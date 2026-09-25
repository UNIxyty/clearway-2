# Ops Agent document viewer — build manifest

Derived row by row from `docs/agent-design-spec-viewer.md` (authority), then
`docs/agent-design-viewer-features.md`, then the design file `Ops Agent Document Viewer.dc.html`.
One row per buildable item. **Status** is against what is in the repo and was seen working in a
browser on a production build (`npm run build` → standalone → Playwright, screenshots `dv1`–`dv25`),
not what a file name suggests.

Status values: `✅` (built and verified in a browser this build) · `present` (built, code path
exercised only partially or not reachable with real data on the rig — reason given) · `partial` ·
`blocked:backend` (needs backend work larger than this pass; what is missing) · `blocked:design`
(no pattern in the spec to follow) · `not built` (explicitly out of scope).

Every `NOT IN DESIGN — spec default` used is listed in §M.

Code: `components/agent/viewer/*` (viewer, context, PDF/other views, locate, entry hook, standalone
route `app/agent/doc`), `components/agent/thread/{Cards,Sources,Message,Verbatim,ContextChip}.tsx`,
`components/agent/pages/{FullPageChat,KnowledgePage}.tsx`, `components/agent/panel/AgentPanel.tsx`,
`components/portal/Shell.tsx`, `components/Providers.tsx`, `agent/server.mjs` (documents metadata,
attachments, Range requests, citation checks), `agent/lib/tools/framework.mjs` (per-document sources).

---

## A. Layout (§V1–V2)

| # | Item | Spec § | Status | Evidence / note |
|---|---|---|---|---|
| A1 | O1 only: viewer replaces the console page between sidebar and panel; O2/O3 not built | V1 | ✅ | `dv1`, `dv3`: overlay spans `[data-cw-sidebar]` right edge → panel left edge |
| A2 | Sidebar untouched (expanded / rail / deep) | V1, V2 | ✅ | Sidebar DOM not touched; only the content column is covered |
| A3 | Console page underneath kept mounted, scroll/filters kept | V2 | ✅ | Knowledge base still mounted after Esc (`verify-viewer`: "KB page still mounted: true") |
| A4 | Panel drops to 360 while open when content area < 1400; returns after | V2 | ✅ | `dv25` at 1280: panel width 360; at 1600: user width |
| A5 | Page width = canvas − 56, capped 900, centred | V2 | ✅ | `dv3` page 900 wide at 1600 |
| A6 | Thumbnails 132, default on ≥ 900 canvas, off below; `T` toggles; persists per session | V2 | ✅ (persistence = spec default, sessionStorage) | `dv1` on at 1600, `dv25` off at 1280 |
| A7 | Below 1280 not designed | V2 | not built | — |

## B. Entry points (§V3)

| # | Item | Status | Evidence / note |
|---|---|---|---|
| B1 | E1 Document result: `Open` (primary, eye) · Download · Email; file name is a link; revision line; disabled when unavailable | ✅ | `rv8`/`rv9`: cards from a real reply (AD 2 EVRA/UMGG/EHAM) with revision tags; Open → viewer. The rig honours `DISABLE_AUTH_FOR_TESTING` in `requireAuthenticatedUser` (test environments only, mirrors the middleware) |
| B2 | E2 Generated file: `Open` primary; thumbnail button with hover chip `Open` | ✅ | `dv9`: Open on the card opens the viewer with the thread as a right column |
| B3 | E3 Sent attachment chips above the bubble, openable; uploading/failed/too-large not openable | ✅ | `rv12`: a real upload sent with a message, chip click opens the attachment (Attachment tier) |
| B4 | E4 Citation: claim + superscript one target; file sources open at the passage; web sources open a browser tab; not-found styling `n ?` red | ✅ | `dv26`: the citation in a real reply opens the approved clause in a second tab with the highlight; `dv3`/`dv4`. Hover tooltip is the native `title` (see §M) |
| B5 | E5 Knowledge base row `Open` on hover/focus; panel closed; `Ask about this document ⌘J` in the header | ✅ | `dv1` |
| B6 | One entry hook for all five (`useOpenDocument`) with hand-off to `/agent/doc` when the panel is framed by the wall console | ✅ | `useAgentDock.jsx` opens the hand-off URL in a new tab |

