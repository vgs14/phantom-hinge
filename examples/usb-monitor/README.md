# Example app: USB monitor

A complete app package for the optional app overlay. Whenever a USB device is plugged in or removed, the kiosk's Chromium shows its details: vendor/product IDs, manufacturer, product and serial strings, speed, USB version, power draw, each interface's class and the driver bound to it, and every property udev has for it.

## How it works

```
USB device plugged in
  -> kernel uevent
  -> udevd (eudev, already running in the base image)
       udev/90-phantom-usb.rules tags it "phantom_usb"
  -> udevadm monitor --tag-match=phantom_usb     (child of the backend)
  -> backend/server.js adds sysfs details, pushes the event over SSE
  -> page in Chromium (EventSource on /events)
```

- **`init.sh`** - run as root by `etc/init.d/app` at boot, before the backend and kiosk. It copies `udev/*.rules` into `/etc/udev/rules.d/` and reloads udev. Nothing in the base image changes: eudev is already installed (`etc/apk/world`) and started in the sysinit runlevel.
- **`udev/90-phantom-usb.rules`** - decides which devices get reported. By default that's every USB device (not each of its interfaces separately). The file has examples for narrowing it down, e.g. skipping hubs.
- **`backend/server.js`** - started by `etc/init.d/app-backend` as the unprivileged `appbackend` user on `127.0.0.1:3000`. No root needed: udev's event broadcasts and sysfs are readable by any user. Uses Node's built-in modules only, so there's no `npm install` and no `node_modules` (the kiosk is offline).
- **`backend/public/index.html`** - the page. It keeps the last 50 events. On (re)connect the backend replays them, so a Chromium restart doesn't lose them.

The page is served from `http://localhost:3000/`, which is already the kiosk URL and on the Chromium allowlist, so nothing else needs configuring.

## Build and deploy

```
./builder/scripts/make-app-squashfs.sh examples/usb-monitor
cp usb-monitor.squashfs srv/nginx/wwwroot/
```

Then set the lines it prints in `srv/dnsmasq/tftp/autoexec.ipxe`:

```
set app-url    http://boot.lan/usb-monitor.squashfs
set app-sha256 <sha256 from the script>
```

and reboot the kiosk. There's no need to rebuild the kiosk image itself.

## Notes

- **Devices plugged in at boot** don't appear. They were added before the backend started listening, and the page only shows events. Unplug and replug them to see them.
- **Vendor/product names** come from the device's own strings, with udev's hwdb as the fallback. The base image doesn't include the hwdb data, so devices that report no strings show only their IDs. Add `hwids-udev` to `builder/overlay-src/etc/apk/world` and rebuild if you want names for those too.
- **Device strings are untrusted.** Anyone with physical access can plug in a device with any manufacturer/product/serial they like. The page only ever inserts them with `textContent`. Keep it that way if you change it.
- **Debugging:** over devmode SSH, `tail -f /var/log/messages` shows the backend logging each event (tag `app-backend`). `udevadm monitor --udev --property --tag-match=phantom_usb` shows exactly what the backend receives.
