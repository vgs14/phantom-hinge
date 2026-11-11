"use strict"

// Example Phantom Hinge app backend: reports USB devices being plugged in
// and removed to the page in Chromium.
//
// udev (eudev, already running in the base image) does the device
// handling. This app's init.sh installs udev/90-phantom-usb.rules, which
// tags USB devices "phantom_usb", and this backend listens for udev's
// events for that tag with "udevadm monitor". Each event gets details from
// sysfs added and is pushed to the page over Server-Sent Events (/events).
//
// No npm dependencies - the kiosk runs offline, so this only uses Node's
// built-in modules.

const http = require('http');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

const TAG = 'phantom_usb';

// Events kept in memory and replayed to the page whenever it (re)connects,
// e.g. after Chromium is restarted by etc/sway/start-chromium.sh.
const HISTORY_SIZE = 50;

const DEVICE_ATTRS = [
  'idVendor', 'idProduct', 'manufacturer', 'product', 'serial',
  'bcdDevice', 'version', 'speed', 'bDeviceClass', 'bDeviceSubClass',
  'bDeviceProtocol', 'bNumConfigurations', 'bMaxPower', 'busnum', 'devnum',
  'removable',
];
const INTERFACE_ATTRS = [
  'bInterfaceNumber', 'bInterfaceClass', 'bInterfaceSubClass',
  'bInterfaceProtocol', 'interface',
];

const INDEX_HTML = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));

const clients = new Set();
const history = [];
let nextId = 1;

function readAttrs(dir, names) {
  const attrs = {};
  for (const name of names) {
    try {
      attrs[name] = fs.readFileSync(path.join(dir, name), 'utf8').trim();
    } catch {
      // Not every device has every attribute (serial, manufacturer, ...).
    }
  }
  return attrs;
}

function driverOf(dir) {
  try {
    return path.basename(fs.readlinkSync(path.join(dir, 'driver')));
  } catch {
    return null;
  }
}

// A device's interfaces are the subdirectories named "<port>:<config>.<n>",
// e.g. 1-2:1.0. The interface classes are what says what the device
// actually is (HID, mass storage, audio, ...) - bDeviceClass is usually 00,
// "defined per interface".
function readInterfaces(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((name) => name.includes(':'))
    .sort()
    .map((name) => {
      const ifDir = path.join(dir, name);
      return { name, driver: driverOf(ifDir), ...readAttrs(ifDir, INTERFACE_ATTRS) };
    });
}

function describe(props) {
  const event = {
    id: nextId++,
    time: new Date().toISOString(),
    action: props.ACTION,
    devpath: props.DEVPATH,
    properties: props,
  };
  // On remove the sysfs directory is already gone - udev's properties
  // (from its database) are all there is.
  if (props.ACTION !== 'remove') {
    const dir = path.join('/sys', props.DEVPATH);
    event.sysfs = readAttrs(dir, DEVICE_ATTRS);
    event.driver = driverOf(dir);
    event.interfaces = readInterfaces(dir);
  }
  return event;
}

function publish(event) {
  history.push(event);
  if (history.length > HISTORY_SIZE) history.shift();

  const msg = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) res.write(msg);
}

// "udevadm monitor --property" prints a header line per event followed by
// its KEY=VALUE properties and a blank line. Anything else (the banner it
// prints at startup, the header lines) is skipped.
let monitor = null;

function watchUdev() {
  monitor = spawn('udevadm', ['monitor', '--udev', '--property', `--tag-match=${TAG}`], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  let props = {};
  readline.createInterface({ input: monitor.stdout }).on('line', (line) => {
    if (line === '') {
      if (props.ACTION && props.DEVPATH) {
        console.log(`${props.ACTION} ${props.DEVPATH}`);
        publish(describe(props));
      }
      props = {};
      return;
    }
    const m = /^([A-Za-z0-9_.]+)=(.*)$/.exec(line);
    if (m) props[m[1]] = m[2];
  });

  monitor.on('error', (err) => console.error(`udevadm: ${err.message}`));
  monitor.on('exit', (code, signal) => {
    console.error(`udevadm monitor exited (${signal || code}), restarting in 3s`);
    setTimeout(watchUdev, 3000);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(INDEX_HTML);
    return;
  }

  if (url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    });
    // "reset" tells the page to clear what it has before the replay, so a
    // reconnect doesn't show the same events twice.
    res.write('event: reset\ndata: {}\n\n');
    for (const event of history) res.write(`data: ${JSON.stringify(event)}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found\n');
});

// Take udevadm down with us, rather than leaving it running until it next
// fails to write an event.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    if (monitor) monitor.removeAllListeners('exit').kill();
    process.exit(0);
  });
}

watchUdev();

// PORT is passed in by etc/init.d/app-backend. Bind to loopback only - the
// kiosk's own Chromium is the only client.
const PORT = process.env.PORT || 3000;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Server running at http://127.0.0.1:${PORT}/`);
});
