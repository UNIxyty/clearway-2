#!/usr/bin/env bash
# The rig box, built from nothing (2026-11-07): an Ubuntu VM on the server that holds the whole test rig, isolated from
# production (docs/rig-on-server-plan.md). Everything comes from this repository except the two private inputs below,
# which a public repository cannot hold; the script refuses to start without them.
#
#   rig/box/build.sh [--replace] [--source <git bundle>]      on the server, as root, from any checkout of this repo
#     --replace   destroy the existing box first (its disk and everything in it)
#     --source    clone the rig from this bundle instead of GitHub's main: commits not pushed yet, the same hashes
#                 (made with  git bundle create <file> HEAD)
#
# Private inputs, in $INPUTS (root only, 0700):
#   anthropic.env         one line, ANTHROPIC_API_KEY=… : the rig's own key, never production's
#   leon-snapshot.json    the intake's Leon stand-in data (rig/intake/leon-snapshot.mjs): production operator data
#
# Host packages it needs (it does not install them): qemu-system-x86 qemu-utils libvirt-daemon-system libvirt-clients
# cloud-image-utils. Network: QEMU user mode, outbound only, SSH on the host's 127.0.0.1:2222. Nothing else is bound.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
D=/var/lib/libvirt/images/rigbox; INPUTS="$D/inputs"; KEY=/root/.ssh/rigbox; KNOWN=/root/.ssh/rigbox_known
REPLACE=0; SOURCE=""
while [ $# -gt 0 ]; do case "$1" in --replace) REPLACE=1;; --source) SOURCE="$2"; shift;; *) echo "unknown option $1"; exit 2;; esac; shift; done
say() { echo "[rigbox $(date -u +%H:%M:%SZ)] $*"; }
fail() { echo "[rigbox] REFUSED: $*" >&2; exit 3; }

[ "$(id -u)" = 0 ] || fail "run as root on the server"
missing=""; for p in qemu-system-x86 qemu-utils libvirt-daemon-system libvirt-clients cloud-image-utils; do dpkg -s "$p" >/dev/null 2>&1 || missing="$missing $p"; done
[ -z "$missing" ] || fail "host packages missing:$missing (apt-get install --no-install-recommends$missing)"
[ -e /dev/kvm ] || fail "no /dev/kvm on this host"
[ -s "$INPUTS/anthropic.env" ] && grep -qE '^ANTHROPIC_API_KEY=.+' "$INPUTS/anthropic.env" || fail "no rig key in $INPUTS/anthropic.env (one line: ANTHROPIC_API_KEY=…, the rig's own key)"
[ -s "$INPUTS/leon-snapshot.json" ] || fail "no $INPUTS/leon-snapshot.json (the intake's Leon stand-in data; see rig/intake/leon-snapshot.mjs)"
[ -z "$SOURCE" ] || [ -s "$SOURCE" ] || fail "no bundle at $SOURCE"
free=$(df --output=avail -BG / | tail -1 | tr -dc 0-9); [ "$free" -ge 30 ] || fail "only ${free} GB free on / (the box needs up to 25 GB; production keeps the rest)"

if virsh dominfo rigbox >/dev/null 2>&1; then
  [ "$REPLACE" = 1 ] || fail "a rig box exists; --replace destroys it and builds a new one"
  say "destroying the existing box"; virsh destroy rigbox >/dev/null 2>&1 || true; virsh undefine rigbox >/dev/null
fi
mkdir -p "$D" "$INPUTS"; chmod 700 "$INPUTS"; cd "$D"; rm -f rigbox.qcow2 serial.log seed.iso

# the cloud image, checked against Ubuntu's sums every build (kept between builds)
B=https://cloud-images.ubuntu.com/releases/noble/release; IMG=ubuntu-24.04-server-cloudimg-amd64.img
curl -fsSL -o SHA256SUMS "$B/SHA256SUMS"
want=$(grep " \*$IMG\$" SHA256SUMS | cut -d" " -f1)
[ -f noble-base.img ] && [ "$(sha256sum noble-base.img | cut -d" " -f1)" = "$want" ] || { say "fetching the Ubuntu cloud image"; curl -fsSL -o noble-base.img "$B/$IMG"; }
[ "$(sha256sum noble-base.img | cut -d" " -f1)" = "$want" ] || fail "the cloud image does not match Ubuntu's checksum"

[ -f "$KEY" ] || ssh-keygen -q -t ed25519 -N "" -C rigbox -f "$KEY"
sed "s#@PUBKEY@#$(cat "$KEY.pub")#" "$HERE/user-data.yaml" > user-data
printf "instance-id: rigbox-%s\nlocal-hostname: rigbox\n" "$(date -u +%Y%m%d%H%M%S)" > meta-data
cp "$HERE/network-config.yaml" network-config
cloud-localds --network-config=network-config seed.iso user-data meta-data
qemu-img create -q -f qcow2 -F qcow2 -b "$D/noble-base.img" rigbox.qcow2 25G
sed "s#@DIR@#$D#g" "$HERE/rigbox.xml" > rigbox.xml
virsh define rigbox.xml >/dev/null; virsh start rigbox >/dev/null; say "started; first boot installs Docker, Node and the fonts"

rm -f "$KNOWN"
SSH=(ssh -q -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="$KNOWN" -o ConnectTimeout=5 -i "$KEY" -p 2222 rig@127.0.0.1)
SCP=(scp -q -o BatchMode=yes -o UserKnownHostsFile="$KNOWN" -i "$KEY" -P 2222)
for _ in $(seq 1 90); do "${SSH[@]}" "test -f /var/log/rigbox-ready" 2>/dev/null && break; sleep 10; done
"${SSH[@]}" "test -f /var/log/rigbox-ready" || fail "first boot did not finish in 15 minutes (see $D/serial.log, and /var/log/cloud-init-output.log in the box)"
say "first boot done: node $("${SSH[@]}" "node --version"), $("${SSH[@]}" "docker --version | cut -d, -f1")"

# the rig: main from GitHub, or the given bundle
if [ -n "$SOURCE" ]; then
  "${SCP[@]}" "$SOURCE" rig@127.0.0.1:/home/rig/source.bundle
  "${SSH[@]}" "set -e; git clone -q ~/source.bundle ~/clearway-2; cd ~/clearway-2; git checkout -q -B main; git remote set-url origin https://github.com/UNIxyty/clearway-2.git; rm ~/source.bundle"
else
  "${SSH[@]}" "git clone -q -b main https://github.com/UNIxyty/clearway-2.git ~/clearway-2"
fi
say "rig at $("${SSH[@]}" "cd ~/clearway-2 && git log --oneline -1 | cut -c1-80")"

# the private inputs: the key into the .env.rig the setup writes around it, the Leon data where its stand-in reads it
"${SSH[@]}" "mkdir -p ~/clearway-2/rig/.scratch && umask 077 && cat > ~/clearway-2/.env.rig" < "$INPUTS/anthropic.env"
"${SCP[@]}" "$INPUTS/leon-snapshot.json" rig@127.0.0.1:/home/rig/clearway-2/rig/.scratch/leon-snapshot.json

say "setup: dependencies, browsers, fonts, the database, the whole rig up (rig/setup.sh)"
"${SSH[@]}" "cd ~/clearway-2 && bash rig/setup.sh" 2>&1 | sed 's/^/  /'
say "done. Run the suite:  ssh into the box (rig/box/ssh.sh), then  bash rig/run-all-suites.sh"
