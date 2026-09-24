# Ops Agent UI — build manifest

Derived row by row from `docs/agent-design-spec.md` (the primary reference). One row per buildable
item. **Status** is against what is actually in the repo and verified in a browser, not what a file
name suggests. A component that renders but does nothing is **partial**.

Status values: `missing` · `partial` · `present` · `✅` (built and verified in a browser this build) ·
`blocked` (with the reason in the last column).

Legend for *Data source*: `have` = backend from Parts 0–10 provides it · `small` = endpoint built in
this pass · `blocked:backend` = needs backend work larger than this pass · `blocked:design` = no
pattern in the spec to follow.

---

## A. Components (§4)

| # | Item | Spec § | States / variants | Animations (§14) | Data source | Status |
|---|---|---|---|---|---|---|
| A1 | Orb — canvas ring mark, geometry, DPR | 4.1 | idle · listening · thinking · speaking · error | O1–O6 | mic RMS / TTS level (`blocked:backend` for live levels; idle/thinking/error need none) | ✅ idle/thinking/error (canvas); listening/speaking levels blocked:backend (no mic/TTS) |
| A2 | Orb — avatar 26px, still | 4.1 | idle still · thinking (streaming) | O3 | have | ✅ |
| A3 | Orb — composer voice button 22px | 4.1 | idle breathing · live | O1, O2 | — | blocked:backend (no STT — the voice button is not rendered rather than stubbed) |
| A4 | Orb — empty state 64px, overlay 120px, cards 30px | 4.1 | idle · error still | O1 | — | ✅ 64 empty state, 30 cards; 120 overlay blocked:backend |
| A5 | Static ring mark (header, sidebar, chips) | 4.1 | — | — | — | ✅ |
| A6 | Waveform — voice bar 56×18 / wall 48×16 / speaking 40×16 / short 32×14 / panel static | 4.2 | invoked · listening · low · speaking | W1 | mic bands / TTS (`blocked:backend` live) | blocked:backend (no live audio) |
| A7 | User bubble — full page (16/16/4/16, 560) and panel (14/14/4/14, 330) | 4.3 | default · timestamp `DK · 07:42Z` (hover in panel) · voice-originated mic prefix · inline entity/command chips | — | have | ✅ |
| A8 | User bubble — sending / failed / edit-retry | 4.3, 16.2 | — | — | — | partial — sending/failed built (spec default); edit/retry blocked:design |
| A9 | Agent reply shell — avatar column, header line (full), block order | 4.4 | full · panel (no header) | — | have | ✅ |
| A10 | Tool activity A — live step list (done/running/queued/cancelled) with elapsed | 4.5 | 4 step states | A7 | tool events (`small`: add startedAt/durationMs to stream) | ✅ |
| A11 | Tool activity B — completed summary, collapsible, rows tool·args·result·duration, `read only` | 4.5 | collapsed (default after finish) · expanded · write rows (`pencil`) | A8 | `small` (args/result/duration on the tool chunk) | ✅ |
| A12 | Tool activity C — one-line summary (1–2 tools) → expands to B | 4.5 | — | A8 | as A11 | ✅ |
| A13 | Streaming caret 8×17 (7×15 panel) | 4.6 | — | A6 | have | ✅ |
| A14 | Stop button (full + panel) | 4.6 | — | — | have | ✅ |
| A15 | Stopped row + `Continue` | 4.6 | — | A10 | `small` (continue = resend with partial) | ✅ |
| A16 | Sources — per-claim underline + superscript (3c) | 4.7 A | internal/company/web; hover claim↔row | H1 | claim spans from model — `blocked:backend` | blocked:backend (claim spans from the model) |
| A17 | Sources — no-source sentence tooltip `agent's reasoning`; unsourced reply eyebrow | 4.7 A | — | — | — | ✅ |
| A18 | Sources — chip row (several) / inline single / 3c rows | 4.7 B | 1 · several · linked/unlinked | H1 | have | ✅ |
| A19 | Sources — panel footer strip + one line per source + single-line chips | 4.7 C | — | — | have | ✅ |
| A20 | Verbatim frame — full page (header stamp·copy·ref; body; footer approved/sha/buttons) | 4.8 | — | — | `small`: `GET /api/verbatim/:kind/:id` by ID | ✅ |
| A21 | Verbatim frame — panel (stacked header, never collapses) | 4.8 | — | — | as A20 | ✅ |
| A22 | Verbatim — `Copy exact text` → `Copied` 1500 ms; `Open source · p. n` | 4.8 | — | — | page number from record | ✅ |
| A23 | Verbatim — fetch failure → error, never model text | 4.8, §3.1 | error | — | as A20 | present — fetch-failure path tested by scripts/agent-verify-ui-rules.mjs (404 → error); the error frame itself not seen in the browser run |
| A24 | Agent's reading eyebrow + muted prose (full + panel) | 4.8 | — | — | have | present (built; not exercised in the browser run) |
| A25 | Flight card — spacious full page | 4.9 | pills delayed/on-wall · markers · delta/on-time | H1 | wall (`have`, fields partial) | present (built; no flight data reachable on the rig — portal tools 401) |
| A26 | Flight card — panel 372 | 4.9 | — | H1 | have | present (as A25) |
| A27 | Flight card — dense row 2a, click expands | 4.9 | flight · airport · document rows | — | have | present (as A25) |
| A28 | Flight cards — several: 2-col grid, `+N more`; panel stack `+n more flights` | 4.9 | — | — | have | present (as A25) |
| A29 | Airport summary — full page 3 columns | 4.10 | VFR/MVFR badge | — | weather/NOTAM/CAA (`have` via tools) | present (built; portal-backed tools unreachable on the rig) |
| A30 | Airport summary — panel label rows / A2 compact | 4.10 | — | — | have | present (as A29) |
| A31 | Document result — full page (PDF tile, meta, Download/Open/Email) | 4.11 | stale/cached pill | — | AIP tool (`have`) | present (as A29) |
| A32 | Document result — panel 3-col actions; icon buttons at 340 | 4.11 | — | — | have | present (as A29) |
| A33 | Generated file — preview pane (page 1 render), eyebrow, summary, Download/Preview/Send… | 4.12 | — | — | `small`: thumbnail of page 1 (PDF) | ✅ (preview pane relies on the browser PDF viewer; headless showed the plugin fallback) |
| A34 | Table — full page grid, pills, footer Open/Export CSV | 4.13 | — | — | have | present (built; not exercised in the browser run) |
| A35 | Table — panel reflow, 4 rows inline, footer `+n more · Show all · Filter the page` | 4.13 | — | — | have | present (built; not exercised in the browser run) |
| A36 | Table — Full view sheet 900px | 4.13 | — | — | have | present (built; not exercised in the browser run) |
| A37 | Mono block — full page `pre`, header meta, Copy | 4.14 | — | — | have | present (built; not exercised in the browser run) |
| A38 | Mono block — panel wrap-at-spaces, `↳`, `—` separators, Wrap toggle, Show on page ↖ | 4.14 | wrap on/off | P9 | have; show-on-page needs page contract (`small` for NOTAM page) | present (built; not exercised in the browser run) |
| A39 | Confirmation — low-risk inline 5a (`Apply ⏎`) | 4.15 A | pending · applied · cancelled | C1 | `small`: generic server confirmations | ✅ |
| A40 | Confirmation — standard card (header expires, body grid, footer ⌘⏎) | 4.15 B | pending · loading · applied · cancelled · expired · partial | C1 | `small` | ✅ |
| A41 | Confirmation — multi-change block | 4.15 B | — | C1 | `small` | present (only single-change prompts arose on the rig) |
| A42 | Confirmation — change behind panel (`previewed on the page ←`) | 4.15 B, 6.8 | — | P6 | page↔panel contract (`small` for Limitations page) | blocked (wall console is a separate app — no page↔panel contract) |
| A43 | Confirmation — destructive pinned bar, hold 2 s, countdown, `Keep it` | 4.15 C | pending · holding · released · expired | C2, C3, C4 | `small` | ✅ |
| A44 | Confirmation — records Applied / Sent / Cancelled / Expired / Partial / Applied (panel) | 4.15 D | 6 | C1 | have (action rows) | ✅ applied / cancelled / partial; expired tested by the rules script |
| A45 | Confirmation — modal 5b destructive (type ID) and low | 4.15 E | — | — | `small` | present (built; not exercised in the browser run) |
| A46 | Confirmation — composer lock while pending; expiry 5 min; focus to Cancel; loading on Confirm | 4.15, §3.6–8 | — | — | `small` | ✅ |
| A47 | Confirmation — double-fire proof (disable on first activation, idempotent token) | §3.6 | — | — | `small` | ✅ (rules script: 3 parallel confirms + retry → 1 action) |
| A48 | Error card — TOOL FAILED / PERMISSION DENIED / SOURCE UNAVAILABLE / MODEL UNAVAILABLE | 4.16 | 4 kinds + panel variants | — | have (tool errors) | ✅ PERMISSION DENIED seen; other kinds share the card |
| A49 | Error card — Offline (panel) with queued item row | 4.16 | — | — | have | ✅ |
| A50 | Composer — full page (16 radius, 8-line growth, toolbar, hint, voice+send buttons) | 4.17 | empty · has text · uploading · locked · voice active · offline | — | have | ✅ |
| A51 | Composer — panel variant | 4.17 | same | — | have | ✅ |
| A52 | Attachments — chips (image · uploading · failed · too large · uploaded), remove | 4.18 | 5 | U1 | upload endpoint — `small`: `/api/attachments` (25 MB, PDF/img/CSV/XLSX/TXT) | ✅ uploaded chip; failed/too-large states built |
| A53 | Attachments — drop zone over the thread | 4.18 | — | D1 | — | present (built; not exercised in the browser run) |
| A54 | @ picker — type tabs, groups, rows, footer, prefix highlight | 4.19 | 6 entity types | M1 | flights `have`; airports/operators/aircraft/limitations/documents via tools (`have`) | ✅ |
| A55 | @ picker — panel context-first ordering (SELECTED / VISIBLE / recents) | 4.19 | — | M1 | page context (`have` partial) | present (built; not exercised in the browser run) |
| A56 | Mention chips — inserted, in bubble; hover card | 4.19 | flight/airport/aircraft/document · limitation · person | — | hover card content `blocked:design` | present (built; not exercised in the browser run) |
| A57 | / menu — rows, kinds, tiles | 4.20 | `/aip /notam /weather /brief /email` | M1 | `/brief` and `/email` map to generate_file / email flow (`have`) | ✅ |
| A58 | / command chip + argument slots in composer; in bubble | 4.20 | current slot · optional slot · remove | — | — | ✅ |
| A59 | Context chip (pill, icon by type, clear) | 4.21 | flight · airport · wall/NOTAM check · limitations page · none | — | have | ✅ |
| A60 | Context chip — loading `Reading Flights · KLJ7226…` | 4.21 | — | P4 | have | present (built; not exercised in the browser run) |
| A61 | Context chip — "Now on…" switch | 4.21 | — | — | have | present (built; not exercised in the browser run) |
| A62 | Suggested questions — full page 4 cards | 4.22 | hover | H1 | live counts `small` (wall state) | ✅ |
| A63 | Suggested questions — panel B1/B2/B3 sets | 4.22, 6.6 | — | H1 | `small` | ✅ B1 (EVRA) and B3 (no context); B2 blocked (wall console is external) |
| A64 | Compact voice bar — invoked/listening/uncertain/processing/error | 4.23 | 5 + 3 error rows | V1–V6, V8 | STT — `blocked:backend` (no ElevenLabs Scribe wiring) | blocked:backend |
| A65 | Voice bar — placement, drag/snap, selected-row context pill | 4.23 | — | — | as A64 | blocked:backend |
| A66 | Voice bar — short-answer card 8 s, `Open in panel ⌘J` | 4.23 | — | V7 | as A64 | blocked:backend |
| A67 | Voice bar over the wall display | 4.23, 16.2 #3 | — | — | **not built** (see report §4) | blocked:design — decision for you (see report) |
| A68 | Voice overlay (large) — 5 states | 4.24 | idle · listening · thinking · speaking · error | V9, O1–O5 | as A64 | blocked:backend |
| A69 | Spoken reply — delivery rules, preference pill, speaking card, must-show, long, both-at-once | 4.25 | 6 rule rows | S1–S3 | TTS — `blocked:backend` | blocked:backend |
| A70 | Panel shell — 420 default, 360–600 drag, header 60, 5 header buttons | 4.26 | push · overlay | P1 | have | ✅ |
| A71 | Panel shell — minimise tab (working / needs you amber / done) | 6.13 | 3 | P3, P10 | have | ✅ |
| A72 | Buttons — primary/secondary/ghost/destructive, 4 sizes, disabled, focus ring | 4.27 | — | H1 | — | ✅ |
| A73 | Pills, tags, keycaps, header status pill | 4.27 | — | — | — | ✅ |

