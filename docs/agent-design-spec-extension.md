# Clearway Ops Agent — spec addendum: Chrome extension

Addendum to `agent-design-spec.md` (and `agent-design-spec-viewer.md`). Design file: `Ops Agent Extension.dc.html` (Claude Design project). Everything in the base spec stands, §3 above all, except where §E14 lists a change. Conventions as before: `TOKEN MISSING`, `SOURCE UNKNOWN — developer to wire`, `NOT IN DESIGN — spec default`, `DECISION OPEN`. `§4.x` / `§6.x` = base spec; `§Ex` = this file. Frame codes (F1.3, S4b…) match the switcher in the design file.

Chrome API names are given so the developer knows which platform feature each behaviour relies on. Anything marked **(verify)** is platform behaviour this spec depends on and must be confirmed in a spike before build.

## E1. What the extension is, and the decisions that changed the brief

The same agent (same account, threads, rules, tools), reached from any Chrome tab through Chrome's side panel. The user sends it what's on screen; it never reads a page by itself.

| Brief | Built as | Why |
|---|---|---|
| Toolbar popup | **No popup.** Clicking the icon opens the side panel. Popup-style actions are in the icon's right-click menu | Chrome lets the icon do one thing on click. A popup is a second, smaller agent that closes and loses input as soon as focus leaves it |
| Push-to-talk keybind | **Press to start, press again or pause 1.5 s to send** | Chrome extension shortcuts only fire on key-down; there is no key-up |
| `⌥ Space` / `⌘J` | **`⌥⇧Space`, `⌥⇧C`, `⌥⇧S`, `⌥⇧E`** | `Alt+Space` opens the window menu on Windows; `Ctrl+J` is Chrome's Downloads shortcut; Chrome allows at most 4 suggested shortcuts |
| "Panel opens automatically" setting | **Cut** | Chrome only opens the side panel in response to a user action |
| Floating selection action on any page | **Approved sites only**; right-click and `⌥⇧E` everywhere | The floating pill needs a script in the page, which the site list governs |
| Wall writes from the extension | **Not offered at all** | §3 rule 13; the confirmation row says "Show it on the wall from the console" |
| Quick actions depend on the page | **Depend on the address only** | Keeps "the agent does not read pages by itself" literally true |

## E2. Platform constraints that shape the design

| Constraint | Consequence | API |
|---|---|---|
| Side panel width is set by the user; minimum ≈ 320px | Panel content must hold at **320**; drawn at 380 | `chrome.sidePanel` |
| Side panel opens only on a user gesture | "Open in panel" buttons and `⌥⇧C`; no auto-open | `sidePanel.open()` |
| One global panel per window, surviving tab switches | Panel set globally; the tab bar follows the active tab | `sidePanel.setOptions` without `tabId` |
| Host access = org-approved sites | Content scripts only on approved hosts, or on a tab after an explicit gesture | `optional_host_permissions`, `activeTab` |
| New site access needs the user's own consent in Chrome | Site requests are two steps: admin approves → user clicks "Enable on this site" → Chrome's prompt | `permissions.request()` |
| Chrome's own pages can't be scripted or captured | chrome://, the Web Store: capture fails; voice docks in the panel | — |
| Context menus, notifications, omnibox, permission prompt are drawn by Chrome/OS | We supply text only | `contextMenus`, `notifications`, `omnibox` |
| Badge: short text + background colour | Badge text ≤ 2 characters | `action.setBadgeText/BackgroundColor` |
| Mic permission is per origin | Audio is captured in the extension's own context, asked **once** | offscreen document with `USER_MEDIA` |

## E3. Surfaces and where each thing lives

| Surface | Owner of the pixels | Contents |
|---|---|---|
| Side panel | Us, inside Chrome's panel | The agent |
| Selection pill | Us, in the page (shadow DOM) | One button |
| Capture overlay | Us, in the page | Dimmer, box, hint bar |
| Voice bar + short answer | Us, in the page | Compact voice bar (§4.23 adapted) |
| Insert preview + toast | Us, in the page | Dashed preview, toast |
| Right-click menus, toolbar icon + badge, system notification, address bar dropdown, permission prompt | Chrome / OS | Text only |

