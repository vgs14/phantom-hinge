# Example app: lobby board

A reception-screen app for an office lobby, built as a Vue 3 single-page app with a Node.js backend. It has three pages, and moves to the next one after 20 seconds with no touch input:

- **Welcome:** a greeting, notices, visitors expected in the next few hours, and recent arrivals.
- **Meeting rooms:** every room, whether it's free or in use right now, and its next bookings.
- **This kiosk:** live stats for the machine it's running on (hostname, uptime, load and memory graphs, IP addresses, the app image it booted from), plus the settings that were baked in at build time.

Visitors and room bookings are made-up data. The point of the example is the moving parts, not the data:

- a front end with its own build step (Vite) that runs on the build machine, not the kiosk,
- values from a `.env` file compiled into the app at build time,
- several pages (Vue Router) that each pull data from the backend's JSON API,
- the build output packed into the app SquashFS, without the sources or `node_modules`.

## How it works

```
build machine                                   kiosk
-------------                                   -----
frontend/.env  ─┐
frontend/src/  ─┼─ vite build ─> backend/public/ ─┐
                │                                 ├─ SquashFS ─> /opt/app/backend/
backend/server.js, backend/data/ ─────────────────┘                 │
                                                       app-backend runs server.js
                                                       Chromium -> http://localhost:3000/
                                                         pages <-> /api/* (JSON)
```

- **`frontend/`** - the Vue app. `src/router.js` lists the pages, which are in `src/views/`. Each page polls the API with `src/composables/usePolling.js`. If a poll fails it keeps the last data it had and shows "retrying", so a backend restart doesn't blank the screen.
- **`frontend/.env`** - build-time settings: site name, welcome message, accent colour, time zone, locale, rotation and refresh intervals. See below.
- **`backend/server.js`** - started by `etc/init.d/app-backend` as the unprivileged `appbackend` user on `127.0.0.1:3000`. It serves the built app from `public/`, plus the API:

  | Endpoint | Data |
  |---|---|
  | `/api/announcements` | `backend/data/announcements.json` |
  | `/api/visitors` | generated, the same for everyone all day |
  | `/api/rooms` | generated, the same for everyone all day |
  | `/api/system` | real: Node's `os` module, `/proc/cmdline`, and load/memory sampled every 5s |

  Any path that isn't a file or an API endpoint gets `index.html`, so Vue Router's URLs (`/rooms`, `/system`) still load if Chromium restarts on one of them. It uses Node's built-in modules only, the same as the USB monitor example.
- **`build.sh`** - runs `npm ci` and `vite build` in `frontend/`, then packs `backend/` with `builder/scripts/make-app-squashfs.sh`.

There's no `init.sh`. This app doesn't need root for anything, so it's just the backend.

The page is served from `http://localhost:3000/`. That's already the kiosk URL and is on the Chromium allowlist, so nothing else needs configuring.

## Build and deploy

The build machine needs Node.js 20.19+ (for Vite) and `squashfs-tools`, plus internet access the first time, for `npm ci`. The kiosk needs neither. It already has Node in `etc/apk/world`, and only runs the backend.

```
./examples/lobby-board/build.sh
cp lobby-board.squashfs srv/nginx/wwwroot/
```

Then set the lines it prints in `srv/dnsmasq/tftp/autoexec.ipxe`:

```
set app-url    http://boot.lan/lobby-board.squashfs
set app-sha256 <sha256 from the script>
```

and reboot the kiosk. There's no need to rebuild the kiosk image itself.

The image only holds `backend/`: `server.js`, `data/`, and the built `public/` (an `index.html` plus hashed JS/CSS in `assets/`). That comes to about 45KB compressed.

## Build-time configuration (`.env`)

Vite replaces every `import.meta.env.VITE_*` in the source with its value from `frontend/.env` while it builds. `src/config.js` is the one place that reads them. The result is plain constants in the JavaScript bundle, so nothing reads `.env` at runtime. To change a value, edit it and run `build.sh` again.

