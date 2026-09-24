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
| A1 | Orb — canvas ring mark, geometry, DPR | 4.1 | idle · listening · thinking · speaking · error | O1–O6 | mic RMS / TTS level (`blocked:backend` for live levels; idle/thinking/error need none) | missing |
| A2 | Orb — avatar 26px, still | 4.1 | idle still · thinking (streaming) | O3 | have | missing |
| A3 | Orb — composer voice button 22px | 4.1 | idle breathing · live | O1, O2 | — | missing |
| A4 | Orb — empty state 64px, overlay 120px, cards 30px | 4.1 | idle · error still | O1 | — | missing |
| A5 | Static ring mark (header, sidebar, chips) | 4.1 | — | — | — | present |
| A6 | Waveform — voice bar 56×18 / wall 48×16 / speaking 40×16 / short 32×14 / panel static | 4.2 | invoked · listening · low · speaking | W1 | mic bands / TTS (`blocked:backend` live) | missing |
| A7 | User bubble — full page (16/16/4/16, 560) and panel (14/14/4/14, 330) | 4.3 | default · timestamp `DK · 07:42Z` (hover in panel) · voice-originated mic prefix · inline entity/command chips | — | have | partial |
| A8 | User bubble — sending / failed / edit-retry | 4.3, 16.2 | — | — | — | blocked:design (no pattern) |
| A9 | Agent reply shell — avatar column, header line (full), block order | 4.4 | full · panel (no header) | — | have | partial |
| A10 | Tool activity A — live step list (done/running/queued/cancelled) with elapsed | 4.5 | 4 step states | A7 | tool events (`small`: add startedAt/durationMs to stream) | missing |
| A11 | Tool activity B — completed summary, collapsible, rows tool·args·result·duration, `read only` | 4.5 | collapsed (default after finish) · expanded · write rows (`pencil`) | A8 | `small` (args/result/duration on the tool chunk) | partial |
| A12 | Tool activity C — one-line summary (1–2 tools) → expands to B | 4.5 | — | A8 | as A11 | missing |
| A13 | Streaming caret 8×17 (7×15 panel) | 4.6 | — | A6 | have | present |
| A14 | Stop button (full + panel) | 4.6 | — | — | have | partial |
| A15 | Stopped row + `Continue` | 4.6 | — | A10 | `small` (continue = resend with partial) | missing |
| A16 | Sources — per-claim underline + superscript (3c) | 4.7 A | internal/company/web; hover claim↔row | H1 | claim spans from model — `blocked:backend` | blocked:backend |
| A17 | Sources — no-source sentence tooltip `agent's reasoning`; unsourced reply eyebrow | 4.7 A | — | — | — | missing |
| A18 | Sources — chip row (several) / inline single / 3c rows | 4.7 B | 1 · several · linked/unlinked | H1 | have | partial |
| A19 | Sources — panel footer strip + one line per source + single-line chips | 4.7 C | — | — | have | partial |
| A20 | Verbatim frame — full page (header stamp·copy·ref; body; footer approved/sha/buttons) | 4.8 | — | — | `small`: `GET /api/verbatim/:kind/:id` by ID | partial |
| A21 | Verbatim frame — panel (stacked header, never collapses) | 4.8 | — | — | as A20 | partial |
| A22 | Verbatim — `Copy exact text` → `Copied` 1500 ms; `Open source · p. n` | 4.8 | — | — | page number from record | partial |
| A23 | Verbatim — fetch failure → error, never model text | 4.8, §3.1 | error | — | as A20 | missing |
| A24 | Agent's reading eyebrow + muted prose (full + panel) | 4.8 | — | — | have | present |
| A25 | Flight card — spacious full page | 4.9 | pills delayed/on-wall · markers · delta/on-time | H1 | wall (`have`, fields partial) | partial |
| A26 | Flight card — panel 372 | 4.9 | — | H1 | have | partial |
| A27 | Flight card — dense row 2a, click expands | 4.9 | flight · airport · document rows | — | have | missing |
| A28 | Flight cards — several: 2-col grid, `+N more`; panel stack `+n more flights` | 4.9 | — | — | have | missing |
| A29 | Airport summary — full page 3 columns | 4.10 | VFR/MVFR badge | — | weather/NOTAM/CAA (`have` via tools) | partial |
| A30 | Airport summary — panel label rows / A2 compact | 4.10 | — | — | have | partial |
| A31 | Document result — full page (PDF tile, meta, Download/Open/Email) | 4.11 | stale/cached pill | — | AIP tool (`have`) | partial |
| A32 | Document result — panel 3-col actions; icon buttons at 340 | 4.11 | — | — | have | partial |
| A33 | Generated file — preview pane (page 1 render), eyebrow, summary, Download/Preview/Send… | 4.12 | — | — | `small`: thumbnail of page 1 (PDF) | partial |
| A34 | Table — full page grid, pills, footer Open/Export CSV | 4.13 | — | — | have | partial |
| A35 | Table — panel reflow, 4 rows inline, footer `+n more · Show all · Filter the page` | 4.13 | — | — | have | partial |
| A36 | Table — Full view sheet 900px | 4.13 | — | — | have | missing |
| A37 | Mono block — full page `pre`, header meta, Copy | 4.14 | — | — | have | partial |
| A38 | Mono block — panel wrap-at-spaces, `↳`, `—` separators, Wrap toggle, Show on page ↖ | 4.14 | wrap on/off | P9 | have; show-on-page needs page contract (`small` for NOTAM page) | partial |
| A39 | Confirmation — low-risk inline 5a (`Apply ⏎`) | 4.15 A | pending · applied · cancelled | C1 | `small`: generic server confirmations | missing |
| A40 | Confirmation — standard card (header expires, body grid, footer ⌘⏎) | 4.15 B | pending · loading · applied · cancelled · expired · partial | C1 | `small` | missing |
| A41 | Confirmation — multi-change block | 4.15 B | — | C1 | `small` | missing |
| A42 | Confirmation — change behind panel (`previewed on the page ←`) | 4.15 B, 6.8 | — | P6 | page↔panel contract (`small` for Limitations page) | missing |
| A43 | Confirmation — destructive pinned bar, hold 2 s, countdown, `Keep it` | 4.15 C | pending · holding · released · expired | C2, C3, C4 | `small` | missing |
| A44 | Confirmation — records Applied / Sent / Cancelled / Expired / Partial / Applied (panel) | 4.15 D | 6 | C1 | have (action rows) | missing |
| A45 | Confirmation — modal 5b destructive (type ID) and low | 4.15 E | — | — | `small` | missing |
| A46 | Confirmation — composer lock while pending; expiry 5 min; focus to Cancel; loading on Confirm | 4.15, §3.6–8 | — | — | `small` | missing |
| A47 | Confirmation — double-fire proof (disable on first activation, idempotent token) | §3.6 | — | — | `small` | missing |
| A48 | Error card — TOOL FAILED / PERMISSION DENIED / SOURCE UNAVAILABLE / MODEL UNAVAILABLE | 4.16 | 4 kinds + panel variants | — | have (tool errors) | partial |
| A49 | Error card — Offline (panel) with queued item row | 4.16 | — | — | have | partial |
| A50 | Composer — full page (16 radius, 8-line growth, toolbar, hint, voice+send buttons) | 4.17 | empty · has text · uploading · locked · voice active · offline | — | have | partial |
| A51 | Composer — panel variant | 4.17 | same | — | have | partial |
| A52 | Attachments — chips (image · uploading · failed · too large · uploaded), remove | 4.18 | 5 | U1 | upload endpoint — `small`: `/api/attachments` (25 MB, PDF/img/CSV/XLSX/TXT) | partial |
| A53 | Attachments — drop zone over the thread | 4.18 | — | D1 | — | missing |
| A54 | @ picker — type tabs, groups, rows, footer, prefix highlight | 4.19 | 6 entity types | M1 | flights `have`; airports/operators/aircraft/limitations/documents via tools (`have`) | partial |
| A55 | @ picker — panel context-first ordering (SELECTED / VISIBLE / recents) | 4.19 | — | M1 | page context (`have` partial) | partial |
| A56 | Mention chips — inserted, in bubble; hover card | 4.19 | flight/airport/aircraft/document · limitation · person | — | hover card content `blocked:design` | partial |
| A57 | / menu — rows, kinds, tiles | 4.20 | `/aip /notam /weather /brief /email` | M1 | `/brief` and `/email` map to generate_file / email flow (`have`) | partial |
| A58 | / command chip + argument slots in composer; in bubble | 4.20 | current slot · optional slot · remove | — | — | missing |
| A59 | Context chip (pill, icon by type, clear) | 4.21 | flight · airport · wall/NOTAM check · limitations page · none | — | have | present |
| A60 | Context chip — loading `Reading Flights · KLJ7226…` | 4.21 | — | P4 | have | missing |
| A61 | Context chip — "Now on…" switch | 4.21 | — | — | have | present |
| A62 | Suggested questions — full page 4 cards | 4.22 | hover | H1 | live counts `small` (wall state) | missing |
| A63 | Suggested questions — panel B1/B2/B3 sets | 4.22, 6.6 | — | H1 | `small` | partial |
| A64 | Compact voice bar — invoked/listening/uncertain/processing/error | 4.23 | 5 + 3 error rows | V1–V6, V8 | STT — `blocked:backend` (no ElevenLabs Scribe wiring) | blocked:backend |
| A65 | Voice bar — placement, drag/snap, selected-row context pill | 4.23 | — | — | as A64 | blocked:backend |
| A66 | Voice bar — short-answer card 8 s, `Open in panel ⌘J` | 4.23 | — | V7 | as A64 | blocked:backend |
| A67 | Voice bar over the wall display | 4.23, 16.2 #3 | — | — | **not built** (see report §4) | blocked:design |
| A68 | Voice overlay (large) — 5 states | 4.24 | idle · listening · thinking · speaking · error | V9, O1–O5 | as A64 | blocked:backend |
| A69 | Spoken reply — delivery rules, preference pill, speaking card, must-show, long, both-at-once | 4.25 | 6 rule rows | S1–S3 | TTS — `blocked:backend` | blocked:backend |
| A70 | Panel shell — 420 default, 360–600 drag, header 60, 5 header buttons | 4.26 | push · overlay | P1 | have | partial |
| A71 | Panel shell — minimise tab (working / needs you amber / done) | 6.13 | 3 | P3, P10 | have | missing |
| A72 | Buttons — primary/secondary/ghost/destructive, 4 sizes, disabled, focus ring | 4.27 | — | H1 | — | partial |
| A73 | Pills, tags, keycaps, header status pill | 4.27 | — | — | — | partial |

