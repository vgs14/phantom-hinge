#!/bin/sh
# Run ONCE on any machine WITH internet access. Does not need to be the
# netboot server itself — copy the resulting tftp/ and http/ directories
# over afterward
#
# Requires: wget
#
# Intended to be run from build.sh
#
# Usage: 01-fetch-online-artifacts.sh [alpine-version] [arch]
#   Both default to ALPINE_VER/ARCH in builder/config.env.

set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$(cd "$(dirname "$0")/." && pwd)"

# shellcheck source=../config.env
. "${ROOT}/config.env"
ALPINE_VER="${1:-${ALPINE_VER}}"
ARCH="${2:-${ARCH}}"
APK_FREEZE="${APK_FREEZE:-0}"

TFTP_DIR="$ROOT/tftp"
ALPINE_DIR="$ROOT/http/alpine"
REPO_DIR="$ROOT/http/repo/v${ALPINE_VER}"
# Netboot files are cached per version/arch, then copied into http/alpine/
# (whose path autoexec.ipxe can't vary). Without this, a version bump would
# keep serving the old kernel - fetch() skips files that already exist.
NETBOOT_CACHE="$ROOT/netboot_cache/v${ALPINE_VER}/${ARCH}"

mkdir -p "$TFTP_DIR/boot" "$ALPINE_DIR" "$NETBOOT_CACHE" \
    "$REPO_DIR/main/$ARCH" "$REPO_DIR/community/$ARCH"

# wget's --no-clobber only takes effect alongside -O if the destination file
# does not already exist yet - combined with an existing file, behaviour is
# unreliable (see wget(1)). So skip the download ourselves instead of
# relying on wget to do it. Downloads go to a temp name first, so a failed
# or interrupted one doesn't leave a partial file that gets skipped forever.
fetch() {
    dest="$1"
    url="$2"
    if [ -e "$dest" ]; then
        echo "    (skip) $dest already exists"
    else
        wget -q --show-progress -O "$dest.tmp" "$url"
        mv "$dest.tmp" "$dest"
    fi
}

echo "==> Fetching Alpine netboot kernel/initramfs/modloop (v${ALPINE_VER}/${ARCH})"
BASE="https://dl-cdn.alpinelinux.org/alpine/v${ALPINE_VER}/releases/${ARCH}/netboot"
for f in vmlinuz-lts initramfs-lts modloop-lts; do
    fetch "$NETBOOT_CACHE/$f" "$BASE/$f"
    cp "$NETBOOT_CACHE/$f" "$ALPINE_DIR/$f"
done

echo "==> Fetching iPXE binaries"
# Prebuilt binaries from ipxe.org boot.ipxe.org mirror. If you need a custom
# build (e.g. embedded script, specific NIC drivers), build from source
# instead: https://ipxe.org/download
# These go under boot/, which is where dnsmasq.conf's dhcp-boot lines
# point. They're x86 PC firmware loaders regardless of ARCH.
fetch "$TFTP_DIR/boot/ipxe.efi"      "https://boot.ipxe.org/x86_64-efi/ipxe.efi"
fetch "$TFTP_DIR/boot/undionly.kpxe" "https://boot.ipxe.org/x86_64-pcbios/undionly.kpxe"

echo "==> Mirroring Alpine apk repo"

# Use whatever python3 is first on PATH rather than assuming /bin/env
# exists - on many systems only /usr/bin/env is guaranteed to be there.
PYTHON3="$(command -v python3)"

FREEZE_ARG=""
if [ "${APK_FREEZE}" = 1 ]; then
    echo "    (APK_FREEZE=1: using cached package index, not checking for updates)"
    FREEZE_ARG="--frozen"
fi

# Mirror just alpine-base (and its dependencies). Enough to get the system running
# shellcheck disable=SC2086
"$PYTHON3" "${SCRIPT}/apk-resolve.py" \
    --quiet \
    --urls-only \
    --version "${ALPINE_VER}" \
    --arch "${ARCH}" \
    --output-dir "${ROOT}/http/repo" \
    --cache-dir "${ROOT}/apkindex_cache" \
    ${FREEZE_ARG} \
    alpine-base \
    openssl

# Mirror anything specified in /etc/apk/world
# shellcheck disable=SC2086
"$PYTHON3" "${SCRIPT}/apk-resolve.py" \
    --assume-installed alpine-base \
    --quiet \
    --urls-only \
    --version "${ALPINE_VER}" \
    --arch "${ARCH}" \
    --output-dir "${ROOT}/http/repo" \
    --cache-dir "${ROOT}/apkindex_cache" \
    ${FREEZE_ARG} \
    --file "${ROOT}/overlay-src/etc/apk/world"

# Version-free path for the mirror, so autoexec.ipxe never has to name the
# Alpine version: it boots from /repo/current/{main,community}. Relative
# symlink, so it survives being copied to srv/nginx/wwwroot/ with cp -r.
ln -sfn "v${ALPINE_VER}" "${ROOT}/http/repo/current"

echo ""
echo "==> Done."
echo "    Kernel/initrd/modloop: $ALPINE_DIR (v${ALPINE_VER}/${ARCH})"
echo "    iPXE binaries:         $TFTP_DIR/boot"
echo "    apk mirror:            $REPO_DIR (also at http/repo/current)"