## B. Screens (§5–§12)

| # | Item | Spec § | States | Animations | Data source | Status |
|---|---|---|---|---|---|---|
| B1 | Sidebar entry — expanded item + keycap; active / panel-open / inactive | 5 | 3 | H1 | have (`hasAgent`) | ✅ |
| B2 | Sidebar entry — sub-items Chat/History/Knowledge base (badge)/Activity log/Settings | 5 | — | — | badge count `small` | ✅ |
| B3 | Sidebar entry — rail (dot badge) and deep-context pinned block | 5 | — | — | have | ✅ rail; deep-context pinned block built (portal deep contexts not visited in the run) |
| B4 | Panel — open/close triggers (⌘J, item, `Ask about …` page button, Esc, x) | 6.1 | — | P1 | have | ✅ ⌘J, sidebar item, Ask about…, ×; Esc built |
| B5 | Panel — push vs overlay rule (≥900 content; 1280 always overlay) | 6.2 | — | P1 | have | ✅ push at 1440 |
| B6 | Panel — layout (chip, thread, composer) | 6.4 | — | — | have | ✅ |
| B7 | Panel — empty states B1 (airport) / B2 (wall console) / B3 (no context + recents) | 6.6 | 3 | — | `small` (live counts, recents `have`) | ✅ B1/B3; B2 blocked (wall console external) |
| B8 | Panel — replies at width (all card variants) | 6.7 | — | — | have | ✅ verbatim/confirmation/error/tool cards at 420; data cards present (no rig data) |
| B9 | Panel — change behind the panel: ghost row, wall preview, applied row highlight, banner, Revert… | 6.8 | pending · applied · cancelled | P6, P7, P8 | page contract `small` (Limitations page) | blocked (cross-app contract with the wall console SPA) |
| B10 | Panel — voice docked in composer | 6.9 | — | — | as A64 | blocked:backend |
| B11 | Panel — History view (groups ABOUT/TODAY/YESTERDAY, search, footer) | 6.10 | list · empty · loading (empty/loading `blocked:design`) | — | have | ✅ |
| B12 | Panel — loading / streaming / error / offline | 6.11 | 4 | A7 | have | ✅ |
| B13 | Panel — expand to full page (`/agent/t/…`, "From Flights · KLJ7226" link, back) | 6.12 | — | P2 | have | ✅ |
| B14 | Panel — minimised tab | 6.13 | 3 | P3, P10 | have | ✅ |
| B15 | Panel — never on the wall display | 6.14, §3.13 | — | — | have (display has no console shell) | ✅ |
| B16 | Full page — layout (header 60, 800 column, composer) | 7.1 | — | — | have | ✅ |
| B17 | Full page — header (title, meta, web pill, changes pill, side-panel button, New chat) | 7.2 | — | — | title `have`; pills from settings `small` | ✅ |
| B18 | Full page — empty state B1 (orb 64, headline, 4 cards) | 7.3 | — | O1 | have | ✅ |
| B19 | Full page — thread, streaming/stop (B2), load order, focus, tab order | 7.4–7.6 | — | A6, A9, A10 | have | ✅ |
| B20 | Full page — command palette 1c | 7.7 | `DECISION OPEN` | — | — | blocked:design (decision open — not built) |
| B21 | Voice — order of events, permission card, unavailable card | 8 | 2 cards | — | as A64 | blocked:backend (no STT to proceed to after the permission card) |
| B22 | History page — search, filters, grouped list, row chips/meta | 9 | list · empty · loading · no results (last three `blocked:design`) | H1 | have + `small` search | ✅ |
| B23 | Knowledge base — header, stat cards, table, tier badges, status | 10 | — | — | have + `small` stats | ✅ |
| B24 | Knowledge base — approval panel (pending/approved/reference/rejected), extraction check, uploader cannot approve | 10 | 4 | — | have (approve/reject); clause extraction preview `small` | ✅ pending → approved seen; reference/rejected built |
| B25 | Knowledge base — upload flow / rejection note / failed-indexing actions / stat filtering | 10, 16.2 | — | — | — | ✅ upload (existing console form) + rejection note (spec default); failed-indexing actions and stat filtering blocked:design |
| B26 | Activity log — header, segmented filter, dropdowns, table, kinds, results, confirmed | 11 | — | — | `small`: `GET /api/activity` over agent_audit_log + agent_actions | ✅ |
| B27 | Activity log — expanded record (REQUEST / ARGUMENTS·RESULT / CONFIRMATION) | 11 | — | — | as B26 | ✅ |
| B28 | Activity log — Export CSV | 11 | — | — | `small` | ✅ (CSV endpoint) |
| B29 | Activity log — filter menus, pagination | 16.2 | — | — | — | ✅ menus via console Dropdown (spec default); Load more paging |
| B30 | Agent settings — capabilities toggles (5), immediate save, logged | 12 | on/off | T1 | `small`: `agent_settings` capability flags | ✅ |
| B31 | Agent settings — who can do what (read-only) | 12 | — | — | `small` from allowlist + roles | ✅ |
| B32 | Agent settings — usage card (spend, cap, replies, tool calls, heaviest user) | 12 | — | — | `small` from audit tokens × model rates; cap editing `blocked:design` | ✅ |