**Everything we draw inside a third-party page** is rendered in a **closed shadow root** with `all: initial` on its host, fonts loaded from the extension package, and `z-index: 2147483647`. Page CSS must not restyle it, and it must never be hidden under page content.

**Nothing that carries the ink frame (`#17181c` verbatim treatment) is ever drawn inside a third-party page.** Approved text renders only in the panel, which is always our own white surface.

## E4. Side panel in Chrome

1. **Chrome's header**: 40px, drawn by Chrome. Not ours.
2. **Our header**: height **48**, bottom `1px #eef0f2`, padding `0 8px 0 14px`, gap 4: static ring mark 18px · `Ops Agent` 14.5/700 (margin-left 6, flex 1) · 30×30 icon buttons, icon 16 `#6c7079`, hover `#f0f1f3`:

| Icon | Tooltip | Action |
|---|---|---|
| `history` | `History` | Panel history (§6.10), same threads as the console |
| `square-pen` | `New thread` | New thread |
| `external-link` | `Open in console` | Opens this thread in the console's full-page chat (new tab, `/agent/t/{id}`) |
| `settings-2` | `Settings` | §E13 |

No minimise and no close.

3. **Tab bar** (§E5).
4. **Thread**: padding `14px`, gap 12, scrolls. Components exactly as the console panel at narrow width. Must hold at 320px: at < 360px source rows ellipsise the name; confirmation grid label column shrinks from 74px to 64px; card buttons wrap (`NOT IN DESIGN — spec default`).
5. **Composer**: §4.17 panel variant. Container padding `10px 12px 12px`, top `1px #eef0f2`; box radius 13, `1px #d6d8dc`; placeholder `Ask, or send something from the page…`; toolbar: `paperclip`, `at-sign`, `slash` (28×28, icon 15), hint 11 `#9aa0a8` `⌥⇧Space talk`, send 30×30 radius 9.

**Background:** the panel is always `#fff` with our tokens. It never takes on the page's theme.
**Thread continuity:** the thread persists across tab switches, tab closes and panel closes. A new thread starts only on "New thread".

## E5. Tab bar (what's shared, what isn't)

Replaces the console's context chip (§4.21). Here **nothing is shared until the user sends it**.

- Container: bg `#fbfbfc`, bottom `1px #eef0f2`, padding `10px 12px`, column gap 9.
- **Row 1**: favicon 15×15 · host + path mono 12 `#3a3d44`, ellipsis · site status pill 11/700, radius 999, padding `2px 8px 2px 6px`, icon 11:

| Status | Copy | Icon | Colours (text / bg / border) |
|---|---|---|---|
| Approved | `Approved site` | `circle-check` | `#15803d` / `#e7f6ec` / `#c7ead2` |
| Not approved | `Not on the list` | `circle-slash` | `#b45309` / `#fef3e2` / `#f6ddb0` |
| Requested / approved-pending-enable | `Requested 08:33Z` | `clock` | `#1d4ed8` / `#eef4ff` / `#dbe6ff` |
| Chrome's own page | `Chrome page` | `ban` | `#6c7079` / `#f0f1f3` / `#e6e7ea` |

- **Row 2 (approved sites)**: eyebrow `SEND` 11/700/0.08em `#9aa0a8` · three buttons 12/600, white, `1px #d6d8dc`, radius 7, padding `5px 8px`, icon 12: `Selection` (`text-select`; disabled at opacity .55 with text `#9aa0a8` when nothing is selected) · `Region` (`scan`) · `Page` (`file-text`).
- **Row 3**: 11.5 `#9aa0a8`: `Nothing on this page is shared until you send it.`
- **Not approved / Chrome pages**: rows 2–3 replaced by one line 12/1.5 `#6c7079`: not approved: `Clearway can't read this site. Capture still works with ⌥⇧S or right-click.` (or `Selections, the page and quick actions are off here.` on S3/S4); Chrome page: `Chrome doesn't let extensions read or capture its own pages.`
- **Quick actions row** (§E7) when the address is recognised.
- Hidden in first run, signed out and loading.

