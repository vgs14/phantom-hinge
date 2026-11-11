#!/bin/sh
# Packages a directory into a SquashFS image for the optional app overlay
# (see etc/init.d/app) - the thing appurl= in autoexec.ipxe points at.
#
# The directory can contain whatever you like; if it has an init.sh at its
# top level, the app service will run it (after mounting the image
# read-only at /opt/app) before the kiosk starts.
#
# Usage:
#   ./make-app-squashfs.sh <source-dir> [output-file]
#
# output-file defaults to <source-dir-basename>.squashfs in the current
# directory. Not run as part of build.sh - build this whenever your app
# changes and host it wherever appurl= can reach it over HTTP; it doesn't
# need to live in this repo or get rebuilt alongside the kiosk image.

set -eu

if [ $# -lt 1 ] || [ $# -gt 2 ]; then
    echo "Usage: $0 <source-dir> [output-file]" >&2
    exit 1
fi

SRC="$1"

if [ ! -d "${SRC}" ]; then
    echo "ERROR: ${SRC} is not a directory" >&2
    exit 1
fi

if [ $# -eq 2 ]; then
    OUT="$2"
else
    # Strip any trailing slash before taking the basename, so
    # "./myapp/" doesn't turn into an empty/weird name.
    OUT="$(basename "${SRC%/}").squashfs"
fi

if ! command -v mksquashfs >/dev/null 2>&1; then
    echo "ERROR: mksquashfs not found - install squashfs-tools" >&2
    echo "  Debian/Ubuntu: apt install squashfs-tools" >&2
    echo "  Alpine:        apk add squashfs-tools" >&2
    echo "  macOS/brew:    brew install squashfs" >&2
    exit 1
fi

rm -f "${OUT}"

# mksquashfs preserves whatever permissions your source tree has,
# including whatever restrictive umask you built it with. Since /opt/app
# ends up mounted read-only, there's no way to fix that after the fact -
# a directory that isn't world-readable/traversable on your machine means
# the unprivileged "appbackend" user (a completely different uid inside
# the kiosk image) can't read into it there either, which Node reports as
# a plain "Cannot find module" - indistinguishable from the file actually
# being missing. Work on a throwaway copy so we can fix that without
# touching the permissions of your actual source tree.
WORKDIR="$(mktemp -d)"
trap 'rm -rf "${WORKDIR}"' EXIT
cp -a "${SRC}/." "${WORKDIR}/"
chmod -R a+rX "${WORKDIR}"

echo "==> Building ${OUT} from ${SRC}"
mksquashfs "${WORKDIR}" "${OUT}" -noappend -comp xz -all-root

echo ""
echo "==> Done: ${OUT}"

# For appsha256= in autoexec.ipxe, if you want the app service to verify
# the download before mounting it.
if command -v sha256sum >/dev/null 2>&1; then
    SHA256="$(sha256sum "${OUT}" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
    # macOS doesn't ship sha256sum by default.
    SHA256="$(shasum -a 256 "${OUT}" | awk '{print $1}')"
else
    SHA256=""
fi

if [ -n "${SHA256}" ]; then
    echo "    sha256: ${SHA256}"
    echo ""
    echo "    Host ${OUT} somewhere appurl= in autoexec.ipxe can reach it"
    echo "    over HTTP, and set:"
    echo "        set app-url   http://.../${OUT}"
    echo "        set app-sha256 ${SHA256}"
else
    echo "    Host ${OUT} somewhere appurl= in autoexec.ipxe can reach it over HTTP."
fi