## C. Email template (§13)

| # | Item | Spec § | States | Data source | Status |
|---|---|---|---|---|---|
| C1 | Structure — desk, card, header (logo + tag), requester line, footer with reference line | 13.2 | light · dark · images blocked | have (Resend mailer) | partial |
| C2 | Blocks — heading, paragraph, personal note, titled section | 13.3 | — | have | partial |
| C3 | Blocks — label/value table, mono block, verbatim quote (2px ink, footer) | 13.3 | — | have | partial |
| C4 | Blocks — callout, attachment list, sources, console link CTA | 13.3 | — | have | partial |
| C5 | Images — absolute HTTPS, alt, text fallbacks | 13.1 | — | have (Supabase storage URLs) | present |
| C6 | Reply-To requester; From agent@ | 13.1 | — | have (`agent@verxyl.com` — see report §7) | partial |
| C7 | Dark mode via `prefers-color-scheme` + `[data-ogsc]` | 13.1 | — | — | missing |

## D. Animation register (§14) — one row each

| # | ID | Element | Status |
|---|---|---|---|
| D1 | O1 | Orb idle breathing | present (built; not exercised in the browser run) |
| D2 | O2 | Orb listening | blocked:backend |
| D3 | O3 | Orb thinking | present (built; not exercised in the browser run) |
| D4 | O4 | Orb speaking | blocked:backend |
| D5 | O5 | Orb error (still) | present (built; not exercised in the browser run) |
| D6 | O6 | Orb state colour 200 ms *(spec default)* | present (built; not exercised in the browser run) |
| D7 | W1 | Waveform bars | blocked:backend |
| D8 | A6 | Streaming caret blink | ✅ |
| D9 | A7 | Running step / loading dots / minimised dot pulse | present (built; not exercised in the browser run) |
| D10 | A8 | Tool summary expand 160 ms *(spec default)* | present (built; not exercised in the browser run) |
| D11 | A9 | Token streaming | present (built; not exercised in the browser run) |
| D12 | A10 | Stopped row 150 ms *(spec default)* | present (built; not exercised in the browser run) |
| D13 | C1 | Confirmation → record 200 ms *(spec default)* | present (built; not exercised in the browser run) |
| D14 | C2 | Hold-to-delete fill 2000 ms linear (runs under reduced motion) | ✅ (seen mid-fill) |
| D15 | C3 | Hold release 150 ms *(spec default)* | present (built; not exercised in the browser run) |
| D16 | C4 | Destructive countdown 1 s steps (runs under reduced motion) | present (built; not exercised in the browser run) |
| D17 | V1 | Voice bar entrance 120 ms | blocked:backend |
| D18 | V2 | Voice bar width 150 ms *(spec default)* | blocked:backend |
| D19 | V3 | Processing line 1400 ms | blocked:backend |
| D20 | V4 | Transcript scroll-off | blocked:backend |
| D21 | V5 | Voice bar error hold 6 s / 3 s, fade 200 ms *(spec default)* | blocked:backend |
| D22 | V6 | Voice bar exit 120 ms *(spec default)* | blocked:backend |
| D23 | V7 | Short-answer card 8 s | blocked:backend |
| D24 | V8 | Uncertain popover 120 ms *(spec default)* | blocked:backend |
| D25 | V9 | Overlay entrance 200 ms *(spec default)*, card +40 ms | blocked:backend |
| D26 | S1 | Speaking progress bar | blocked:backend |
| D27 | S2 | Reading-position highlight 150 ms *(spec default)* | blocked:backend |
| D28 | S3 | Transcript spoken colour | blocked:backend |
| D29 | P1 | Panel open 200 / close 160 ms *(spec default)* | present (built; not exercised in the browser run) |
| D30 | P2 | Expand to full page 200 ms | present (built; not exercised in the browser run) |
| D31 | P3 | Minimised ring rotation 1000 ms *(spec default)* | present (built; not exercised in the browser run) |
| D32 | P4 | Context chip loading pulse | present (built; not exercised in the browser run) |
| D33 | P5 | Skeleton lines (static) | present (built; not exercised in the browser run) |
| D34 | P6 | Ghost row 150 ms *(spec default)* | present (built; not exercised in the browser run) |
| D35 | P7 | Applied row highlight 10 s, fade 400 ms *(spec default)* | present (built; not exercised in the browser run) |
| D36 | P8 | Scroll to changed row (smooth) | present (built; not exercised in the browser run) |
| D37 | P9 | Show-on-page highlight 3 s, fade 400 ms | present (built; not exercised in the browser run) |
| D38 | P10 | Done dot on minimised tab 30 s | present (built; not exercised in the browser run) |
| D39 | H1 | Hover colour 120 ms *(spec default)* | partial — hover on source rows; claim↔row needs A16 |
| D40 | T1 | Toggle knob 150 ms *(spec default)* | present (built; not exercised in the browser run) |
| D41 | D1 | Drop zone 120 ms *(spec default)* | present (built; not exercised in the browser run) |
| D42 | U1 | Upload progress | present (built; not exercised in the browser run) |
| D43 | M1 | Menus 120 ms *(spec default)* | present (built; not exercised in the browser run) |