## E6. Sending context: selection, region, page

All three produce an **attachment card** above the user's message (and above the text in the composer while drafting). Nothing is sent until the user presses Enter.

**Attachment card** — width 310 (max: bubble column), white, `1px #e6e7ea`, radius 10, padding `8px 10px`, column gap 5:
- Header row 10.5/700/0.08em `#6c7079`: icon 12 · kind (`SELECTION`, `CAPTURE`, `PAGE`) · spacer · size mono 10.5/500 (`232 chars`, `84 KB`, `3.9 KB`); over the limit: `#b45309`.
- Body: selection text 12.5/1.5 `#3a3d44`, inset left rule `2px #d6d8dc`, padding-left 8, **clamped to 3 lines**; click expands. Capture: image 88px tall, radius 6. Page: `{title} · {n} words · headings kept · {n} table(s)`.
- Footer 11 `#9aa0a8`, ellipsis: `{page title} · {host}{path}` (capture: `{title} · {host} · {HH:MM}Z`).
- Remove ✕ while drafting.

| Kind | Sent | Never sent |
|---|---|---|
| Selection | selected text, page title, full URL, time | anything outside the selection |
| Region | PNG of the box, page title, host, time | page text, full URL path |
| Page | title, URL, main text (nav, footer, ads, cookie banners stripped), headings, tables as text | forms, input values, hidden elements |

**Tier:** all three are cited as **Web** tier (amber): `handling-baltic.lv · sent by you 08:12Z`, `Capture · vno-handling.lt · 08:31Z`.

### E6.1 Selection
**Floating pill** — approved sites only; setting to turn off. Appears **400 ms** after mouseup on a non-empty selection of ≥ 3 characters, **8px above the end of the selection**, flipped below if < 48px from the top. White, `1px solid rgba(16,18,22,.28)`, `box-shadow: 0 0 0 3px rgba(255,255,255,.92), 0 8px 24px rgba(0,0,0,.24)`, radius 999, padding `6px 12px 6px 8px`, gap 8: ring mark 16 · `Ask Clearway` 13/600 · `⌥⇧E` mono 11 `#9aa0a8`. Click → opens the panel with the selection as a draft card. Hides on selection cleared, Esc, scroll > 40px, or typing. Not shown in `input`/`textarea`/`contenteditable` selections.
**Right-click** — any site. Item: `Ask Clearway about “%s”`. **Shortcut** `⌥⇧E` — any site.
**Limit:** **20,000 characters**. Over it (S10), warning card (amber, `triangle-alert`): title `That's a long selection`; body `The agent reads up to 20,000 characters of a selection. For this much, send the page instead: it keeps the headings, so answers can say where things are.`; buttons `Send the page instead` (primary) · `Send first 20,000` · `Cancel`. Size label e.g. `48,120 chars` in `#b45309`.

### E6.2 Region capture
Triggers: `⌥⇧S`, right-click → Clearway Ops Agent → `Capture region`, icon menu → `Capture region`, panel `Region` button (approved sites).
- Dimmer `rgba(16,18,22,.45)` everywhere except the box (`box-shadow: 0 0 0 9999px rgba(16,18,22,.45)` on the box).
- Box: `1.5px solid #fff` + `outline: 1px solid #2563eb`. Size chip under the box's bottom-left: mono 11.5/600 white on `#2563eb`, radius 5, padding `2px 7px`: `560 × 200`.
- Hint bar, top-centre 14px from the top, foreign-surface treatment: `scan` 14 `#2563eb` · `Drag to capture` · `⏎ whole visible area` · `Esc cancel` (keys mono, secondary text `#6c7079`, separators `·` `#9aa0a8`) · `Capture` button 12.5/600 white on `#2563eb`, radius 999, padding `5px 11px`.
- Crosshair cursor. Releasing the mouse captures immediately. Minimum 24×24px; smaller = cancelled.
- Capture = `tabs.captureVisibleTab` then crop at devicePixelRatio. Image max 2,000px on the long side.
- Result: CAPTURE attachment card in the composer, panel opened.

