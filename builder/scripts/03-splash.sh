#!/bin/sh
# Converts an optional builder/splash/splash.png into the PPM that both
# boot splashes draw, and packages it for each of them:
#
# - build/splash.ppm, which 04-build-apkovl.sh copies into the apkovl at
#   /etc/splash/splash.ppm for etc/init.d/splashd (the splash from early
#   in the real root until the kiosk starts).
#
# - http/alpine/splash.cpio.gz, a second initrd that autoexec.ipxe loads
#   after the main one. It puts the image at /media/splash/fbsplash.ppm in
#   the initramfs, where Alpine's initramfs-init looks for one: if it's
#   there, it shows it (on VT 16, over all boot messages) from just after
#   the network comes up - i.e. through the long package install, which
#   would otherwise be a black screen that looks like a dead machine.
#   splashd takes over from it later (see the comments there).
#
# splash.cpio.gz is always written - as an empty archive when there's no
# splash.png - so removing splash.png and redeploying replaces an old
# splash rather than leaving it on the boot server (cp -r doesn't delete).
# autoexec.ipxe boots fine without the file too; it just skips the splash.
#
# Rendering is handled by the fbsplash applet built into busybox - no extra
# apk package is needed - but it does need an active framebuffer console
# on the target hardware to draw to.
#
# Requires: cpio, gzip; ImageMagick (only if splash.png exists)

set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${ROOT}/splash/splash.png"
OUT="${ROOT}/build/splash.ppm"
CPIO_OUT="${ROOT}/http/alpine/splash.cpio.gz"
BG_OUT="${ROOT}/build/splash.png"

mkdir -p "${ROOT}/build" "${ROOT}/http/alpine"

if ! command -v cpio >/dev/null 2>&1; then
    echo "ERROR: cpio isn't installed - it's needed to build splash.cpio.gz" >&2
    exit 1
fi

# Never let a splash from a previous build leak into this one.
rm -f "${OUT}" "${CPIO_OUT}" "${BG_OUT}"

STAGE="$(mktemp -d)"
trap 'rm -rf "${STAGE}"' EXIT

if [ -f "${SRC}" ]; then
    # ImageMagick 7 ships `magick` (plain `convert` is deprecated there);
    # older installs only have `convert`. Just check what's on PATH.
    if command -v magick >/dev/null 2>&1; then
        CONVERT="magick"
    elif command -v convert >/dev/null 2>&1; then
        CONVERT="convert"
    else
        echo "ERROR: ${SRC} exists but ImageMagick isn't installed - can't build the splash screen" >&2
        exit 1
    fi

    echo "==> Building ${OUT} from ${SRC}"
    ${CONVERT} "${SRC}" -resize '1024x' -type TrueColor "ppm:${OUT}"

    # The same pixels as a PNG, for Sway's desktop background (swaybg
    # can't read PPM). Shown centred and unscaled, exactly like fbsplash
    # draws it, so the handover from splash to Sway doesn't visibly change
    # anything - see 04-build-apkovl.sh.
    ${CONVERT} "${OUT}" "png:${BG_OUT}"

    # Same image and layout for the initramfs splash, so the handover
    # to splashd doesn't visibly change anything. initramfs-init uses the
    # .cfg next to the .ppm if there is one.
    mkdir -p "${STAGE}/media/splash"
    cp "${OUT}" "${STAGE}/media/splash/fbsplash.ppm"
    cp "${ROOT}/overlay-src/etc/splash/fbsplash.cfg" "${STAGE}/media/splash/fbsplash.cfg"
    echo "==> Building ${CPIO_OUT}"
else
    echo "Splash image does not exist - will not create splash screen" >&2
fi

# newc is the cpio format the kernel's initramfs unpacker reads.
( cd "${STAGE}" && find . | cpio -o -H newc --quiet ) | gzip -9 > "${CPIO_OUT}"
