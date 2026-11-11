"use strict"

// Example Phantom Hinge app backend: the API and static file server for the
// lobby-board Vue app.
//
// The Vue front end is built on the build machine (see ../build.sh) into
// public/, which is all that ships in the SquashFS - no Vue sources, no
// node_modules. This file serves that build and a small JSON API the pages
// poll:
//
//   GET /api/announcements   notices from data/announcements.json
//   GET /api/visitors        today's expected/arrived visitors (generated)
//   GET /api/rooms           meeting rooms, what's on now and next (generated)
//   GET /api/system          live stats for the kiosk itself (real)
//
// Visitors and room bookings are made up, but stable: they're generated
// from a seed of today's date, so every poll (and every kiosk) sees the
// same day. Replace generateDay() with calls to your real systems.
//
// No npm dependencies - the kiosk runs offline, so this only uses Node's
// built-in modules.

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');

// How far either side of "now" the visitors list and room schedules reach.
const VISITORS_BEHIND_MS = 2 * 3600e3;
const VISITORS_AHEAD_MS = 6 * 3600e3;
const ROOMS_AHEAD_MS = 10 * 3600e3;

// System stats sampled in the background, so the System page can draw a
// history graph straight away instead of starting empty.
const SAMPLE_INTERVAL_MS = 5000;
const SAMPLE_COUNT = 60;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// ---------------------------------------------------------------------------
// Static files
// ---------------------------------------------------------------------------

// /opt/app is a read-only SquashFS, so the build can't change under us -
// load it all once at startup. Requests are then looked up in this map,
// which also means a request path can never reach outside public/.
function loadStatic(dir, prefix = '/', files = new Map()) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      loadStatic(full, `${prefix}${entry.name}/`, files);
    } else {
      files.set(`${prefix}${entry.name}`, {
        body: fs.readFileSync(full),
        type: CONTENT_TYPES[path.extname(entry.name)] || 'application/octet-stream',
      });
    }
  }
  return files;
}

let STATIC;
try {
  STATIC = loadStatic(PUBLIC_DIR);
} catch (err) {
  // Without the build there's nothing to show. Exiting (rather than
  // serving 404s) makes it obvious in /var/log/messages.
  console.error(`can't read ${PUBLIC_DIR} (${err.code}) - was the front end built? See build.sh`);
  process.exit(1);
}
const INDEX = STATIC.get('/index.html');

function serveStatic(pathname, res) {
  const file = STATIC.get(pathname);
  if (file) {
    // Vite puts a content hash in every filename under assets/, so those
    // can be cached forever. index.html must always be re-fetched.
    const cache = pathname.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'no-cache';
    res.writeHead(200, { 'Content-Type': file.type, 'Cache-Control': cache });
    res.end(file.body);
    return;
  }
  // Anything else that looks like a file really is missing.
  if (path.extname(pathname)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found\n');
    return;
  }
  // The app uses HTML5 history routing (/rooms, /system, ...), so any other
  // path is a page of the app - hand it index.html and let Vue Router pick
  // the page. Without this, Chromium restarting on /rooms would get a 404.
  res.writeHead(200, { 'Content-Type': INDEX.type, 'Cache-Control': 'no-cache' });
  res.end(INDEX.body);
}

// ---------------------------------------------------------------------------
// Generated data: visitors and room bookings
// ---------------------------------------------------------------------------

const ROOMS = [
  { id: 'boardroom', name: 'Boardroom', floor: 3, capacity: 16, features: ['Video', 'Display'] },
  { id: 'aire', name: 'Aire', floor: 2, capacity: 8, features: ['Video', 'Whiteboard'] },
  { id: 'calder', name: 'Calder', floor: 2, capacity: 6, features: ['Display'] },
  { id: 'wharfe', name: 'Wharfe', floor: 1, capacity: 10, features: ['Video', 'Display'] },
  { id: 'nidd', name: 'Nidd', floor: 1, capacity: 4, features: ['Whiteboard'] },
  { id: 'pod-1', name: 'Focus Pod 1', floor: 1, capacity: 2, features: [] },
];

const MEETINGS = [
  'Weekly stand-up', 'Quarterly planning', 'Supplier review', 'Design critique',
  'Interview', 'Customer call', '1:1', 'Budget review', 'Sprint retro',
  'Onboarding', 'Product demo', 'Ops sync', 'Hiring panel', 'Workshop',
];
const FIRST = [
  'Amara', 'Ben', 'Chloe', 'Dev', 'Ella', 'Farid', 'Grace', 'Hugo', 'Isla',
  'Jonah', 'Kiran', 'Lena', 'Marcus', 'Nadia', 'Owen', 'Priya', 'Quinn',
  'Rosa', 'Sami', 'Tom', 'Uma', 'Viktor', 'Wren', 'Yusuf', 'Zoe',
];
const LAST = [
  'Adeyemi', 'Brooks', 'Chen', 'Dawson', 'Evans', 'Fischer', 'Gill', 'Hart',
  'Iqbal', 'Jensen', 'Kowalski', 'Lamb', 'Moreau', 'Novak', 'Okafor',
  'Patel', 'Reid', 'Silva', 'Turner', 'Walsh',
];
const COMPANIES = [
  'Northgate Logistics', 'Brightwater Ltd', 'Kestrel Analytics', 'Oakfield Legal',
  'Pennine Build Co.', 'Halo Health', 'Ridgeway Energy', 'Copperleaf Design',
  'Fernhill Foods', 'Summit Recruitment',
];

// mulberry32: a tiny seeded PRNG, so a given day always generates the same
// visitors and bookings.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rand, list) => list[Math.floor(rand() * list.length)];
const person = (rand) => `${pick(rand, FIRST)} ${pick(rand, LAST)}`;

