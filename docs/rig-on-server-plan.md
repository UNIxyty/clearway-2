# The rig on clearway-2: plan (2026-11-06)

Asked for on 2 November ("the tests are eating his day"). Numbers marked **measured** were measured; the rest are
estimates, and say what they rest on.

## Built (2026-11-07): steps 1–3, then reproducibility before the second lane

The box exists: a KVM VM `rigbox` (6 GB, 8 threads, 25 GB thin disk, QEMU user-mode network, SSH on the host's
loopback only). The first timing trial (one lane, 43 min 28 s, 66 green and 34 red) showed that **the rig could not be
rebuilt from the repository**: the Mac rig passed every day because it held setup nobody had written down. So step 5
(the breakages) came before step 4 (two lanes), with one goal: a rig built from the repository alone, on a clean
machine, with no step anyone has to remember. Proven the only way that counts: the box destroyed and built again by
`rig/box/build.sh --replace`, then a full run in it.

What the Mac had that the repository did not, and where it lives now:

| Found | Now |
| --- | --- |
| Migration 0028 and the email confirmations, applied to the Mac rig by hand | rig migrations; `rig/supabase/sources.json` names the rig source of every schema file; `rig/migrations-check.mjs` fails on a new one with none |
| The wall's airport directory, a file copied from one Mac | `rig/fixtures/geo-airports.json` (public reference data) |
| The manifest generator's Python environment | `rig/fontenv.sh` from `rig/fontenv-requirements.txt` |
| The extension suites loaded one Mac's main-checkout build from 13 October, by absolute path | paths relative to the checkout; the runner builds the rig extension before its suites |
| The intake's Leon data, a snapshot of production's Leon in one Mac's scratch folder | a private input (below) |
| Node installed by hand (the first boot's checksum step looked for the wrong file name) | `rig/box/user-data.yaml`, checked against nodejs.org's sums |

And what broke on Linux: `lsof` misses Next's server and Docker's root-owned listeners (so "stop the old agent" stopped
nothing): `rig/port.sh` uses `ss` there. `date -v` is BSD-only. Background services held pipes and SSH sessions open.
The bundle sweep took the box's user, `rig`, for a person's name. The database CLI is pinned everywhere (`2.119.0`).

**The zone:** the rig runs in Europe/Riga on every machine (the box's first boot sets it; the runner refuses
another). The dispatchers' zone, and the Mac's all along; and a zone that is not UTC shows code that reads the machine's
local time where it means UTC two hours off, which production's UTC servers would hide. (The empty board in the first
trial was not the clock, as first thought, but the order of the runner's setup: on a fresh database it refreshed the
walls before seeding their Leon operators. The operators are seeded first now, in the runner and in rig/up.sh.)

**Private inputs.** The repository is public, so two things stay out of it, on the server in
`/var/lib/libvirt/images/rigbox/inputs` (root only): the rig's own Anthropic key, and the Leon snapshot (production
operator data: aircraft, flights, the checklist configuration). `build.sh` refuses without either. Decided 2026-11-08: the real Leon
data stays a private input on the server; nothing from it goes into the repository, and there is no invented checklist.

**Build and run:** on the server as root, from a copy of `rig/box/`: `bash rig/box/build.sh --replace` (GitHub's
main) or `--source <git bundle create f HEAD>` (commits not pushed yet, the same hashes). About ten minutes. Then
`bash rig/box/ssh.sh "cd ~/clearway-2 && bash rig/run-all-suites.sh"`.

**Since then, every deploy** runs the static source checks first (`scripts/check-source.sh` in `scripts/deploy.sh`):
`error-text` sat red for four days because its verdict only ran in a full run, and no full run happened.

## What the server has, and what production uses (measured 2026-11-06, 20:45Z)

| | Server | Production uses | Free for the rig |
| --- | --- | --- | --- |
| CPU | AMD Ryzen 9 7900, 24 threads | load average 0.00–0.07 | almost all of it |
| Memory | 15 GB, 4 GB swap | 2.8 GB (13 containers; n8n the largest at 0.29 GB) | about 12 GB available; the rig gets 6 GB, capped (below) |
| Root disk (SSD) | 98 GB | 73 GB used, **21 GB free** | after pruning: about 70 GB free |
| /mnt/hdd-storage | 1.8 TB HDD | 0.5 GB | room, but slow for a database |
| Docker | 62 images, 58 GB | 12 active | 33 GB of old images and 21 GB of build cache can go |

Production's database is hosted (Supabase cloud), not on this machine, so a rig database here does not compete with it.
Single-thread speed, the same node loop: **the server 830 ms, the Mac 1,419 ms** (1.7× faster). The Mac: M1, 8 GB.

## What the rig needs

**Disk, one rig (measured on the Mac, sizes are the same on Linux):** database images 2.1 GB (Postgres alone 1.76 GB),
database volume 0.1 GB, git history 0.6 GB plus the working tree, `node_modules` 0.6–0.8 GB, the portal build
0.6–0.8 GB, browsers 0.8 GB, npm cache about 1 GB, scratch output (screenshots, logs) 0.7 GB today and growing.
**About 9 GB for one rig, plus about 1 GB for each extra lane** (its own database volume and scratch).

**Memory, one lane:** the rig database **0.45 GB measured** (0.454 GB peak under a browser suite); a browser suite with its
own portal, agent and proxy **0.8 GB peak measured** (web-citations-ui); the long-running rig services (three portal
processes, two agents, two walls, two proxies, six mocks) about 1–1.3 GB estimated (macOS compresses idle processes,
so their Mac numbers are not usable). **About 2.5 GB a lane.**

## How production is kept safe from it