### E6.3 Send this page
Triggers: panel `Page`, right-click submenu `Send this page`, icon menu `Send this page`. Approved sites only. Limit: 100,000 characters; over it, the first 100,000 with a note `Page trimmed to the first 100,000 characters.`

## E7. Quick actions
A registry of URL patterns → entity extractors → actions. Only the tab URL is used. Registry is server-provided.

| Pattern | Extracts | Actions |
|---|---|---|
| `app.leon.aero/flights/{id}` | Leon flight ID → looked up → callsign | `Limitations for this flight` (read) · `NOTAMs EVRA → EGLL` (read) · `Add a limitation…` (write) |
| `*/ad-2/{ICAO}` on AIP portals | ICAO | `AIP for {ICAO}` · `NOTAMs for {ICAO}` · `Save to Knowledge base…` (write) |

Display: top border `1px #eef0f2`, padding-top 9; eyebrow 10.5/700/0.1em `#9aa0a8` `LEON · FLIGHT BTI472 · FROM THE ADDRESS` (callsign mono `#3a3d44`); chips wrap, gap 6: 12/600, radius 999, padding `4px 10px`, icon 12. Read actions: `#17181c` on white `1px #d6d8dc`. **Write actions end in `…` and are `#1d4ed8` on white `1px #b9d0ff`**.
First time a flight is recognised in a thread, a neutral card: icon `link`, title `Recognised from the address only`, body `Flight 8812345 in Leon is BTI472, 24 SEP, EVRA → EGLL. The page itself hasn't been read.`
**Clicking a chip** sends its label as the user's message with the entity attached. Write chips put `Add a limitation for BTI472: ` into the composer and focus it. Write actions the user's role can't perform are **hidden**.

## E8. Voice outside the console
**Trigger:** `⌥⇧Space`. **Press to start; press again, press Enter, or pause 1.5 s to send; Esc discards.**
**Mic:** captured in the extension context (offscreen document), permission asked once in first run. Pages never get microphone access.

| Situation | Position |
|---|---|
| Panel open | Docked in the panel composer |
| Panel closed, scriptable tab | **Top-centre of the tab viewport, 14px from the top** |
| Chrome's own pages | Panel opens with voice docked |

**Contrast solution (VB)** — the same surface on every background: background `#ffffff` opaque; border `1px solid rgba(16,18,22,.28)`; `box-shadow: 0 0 0 3px rgba(255,255,255,.92), 0 10px 30px rgba(0,0,0,.32)`; text `#17181c`, provisional tail `#9aa0a8`, ring mark and waveform `#2563eb`. `TOKEN MISSING`: `surface.foreign.border rgba(16,18,22,.28)`, `surface.foreign.shadow`. Same treatment for every in-page surface: pill, hint bar, voice bar, short-answer card, insert toast.

**States** — as base §4.23: height 44, radius 999, padding `0 8px 0 14px`, gap 12; ring 16 (`2px #2563eb`, dot 6).
- Invoked: width 420; flat waveform (3px bars); `Listening…` `#9aa0a8`; right `⌥⇧Space to send · Esc` 11.5 `#9aa0a8`.
- Listening: width grows with text, 420 → **560** max; live waveform; timer mono.
- Processing: width 540; quoted question `#6c7079` ellipsis; divider 1×18 `#e6e7ea`; step 13.5 (`Fetching TAF EGLL…`); `Esc`; 2px `#2563eb` bar 33% wide sliding along the bottom.

