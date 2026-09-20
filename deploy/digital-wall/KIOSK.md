# Digital Wall kiosk — host setup that keeps the screen alive

Bug report 6 item 7 shipped device registration: the wall screen now runs on
its own long-lived device key (approved from Console → Settings → Devices)
instead of a person's portal session, so the *software* no longer logs itself
out. What software cannot fix is the **kiosk host** — screen blanking, a
browser profile that forgets storage, or a machine that never restarts. Apply
everything below on the box that drives the TV. Each item is independent;
together they are the difference between "survives the weekend" and "blank on
Monday".

These steps survive a `git pull && docker compose up -d --build` because they
live on the kiosk host, not in the repo or the containers. Re-apply them only
when the kiosk machine itself is rebuilt — keep this file as the checklist.

## 1. Use the HTTPS domain, never localhost or plain http

Open the wall as `https://<your-portal-domain>/digital-wall/timeline`.

Why it matters:

- The device key (and the device id it belongs to) live in `localStorage`,
  which browsers key by *origin*. `http://localhost:3000`, `http://<lan-ip>`
  and the HTTPS domain are three different origins with three different
  storages — switching between them is why the wall kept "logging out" after
  reboots that changed how it was opened.
- Browsers treat plain-http origins as low-value and clear their storage far
  more eagerly, and some kiosk distros wipe non-secure-context storage on
  every restart.

One URL, always the same, always HTTPS.

## 2. Persistent browser profile

The kiosk browser must run with a **named, persistent profile directory** on
disk that survives reboots:

```sh
# Chromium example — the profile dir must NOT be in /tmp
chromium --kiosk "https://<portal>/digital-wall/timeline" \
  --user-data-dir=/home/kiosk/.config/wall-profile \
  --noerrdialogs --disable-session-crashed-bubble --disable-infobars
```

Never use `--incognito`, `--guest`, or a profile under `/tmp` — those drop
`localStorage` (the device key) on every restart, and the wall will sit at
"Waiting to be approved" until someone re-approves it. If your kiosk image
runs the browser from a systemd unit, put the `--user-data-dir` flag there.

## 3. Disable display blanking (DPMS) and screensavers

A blanked screen suspends the browser's rendering loop; before bug 6 item 3's
fix that also froze the board, and it still wastes the panel. On the X11 kiosk:

```sh
xset s off          # no screensaver
xset s noblank      # never blank the screen
xset -dpms          # no power management off/suspend
```

Put these in the kiosk session autostart (e.g. `~/.xprofile` or the openbox
autostart), not just an interactive shell. On Wayland/labwc use the
compositor's idle settings; on a smart-TV browser disable the TV's own
"screen off / eco" timers too.

## 4. Supervised nightly restart

Restart the *browser* (not the whole box) once a night at a quiet hour. It
clears leaked memory, reconnects the stream fresh, and picks up newly
deployed frontend builds without anyone touching the wall:

```sh
# crontab of the kiosk user — 04:30 local, then the supervisor relaunches it
30 4 * * * pkill -f chromium
```

…where the browser runs under a supervisor that relaunches it, e.g. a
systemd user unit with `Restart=always`:

```ini
# /home/kiosk/.config/systemd/user/wall-kiosk.service
[Unit]
Description=Digital Wall kiosk browser
After=graphical-session.target

[Service]
ExecStart=/usr/bin/chromium --kiosk https://<portal>/digital-wall/timeline --user-data-dir=/home/kiosk/.config/wall-profile --noerrdialogs
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

Because the device key is in the persistent profile, the restarted browser is
back on the wall in seconds with no sign-in.

## 5. First boot of a new screen (pairing)

1. Open the wall URL on the kiosk. It shows **"Waiting to be approved"** and
   a 4-character code. It shows nothing else — an unapproved screen gets no
   flight data.
2. On any signed-in machine, open Console → Settings → **Devices**. The same
   code is listed as a pending request (requests expire after 15 minutes —
   just reload the wall page to ask again).
3. Check the codes match, give the screen a name, press **Approve**. The wall
   comes to life by itself within a few seconds.
4. The key issued to the screen is read-only: it can fetch wall data and the
   stream, and nothing else. Revoking the device in the same card stops the
   screen immediately and returns it to the waiting state.
