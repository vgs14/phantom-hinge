# PHANTOM-HINGE

A netboot (iPXE) kiosk. Standard PC hardware PXE-boots into full-screen Chromium, running entirely from RAM - nothing is written to local disk, and once built, the whole thing runs offline. Built as a PXE-capable replacement for Porteus Kiosk. Perfect for digital signage, kiosks for a specific use etc. Easily extendable to run your own Node.js backend. Easily customizable to include other Alpine features and packages.

Base OS is Alpine Linux, compositor is Sway (Wayland), locked down with Sway keybindings + a Chromium policy. Everything is open source. No wizard, easily replicated offline, no magic behind the scenes.

## How it works

- A **builder** (needs internet access) fetches the Alpine kernel/initramfs, mirrors the apk packages the kiosk needs, and packages your customisations into an apkovl.
- Two Docker containers - `dnsmasq` (DHCP/TFTP/DNS) and `nginx` (serves the kernel/apkovl/apk mirror over HTTP) - are what a PC on your network actually PXE-boots against. They are intended to be run on a dedicated, isolated network interface.
- On boot, Alpine's `mkinitfs` installs the packages listed in `etc/apk/world` and unpacks your apkovl, entirely from the initramfs, before switching to the real (tmpfs) root. Nothing persists across reboots.

## Security model

**The boot network is the security boundary. Whoever controls it controls every kiosk.** Kiosks boot over plain HTTP and TFTP with nothing authenticated end to end, so anyone who can plug into that network, or tamper with its traffic, can:

- serve their own kernel, kernel command line or apkovl, and so get root on every kiosk that boots. The apkovl is unpacked with no signature check (apk packages are signature-checked, the apkovl isn't).
- serve their own app SquashFS. Its `init.sh` runs as root, and `app-sha256` doesn't help, since it comes over the same network.
- serve their own CA cert through `cacert-url`. It goes into the system trust store, which lets them intercept all of the kiosk's HTTPS.

So keep the boot network physically or logically isolated: its own switch or VLAN, with nothing else on it and no route in from other networks. The kiosk's firewall blocks inbound connections, but it can't help against an attacker who controls what the kiosk boots.

**Nothing you build in is secret.** nginx serves the apkovl, the app SquashFS and everything else in `srv/nginx/wwwroot/` to anyone on the boot network who asks, with no authentication, and the kernel command line is in `autoexec.ipxe` on TFTP. Never put passwords, API tokens, private keys or anything else secret in `builder/overlay-src/`, in an app image or in `autoexec.ipxe`. If the kiosk's app needs credentials, have the backend fetch them at runtime from somewhere that authenticates it, or give the kiosk an identity that's useless off-site, such as a token scoped to read-only display data.

**Physical access:** lock each kiosk's BIOS/UEFI with a password, fix the boot order and disable the one-time boot menu, or anyone with a keyboard can boot a USB stick. Also note that the stock iPXE binaries offer a Ctrl-B command line for 2 seconds at startup, which someone with a keyboard can use to boot with arbitrary kernel arguments, root shell included. Either keep keyboards away from kiosks at boot, or use a custom iPXE build with the prompt disabled (`BANNER_TIMEOUT 0` - [rom-o-matic.eu](https://rom-o-matic.eu) builds one in the browser).


## License

Copyright (C) 2026 Richard Bishop

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.


## Quick start

1. **Build.**
   ```
   cd builder
   ./scripts/build.sh
   ```
   This is the only step that needs internet access.

2. **Deploy.**
   ```
   cp -r builder/http/*  srv/nginx/wwwroot/
   cp -r builder/tftp/*  srv/dnsmasq/tftp/
   ```
   Re-run this (and step 1) any time you rebuild.

3. **Run.**
   ```
   cd srv
   docker compose up -d
   ```
   Edit `PARENT_IF` in `srv/.env` to match your network interface first (see *Versions and network settings* below for the rest). Make sure it's the dedicated boot network and not your main LAN: dnsmasq is an authoritative DHCP server that PXE-boots everything it sees, so on the wrong interface it takes over DHCP for that whole network. This brings up `dnsmasq` (DHCP/TFTP/DNS) and `nginx` (kernel/apkovl/apk mirror over HTTP) on their own network.

   **ipvlan gotcha:** the containers get their own IPs (`DNSMASQ_IP` and `HTTP_IP` in `srv/.env`) directly on that interface, and Linux doesn't let the Docker host itself talk to ipvlan/macvlan containers through their parent interface. So `curl http://<HTTP_IP>/` *from the Docker host* will time out, even though the kiosks can reach it fine. Test from another machine on that network, or use `docker exec` / `docker logs`.

4. PXE-boot a PC on that network. It should pick up an address, fetch iPXE, and boot straight into the kiosk. Note that both UEFI and BIOS are supported.

## Customising

### Versions and network settings

Two files hold every version and address, and nothing else needs editing when they change:

- **`builder/config.env`** - the kiosk's Alpine version (`ALPINE_VER`) and architecture (`ARCH`). A version bump is: change `ALPINE_VER`, rebuild, redeploy. The build mirrors that release's packages to `http/repo/v<version>/` and points the symlink `http/repo/current` at it, which is what `autoexec.ipxe` boots from. Netboot kernels are cached per version in `builder/netboot_cache/`, so switching back and forth doesn't re-download them.
- **`srv/.env`** - the boot server's network: host interface, subnet, DHCP range, and the two container IPs. Docker Compose reads it automatically. dnsmasq answers the name `boot.lan` with `HTTP_IP`, and `autoexec.ipxe` and the kiosk only ever use that name, so changing the subnet is just editing `.env` and running `docker compose up -d`.

**Repeatable builds:** by default the build checks dl-cdn for an updated package index every time, so you pick up Alpine's security fixes, but two builds a week apart may contain different package versions. Set `APK_FREEZE=1` in `builder/config.env` to reuse the cached index and the packages already mirrored, so every rebuild produces the same package set. It needs one normal build first to fill the cache. Set it back to `0` to take updates.

### The kiosk URL

Edit `URL=` in `builder/overlay-src/etc/sway/start-chromium.sh`. That script also waits up to 30 seconds for the URL to be reachable before launching Chromium, so a cold boot can't beat the network (or a slow-starting app server) to being ready.

It then keeps the page alive. Chromium never retries a page that failed to load, so the script checks the URL every 10 seconds. If it was unreachable at launch, or fails 3 checks in a row, Chromium is restarted as soon as it answers again. That recovers from a backend crash, a network outage, or an app server that took longer than 30 seconds to start. If Chromium itself exits (crash, out of memory), it's relaunched after 2 seconds. The interval and threshold are `CHECK_INTERVAL` and `FAIL_THRESHOLD` at the top of the script.

Chromium is locked down to an allowlist (`URLBlocklist: ["*"]` plus `URLAllowlist` in `builder/overlay-src/etc/chromium/policies/managed/kiosk.json`), so if you point `URL=` somewhere other than `http://localhost:3000`, add its origin to `URLAllowlist` too - along with any other origin the page loads from or calls (APIs, CDNs, fonts). The build fails with an error if the kiosk URL itself isn't covered.

### Software rendering (VMs)

`swrender` in `autoexec.ipxe` makes Sway and Chromium render on the CPU instead of the GPU. It's needed in VMs like VMware Workstation, where the virtual GPU fails to initialise and you get a white screen. It's set by default; clear it (`set swrender`) on real hardware with a working GPU driver for much better performance. No rebuild needed - it's read from the kernel command line at boot.

### Lockdown

- Sway swallows the browser shortcuts that could escape the app (address bar, history, downloads, view source, save, print, back/forward, devtools, ...) - see `builder/overlay-src/etc/sway/kiosk-config`. Your web app can't use those key combinations either; delete a line there if it needs one.
- Ctrl+Alt+F1-F12 doesn't switch virtual terminals, and there are no console logins (`builder/overlay-src/etc/inittab`). Use devmode SSH for debugging.
- The Node backend should listen on `127.0.0.1` only, as the example `server.js` does.
- An nftables firewall (`builder/overlay-src/etc/firewall.nft`, loaded by `etc/init.d/firewall` in the boot runlevel) drops every inbound connection the kiosk didn't start itself, over IPv4 and IPv6, and allows all outbound traffic. Ping is dropped too. On devmode boots, `etc/init.d/devmode` adds a rule allowing SSH on port 22.
- The magic SysRq key is disabled (`sysctl.kernel.sysrq=0` on the kernel command line, and again in `etc/sysctl.d/90-kiosk.conf`).

### Boot splash

Drop a `splash.png` into `builder/splash/splash.png` before building (needs ImageMagick and `cpio` on the build machine). It appears a few seconds into boot, once the network is up, and stays up until the kiosk starts:

- During the initramfs stage, which includes the long package install, Alpine's own initramfs shows it. The build packs the image into a second initrd, `http/alpine/splash.cpio.gz`, which `autoexec.ipxe` loads.
- Once the real root filesystem is up, `etc/init.d/splashd` takes over with the same image. See the comments there for how the handover works.
- When the kiosk starts, the same image is Sway's desktop background, so it stays on screen until Chromium covers it (needs `swaybg`, which is in `etc/apk/world`).

Expect one short blank in the middle: when the real GPU driver loads early in the real root, it takes over the display from the generic one the initramfs used and resets the video mode. `splashd` runs straight after that to keep the gap short.

Both splashes run on their own virtual terminal, so boot messages can't draw over the image. To see the boot messages when debugging a boot that fails before devmode SSH is up, change `splash` to `splash=no` in `autoexec.ipxe` (no rebuild needed).

### Optional app overlay

Set `app-url` (and optionally `app-sha256`) in `srv/dnsmasq/tftp/autoexec.ipxe` to point at a SquashFS image. At boot, it's downloaded, verified (if a checksum was given), and mounted read-only at `/opt/app`. If `/opt/app/init.sh` exists then it's run before the kiosk starts. If you need to do app-specific setup prior to running the app do it here.

Build the SquashFS from any directory with:
```
./builder/scripts/make-app-squashfs.sh <source-dir>
```
It prints the `app-url`/`app-sha256` lines to paste into `autoexec.ipxe`.

**Node.js backend:** if the mounted (or baked-in - see below) app has a `backend/server.js`, `etc/init.d/app-backend` runs it automatically as an unprivileged `appbackend` user, supervised with auto-restart. It needs to listen on `127.0.0.1:$PORT` (default `3000`) - the kiosk waits for that to actually be answering before starting Chromium.

**Example apps:** two complete app packages, each with its own README:

- `examples/usb-monitor/` - an `init.sh` that installs a udev rule, and a Node backend that shows every USB device plugged into the kiosk in Chromium. No build step.
- `examples/lobby-board/` - an office reception screen: a multi-page Vue 3 + Vite front end, compiled on the build machine with settings from a `.env` file, and a Node backend serving it and a JSON API. Its `build.sh` builds the front end and packs only the output into the SquashFS.
- `examples/mall-directory/` - a touchscreen store directory for a shopping centre: search with an on-screen keyboard, floor maps, directions between floors, an idle reset, and per-kiosk "You are here" from the MAC address, all from one image. Same Vue/Vite build approach as `lobby-board`.

**Default backend (no `appurl=` needed):** put a `server.js` at `builder/overlay-src/opt/app/backend/server.js` and it'll run on every boot, even without `app-url` set. If `app-url` *is* set, the mounted SquashFS transparently takes over that same path - no conflict either way.

### Private CA cert for a HTTPS backend

If your backend API uses HTTPS with a private/internal CA, set `cacert-url` (and optionally `cacert-sha256`) in `autoexec.ipxe` rather than baking the cert into the apkovl - it's fetched and installed into the trust store at boot (`etc/init.d/cacert`), so rotating the cert is just updating whatever it's hosted at, no rebuild needed. Both Chromium and the Node backend pick up the system trust store automatically. Note that Alpine's stock initramfs and Chromium already trust public CAs, so this is not required.

**What the checksums do and don't protect:** `app-sha256` and `cacert-sha256` catch corruption or a stale/wrong file, but they're delivered on the kernel command line over the same plain HTTP/TFTP as everything else. Anyone who can tamper with traffic on the boot network can change the checksum along with the file, so they're not a defence against an attacker on that network - keep it isolated.

**apkovl integrity:** `apkovl` itself has no integrity verification at all - unlike apk packages, which are signature-checked, the apkovl tarball is just fetched and unpacked as-is. Hardening this would require custom patches to `mkinitfs`'s own `initramfs-init` - which introduces maintenance overheads.

### SSH debugging access

Root has no password, ever - the only way in is over SSH with a key, and only when explicitly enabled. Meant for development/debugging only.

**Generate a keypair** (skip if you already have one you want to use):
```
ssh-keygen -t ed25519 -f ~/.ssh/phantomhinge_dev -C "phantomhinge-dev"
```

**Install the public key:** paste the contents of `~/.ssh/phantomhinge_dev.pub` into `builder/ssh-dev/authorized_keys` (gitignored), then build as usual. Consider restricting it to the machine or subnet you debug from, by putting `from="<your-ip-or-subnet>"` in front of the key on the same line.

**Enable it for a given boot:** set `devmode` to a non-empty value in `autoexec.ipxe` (blank = disabled, the production default). This generates fresh SSH host keys, installs your key for root, and starts sshd.

**Log in:**
```
ssh -i ~/.ssh/phantomhinge_dev root@<kiosk-ip>
```
First connection will ask you to confirm the host fingerprint - accept it.

Host keys aren't persisted (nothing is, in this diskless setup), so rebooting a dev box will trigger a "REMOTE HOST IDENTIFICATION HAS CHANGED" warning each time. That's expected - clear it with `ssh-keygen -R <kiosk-ip>` before reconnecting, or wrap the two in an alias:
```
alias ph-ssh='ssh-keygen -R <kiosk-ip> 2>/dev/null; ssh -i ~/.ssh/phantomhinge_dev root@<kiosk-ip>'
```

### Logs

On the kiosk, everything goes to syslog in `/var/log/messages`: Sway and Chromium (tagged `kiosk` and `kiosk-chromium`), the Node backend (`app-backend`) and the OpenRC services. It lives in RAM like the rest of the filesystem, so it's capped: rotated at 1MB with 2 old copies kept (`builder/overlay-src/etc/conf.d/syslog`). Read it over devmode SSH, e.g. `tail -f /var/log/messages`. Chromium's HTTP cache is capped at 50MB for the same reason.

On the boot server, dnsmasq and nginx log to `docker logs ph_dnsmasq` / `docker logs ph_nginx`, capped at 3 x 10MB per container in `srv/docker-compose.yml`.

## Layout

```
builder/
  config.env         Alpine version/arch, APK_FREEZE (see above)
  scripts/           build steps - run build.sh, or individual scripts as needed
  overlay-src/       everything that ends up on the real root filesystem
    etc/init.d/        app, app-backend, devmode, kiosk, splashd - the custom services
    etc/local.d/       one-shot boot scripts (user creation, locking root)
    opt/app/backend/   optional default Node.js backend (see above)
  splash/splash.png  optional boot splash image (you provide this)
  ssh-dev/authorized_keys  dev SSH public key (you provide this)
examples/
  usb-monitor/       example app package: udev rule + Node backend (see its README)
  lobby-board/       example app package: Vue/Vite front end with a build step + Node backend (see its README)
  mall-directory/    example app package: touchscreen store directory, Vue/Vite + Node backend (see its README)
srv/
  .env                       network settings - interface, subnet, IPs (see above)
  docker-compose.yml         dnsmasq + nginx, PXE server side
  dnsmasq/tftp/autoexec.ipxe  the iPXE script - kernel args, app-url, devmode, etc.
```