**Short answer** — card 460 wide, 10px below the bar, same surface, radius 14, padding `12px 14px`, gap 8: speaking row: waveform (7 bars) · `SPEAKING · 0:04 / 0:09` 12/700/0.08em `#2563eb` · `Show instead S` pill · `Stop` pill. Transcript 14/1.5, spoken `#17181c`, unspoken `#b9bdc5`. Footer, top `1px #eef0f2`: source icons + names 12 `#6c7079` · `Open in panel ⌥⇧C` 600 `#1d4ed8`. Stays **8 s** after speech ends. Tables, documents, raw text and confirmations need the panel: the card shows `Needs the panel · ⌥⇧C` as the only action.

## E9. Insert into page
Approved sites only. **Plain text only. Never submits.** Target = the editable element focused when the user last clicked in the page; if none, `Review in page` asks `Click the field to insert into`. Insertion point = the caret; existing text kept. No server token; still blocking, explicit, logged. Verbatim text is preceded by `VERBATIM — {LIM-ID} rev {n} §{clause} (approved text, do not edit)`. Activity log kind `INSERT` (`#3a3d44` on `#f0f1f3`), tool `page.insert`, `{host, field, characters}`, result `Inserted` / `Undone` / `Cancelled`.

**Step 1 — Proposal.** Card: icon `text-cursor-input` `#1d4ed8`; title `Insert into page`; right `mail.clearway.lv` 11 `#6c7079`; text box 13/1.55 `#17181c` on `#fbfbfc` `1px #e6e7ea` radius 8 padding `8px 10px`; note 11.5 `#6c7079` `Goes into the field you last clicked: message body, after "Hi all,".`; buttons `Review in page` (primary) · `Copy` · `Edit` (ghost).
**Step 2 — Review.** In the page: preview box `1.5px dashed #2563eb`, bg `#f2f7ff`, radius 6, padding `8px 10px`, text `#3a3d44`; label straddling the top border `PREVIEW · NOT INSERTED` 10.5/700/0.08em `#1d4ed8` on white, padding `0 5px`. An overlay at the insertion point, **not** part of the field's value. In the panel: confirmation card: title `Insert this text?`; right `local · not saved to Clearway`; rows `Where` · `Adds` `4 lines · 232 characters` · `Replaces` `Nothing. Existing text is kept` · `Sends` `No. Clearway never presses Send`; buttons `Insert ⌘⏎` · `Edit first` · `Cancel Esc`. Composer not locked. Cancel if the field changes/disappears/navigates: `Insert cancelled — the field changed` / `…the field this was going into is gone`.
**Step 3 — Inserted.** One edit through `execCommand('insertText')` / InputEvent. Marker `box-shadow: inset 3px 0 0 #2563eb` **10 s**, then fades. Toast at the field's bottom-left, 16px inset: ring mark 14 · `Inserted by Clearway` 13 · `Undo` 13/600 white on `#2563eb` radius 7 padding `5px 10px` · countdown mono 11.5 `#9aa0a8` `0:24`. Panel record: `circle-check` `#16a34a`; `Inserted into message body`; right mono `08:14:02Z`; body `232 characters on mail.clearway.lv. Undo here or from the page for 30 s, or until you edit the field. Recorded in the activity log.`; `Undo`. **Undo window: 30 s, or until the user edits the field.**
**Step 4 — Undone.** Toast `Removed. The field is as it was` 3 s. Panel: dashed `#d6d8dc`, bg `#fbfbfc`, `undo-2` `#9aa0a8`, `Insert undone`, body `The field is back to what it was before. Ask again if you want a different version.`

## E10. Toolbar icon, badge, notifications, right-click menus
**Icon.** Ring mark. Click → opens/closes the panel. No popup. Tooltip `Clearway Ops Agent` / `Clearway — signed out`.

| Priority | Condition | Text | Background | Clears when |
|---|---|---|---|---|
| 1 | Confirmation waiting (this browser) | `!` | `#d97706` | answered or expired |
| 2 | NOTAM check needs review | count, `9+` above 9 | `#e5484d` | count 0 |
| 3 | Long job finished | `✓` | `#2563eb` | panel opened on it |
| 3 | Site request approved | `1` | `#2563eb` | site enabled |
| — | Signed out | none; icon at 40% opacity | — | signed in |