## B. Screens (§5–§12)

| # | Item | Spec § | States | Animations | Data source | Status |
|---|---|---|---|---|---|---|
| B1 | Sidebar entry — expanded item + keycap; active / panel-open / inactive | 5 | 3 | H1 | have (`hasAgent`) | partial |
| B2 | Sidebar entry — sub-items Chat/History/Knowledge base (badge)/Activity log/Settings | 5 | — | — | badge count `small` | missing |
| B3 | Sidebar entry — rail (dot badge) and deep-context pinned block | 5 | — | — | have | missing |
| B4 | Panel — open/close triggers (⌘J, item, `Ask about …` page button, Esc, x) | 6.1 | — | P1 | have | partial |
| B5 | Panel — push vs overlay rule (≥900 content; 1280 always overlay) | 6.2 | — | P1 | have | present |
| B6 | Panel — layout (chip, thread, composer) | 6.4 | — | — | have | present |
| B7 | Panel — empty states B1 (airport) / B2 (wall console) / B3 (no context + recents) | 6.6 | 3 | — | `small` (live counts, recents `have`) | partial |
| B8 | Panel — replies at width (all card variants) | 6.7 | — | — | have | partial |
| B9 | Panel — change behind the panel: ghost row, wall preview, applied row highlight, banner, Revert… | 6.8 | pending · applied · cancelled | P6, P7, P8 | page contract `small` (Limitations page) | missing |
| B10 | Panel — voice docked in composer | 6.9 | — | — | as A64 | blocked:backend |
| B11 | Panel — History view (groups ABOUT/TODAY/YESTERDAY, search, footer) | 6.10 | list · empty · loading (empty/loading `blocked:design`) | — | have | partial |
| B12 | Panel — loading / streaming / error / offline | 6.11 | 4 | A7 | have | partial |
| B13 | Panel — expand to full page (`/agent/t/…`, "From Flights · KLJ7226" link, back) | 6.12 | — | P2 | have | partial |
| B14 | Panel — minimised tab | 6.13 | 3 | P3, P10 | have | missing |
| B15 | Panel — never on the wall display | 6.14, §3.13 | — | — | have (display has no console shell) | present |
| B16 | Full page — layout (header 60, 800 column, composer) | 7.1 | — | — | have | partial |
| B17 | Full page — header (title, meta, web pill, changes pill, side-panel button, New chat) | 7.2 | — | — | title `have`; pills from settings `small` | missing |
| B18 | Full page — empty state B1 (orb 64, headline, 4 cards) | 7.3 | — | O1 | have | missing |
| B19 | Full page — thread, streaming/stop (B2), load order, focus, tab order | 7.4–7.6 | — | A6, A9, A10 | have | partial |
| B20 | Full page — command palette 1c | 7.7 | `DECISION OPEN` | — | — | blocked:design (decision open — not built) |
| B21 | Voice — order of events, permission card, unavailable card | 8 | 2 cards | — | as A64 | blocked:backend |
| B22 | History page — search, filters, grouped list, row chips/meta | 9 | list · empty · loading · no results (last three `blocked:design`) | H1 | have + `small` search | missing |
| B23 | Knowledge base — header, stat cards, table, tier badges, status | 10 | — | — | have + `small` stats | partial |
| B24 | Knowledge base — approval panel (pending/approved/reference/rejected), extraction check, uploader cannot approve | 10 | 4 | — | have (approve/reject); clause extraction preview `small` | partial |
| B25 | Knowledge base — upload flow / rejection note / failed-indexing actions / stat filtering | 10, 16.2 | — | — | — | blocked:design (upload + rejection note follow existing console pattern → built as the obvious version; stat filtering not built) |
| B26 | Activity log — header, segmented filter, dropdowns, table, kinds, results, confirmed | 11 | — | — | `small`: `GET /api/activity` over agent_audit_log + agent_actions | missing |
| B27 | Activity log — expanded record (REQUEST / ARGUMENTS·RESULT / CONFIRMATION) | 11 | — | — | as B26 | missing |
| B28 | Activity log — Export CSV | 11 | — | — | `small` | missing |
| B29 | Activity log — filter menus, pagination | 16.2 | — | — | — | blocked:design (menus not drawn → console Dropdown pattern used; pagination: `Load more` per console pattern) |
| B30 | Agent settings — capabilities toggles (5), immediate save, logged | 12 | on/off | T1 | `small`: `agent_settings` capability flags | missing |
| B31 | Agent settings — who can do what (read-only) | 12 | — | — | `small` from allowlist + roles | missing |
| B32 | Agent settings — usage card (spend, cap, replies, tool calls, heaviest user) | 12 | — | — | `small` from audit tokens × model rates; cap editing `blocked:design` | missing |

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
| D1 | O1 | Orb idle breathing | missing |
| D2 | O2 | Orb listening | blocked:backend (needs mic level) |
| D3 | O3 | Orb thinking | missing |
| D4 | O4 | Orb speaking | blocked:backend (needs TTS level) |
| D5 | O5 | Orb error (still) | missing |
| D6 | O6 | Orb state colour 200 ms *(spec default)* | missing |
| D7 | W1 | Waveform bars | blocked:backend |
| D8 | A6 | Streaming caret blink | present |
| D9 | A7 | Running step / loading dots / minimised dot pulse | partial |
| D10 | A8 | Tool summary expand 160 ms *(spec default)* | missing |
| D11 | A9 | Token streaming | present |
| D12 | A10 | Stopped row 150 ms *(spec default)* | missing |
| D13 | C1 | Confirmation → record 200 ms *(spec default)* | missing |
| D14 | C2 | Hold-to-delete fill 2000 ms linear (runs under reduced motion) | missing |
| D15 | C3 | Hold release 150 ms *(spec default)* | missing |
| D16 | C4 | Destructive countdown 1 s steps (runs under reduced motion) | missing |
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
| D29 | P1 | Panel open 200 / close 160 ms *(spec default)* | missing |
| D30 | P2 | Expand to full page 200 ms | missing |
| D31 | P3 | Minimised ring rotation 1000 ms *(spec default)* | missing |
| D32 | P4 | Context chip loading pulse | missing |
| D33 | P5 | Skeleton lines (static) | present |
| D34 | P6 | Ghost row 150 ms *(spec default)* | missing |
| D35 | P7 | Applied row highlight 10 s, fade 400 ms *(spec default)* | missing |
| D36 | P8 | Scroll to changed row (smooth) | missing |
| D37 | P9 | Show-on-page highlight 3 s, fade 400 ms | missing |
| D38 | P10 | Done dot on minimised tab 30 s | missing |
| D39 | H1 | Hover colour 120 ms *(spec default)* | partial |
| D40 | T1 | Toggle knob 150 ms *(spec default)* | missing |
| D41 | D1 | Drop zone 120 ms *(spec default)* | missing |
| D42 | U1 | Upload progress | missing |
| D43 | M1 | Menus 120 ms *(spec default)* | partial |