// Generates a whole (UTC) day, cached until the date changes. The day runs
// round the clock, so whatever time zone the kiosk is in and whenever you
// look, there's something on.
let day = null;

function generateDay(now) {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (day && day.start === start) return day;

  const rand = rng(start / 86400e3);
  const SLOT = 30 * 60e3;

  const bookings = {};
  for (const room of ROOMS) {
    const list = [];
    let t = start;
    while (t < start + 86400e3) {
      if (rand() < 0.45) {
        const length = (1 + Math.floor(rand() * 4)) * SLOT;
        list.push({
          title: pick(rand, MEETINGS),
          organiser: person(rand),
          start: new Date(t).toISOString(),
          end: new Date(t + length).toISOString(),
        });
        t += length;
      } else {
        t += SLOT * (1 + Math.floor(rand() * 3));
      }
    }
    bookings[room.id] = list;
  }

  const visitors = [];
  for (let i = 0; i < 48; i++) {
    visitors.push({
      id: i + 1,
      name: person(rand),
      company: pick(rand, COMPANIES),
      host: person(rand),
      // On the quarter hour, like real bookings.
      expected: new Date(start + Math.floor(rand() * 96) * 15 * 60e3).toISOString(),
      // Most people turn up roughly on time; some are late.
      lateBy: rand() < 0.15 ? Infinity : Math.floor(rand() * 20) * 60e3,
    });
  }
  visitors.sort((a, b) => a.expected.localeCompare(b.expected));

  day = { start, bookings, visitors };
  return day;
}

function getVisitors() {
  const now = new Date();
  const { visitors } = generateDay(now);
  const from = now.getTime() - VISITORS_BEHIND_MS;
  const to = now.getTime() + VISITORS_AHEAD_MS;

  return visitors
    .filter((v) => {
      const t = Date.parse(v.expected);
      return t >= from && t <= to;
    })
    .map(({ lateBy, ...v }) => {
      const arrivedAt = Date.parse(v.expected) + lateBy;
      return {
        ...v,
        status: arrivedAt <= now.getTime() ? 'arrived' : 'expected',
        arrived: arrivedAt <= now.getTime() ? new Date(arrivedAt).toISOString() : null,
      };
    });
}

function getRooms() {
  const now = new Date();
  const t = now.getTime();
  const { bookings } = generateDay(now);

  return ROOMS.map((room) => {
    const list = bookings[room.id];
    const current = list.find((b) => Date.parse(b.start) <= t && Date.parse(b.end) > t) || null;
    const upcoming = list
      .filter((b) => Date.parse(b.start) > t && Date.parse(b.start) < t + ROOMS_AHEAD_MS)
      .slice(0, 4);
    return {
      ...room,
      status: current ? 'busy' : 'free',
      current,
      upcoming,
      // When a free room is next needed (null = free for the rest of the window).
      freeUntil: current ? null : upcoming[0]?.start ?? null,
    };
  });
}

// Read from disk on every request (it's tiny) rather than at startup, so if
// you point DATA_DIR somewhere writable, edits show up without a restart.
function getAnnouncements() {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'announcements.json'), 'utf8'));
}

// ---------------------------------------------------------------------------
// System stats (real)
// ---------------------------------------------------------------------------

const samples = [];

function sample() {
  samples.push({
    time: new Date().toISOString(),
    load1: os.loadavg()[0],
    memUsed: os.totalmem() - os.freemem(),
  });
  if (samples.length > SAMPLE_COUNT) samples.shift();
}

// The boot parameters for this app (app-url and app-sha256 in
// autoexec.ipxe) end up on the kernel command line, which any user can read.
function bootParams() {
  const params = {};
  try {
    for (const p of fs.readFileSync('/proc/cmdline', 'utf8').trim().split(/\s+/)) {
      const m = /^(appurl|appsha256)=(.*)$/.exec(p);
      if (m) params[m[1]] = m[2];
    }
  } catch {
    // Not Linux (e.g. running the backend on a dev machine).
  }
  return params;
}

function getSystem() {
  const cpus = os.cpus();
  const interfaces = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs) {
      if (!a.internal) interfaces.push({ name, family: a.family, address: a.address, mac: a.mac });
    }
  }
  return {
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()} (${os.arch()})`,
    node: process.version,
    cpu: { model: cpus[0]?.model?.trim() || 'unknown', count: cpus.length },
    load: os.loadavg(),
    memory: { total: os.totalmem(), free: os.freemem() },
    uptime: { system: os.uptime(), backend: process.uptime() },
    interfaces,
    boot: bootParams(),
    samples,
    sampleIntervalMs: SAMPLE_INTERVAL_MS,
  };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const API = {
  '/api/announcements': getAnnouncements,
  '/api/visitors': getVisitors,
  '/api/rooms': getRooms,
  '/api/system': getSystem,
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain', Allow: 'GET, HEAD' });
    res.end('Method not allowed\n');
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    const handler = API[url.pathname];
    if (!handler) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    try {
      const body = JSON.stringify(handler());
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch (err) {
      console.error(`${url.pathname}: ${err.stack || err}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'internal error' }));
    }
    return;
  }

  serveStatic(url.pathname, res);
});

sample();
setInterval(sample, SAMPLE_INTERVAL_MS).unref();

// PORT is passed in by etc/init.d/app-backend. Bind to loopback only - the
// kiosk's own Chromium is the only client.
const PORT = process.env.PORT || 3000;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Server running at http://127.0.0.1:${PORT}/ (${STATIC.size} static files)`);
});