**System notification** — only **confirmation waiting** and **long job finished**, only when the Chrome window isn't focused: `Confirmation waiting` / `Create LIM-0422 for BTI472. Expires 08:26Z. Click to open the panel.`; `Briefing ready` / `BTI472_crew_brief_24SEP.pdf is ready in Clearway.` Toggle in Settings.

| Context | Items |
|---|---|
| Selection | `Ask Clearway about “%s”` |
| Page, no selection | `Send this page` · `Capture region` under `Clearway Ops Agent ▸` |
| Image | `Ask Clearway about this image` (sends as CAPTURE) |
| Toolbar icon | `Open side panel ⌥⇧C` · `Capture region ⌥⇧S` · `Send this page` · `Settings` |

`Send this page` hidden on sites not on the list.

## E11. Address bar (`cw`)
| Input | First suggestion | Enter does |
|---|---|---|
| `cw EGLL aip` | `EGLL AIP AD 2 · EG_AD_2_EGLL_en.pdf — AIRAC 2610 · AIP Portal` | Opens the document in the console viewer |
| `cw EGLL notam` | `EGLL NOTAM · 38 active · 4 new — NOTAM Check` | Opens NOTAM Check for EGLL |
| `cw EGLL metar` | `EGLL METAR 230720Z 24014G26KT 9999 BKN014 — aviationweather.gov` | Opens the airport page |
| `cw BTI472` | `BTI472 EVRA → EGLL · ETD 11:55Z — Flights` | Opens the flight in the console |
| anything else | `Ask Clearway: “{text}” — opens the panel` (always last) | Opens the panel with the text in the composer, **not sent** |

## E12. States
| Code | State | Panel | Tab bar | Page overlays | Composer |
|---|---|---|---|---|---|
| S1 | First run | Welcome | hidden | none | disabled |
| S2 | Signed out | card | hidden | pill and menus hidden | disabled |
| S3 | Site not on list | card | amber pill + note | pill unavailable; capture works | normal |
| S4 | Requesting a site | request card | amber | — | normal |
| S4b | Approved → enable | card + Chrome prompt | blue `Requested` | Chrome's prompt | normal |
| S5 | Loading | skeleton | hidden | — | disabled (accepts typing) |
| S6 | Offline | banner | normal | normal | `You're offline. Questions send when you're back` + `wifi-off` |
| S7 | Agent unavailable | §4.16 MODEL UNAVAILABLE | normal | normal | normal |
| S8 | No permission | §4.16 PERMISSION DENIED | normal | — | normal |
| S9 | Page changed mid-answer | amber banner above the streaming answer | new page | — | normal |
| S10 | Very long selection | warning card | normal | selection shown | normal |
| S11 | Capture failed | CAPTURE FAILED card | grey `Chrome page` | — | normal |

Composer: normal `Ask, or send something from the page…` `#d6d8dc`/white, send `#b9c8ea` → `#2563eb`; locked `Confirm or cancel the change above` + `lock`, `#e6e7ea`/`#f5f6f7`, send `#c9cdd3`, icons .4; offline `You're offline. Questions send when you're back` + `wifi-off`; disabled `Ask the agent…`.

