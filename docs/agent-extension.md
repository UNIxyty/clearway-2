# Ops Agent — Chrome extension (2026-09-27)

What was built from `agent-design-spec-extension.md` and the design file, how it was verified, the permission
model as it ended up, and how to package it. Code: `extension/` (Manifest V3), server routes in
`agent/lib/extension.mjs` + `agent/server.mjs`, the console's admin screen in `app/admin/agent-sites/`.
Screenshots: `docs/agent-extension-shots/` (named by the test that took them).

## The rule, by construction

The agent never reads a page by itself. This is architecture, not policy:

- **No content script is declared in the manifest.** Nothing runs in any page at install. Scripts are injected
  with `chrome.scripting.executeScript` only when the user acts (a shortcut, a menu item, a panel button, the
  pill) or when the page's host is on the organisation's list *and* Chrome has granted that origin.
- **The only host permission is the console's origin.** Every other site is an `optional_host_permission`,
  granted per site by the user in Chrome's own prompt after an admin approved it.
- **On an approved host, the one resident script is the pill**, and it reads only the *length* of the
  selection on mouseup; the text leaves the page when the pill is clicked. Everything else (selection read,
  page extraction, capture overlay, insert, voice bar) is injected for that one act and reads only what the
  act names: the selection, the pixels of the box, the page's main text without forms.
- **The tab bar and quick actions use the tab's URL and title only** (the `tabs` permission), never the page.
- **The worker holds no state**; nothing is prefetched, polled or scraped from pages. Its only network traffic
  is the console's API.

Evidence (test t3/t6): on a site not on the list, no `cw-*` host exists in the page, the proxy log shows only
`/agent/api/extension/session` polls from the extension with no body, and no request to the console origin
ever originates from the page (the page has no script of ours to make one).

## Built — 44 of 49 checklist items seen working in Chromium; 5 built but not observed

