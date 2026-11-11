#!/bin/sh
# Builds lobby-board.squashfs: the Vue front end compiled into
# backend/public/, then backend/ packed into a SquashFS with
# builder/scripts/make-app-squashfs.sh.
#
# Usage:
#   ./build.sh [output-file]            uses frontend/.env
#   MODE=york ./build.sh [output-file]  frontend/.env + frontend/.env.york
#
# output-file defaults to lobby-board.squashfs in the current directory.
# Needs Node.js/npm and squashfs-tools on the build machine, and internet
# access the first time (npm ci) - the kiosk itself needs neither.

set -eu

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "${HERE}/../.." && pwd)"
OUT="${1:-lobby-board.squashfs}"
MODE="${MODE:-production}"

for tool in node npm; do
    if ! command -v "${tool}" >/dev/null 2>&1; then
        echo "ERROR: ${tool} not found - install Node.js 20.19+ on the build machine" >&2
        exit 1
    fi
done

echo "==> Building the front end (mode: ${MODE})"
cd "${HERE}/frontend"
# npm ci installs exactly what's in package-lock.json, so every build of
# the same commit gets the same dependencies.
npm ci --no-audit --no-fund
npm run build -- --mode "${MODE}"
cd - >/dev/null

exit

# Pack only what the kiosk runs: server.js, its data and the built
# public/. The Vue sources and node_modules stay on the build machine.
STAGE="$(mktemp -d)"
trap 'rm -rf "${STAGE}"' EXIT
mkdir "${STAGE}/backend"
cp -a "${HERE}/backend/server.js" "${HERE}/backend/data" "${HERE}/backend/public" "${STAGE}/backend/"

"${REPO}/builder/scripts/make-app-squashfs.sh" "${STAGE}" "${OUT}"