**S1 First run** — `Clearway in any tab` 19/800; `Ask about what's on screen without switching to the console. The agent only sees what you send it.` 13.5 `#6c7079`. Steps (radius 11, padding `10px 12px`, gap 11; 22px circle): 1 done `Signed in as {name}` / `From your console session on {console host}.` · 2 done `{n} sites approved by Clearway` / `Leon, company mail, AIP portals and handlers. On other sites you can capture or paste.` · 3 to do (dot `#eef4ff`, `mic` `#1d4ed8`) `Microphone` / `Asked once, for the extension, not per site. Audio is transcribed and discarded.` `Allow microphone` (+ `Not now`) · 4 info `Shortcuts` / `⌥⇧C panel · ⌥⇧Space talk · ⌥⇧S capture · ⌥⇧E ask about selection. Change them in Chrome.` Done style `#f0faf3`/`#c7ead2`/dot `#16a34a`; to-do white/`#e6e7ea`.
**S2 Signed out** — `log-in`; `Sign in to Clearway`; `The extension uses your console sign-in. Sign in at {console host} and this panel connects on its own.`; `Open console sign-in`; note `Nothing you select or capture is kept while you're signed out.`
**S3** — `circle-slash` `#b45309`; `{host} isn't on Clearway's site list`; `The agent can't read selections or pages here. You can still capture a region (⌥⇧S or right-click), paste text, or ask something general.`; `Request this site` · `Capture region`.
**S4** — confirmation-style card, `send`: `Request {host}`; rows `Site` (mono) · `Scope` `This site only (not *.{host})` (toggle) · `Why` (textarea, prefilled from the page title, required 10–200) · `Goes to` `Clearway admins: {names}`; `Send request` · `Cancel`; note where admins approve. After sending: pill `Requested {HH:MM}Z`, card `Request sent · you'll see a badge when it's decided.` Declined: `Request declined by {name}` + note.
**S4b** — badge `1`; `circle-check` green `{host} approved`, right mono time, `Approved by {name}. Chrome will ask you to allow access to this one site.`, `Enable on this site` → Chrome's prompt.
**S5** — chip `Connecting to Clearway…` + 4 skeleton lines 12px, widths 80/62/90/48%, `#f0f1f3`, radius 4, pulsing.
**S6** — banner `wifi-off`: **You're offline.** `Earlier replies stay readable. Questions queue and send when you're back; captures and selections are kept with them. Nothing that changes data is queued.`
**S7** — `The agent can't reply right now` · `Your message and the selection are saved and will send when it's back. Nothing was run.` · `Retry now` · `Open console ↗`. **S8** — `You can't create limitations` · `That needs the Limitations editor role. The extension can't do more than you can in the console. Ask {admins}.` · `Request access` · `Copy request`.
**S9** — banner `history` amber: **You've moved on from the page this answer is about.** `It's about the selection you sent from "{title}" at {HH:MM}Z. The page you're on now hasn't been shared.`
**S11** — `scan` red, `CAPTURE FAILED`; `Couldn't capture this tab`; `Chrome doesn't let extensions capture chrome:// pages or the Web Store. Take a screenshot and paste it here, or attach the file.`; diag `tabs.captureVisibleTab → Cannot access contents of url "chrome://downloads/"`; `Paste a screenshot` · `Attach a file`. Variant `The tab changed before the capture finished.` with `Try again`.

## E13. Extension settings
Header 48 with `arrow-left` + `Extension settings` 14.5/700. Groups padding `12px 14px`, divider `#eef0f2`, eyebrow 10.5/700/0.1em `#9aa0a8`, rows gap 9, label 13/600, description 11.5/1.45 `#6c7079`.

| Group | Row | Control |
|---|---|---|
| SHORTCUTS | `Open the panel` · `Talk` · `Capture region` · `Ask about selection` | Keycap from `commands.getAll` |
| | `Change shortcuts` / `Chrome manages these at chrome://extensions/shortcuts.` | `Open ↗` |
| ON THIS COMPUTER | `Show "Ask Clearway" when I select text` | toggle, default on |
| | `System notifications` / `Confirmations waiting and finished jobs, when Chrome isn't focused.` | toggle, default on |
| | `Microphone` / `Allowed for the extension.` | `Test` (5 s level meter) |
| SITES · SET BY CLEARWAY | approved hosts (mono) with `APPROVED` (`#15803d` on `#e7f6ec`), first 3 + `+ n more` `Show all`; requests with `REQUESTED` (`#1d4ed8` on `#eef4ff`) | read-only |
| ACCOUNT | `{name}` / `From your console session.` | `Disconnect` |
| | `Agent settings, reply mode, roles` | `Console ↗` |