## C. Anatomy (§V4)

| # | Item | Status | Evidence / note |
|---|---|---|---|
| C1 | Tab strip 40: breadcrumb `← {from}`, tabs (type icon, mono name, close), max 6 with LRU eviction + `Closed {file} · Undo` toast | ✅ | `dv11`: 8 opens → 6 tabs, toast with Undo; `dv12` |
| C2 | Tabs belong to the thread; restored with page/zoom | ✅ | `ViewerContext` stores per conversation in sessionStorage; panel/full chat call `setConversationId` |
| C3 | Header: type tile, mono name, revision chip (always present: current grey / superseded amber / not yet effective blue / "revision unknown" italic), meta line (type · size · pages → tier words → time → authority badge), actions, close | ✅ | `dv1`, `dv7`, `rv1`–`rv4` |
| C4 | `Attach to reply` | ✅ deviation | Pins the open document as the composer context (`Asking about … · p. n`) rather than adding a chip — the composer's attachment list holds uploads only. Documented in §M |
| C5 | `Email` → email flow with confirmation | ✅ | Sends "Email the file … — ask me before sending" to the thread; the agent's send_email confirmation is the existing base §4.15 flow |
| C6 | `Download` original · `⌘S` | ✅ | `downloadUrl` from metadata; DOCX downloads the original, never the preview |
| C7 | `Open source` → new tab (AIP Portal / Knowledge base / hidden for attachments) | ✅ (AIP deep link = guess, §K) | |
| C8 | Toolbar: thumbnails, prev/next, page field (out-of-range → red 1 s, revert), zoom steps 50–200, zoom value, fit width, rotate, citation stepper, search; inert while loading/state card | ✅ | `dv2`, `dv3` stepper `Citation 1 of 1` |
| C9 | Per-type toolbar: image = zoom to 400 + `Fit`; table/text = search only | ✅ | `dv14`, `dv18`, `dv19` |
| C10 | Search row: field with count, prev/next, page list, Close; yellow matches, darker current; thumbnail dot; debounce 200 ms; case-insensitive substring | ✅ | `dv2` (2 hits, `1 of 2`, `Matches on pages 1`, orange dot on thumb 1) |
| C11 | Banners in order: citation not found → revision mismatch → superseded / not yet effective / unknown → offline → scanned / rendered preview; not dismissible. "No span" is grey and says "not a failed check"; "not found" is red and says "treat the claim as unverified" | ✅ | `dv4`, `dv15`, `dv20`, `dv24`, `rv3`, `rv5a`/`rv5b` |
| C12 | Thumbnail rail: rendered thumbs, current outline, citation badge, search dot, loading placeholder, click to jump, auto-scroll | ✅ | `dv3` badge `1`, `dv7` |
| C13 | Canvas: `#eceef1` PDF / `#e4e6ea` image / white table+text / `#fbfbfc` state cards; page shadow; markers in the gutter 12 px left of the page; selectable text layer | ✅ | Tokens `viewer.canvas*` in `shared/design-tokens.json` |

## D. Scrolling, position, focus (§V5)

| # | Item | Status | Evidence / note |
|---|---|---|---|
| D1 | Fixed chrome, independent canvas and rail scrollers; citation click scrolls the viewer only | ✅ | |
| D2 | Reading position = page with most visible area → page field, thumb, context chip (500 ms debounce) | ✅ | `dv9` chip `Asking about viewer_probe.pdf · p. 1` |
| D3 | Per-tab scroll offset and zoom kept | ✅ | `patchTab` on scroll/zoom |
| D4 | Focus: canvas (`role=document`) on open; passage on citation; search field; state card primary button; opener (else composer) on close; `F6` between viewer and panel | ✅ | `verify-viewer`: "focus on passage: true"; `dv16` password field focused |
| D5 | `aria-live` announcements `Cited passage k, page n` / `not found` | ✅ | |

## E. Citation → document (§V6) — the part that matters most