## E. Keyboard register (§15) — one row each

| # | Key | Where | Action | Status |
|---|---|---|---|---|
| E1 | ⌘J / Ctrl+J | anywhere | Toggle panel | ✅ |
| E2 | ⌘⇧J | panel open | Expand to full page | ✅ |
| E3 | ⌘K | anywhere | Command palette (1c only) | blocked:design (decision open) |
| E4 | hold ⌥ Space | anywhere | Compact voice bar | blocked:backend |
| E5 | double-tap ⌥ Space | anywhere | Overlay | blocked:backend |
| E6 | ⇧ on release | voice | Flip reply mode | blocked:backend |
| E7 | S / V | speaking / shown | Show instead / say instead | blocked:backend |
| E8 | 1–3 | uncertain popover | Pick alternative | blocked:backend |
| E9 | Esc | voice capture | Discard | blocked:backend |
| E10 | Esc | streaming / speaking | Stop | present (built; not exercised in the browser run) |
| E11 | Esc | menu open | Close menu first | present (built; not exercised in the browser run) |
| E12 | Esc | pending confirmation | Cancel | present (built; not exercised in the browser run) |
| E13 | Esc | panel, empty composer, idle | Close panel | present (built; not exercised in the browser run) |
| E14 | ⏎ | composer | Send | ✅ |
| E15 | ⇧⏎ | composer | New line | present (built; not exercised in the browser run) |
| E16 | ⏎ | low-risk inline | Apply | present (built; not exercised in the browser run) |
| E17 | ⌘⏎ | standard confirmation | Confirm | present (built; not exercised in the browser run) |
| E18 | (none) | destructive | Hold 2 s; Space on focused button *(spec default)* | ✅ (destructive has no keyboard confirm by construction) |
| E19 | @ | composer | Mention picker | ✅ |
| E20 | / | composer, line start / after space | Command menu | ✅ |
| E21 | ↑ ↓ | menus | Move | present (built; not exercised in the browser run) |
| E22 | ⏎ | menus | Insert | present (built; not exercised in the browser run) |
| E23 | Tab | @ menu | Next type tab | present (built; not exercised in the browser run) |
| E24 | Tab | command args | Next argument | present (built; not exercised in the browser run) |
| E25 | ⌫ | empty command argument | Remove command | present (built; not exercised in the browser run) |
| E26 | ⏎ | short-answer / must-show card | Open in panel | blocked:backend |
| E27 | ⌘D | palette | Download (1c only) | blocked:design |
| E28 | Esc precedence | — | menu → voice → confirmation → streaming → panel | present (built; not exercised in the browser run) |