Toggles: 36×22, padding 3, knob 16 white with `0 1px 3px rgba(0,0,0,.2)`; on `#16a34a`, off `#cfd3d8`. Saved to `chrome.storage.sync`.

## E14. Changes to the base spec
1. §3 rule 13 clarified: the extension never offers wall actions. 2. §3 new rule 15: nothing drawn inside a third-party page carries the ink frame or a tier colour as a surface. 3. §4.21 context chip does not exist in the extension. 4. §4.23 extension voice bar is press-to-toggle, top-centre, not draggable, foreign surface. 5. §4.26 header has no minimise/close/expand; minimum width 320. 6. §6.13 minimised not available. 7. §11 Activity log — `From` column (`Console` / `Extension · {host}`); kind `INSERT`; tool `page.insert`. 8. §12 — **Sites** section (approve/decline requests). 9. §15 — decided: the voice keybind is `⌥⇧Space` everywhere (console, wall console, extension) and voice is press-again-to-send everywhere; the console no longer holds-to-talk (base spec §4.23, §8.1, §15 updated). A stored `Alt+Space` reads as the new default. 10. Third-party content the user sends is cited as **Web** tier with `sent by you` / `Capture`.

## E15. Register additions
| ID | Element | Trigger | Property | From → to | Duration | Easing |
|---|---|---|---|---|---|---|
| X1 | Selection pill in | selection held 400 ms | opacity, translateY | 0, 4px → 1, 0 | 120 ms | ease.out |
| X2 | Selection pill out | cleared / scroll / Esc | opacity | 1 → 0 | 80 ms | ease.in |
| X3 | Capture dimmer in | capture triggered | opacity | 0 → 1 | 120 ms | ease.out |
| X5 | Capture flash | capture taken | white overlay opacity | 0 → .6 → 0 | 180 ms | ease.out |
| X6 | Voice bar in | `⌥⇧Space` | opacity, translateY | 0, −8px → 1, 0 | 120 ms | ease.out |
| X7 | Voice bar width | transcript grows | width | 420 → 560 | 150 ms | ease.out |
| X8 | Short-answer card | answer ready | opacity, translateY | 0, −4px → 1, 0; out after 8 s | 120 / 160 ms | ease.out / in |
| X9 | Insert preview | Review in page | opacity | 0 → 1 | 150 ms | ease.out |
| X10 | Inserted marker | insert done | inset edge alpha | 1 → 0 after 10 s | 400 ms | ease.in |
| X11 | Insert toast | insert / undo | opacity, translateY | 0, 6px → 1, 0 | 120 ms | ease.out |
| X12 | Undo countdown | insert done | text | 0:30 → 0:00 | 1 s steps | — |
| X13 | Tab bar update | tab switch | host text | cross-fade | 100 ms | ease.out |
| X14 | Quick-action chips | recognised URL | opacity | 0 → 1 | 150 ms, 30 ms per chip | ease.out |

Keyboard: `⌥⇧C` open/close panel · `⌥⇧Space` voice, again to send · `⏎` voice send / capture whole visible area · `Esc` discard / cancel / hide pill · `⌥⇧S` capture · `⌥⇧E` ask about selection · `⌘⏎` insert · `S`/`V` show / say instead · `cw` + Space address bar.

## E17. Edges
Designed but incomplete: console Sites admin screen; request declined state; uncertain-word popover in the in-page bar; attachment card expanded state; Chrome PDF viewer capture fallback; width < 360 adjustments; `Needs the panel` behaviour; microphone test; `SOURCE UNKNOWN`: quick-action registry, lookup API, session handshake, badge push channel, deployment policy, payload formats.
Not designed: other browsers, tablet, phone, the wall display; writing to third-party systems; auto-reading pages; multi-field or formatted inserts; review furniture (do not build).