| # | Item | Status | Evidence |
|---|---|---|---|
| E1 | Locate: cited page's text layer first, then whole document; whitespace-normalised, **case-sensitive exact**; no fuzzy highlight | ✅ | `locate.ts` `findExact`; `dv3` |
| E2 | C1 Found: scroll passage to 96 px, tint + 3 px halo, margin marker rings once, stepper, reply claim/source tint | ✅ | `dv3`: 1 highlight, 1 marker, focus on the mark |
| E3 | C2 Page-break span: both parts tinted, marker on the first, `Passage continues on p. n ↓` / `↑ … continued from p. n` tags | ✅ | `rv10`/`rv10b`: a clause approved across pages 1–2 of a rendered PDF |
| E4 | C3 Second citation same tab: previous → dashed outline + white marker; `[`/`]` step | ✅ | `rv11`: two replies citing the same file; the second citation moves in the same tab, the first passage stays dashed |
| E5 | **C4 Not found: no tint, no marker anywhere; red banner quoting the claim; page still opens; reply superscript `n ?` red; Activity log row** | ✅ | `dv4`: highlights 0, markers 0, banner 1, page shown; Activity `citation.check → Citation not found` |
| E6 | Verbatim from a quoted block: highlight + `Quoted verbatim in the reply · text matches`; mismatch → red `Text differs from the quoted clause` + data error logged | ✅ | `dv6` match tag; `dv5` mismatch: highlights 0, red warning; Activity `verbatim.check → Data error · text differs` |
| E7 | Scanned: open at the page, no highlight, scanned banner (not the red banner) | ✅ | `verify-viewer4` "scanned with citation: red banner 0, highlights 0, scanned banner 1" |
| E8 | Revision mismatch: open the cited revision or superseded banner + `Found in …, cited from …` | ✅ | Revisions job: knowledge citations open the exact revision row (a superseded one shows the amber banner with **Open current**); AIP copies replaced under the same key show "The answer cited AIRAC 2608; this copy is AIRAC 2609" (`rv13`). See `docs/agent-revisions.md` |
| E9 | Spans for AIP sources | partial | AIP citations open the file at the page with a `no-span` banner; the AIP tool returns page text, not the exact cited sentence. Knowledge-base and generated sources carry spans |

## F. Tier without the ink frame (§V7)

| # | Item | Status | Evidence |
|---|---|---|---|
| F1 | Viewer never uses `#17181c` as frame/header/border | ✅ | `verify-viewer`: elements with that background inside the viewer = 0 (`dv1`) |
| F2 | Authoritative badge violet `approved by {name} {date}`; violet quote markers for quoted clauses | ✅ badge · present markers | `dv3`; quote markers need a thread that quoted the open document |
| F3 | Reference badge grey `cited, not quotable` | ✅ | tier-2 documents on the rig |
| F4 | Awaiting approval amber badge + strip + `Review in Knowledge base` for approvers | ✅ | `dv7` (AMDT.pdf awaiting) |
| F5 | `Attachment` label (paperclip) — token `tier.attachment` added | ✅ | `dv8` shows the tier line for a generated file; attachments use the new label |

## G. File types (§V8)

| # | Type | Status | Evidence |
|---|---|---|---|
| G1 | PDF: text layer, search, citations, thumbnails | ✅ | `dv1`–`dv7` |
| G2 | Scanned PDF: image pages, scanned banner, search disabled with tooltip | ✅ | `dv15` |
| G3 | Image: canvas `#e4e6ea`, grab/pan, zoom to 400, `Fit`, minimap past fit, arrows pan 40 px | ✅ | `dv14` |
| G4 | Table (CSV, XLSX): frozen header, row numbers, sheet tabs, `{rows} rows · {cols} columns · header row frozen`, horizontal scroll; no sort/filter | ✅ | `dv19` |
| G5 | Text / raw: `white-space: pre`, mono, line numbers, cited lines tinted | ✅ | `dv18`, `dv12` |
| G6 | DOCX: rendered pages + `Rendered preview` banner + `Download original` | ✅ deviation | Rendered in the browser with `mammoth` (HTML, one flow, not paginated) — there is no server-side DOCX→PDF service (`SOURCE UNKNOWN`). Generated PDFs use the PDF view |
| G7 | No preview (.kmz etc.): state card, Download primary, Open in source, Email, `Viewable types` note; toolbar hidden | ✅ | `dv21` |
| G8 | Table result "Full view" → Table tab `Result · n things` | ✅ | `Cards.tsx` TableResult → `openTable`; sheet fallback kept only when no viewer host |