| Area | Status | Evidence |
|---|---|---|
| Side panel: header (History, New thread, Open in console, Settings), white surface on dark sites, thread persists across tab switches, holds at 320 | seen | t1, t11-320-thread (no horizontal overflow at 320) |
| Panel opens by icon / ⌥⇧C | built (`setPanelBehavior` + `_execute_action`); a real click cannot be synthesised in automation — load unpacked and click | — |
| Tab bar: site + address, four statuses, Selection·Region·Page, "nothing is shared" line, quick actions | seen | t2-tab-bar, t3-s3, t10-s4b, t11-320-chrome-page, t3-quick-actions-aip |
| Selection: pill (400 ms, 8 px above the end, approved sites only), context menu, ⌥⇧E, >20,000 warning with three choices | seen | t2-pill-on-page, t2-selection-draft, t9 (menu handler), t3-s10 |
| Region capture: dim, drag, size chip, Enter, Esc, crop at DPR, ≤2,000 px, card, failure card on Chrome pages | seen | t3-capture-overlay/drag, t11-capture-draft, t3-s11 |
| Whole page: title, URL, main text; nav/footer/ads/cookie banner stripped; **form values never sent**; approved sites only | seen | t3-page-draft (80 words, 4 headings, 1 table; `secret@example.com` absent) |
| Web attribution: `host · sent by you HH:MMZ`, `Capture · host · HH:MMZ`, amber | seen | t2-answer, t11-capture-answer |
| Verbatim only inside the panel; inserted verbatim gets the `VERBATIM — …` label line | built; label path not exercised (no approved clause in the rig threads) | code: `App.tsx verbatimLabelFor` |
| Quick actions from the URL only; read plain / write blue with "…"; write actions hidden by role (server filters by tool list, client re-filters) | seen (AIP rule); Leon rule needs the wall's flights (rig sandbox has no Leon) | t3-quick-actions-aip; `agent/config/quick-actions.json` |
| First-time "Recognised from the address only" card | built (Leon flights only) — not observed on the rig | — |
| Voice, panel closed: ⌥⇧Space, bar top-centre, live transcript, send on second press / Enter / 1.5 s pause, answer card, "Needs the panel" | seen — real speech through the fake mic, transcribed exactly | t7-bar-invoked/processing/answer |
| Voice, panel open: goes into the composer's docked bar | seen | t7-panel-voice |
| Microphone owned by the extension, asked once | seen: `getUserMedia` only in the panel/offscreen document; permission state `granted` for the extension origin; pages never prompt | t7 |
| Insert: proposal (Review), preview in page not in the field, confirmation (Where/Adds/Replaces/Sends), ⌘⏎, marker, toast, Undo 30 s / until edit, cancel on change, plain text, never submits, input + contenteditable, approved sites only, Activity log | seen | t4-* (contenteditable and textarea; the Send button's title never changed) |
| Writes: server confirmation, 5-min expiry, locked composer, amber "!", result only after the server, Wall row, double-click + held Enter = one run | seen | t5b-confirmation, t5-applied, t5b-expired (expired 20 s after 22:31:51; one `create_limitation` row applied) |
| Worker restart with a pending confirmation | seen: stopped via CDP (as chrome://serviceworker-internals), badge "!" and the alarm survive, expiry still clears it | t5, t5b |
| Toolbar: click opens the panel; action menu (4 items); pale when signed out; badges by priority | seen for badge "!", "3" (red) and signed-out title; the 40 % icon and the action menu are drawn by Chrome, not observable in automation | t5, t9, t6 |
| System notifications (confirmation waiting, job finished, only when Chrome isn't focused) | built; not observed (the test window is always focused) | `background/notifications.ts` |
| Context menus: selection, page submenu, image, action | selection/page handlers seen (dispatched); image built | t9 |
| Omnibox `cw`: five behaviours, METAR inline | seen for AIP and "Ask Clearway"; METAR/NOTAM/flight rows depend on wall/portal services the rig lacks (server rows dropped cleanly) | t9 |
| States S1–S11 | S1, S2, S3, S4, S4b, S5, S6, S10, S11 seen; S7/S8 use the console's own §4.16 cards (seen for a failed tool); S9 built, not observed | t2-after-first-run, t6-*, t3-*, t11-loading |
| Settings: shortcuts (live from `commands.getAll`), pill toggle, notifications toggle, mic test, sites (read-only), account, Disconnect | seen (mic test built, not observed) | t6-settings |
| Activity log "From" column (`Console` / `Extension · host`), kind INSERT | seen | t9-activity-from-column |
| Admin approval screen | seen (approve from the screen) | t9-admin-agent-sites, t9-admin-after-approve |
| Offline: question queues and sends on reconnect; a change does not | seen (1 queued, 1 sent after; a confirmation cannot be applied offline) | t6-offline-queued |
| Signed out → sign in on the console → reconnects by itself | seen: reconnected in 9 s | t6-signed-out, t6-reconnected |
| Disconnect signs out the extension only | seen: console cookies untouched | t6-disconnected |
| Voice bar and pill on the five backgrounds | seen | t8-* |

Not observed (built): system notifications; the image context-menu item; the S8/S9 cards; the mic test meter;
the 40 % pale icon (set through `action.setIcon` with alpha 0.4).

## Blocked

**Needs backend**
- **Leon flight quick actions on the rig**: the sandbox wall has no Leon credentials, so `resolve` answers
  `unavailable`; on production it reads the normalised feed by `flightNid`. Verify there.
- **Finished-job badge/notification**: there is no job registry; `/api/extension/badge` returns `jobs: []`.
- **NOTAM review count** comes from the wall's `/api/notam-check/today` (0 on the rig).
- **Reply mode** (spoken / shown / auto) is a per-user server preference (`GET`/`PATCH /api/settings/me`,
  `replyMode`; row `pref:<userId>:replyMode`). The console caches it in browser storage for the first paint only.
  `/api/extension/session` should return the same value in its `replyMode` field (currently still `null` there).
- **Omnibox METAR/NOTAM/flight rows** need the portal's weather source and the wall; the AIP row works.
- **"Save to Knowledge base…"** is not offered: no tool saves a document from a URL.

**Needs design**
- **Region from the panel button**: Chrome does not grant `activeTab` for a click inside the side panel, and a
  host permission alone does not allow `captureVisibleTab` (verified). The worker records each gesture on a tab
  (a command, a menu click, the panel opening from the icon or ⌥⇧C) and the button is **disabled** unless the
  active tab has one, with the hint "Capture with ⌥⇧S or right-click → Capture region"; after a gesture it works
  as before (verified: `rig/ext/t-region.mjs`, `region-disabled.png` / `region-enabled.png`). The explanation
  card stays for a capture that fails another way.
- **S4b → Chrome's prompt**: works; Chrome's prompt itself cannot be approved in automation (the card and the
  request are seen).
- **Voice keybind and behaviour** (decided 2026-09-27): ⌥⇧Space everywhere, press to start and press again to
  send, in the console and the extension; the console's mic button toggles the same way; a stored `Alt+Space`
  reads as the new default. All "hold" copy is gone.
- **Attachment card expanded state**, **request declined card** — built with spec defaults, not drawn.

## `NOT IN DESIGN — spec default` used

1. Selection card click expands beyond 3 lines; ✕ removes the draft (E6).
2. Capture: no handles, release captures; min 24×24; long side ≤ 2,000 px; JPEG thumbnail for the card (E6.2).
3. Page trimmed to 100,000 characters with the note (E6.3).
4. Write quick-action chips compose `Add a limitation for {callsign}: ` into the composer (E7).
5. Voice bar not draggable; "Needs the panel · ⌥⇧C" as the only action when the answer needs the panel (E8).
6. Insert target = the field the user last clicked; "Click the field to insert into" when there is none; the
   inserted text is logged (E9).
7. Composer not locked during an insert review (E9).
8. Notification copy for a finished file (E10).
9. Request scope toggle (E12 S4); "Request sent · you'll see a badge…" copy; declined card.
10. S5 composer accepts typing.
11. "Not now" on the microphone step (S1).
12. Disconnected state needs an explicit **Connect** (a deliberate act should not undo itself).
13. Width < 360: card button rows wrap; the confirmation record's header wraps.
14. Capture from the panel without a gesture: the "Capture from the page, not from here" card.
15. Foreign-surface tokens: `surface.foreign.border rgba(16,18,22,.28)` and the shadow are in the content
    scripts' stylesheet only (`TOKEN MISSING` — not added to `shared/design-tokens.json`, which is the console's).

## Admin approval screen (for design to pick up)

`/admin/agent-sites` (nav: Admin → Agent sites; also linked from Agent settings → Sites card). Plain console
pattern (PortalShell, PCard). Three sections:
1. **Pending requests** — site (mono, scope), requester (name + email), why, when (Z), Approve / Decline; each
   opens an inline note (optional for approve, encouraged for decline) then confirms.
2. **Approved sites** — host, scope, approved by, when, Revoke (inline confirm); "Add a site" row (host, include
   subdomains).
3. **Decided** — last 50: status chip, site, requested by, decided by, when, note.
Storage: `agent_settings` rows `extsite:<host>` and `extreq:<id>` (no DDL). Every decision is audited
(`extension.site_requested/decided/revoked/added`).

## Permission model (what a security review will read first)

| Manifest entry | Why it is needed |
|---|---|
| `sidePanel` | The panel is Chrome's side panel; the icon opens it (`setPanelBehavior`). |
| `storage` | The worker is ephemeral: session state, pending confirmations (with their 5-minute expiry), the current thread id, drafts and inserts live in `chrome.storage.local`; per-machine settings in `sync`. |
| `scripting` | Inject the pill, capture overlay, insert preview and voice bar on demand, and run `readSelection` / `extractPage` when the user acts. No content script is declared. |
| `activeTab` | One-tab access after a gesture (shortcut, menu, toolbar click): selection read, capture, and `captureVisibleTab` on sites that are not on the list. |
| `contextMenus` | "Ask Clearway about …", "Send this page", "Capture region", the image item, the icon menu. |
| `tabs` | The tab bar needs the active tab's URL, title and favicon, and quick actions match the URL. Nothing else about tabs is read. |
| `notifications` | "Confirmation waiting" and "job finished" when Chrome isn't focused (switchable). |
| `offscreen` | Microphone and speaker when the panel is closed — so the mic belongs to the extension, never to a site. |
| `favicon` | The tab bar shows the visited site's favicon from Chrome's own favicon cache (`/_favicon/` on the extension origin), so the panel never loads an image from the site and `img-src` stays `'self'` + the console. |
| `alarms` | Session poll, badge poll, the pending-confirmation expiry and the insert undo window — timers that survive a worker restart. |
| `host_permissions: https://clearway.verxyl.com/*` | The console: API calls carry the console's own session cookies (Chrome attaches them because the origin is a host permission). The extension stores no token. |
| `optional_host_permissions: https://*/*, http://*/*` | Approved sites, granted one at a time by the user in Chrome's prompt after an admin approved the host. Nothing is granted at install. |
| `commands` | The four shortcuts (⌥⇧C, ⌥⇧Space, ⌥⇧S, ⌥⇧E). |
| `omnibox: cw` | Address-bar lookups; Chrome draws the dropdown. |
| `web_accessible_resources: fonts/*` | The in-page surfaces load Public Sans / IBM Plex Mono from the package. Nothing else is exposed. |
| CSP `script-src 'self'` … `connect-src <console> wss://api.elevenlabs.io` | No remote code, no eval (the build fails on either); network only to the console and, for voice, ElevenLabs through a single-use token minted by the agent service. |

Authentication, two paths (2026-09-27):
1. **Cookie (primary).** The console's Supabase session, observed, never copied: every request is
   `credentials: "include"` to the console origin with `x-clearway-client: extension`; the server authenticates
   the cookie exactly as it does for the console (`agent/lib/auth.mjs`) and runs every tool as that user.
2. **Token (fallback), when the cookie does not arrive.** The extension asks a signed-in console tab (same
   origin, its cookies always travel) to call `POST /api/extension/token`; the agent answers with a sealed,
   short-lived token (15 min, AES-GCM, `agent/lib/extension-session.mjs`) that carries the user's own Supabase
   access token, so upstream calls still run as the user. The extension keeps it in `chrome.storage.session`
   (memory only, never `local`), refreshes it two minutes before expiry through `POST /api/extension/token/refresh`,
   re-exchanges from a console tab when refresh is refused, and clears it on Disconnect and on any 401. The
   server tries the cookie first, the token second, and a plain bearer last, and records which path
   authenticated each user: an audit row `extension.auth_path` whenever it changes, plus `authPath` in the
   session response. A silent change of browser behaviour therefore appears in the Activity log.
   Verified on the rig with the cookie withheld from the extension's requests (`rig/ext/t-auth-fallback.mjs`):
   signed out without a console tab; token path with one; chat, refresh and Disconnect through it; audit trail
   `bypass → cookie → token`.
   Note: Chrome sends even a `SameSite=Strict` console cookie with an extension's host-permitted requests, so the
   failure mode was simulated at the rig proxy, which drops the Cookie header from extension requests only.

## Packaging

Build: `cd extension && npm install && npm run build` → `extension/dist/`. Load unpacked: `chrome://extensions`
→ Developer mode → Load unpacked → `extension/dist`. Web Store: `npm run zip` → `extension/clearway-ops-agent.zip`
(148 files, ≈0.9 MB): `manifest.json`, `background.js`, `sidepanel.html`, `offscreen.html`, `assets/` (panel
and offscreen bundles, CSS), `content/` (four IIFE scripts), `icons/`, `fonts/`. The console origin is stamped
at build time (`CW_CONSOLE_ORIGIN`); `CW_TEST_HOSTS` is for the automated rig only and must never be set for a
release.

## Verification notes

Automated with Playwright driving Chromium with the unpacked build (Google Chrome 154 no longer accepts
`--load-extension`, so the automation used Playwright's Chromium; loading unpacked in Chrome is the manual
path). Gestures Chrome requires (icon click, shortcut key-down at browser level) were dispatched through the
extension's own event objects; the microphone was a fake device playing a recorded question. Test scripts and
raw logs: session scratchpad `ext-t1…t11`. Rig rows written to the production database (`extsite:127.0.0.1`,
`extsite:localhost`, one request for `vno-handling.example`) were revoked; audit rows for `local@clearway.aero`
and the rig's conversations remain, as with earlier rigs.

## Icons (2026-09-27)

The first icons were a preview thumbnail of a hand-drawn SVG (mostly blank at 16 px) and `action.default_icon`
declared only 16 and 32. Now `extension/scripts/make-icons.mjs` renders each size separately with Chromium
from the repo's vector sources — nothing is scaled down from a bitmap — into `extension/public/icons/`:
`app-{16,32,48,128}.png` and a pale signed-out set `app-off-*.png` (40 %). Both `icons` and
`action.default_icon` declare all four sizes; the worker switches sets with `chrome.action.setIcon`.
Two candidates were compared (`icon-candidates.png`): the Clearway emblem from `public/clearway-logo.svg`, and
the agent ring from `public/icons/ring-mark.svg`. The emblem's inner lines merge at 16 px; the ring stays
crisp, and the spec names it (§E10), so the ring is used at every size (`node … make-icons.mjs emblem` switches).
The mark sits on a white disc so it holds on a dark Chrome theme. Evidence: `chrome-extensions-row.png`
(real page), `toolbar-composite-100.png` / `-200.png` (the exact PNG Chrome uses at each scale on Chrome's
light and dark toolbar colours; the real toolbar could not be screen-captured without macOS Screen Recording
permission). The sign-in / sign-out switch was confirmed in Chrome: title "Clearway — signed out" and both
sets load through `setIcon` without error.

## Console-clean fixes (2026-09-27)

1. **Voice worklet** — was a `blob:` module, refused by the extension CSP (`script-src 'self'`); the code fell
   back silently to the deprecated `ScriptProcessorNode`. Now a real file, `public/voice-worklet.js`, served by
   the console at `/voice-worklet.js` and shipped at the extension root (`chrome.runtime.getURL`). No fallback:
   if it cannot load, voice shows "Voice unavailable" and logs why (`voice-unavailable-card.png`).
2. **Missing assets** — `scan.svg` and `link.svg` did not exist (added from lucide-static 0.469.0); the content
   scripts asked for font files under names the package does not have. The build stages every asset into
   Vite's public directory (no "didn't resolve" warnings remain) and fails on any reference — paths, font
   files, and every icon name used in source — not in `dist/`. Proven with a deliberately missing icon and font.
3. **Blocked image** — the visited site's favicon in the tab bar (third-party). Policy not widened: it now comes
   from Chrome's favicon cache on the extension origin (`favicon` permission).
4. **Issues panel** — form fields without id or name (composer, file input, command arguments, history search,
   the site request form): named.
5. **Rig console build** — a plain `npm run build` compiled the production Supabase URL and anon key into the
   console and copied `.env` (all production secrets) into `.next/standalone`, loaded at runtime. The rig now
   builds with `rig/build-portal.sh` (from `.env.rig`, `.env*` stripped, fetch cache cleared) and
   `rig/check-portal-build.sh` refuses any build with a `.env` file or a production Supabase host.

Verification rule from now on: the side panel's console, its DevTools Issues, and a content script's console
on a real page must be clean — `rig/ext/t-console.mjs` and `rig/ext/t-issues.mjs` exit 1 on any finding;
`rig/ext/t-devtools-shot.mjs` screenshots the real DevTools console.