## F. §3 rules — each is a row with a test

| # | Rule | How it is tested | Status |
|---|---|---|---|
| F1 | Verbatim from stored clause by ID, error on fetch failure, never model text | Playwright: frame renders from `/api/verbatim/:kind/:id`; kill the record → error card, no prose inside frame | ✅ rules script + ink frame fetched by id in the browser |
| F2 | Ink frame used by exactly one thing | grep built output for `#17181c` header fills outside `VerbatimFrame` | ✅ (grep: ink header only in VerbatimFrame; command chip is the permitted exception) |
| F3 | Only authoritative tier in the frame | reference-tier hit rendered as citation only; pending doc → "could not be quoted" | ✅ |
| F4 | Every factual reply carries attribution | reply with no sources shows `No source · agent's reasoning` | ✅ source strip or `NO SOURCE · AGENT'S REASONING` |
| F5 | Tier colours fixed | tokens `tier.*`; no other use of violet/amber-as-tier | ✅ |
| F6 | Confirmations server-verified, blocking, not optimistic, double-fire safe | double click, held Enter, replayed request → one execution; token bound to args hash | ✅ rules script 15/15 + browser |
| F7 | Composer locked while pending | typing/sending refused while a prompt is open | ✅ |
| F8 | Confirmations expire at 5 min, not reusable | clock-advance test → Expired record; old token refused | ✅ rules script (TTL 1500 ms) + countdown in the card |
| F9 | Voice never confirms | chat "yes" with `inputMode: voice` while pending → nothing runs | ✅ rules script: spoken/typed “yes” changes nothing |
| F10 | Verbatim never read aloud | TTS payload excludes verbatim blocks (blocked with voice) | blocked:backend (no TTS; the frame carries the not-read-aloud label) |
| F11 | Offline never queues writes | offline + write attempt → refused; question queued | ✅ offline card queues the question only |
| F12 | Every tool call runs as the requester | audit rows carry user; no service credentials in tool HTTP | ✅ rules script: model/voice-origin tokens refused |
| F13 | Agent never on the wall display | display bundle has no agent entry point | ✅ (wall console SPA contains no agent code) |
| F14 | Mono for codes | visual pass on every card | ✅ |

---

## Totals (after the build, verified 2026-09-25)

| Status | Rows |
|---|---|
| ✅ built and seen working in the browser (production build) | 89 |
| present — built to the spec, not exercised by the browser run | 61 |
| partial | 7 |
| blocked (backend / design / cross-app) | 39 |
| missing | 1 |

`present` rows are code-complete against the spec and typechecked, but the rig could not reach the data
(portal-backed tools answer 401 locally) or the state is motion that a still cannot show. `missing` rows are
the email-template items untouched by this build (C1–C7 stay as Part 8 left them).