## H. States (§V9)

| # | State | Status | Evidence |
|---|---|---|---|
| H1 | Header from metadata in every state | ✅ | `dv8`, `dv17`, `dv22` |
| H2 | Loading: inert toolbar, skeleton page, `Opening {file} · {size}` | ✅ | skeleton seen on first paint (`verify-viewer4` LOADING) |
| H3 | Slow / progressive: **target page fetched first (Range requests)**, progress row with bytes and elapsed, placeholder pages, thumbnails placeholder | ✅ | `dv7`; agent range log: xref chunk then the target page's ranges; render order in `verify-viewer3` |
| H4 | Empty: `EMPTY` card, `Remove from thread` | present | The upload routes refuse a 0-byte file, so no real document can be empty; the card renders when a fetch returns 0 bytes |
| H5 | Render failed: `RENDER FAILED` card with diagnostic, Retry · Download · Open in source | ✅ | `dv17` |
| H6 | Too large > 100 MB: `TOO LARGE` card, Open in AIP Portal primary, Download | ✅ | `dv22` (size stated on the link; no 100 MB+ file on the rig) |
| H7 | Password: `PROTECTED` card with field, wrong password → red field + `Wrong password`, correct opens | ✅ | `dv16` |
| H8 | Fetch failed: `FETCH FAILED` card, Retry (cached copy: see H10) | ✅ | `dv23` |
| H9 | Permission denied: `PERMISSION DENIED` card with file name, diag, `Request access` · `Copy request` | ✅ | `dv8` for another user's generated file requested by URL; direct URL answers 404 |
| H10 | Stale / superseded: amber banner + chip + `Open current`; plus **not yet effective** (blue) and **revision unknown** (grey, italic chip) — unknown is never shown as current | ✅ | `rv1`–`rv4`: current / not yet effective / superseded / unknown |
| H11 | Offline: banner, Email/Download/Open source disabled, search works; no cached copy → `wifi-off` card | ✅ banner · partial cache | `dv24`. There is no saved-copy store: an open document keeps working from the browser's HTTP cache only; a document not yet fetched shows the `wifi-off` card |
| H12 | Limits: 100 MB view limit; progressive above 10 MB or 60 pages; 20 cached documents per user | ✅ limits · blocked cache | `VIEWER.maxBytes`, `progressiveBytes`, `progressivePages` in tokens; cached copies need a store (§K) |

## I. Behaviour while open (§V10)

| # | Item | Status | Evidence |
|---|---|---|---|
| I1 | B1 Document replaces the context chip: `Asking about {file} · p. {n}`; placeholder `Ask about this document…`; the agent receives document id/source/page | ✅ | `dv9`; `agent/server.mjs` contextLine for `kind: "document"` |
| I2 | B2 Citation into another file → new tab, first tab keeps highlights | ✅ | `dv26`: generated file open, citation into the knowledge document → tab 2; Ctrl+Tab returns to tab 1 at its page |
| I3 | B3 Tabs (not replace/stack); reopening switches | ✅ | `verify-viewer3`: reopening the same document keeps 6 tabs |
| I4 | B4 Panel minimised: viewer widens; ⌘J restores | ✅ | Viewer measures `[data-cw-agent-panel]`/`[data-cw-agent-minimised]` on resize |
| I5 | B5 Full-page chat: thread becomes a 420/360 right column; `← Chat`; closing restores | ✅ | `dv9` |
| I6 | B6 Hand-off to the AIP Portal for > 100 MB and bundles (`Open source`, Too-large card) | ✅ link · blocked format | Link is `/aip/…` derived from the file path (`SOURCE UNKNOWN` deep-link format) |
| I7 | Closing: Esc / × / breadcrumb closes all tabs (restored with the thread); ⌘W closes one; last tab closes the viewer | ✅ | `verify-viewer2`: ⌘W on the only tab → viewer closed |

## J. Keyboard and motion (§V11)

