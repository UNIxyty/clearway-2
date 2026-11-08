#!/usr/bin/env bash
# The rig box, built from nothing (2026-11-07): an Ubuntu VM on the server that holds the whole test rig, isolated from
# production (docs/rig-on-server-plan.md). Everything comes from this repository except the two private inputs below,
# which a public repository cannot hold; the script refuses to start without them.
#
#   rig/box/build.sh [--replace] [--source <git bundle>]      on the server, as root, from any checkout of this repo
#   RIGBOX=rigbox2 RIGBOX_MEM_MB=3584 RIGBOX_VCPUS=6 RIGBOX_SSH_PORT=2223 rig/box/build.sh …   a second box (two lanes,
#     rig/box/two-lanes.sh); the defaults are the one box: rigbox, 6144 MB, 8 threads, port 2222
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
BOX="${RIGBOX:-rigbox}"; MEM="${RIGBOX_MEM_MB:-6144}"; VCPUS="${RIGBOX_VCPUS:-8}"; PORT="${RIGBOX_SSH_PORT:-2222}"
[[ "$BOX" =~ ^rigbox[0-9]*$ ]] || { echo "RIGBOX must be rigbox or rigboxN"; exit 2; }
MAC="52:54:00:c1:ea:$(printf %02x "$(( ${BOX#rigbox} + 1 ))" 2>/dev/null || echo 01)"
BASEDIR=/var/lib/libvirt/images/rigbox                     # the cloud image and the private inputs: one copy, shared
D=/var/lib/libvirt/images/$BOX; INPUTS="$BASEDIR/inputs"; KEY=/root/.ssh/rigbox; KNOWN=/root/.ssh/${BOX}_known
REPLACE=0; SOURCE=""
while [ $# -gt 0 ]; do case "$1" in --replace) REPLACE=1;; --source) SOURCE="$2"; shift;; *) echo "unknown option $1"; exit 2;; esac; shift; done
say() { echo "[$BOX $(date -u +%H:%M:%SZ)] $*"; }
fail() { echo "[rigbox] REFUSED: $*" >&2; exit 3; }

[ "$(id -u)" = 0 ] || fail "run as root on the server"
. "$HERE/host-lock.sh"; run_gate "build of $BOX" || fail "not started: see the line above"
missing=""; for p in qemu-system-x86 qemu-utils libvirt-daemon-system libvirt-clients cloud-image-utils; do dpkg -s "$p" >/dev/null 2>&1 || missing="$missing $p"; done
[ -z "$missing" ] || fail "host packages missing:$missing (apt-get install --no-install-recommends$missing)"
[ -e /dev/kvm ] || fail "no /dev/kvm on this host"
[ -s "$INPUTS/anthropic.env" ] && grep -qE '^ANTHROPIC_API_KEY=.+' "$INPUTS/anthropic.env" || fail "no rig key in $INPUTS/anthropic.env (one line: ANTHROPIC_API_KEY=…, the rig's own key)"
[ -s "$INPUTS/leon-snapshot.json" ] || fail "no $INPUTS/leon-snapshot.json (the intake's Leon stand-in data; see rig/intake/leon-snapshot.mjs)"
[ -z "$SOURCE" ] || [ -s "$SOURCE" ] || fail "no bundle at $SOURCE"
# the old box's disk counts as free when --replace is about to delete it
free=$(df --output=avail -BG / | tail -1 | tr -dc 0-9); old=0
[ "$REPLACE" = 1 ] && [ -f "$D/$BOX.qcow2" ] && old=$(du -BG "$D/$BOX.qcow2" | cut -f1 | tr -dc 0-9)
[ $((free + old)) -ge 30 ] || fail "only $((free + old)) GB free on / once the old box is gone (the box needs up to 25 GB; production keeps the rest)"

if virsh dominfo "$BOX" >/dev/null 2>&1; then
  [ "$REPLACE" = 1 ] || fail "$BOX exists; --replace destroys it and builds a new one"
  say "destroying the existing box"; virsh destroy "$BOX" >/dev/null 2>&1 || true; virsh undefine "$BOX" >/dev/null
fi
mkdir -p "$BASEDIR" "$D" "$INPUTS"; chmod 700 "$INPUTS"; cd "$BASEDIR"

# the cloud image, checked against Ubuntu's sums every build (kept between builds)
B=https://cloud-images.ubuntu.com/releases/noble/release; IMG=ubuntu-24.04-server-cloudimg-amd64.img
curl -fsSL -o SHA256SUMS "$B/SHA256SUMS"
want=$(grep " \*$IMG\$" SHA256SUMS | cut -d" " -f1)
[ -f noble-base.img ] && [ "$(sha256sum noble-base.img | cut -d" " -f1)" = "$want" ] || { say "fetching the Ubuntu cloud image"; curl -fsSL -o noble-base.img "$B/$IMG"; }
[ "$(sha256sum noble-base.img | cut -d" " -f1)" = "$want" ] || fail "the cloud image does not match Ubuntu's checksum"
cd "$D"; rm -f "$BOX.qcow2" serial.log seed.iso

[ -f "$KEY" ] || ssh-keygen -q -t ed25519 -N "" -C rigbox -f "$KEY"
sed "s#@PUBKEY@#$(cat "$KEY.pub")#" "$HERE/user-data.yaml" > user-data
printf "instance-id: %s-%s\nlocal-hostname: %s\n" "$BOX" "$(date -u +%Y%m%d%H%M%S)" "$BOX" > meta-data
cp "$HERE/network-config.yaml" network-config
cloud-localds --network-config=network-config seed.iso user-data meta-data
qemu-img create -q -f qcow2 -F qcow2 -b "$BASEDIR/noble-base.img" "$BOX.qcow2" 25G
sed -e "s#@DIR@#$D#g" -e "s#@NAME@#$BOX#g" -e "s#@MEM@#$MEM#g" -e "s#@VCPUS@#$VCPUS#g" -e "s#@PORT@#$PORT#g" -e "s#@MAC@#$MAC#g" "$HERE/rigbox.xml" > "$BOX.xml"
virsh define "$BOX.xml" >/dev/null; virsh start "$BOX" >/dev/null; say "started ($MEM MB, $VCPUS threads, SSH on 127.0.0.1:$PORT); first boot installs Docker, Node and the fonts"

rm -f "$KNOWN"
SSH=(ssh -q -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="$KNOWN" -o ConnectTimeout=5 -i "$KEY" -p "$PORT" rig@127.0.0.1)
SCP=(scp -q -o BatchMode=yes -o UserKnownHostsFile="$KNOWN" -i "$KEY" -P "$PORT")
# 15 minutes of the box running: time a deploy kept it paused (rig/box/host-lock.sh) does not count
n=0; while [ $n -lt 90 ]; do "${SSH[@]}" "test -f /var/log/rigbox-ready" 2>/dev/null && break; sleep 10; [ "$(virsh domstate "$BOX" 2>/dev/null)" = paused ] || n=$((n + 1)); done
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
# into a log in the box, not this session: the services it leaves running would otherwise hold the session open
rc=0; "${SSH[@]}" "cd ~/clearway-2 && bash rig/setup.sh > ~/setup.log 2>&1 < /dev/null" < /dev/null || rc=$?
"${SSH[@]}" "cat ~/setup.log" < /dev/null | sed 's/^/  /'
[ "$rc" = 0 ] || fail "rig/setup.sh exited $rc in the box (above)"
say "done. Run the suite:  RIGBOX=$BOX rig/box/ssh.sh \"cd ~/clearway-2 && bash rig/run-all-suites.sh\""
