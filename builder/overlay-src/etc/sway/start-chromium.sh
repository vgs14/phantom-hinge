#!/bin/sh
# Keeps Chromium on screen, showing the kiosk URL, for as long as Sway runs.
#
# - Cold boot: waits up to ~30s for the URL to answer before launching
#   Chromium, so the network (or a slow-starting app server) has a chance
#   to be ready first.
# - Chromium only loads the URL once and never retries an error page. So
#   while it runs, the URL is checked every CHECK_INTERVAL seconds; once it
#   has been down (FAIL_THRESHOLD failed checks in a row, or never came up
#   at boot) and answers again, Chromium is restarted to load it fresh.
#   That covers a backend that died and was respawned, a network outage,
#   or a boot where the app server was slower than 30s.
# - If Chromium exits for any reason (crash, OOM kill), it's relaunched.
#
# Logs go to syslog (/var/log/messages) tagged kiosk-chromium.

URL="http://localhost:3000/"

CHECK_INTERVAL=10
FAIL_THRESHOLD=3

# The profile lives in the kiosk user's home (tmpfs, like everything else)
# rather than the world-writable /tmp, where another user could create it
# first. The HTTP cache is capped so a kiosk running for weeks can't slowly
# fill RAM with it.
PROFILE="/home/kiosk/chromium-profile"
CACHE_BYTES=$((50 * 1024 * 1024))

log() {
    logger -t kiosk-chromium "$*"
}

# busybox wget resolves "localhost" to ::1 first and never falls back to
# 127.0.0.1, so a backend listening on 127.0.0.1 only (as it should, see
# etc/init.d/app-backend) never looks reachable. Chromium does fall back,
# so it keeps the URL as written; only the check uses 127.0.0.1.
CHECK_URL="$(echo "${URL}" | sed 's#://localhost\([:/]\|$\)#://127.0.0.1\1#')"

url_ok() {
    wget -q -T 5 --spider "${CHECK_URL}" 2>/dev/null
}

log "The target URL is ${URL}"

healthy=1
deadline=$(($(date +%s) + 30))
until url_ok; do
    if [ "$(date +%s)" -ge "${deadline}" ]; then
        log "URL not reachable after 30s - starting Chromium anyway; it will be restarted once the URL answers"
        healthy=0
        break
    fi
    sleep 0.2
done

# mesa-dri-gallium/mesa-gl are installed (see etc/apk/world) so that
# Chromium can use real GPU acceleration on actual hardware. With swrender=
# set on the kernel command line (see autoexec.ipxe) - for VMs and anything
# else without a working GPU driver - turn GPU use off, to match the
# software rendering etc/init.d/kiosk switches Sway to for the same flag.
GPU_FLAGS=""
case " $(cat /proc/cmdline) " in
    *" swrender="[!\ ]*)
        GPU_FLAGS="--disable-gpu --disable-gpu-compositing"
        ;;
esac

# Sway runs this script exactly once (exec in kiosk-config), and
# supervise-daemon only watches Sway - so this loop is the only thing that
# brings Chromium back. swaymsg failing means Sway has gone (stopped, or
# crashed and about to be respawned with a fresh copy of this script), so
# stop rather than leave an orphaned loop behind. The sleep at the bottom
# stops a Chromium that dies immediately on startup from spinning the CPU.
while swaymsg -t get_version >/dev/null 2>&1; do
    # A killed Chromium leaves its profile lock behind; clear it so the
    # relaunch doesn't refuse to start or try to hand off to a dead process.
    rm -f "${PROFILE}"/Singleton*

    log "Starting Chromium"
    # GPU_FLAGS is deliberately unquoted so it splits into separate arguments.
    # shellcheck disable=SC2086
    chromium \
        --kiosk \
        --no-first-run \
        --disable-translate \
        --disable-infobars \
        --noerrdialogs \
        --disable-session-crashed-bubble \
        --disable-features=TranslateUI \
        --user-data-dir="${PROFILE}" \
        --disk-cache-size="${CACHE_BYTES}" \
        ${GPU_FLAGS} \
        "${URL}" &
    cpid=$!

    # Watch the URL while Chromium runs. Ticks every second so a Chromium
    # crash is noticed straight away, but only checks the URL every
    # CHECK_INTERVAL seconds.
    fails=0
    elapsed=0
    while kill -0 "${cpid}" 2>/dev/null; do
        sleep 1
        elapsed=$((elapsed + 1))
        [ "${elapsed}" -ge "${CHECK_INTERVAL}" ] || continue
        elapsed=0

        if url_ok; then
            fails=0
            if [ "${healthy}" = 0 ]; then
                log "URL is reachable again - restarting Chromium to reload it"
                healthy=1
                kill "${cpid}" 2>/dev/null
                break
            fi
        else
            fails=$((fails + 1))
            if [ "${healthy}" = 1 ] && [ "${fails}" -ge "${FAIL_THRESHOLD}" ]; then
                log "URL unreachable for ${fails} checks in a row - will restart Chromium once it's back"
                healthy=0
            fi
        fi
    done

    wait "${cpid}"
    log "Chromium exited with status $?, restarting in 2s"
    sleep 2
done

log "Sway is gone, not restarting Chromium"