| # | Item | Status | Evidence |
|---|---|---|---|
| J1 | 19 keyboard rows (⏎/Space open, Esc, ⌘W, Ctrl+Tab/⇧, PgUp/PgDn, Space/⇧Space, Home/End, ⌘±, ⌘0, R, T, ⌘F, ⏎/⇧⏎ in search, [ ], ⌘S, F6, arrows on image) | ✅ | `verify-viewer`: T, R, Esc, ⌘F; `verify-viewer2/3`: ⌘W, Ctrl+Tab; `verify-viewer4`: ⌘+ on image |
| J2 | Esc precedence: menu → voice → search row → confirmation → streaming → viewer → panel; ⌘J does not close the viewer | ✅ | Viewer listens in the capture phase and stops only when search is closed and no menu is open |
| J3 | DV1–DV19 motion rows with the stated durations; `cwring` 700 ms once; `cwpulse` 1200 ms | ✅ | `agent.css` DV1–DV17 comments |
| J4 | Reduced motion: everything instant, no ring/pulse | ✅ | `dv10`: animation-name `none` on viewer, marker and highlight |

## K. Data (`SOURCE UNKNOWN` in the spec)

| Item | Resolution |
|---|---|
| Citation spans and page | wired: `sourcesFromToolCalls` emits document id and the retrieved span for knowledge and generated sources; tier-1 (approved clause) hits get their document id from `agent_tier1_records` (the table has no page column, so the viewer searches the whole file for the clause); AIP sources carry the path only |
| Document fetch / Range API | built: `GET /agent/api/documents/{knowledge\|generated\|attachment}/:id` (metadata), Range/206 on the file routes, `GET /agent/api/attachments/:id` |
| Failed-citation log write | built: `POST /agent/api/citations/check` → `agent_audit_log` kinds `citation.check`, `verbatim.check`; listed in Activity |
| Revision / superseded metadata | built (revisions job): AIP sidecars `aip/<ns>/<NAME>.meta.json` written by the sync worker from the EAD table / dated filenames; `agent_documents` version + effective date, siblings, and `docs/supabase-agent-revisions.sql` for `valid_until` / `superseded_by` |
| DOCX rendering service | **blocked:backend** — rendered in the browser instead (G6) |
| Portal deep-link format | **blocked:backend** — `/aip/{path}` guessed from the file path; page not carried |
| Cached-copy storage (20 per user) | **blocked:backend** — no store; browser cache only |
| Server-side full text for files over the load limit | **blocked:backend** |

## L. Not built (by instruction)

Tablet/phone, wall display, editing/annotating/commenting/redaction, printing, side-by-side
compare, table sort/filter/formulas, review furniture (state switcher, option IDs, RECOMMENDED
badge, scaled frames, notes).

## M. `NOT IN DESIGN — spec default` used

| Where | Default applied |
|---|---|
| Panel width while open | 360 below 1400 content width; the user's own width otherwise; a drag while open is kept for viewer sessions (sessionStorage) |
| Thumbnails toggle | persists per session |
| `Ask about this document` placement | left of the header actions |
| Tab hover | `#eceef1` (token `tabHover`) |
| 7th-tab toast | dark toast, 13 px, 6 s, `Undo`. Undo puts the closed tab back; the strip then holds seven until the next open evicts again (tabs shrink to fit) |
| Page field out of range | red border 1 s, value reverts |
| Search `No matches` | red text in the count slot |
| Wrong password | red field, `Wrong password` helper |
| Offline without a cached copy | `wifi-off` card with the spec's copy |
| Per-type toolbar reduction | image: zoom + Fit only; table/text: search only |
| Generating state on the generated-file card | not openable until the file exists (no spinner) |
| Limits | 100 MB view limit; progressive above 10 MB or 60 pages |
| Markers | 12 px left of the page edge |
| Search debounce | 200 ms |
| Citation jump | 300 ms, instant when more than 6 pages away |
| DV durations marked *(spec default)* | as listed in §V11 |
| Attach to reply | pins the document as context (see C4) |
| Citation tooltip | native `title` text `{file} · p. n · click to open at the passage` (no dark custom tooltip) |
| Generated-file metadata unavailable | the link's file name is used so the permission card can name the file (H9) |
| Full-page chat beside a document | the header drops its pills and the meta line, New chat becomes an icon button (the column is 420/360) |
| Header below 1000 px of viewer width | actions drop their labels (icon + tooltip), `Ask about this document` becomes `Ask` |