## E. Keyboard register (§15) — one row each

| # | Key | Where | Action | Status |
|---|---|---|---|---|
| E1 | ⌘J / Ctrl+J | anywhere | Toggle panel | present |
| E2 | ⌘⇧J | panel open | Expand to full page | missing |
| E3 | ⌘K | anywhere | Command palette (1c only) | blocked:design (decision open) |
| E4 | hold ⌥ Space | anywhere | Compact voice bar | blocked:backend |
| E5 | double-tap ⌥ Space | anywhere | Overlay | blocked:backend |
| E6 | ⇧ on release | voice | Flip reply mode | blocked:backend |
| E7 | S / V | speaking / shown | Show instead / say instead | blocked:backend |
| E8 | 1–3 | uncertain popover | Pick alternative | blocked:backend |
| E9 | Esc | voice capture | Discard | blocked:backend |
| E10 | Esc | streaming / speaking | Stop | present |
| E11 | Esc | menu open | Close menu first | partial |
| E12 | Esc | pending confirmation | Cancel | missing |
| E13 | Esc | panel, empty composer, idle | Close panel | present |
| E14 | ⏎ | composer | Send | present |
| E15 | ⇧⏎ | composer | New line | present |
| E16 | ⏎ | low-risk inline | Apply | missing |
| E17 | ⌘⏎ | standard confirmation | Confirm | missing |
| E18 | (none) | destructive | Hold 2 s; Space on focused button *(spec default)* | missing |
| E19 | @ | composer | Mention picker | present |
| E20 | / | composer, line start / after space | Command menu | present |
| E21 | ↑ ↓ | menus | Move | missing |
| E22 | ⏎ | menus | Insert | missing |
| E23 | Tab | @ menu | Next type tab | missing |
| E24 | Tab | command args | Next argument | missing |
| E25 | ⌫ | empty command argument | Remove command | missing |
| E26 | ⏎ | short-answer / must-show card | Open in panel | blocked:backend |
| E27 | ⌘D | palette | Download (1c only) | blocked:design |
| E28 | Esc precedence | — | menu → voice → confirmation → streaming → panel | partial |

