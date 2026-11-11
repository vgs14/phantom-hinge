#!/bin/sh
# Stages builder/ssh-dev/authorized_keys at build/ssh-dev/authorized_keys,
# which 04-build-apkovl.sh copies into the apkovl at
# /etc/ssh-dev/authorized_keys for etc/init.d/devmode to pick up at boot.
#
# This runs unconditionally - the file always ends up in the apkovl -
# but it's inert unless devmode is set on the kernel command line at boot
# (see autoexec.ipxe), at which point etc/init.d/devmode copies it into
# /root/.ssh/authorized_keys and starts sshd. Without devmode, sshd never
# runs and root is never reachable, so an unused key sitting in the
# apkovl isn't a real exposure - but if you'd rather it not be there at
# all in a given build, just leave builder/ssh-dev/authorized_keys empty.
#
# Written to build/ rather than overlay-src/ so the key never ends up in
# the source tree (builder/ssh-dev/authorized_keys and builder/build/ are
# both gitignored).

set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${ROOT}/ssh-dev/authorized_keys"
OUT_DIR="${ROOT}/build/ssh-dev"

# Never let a key from a previous build leak into this one.
rm -rf "${OUT_DIR}"

# Skip comment lines and look for a key type anywhere on a line, not just
# at the start - so keys with options in front of them, like
# from="10.1.1.0/24" ssh-ed25519 AAAA..., count too.
if [ -f "${SRC}" ] && grep -v '^[[:space:]]*#' "${SRC}" | grep -qE '(^|[[:space:]])(ssh-|ecdsa-|sk-)'; then
    echo "==> Staging dev SSH authorized_keys"
    mkdir -p "${OUT_DIR}"
    cp "${SRC}" "${OUT_DIR}/authorized_keys"
else
    echo "No key in builder/ssh-dev/authorized_keys - devmode root SSH login won't work" >&2
fi
