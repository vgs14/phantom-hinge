#!/bin/sh
# Runs every build step in order. Can be run from anywhere, and stops at
# the first step that fails rather than packaging a half-built image.
#
# Usage: ./scripts/build.sh [alpine-version] [arch]
#   Both default to ALPINE_VER/ARCH in builder/config.env - edit that
#   rather than passing them here, so every build agrees.

set -eu

cd "$(dirname "$0")/.."

./scripts/01-fetch-online-artifacts.sh "$@"
./scripts/02-devmode.sh
./scripts/03-splash.sh
./scripts/04-build-apkovl.sh