## F. §3 rules — each is a row with a test

| # | Rule | How it is tested | Status |
|---|---|---|---|
| F1 | Verbatim from stored clause by ID, error on fetch failure, never model text | Playwright: frame renders from `/api/verbatim/:kind/:id`; kill the record → error card, no prose inside frame | missing |
| F2 | Ink frame used by exactly one thing | grep built output for `#17181c` header fills outside `VerbatimFrame` | partial (command chip is the permitted exception) |
| F3 | Only authoritative tier in the frame | reference-tier hit rendered as citation only; pending doc → "could not be quoted" | partial |
| F4 | Every factual reply carries attribution | reply with no sources shows `No source · agent's reasoning` | partial |
| F5 | Tier colours fixed | tokens `tier.*`; no other use of violet/amber-as-tier | present |
| F6 | Confirmations server-verified, blocking, not optimistic, double-fire safe | double click, held Enter, replayed request → one execution; token bound to args hash | missing |
| F7 | Composer locked while pending | typing/sending refused while a prompt is open | missing |
| F8 | Confirmations expire at 5 min, not reusable | clock-advance test → Expired record; old token refused | missing |
| F9 | Voice never confirms | chat "yes" with `inputMode: voice` while pending → nothing runs | partial (backend readback exists; needs the new confirmation path) |
| F10 | Verbatim never read aloud | TTS payload excludes verbatim blocks (blocked with voice) | blocked:backend |
| F11 | Offline never queues writes | offline + write attempt → refused; question queued | partial |
| F12 | Every tool call runs as the requester | audit rows carry user; no service credentials in tool HTTP | present |
| F13 | Agent never on the wall display | display bundle has no agent entry point | present |
| F14 | Mono for codes | visual pass on every card | partial |

---

## Totals (at manifest time)

| Section | Rows | present | partial | missing | blocked |
|---|---|---|---|---|---|
| A components | 73 | 5 | 33 | 25 | 10 |
| B screens | 32 | 3 | 12 | 13 | 4 |
| C email | 7 | 1 | 5 | 1 | 0 |
| D animations | 43 | 3 | 3 | 22 | 15 |
| E keyboard | 28 | 7 | 2 | 12 | 7 |
| F §3 rules | 14 | 3 | 7 | 3 | 1 |
| **Total** | **197** | **22** | **62** | **76** | **37** |

Totals are updated at the end of each stage.