| Variable | Used for |
|---|---|
| `VITE_SITE_NAME` | header, welcome heading, `<title>` (via `%VITE_SITE_NAME%` in `index.html`) |
| `VITE_WELCOME_MESSAGE` | welcome page |
| `VITE_ACCENT_COLOR` | highlight colour, set as the `--accent` CSS variable in `main.js` |
| `VITE_TIME_ZONE`, `VITE_LOCALE` | every time and date shown. Chromium has its own time zone data, so this works even though the kiosk runs in UTC. |
| `VITE_ROTATE_SECONDS` | idle time before moving to the next page (`0` turns rotation off) |
| `VITE_REFRESH_SECONDS` | how often pages re-fetch from the API (minimum 5) |

`vite.config.js` also bakes in the app version (from `package.json`), the build time and the build mode with `define`, and the footer shows them. That way you can tell which build a kiosk is running. The build fails if a variable is missing or the time zone/locale isn't valid, so a typo can't produce a broken kiosk.

**One image per site:** put the differences in `frontend/.env.<mode>` and build with that mode. Vite loads `.env`, then `.env.<mode>` on top:

```
# frontend/.env.york
VITE_SITE_NAME="Hinge & Co. York"
VITE_ACCENT_COLOR="#e5534b"
```
```
MODE=york ./examples/lobby-board/build.sh lobby-board-york.squashfs
```

Each site's `autoexec.ipxe` then points at its own image. `.env.local` and `.env.<mode>.local` are gitignored, for overrides on your own machine.

**Everything in `.env` is public.** It ends up in a JavaScript file that nginx serves to anyone on the boot network (see *Security model* in the main README). If the app ever needs a credential, have the backend fetch it at runtime. Don't build it into the front end.

## Developing

You don't need a kiosk to work on this. Run the backend and Vite's dev server side by side:

```
cd examples/lobby-board/frontend
npm ci && npm run build              # once, so backend/public/ exists
node ../backend/server.js &          # API on http://127.0.0.1:3000
npm run dev                          # app on http://localhost:5173, hot reload
```

The dev server proxies `/api` to the backend (`server.proxy` in `vite.config.js`). Open http://localhost:5173/ at the kiosk's resolution, e.g. 1920x1080. The layout is designed for a landscape screen.

`/proc/cmdline` exists on any Linux machine, so on a dev box the "This kiosk" page shows your own machine's details and "app-url: not set".

## Making it your own

- **Real data:** replace `getVisitors()` and `getRooms()` in `server.js` with calls to your booking/visitor systems. Keep the response shapes and the pages won't need changing. The kiosk only allows outbound connections (see the firewall section of the main README), which is all the backend needs.
- **Another page:** add a component in `src/views/`, a route in `src/router.js` (with `meta.title`, so it gets a tab and joins the rotation), and an endpoint in the `API` table in `server.js`.
- **Notices:** edit `backend/data/announcements.json` and rebuild. `level` is `info`, `warning` or `notice`.
- **npm dependencies for the backend:** this backend has none. If you add some, `npm ci --omit=dev` in `backend/` before `build.sh` packs it, so `node_modules` goes into the image. The kiosk can't install anything at boot.

## Notes

- **Chromium can't load anything from the internet.** The URL allowlist only permits `http://localhost:3000`, so the front end can't use a CDN, web fonts or remote images. Everything has to be in the bundle or served by the backend. Vite bundles anything imported from `node_modules` into `assets/`, which is what you want.
- **Debugging:** over devmode SSH, `tail -f /var/log/messages` shows the backend's output (tag `app-backend`), including any API errors. `wget -qO- http://127.0.0.1:3000/api/system` checks the API directly.
- **Cache:** files under `assets/` are served as immutable (their names contain a content hash), and `index.html` as `no-cache`. A new image is picked up on the next page load without stale JS.