1. **Its own machine inside the machine.** The rig runs in a KVM virtual machine ("rig box"), not on the host's Docker:
   its own Docker daemon, its own network, its own disk image. Nothing the rig runs (`supabase stop`, `db reset`, a
   prune, a port bind) can touch a production container. A wiped or broken rig box is deleted and rebuilt.
2. **Hard limits.** The VM gets 6 GB of memory, 8 of the 24 threads and a 40 GB disk on the SSD. If the rig runs out,
   the VM's own kernel kills a rig process; production keeps its 8+ GB. A production deploy (image builds peak around
   3 GB) still fits beside it.
3. **No way in.** The VM binds nothing on the host. Cloudflare's tunnel routes only to production's ports. Tailscale
   bypasses ufw, so the VM gets no Tailscale address; it is reached by `ssh clearway-2` then `virsh console`/ssh to its
   private address.
4. **No production secrets.** The VM holds `.env.rig` only: local Supabase, the rig's own Anthropic key (already
   different from all six production keys, checked by hash on 2026-11-04), mocks for Leon, Resend, ElevenLabs,
   Telegram. Production's `/root/clearway-2/.env` and `/mnt/hdd-storage` are not mounted. The rig's guards stay:
   `.env.rig` refuses supabase.co and verxyl.com; every suite refuses a non-local Supabase.
5. **Its own checkout.** The VM clones main itself. Production deploys never see rig work, and the rig never reads
   production's checkout.
6. **Deploys come first.** The deploy chain takes a lock; a rig run waits for it, and a deploy pauses the VM's CPU
   share (`virsh schedinfo`) for the build. A disk guard refuses to start a run below 15 GB free on the host.
7. **A run is reported, not just written.** The verdict line goes to the developers' Telegram, so a red night is seen.

## How many suites at once, and how long a full run takes

**Measured, on the Mac:**
- the 74 suites that do not need the model: **32 minutes** of suite time, 35 minutes wall clock (3 November);
- the 9 model suites (intake end to end, manifest/browser): **about 23 minutes** on 28 October, on Bedrock. Skipped
  since 1 November for the dead key; they run again now with the rig key, on the Anthropic API, and have not been timed;
- so a full serial run on the Mac is about **57–60 minutes** awake (the "two hours" was the Mac sleeping).

**Two lanes on the server (6 GB):**
- one runs the intake lane: the model suites and the browser intake suites, about 25 minutes. It is model-bound, so the
  faster CPU barely helps;
- the other runs everything else: 32 Mac minutes, about 20–25 on the server.

**Estimated: about 25–30 minutes for a full run**, the intake lane being the critical path. Three lanes (7.5 GB, with the
intake suites split across two databases, rig-speed.md option B) would bring it to about 20 minutes, at the cost of two
more days of work and tighter memory.

**Not measured yet: any time on the server.** That needs the rig there, which is the move. So the move's first step is a
timing trial: one lane, then two, timed suite by suite. The plan goes no further until those numbers are in.

## What breaks on the way, and the fix for each

- **The sleep guards** (`caffeinate`, the `pmset` log check in rig/run-all-suites.sh) are macOS only. A server does not
  sleep: on Linux they become a no-op.
- **Four extension files name /Users/whae/…** (rig/ext/harness.mjs, t-devtools-shot, t-toolbar, toolbar-composite):
  they become paths relative to the repo.
- **Three extension suites run a visible Chrome** (`headless: false`: an MV3 extension needs it). On the VM they run under
  `xvfb-run`; the new headless mode may also work and is tried first.
- **Fonts.** Linux has other system fonts. The checks that measure layout (Admin › Clients padding and overlap at six
  widths, the overlay and dark audits, the docs screenshots) may move by a pixel or a line. The same fonts get
  installed on the VM; anything still off is fixed and dated in rig-suites.md, never left red.
- **The database CLI is unpinned** (`npx supabase@latest` in rig/db.sh). It gets pinned to one version, the same on the
  Mac and the VM, so a CLI release cannot change the rig overnight.
- **The shared rig state** in rig-speed.md (the intake suites truncate tables; permissions-check deletes every grant;
  the vite preview on :4173) stays as it is inside a lane. Two lanes are two separate stacks, so they cannot collide.
- **Run time on Linux.** Untested so far. A handful of suites with timing waits may need their waits tuned; they come out
  of the trial.

## The Mac

The Mac keeps its own rig for a single suite: nothing in this plan removes it, and one suite at a time fits in 8 GB
(the swapping came from full runs). The full run moves to the server. Both rigs apply the same migrations
(`rig/db.sh reset`), and the runner says which machine it ran on.

The main checkout's `node_modules` is still empty (since 2026-11-04). Running `npm ci` there brings the Mac's rig back.

## The order, when you say go

1. Prune the host's old images and build cache, keeping each service's `:pre-` revert image. Takes the root disk from
   21 to about 70 GB free.
2. Install QEMU/KVM and libvirt on the host (the CPU has virtualisation on, `/dev/kvm` and `kvm_amd` are there; the
   packages are not). Create the rig box VM (6 GB, 8 threads, 40 GB). Inside it: Node 24, Docker, the pinned Supabase
   CLI, Playwright's browsers and fonts, and xvfb.
3. Clone main, `npm ci`, `.env.rig` from the Mac (the rig key only), `rig/db.sh start`.
4. **Timing trial**: one lane, then two lanes, timed suite by suite. Fix what breaks.
5. The lock with the deploy chain, the disk guard, and the verdict to Telegram.
6. Then: run it nightly, or on demand with `ssh clearway-2 rig-run`.

Steps 1–4: about a day. Step 5: half a day. Option B (three lanes): another day or two after that.
