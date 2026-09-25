# Clearway Ops Agent — spec addendum: document viewer

Addendum to `agent-design-spec.md`. Design file: `Ops Agent Document Viewer.dc.html`. Everything in the base spec stands except where §V12 below lists a change. Same conventions: `TOKEN MISSING`, `SOURCE UNKNOWN — developer to wire`, `NOT IN DESIGN — spec default`, `DECISION OPEN`. Section numbers `§4.x`, `§6.x` refer to the base spec; `§Vx` to this file.

## Contents

- V1. Decision: where a document opens
- V2. Layout and widths
- V3. The five ways in
- V4. Viewer anatomy
  - V4.1 Tab strip · V4.2 Header · V4.3 Toolbar · V4.4 Search row · V4.5 Banners · V4.6 Thumbnail rail · V4.7 Canvas
- V5. Scrolling, reading position, focus
- V6. Citation → document
- V7. Tier shown without the ink frame
- V8. File types
- V9. States
- V10. Behaviour while a document is open
- V11. Register additions (§14 animation, §15 keyboard)
- V12. Changes to the base spec
- V13. Edges

---

## V1. Decision: where a document opens

Three layouts drawn (frames O1–O3, 1280 and 1920 each).

| Option | What it is | Verdict |
|---|---|---|
| **O1 — Document takes the page, chat stays the panel** | Viewer replaces the console page between sidebar and panel. Panel doesn't move. | **Build this.** |
| O2 — Split view | Panel widens to half the content area; document in the other half. | Fails at 1280: page renders at 470px. Wastes width on chat at 1920. Do not build. |
| O3 — Full-screen sheet, chat as floating bar | Document covers everything including sidebar; chat is a bar + drawer. | Answer and source are never side by side. Do not build. |

**Why O1:** the job is checking the agent's claim against the source. The panel is already where the user's attention and scroll position are; O1 keeps it exactly there and gives the document every pixel the page had. The sidebar is untouched (base §5 rule: the panel never changes the sidebar).

The same layout is used from the full-page chat (§V10 B5), so there is one viewer component.

---

## V2. Layout and widths

```
| sidebar (as user left it) | viewer (flex 1)                                | panel |
|  244 / 68 / deep 244      | tabs 40 · header ~68 · toolbar 46 · [search 48] |  420  |
|                           | [banners] · body: thumbnails 132 | canvas       |  (360 |
|                           |                                                 |  at   |
|                           |                                                 | 1280) |
```

- **Viewer region** = viewport − sidebar − panel. White background.
- **Panel width while a document is open:**
  - Content area (viewport − sidebar) **< 1400px** → panel drops to its **360px** minimum for as long as the viewer is open, then returns to the user's width. The user can still drag it wider (up to 600); that choice persists for viewer sessions separately (`NOT IN DESIGN — spec default`).
  - Otherwise the panel keeps the user's width (default 420).
- **Page width (PDF / DOCX):** fit-width = canvas width − 56px padding, **capped at 900px** (860px drawn with thumbnails at 1600). Centred.
- **Thumbnails rail:** 132px. Default **on** when canvas ≥ 900px wide, **off** below (so off at 1280). Toggle with `T`. The user's toggle persists per session (`NOT IN DESIGN — spec default`).

Drawn widths:

| Frame | Viewport | Sidebar | Panel | Viewer | Page at fit |
|---|---|---|---|---|---|
| O1 1280 | 1280 | 244 expanded | 360 | 676 | 620 (thumbnails off) |
| V hero | 1600 | 68 rail | 420 | 1112 | 860 (thumbnails on) |
| O1 1920 | 1920 | 244 | 420 | 1256 | 900 cap (thumbnails on) |

- **Console page underneath:** covered, **not unmounted**. Its scroll position, selection and filters are kept; closing the viewer reveals it unchanged. Live updates to the page continue in the background.
- **Below 1280:** not designed (base §16.3).

---

## V3. The five ways in

One verb and one icon everywhere: **`Open`** with Lucide `eye`. The file name is also a link to the same action. Keyboard: `⏎` on the focused control.

| # | Where | Change to the base component | States |
|---|---|---|---|
| E1 | Document result §4.11 | Actions become **`Open` (primary) · `Download` · `Email`** (Open moves first; Download becomes secondary). File name: `#1d4ed8` on hover, underline `#93b4f5` offset 3px. Panel grid stays 3 equal columns. | Default · hover (name link) · focus (`0 0 0 2px #fff, 0 0 0 4px #2563eb` ring) · disabled when the source is unavailable (opacity .4, tooltip `Source unavailable`) |
| E2 | Generated file §4.12 | `Preview` is renamed **`Open`** and becomes primary; `Download` secondary; `Send…` unchanged. Thumbnail is a button: on hover shows chip `Open` (11/700 white on `rgba(23,24,28,.78)`, radius 6, padding `4px 7px`, eye 11) centred. | Default · hover · focus · generating (not openable; spinner not drawn — `NOT IN DESIGN`) |
| E3 | Attachment the user sent §4.18 | In the **sent** bubble, chips sit above the bubble, right-aligned, gap 6. Chip: white, `1px #e6e7ea`, radius 10, padding `6px 10px 6px 6px`, 30×30 thumb/tile; name 12/600; second line = size (11 `#6c7079`). On hover/focus: border `#2563eb` + halo, second line becomes `eye` 11 + `Open` 11/600 `#1d4ed8`. | Uploading / failed / too-large chips are **not openable** (no hover change) |
| E4 | Citation §4.7 | Claim span + superscript are one target. Hover (300 ms delay): superscript fills `#2563eb` with white text (10/700, radius 4, padding `0 4px`); dark tooltip (`#17181c`, radius 9, padding `7px 10px`, 12/1.45) `{file} · p. {n}` bold + `{section} · click to open at the passage` in `#b9bdc5`. Into a file that isn't the active tab: tooltip line 2 = `Opens in a new tab`. **Web-tier citations** open the URL in a new browser tab — the viewer only opens files. | Default · hover · focus · active (claim bg `rgba(37,99,235,.10)` while its passage is shown) · not found (superscript `#b91c1c` + `?`, claim underline `#e5484d`, bg `#fdecec`) |
| E5 | Knowledge base row §10 | `Open` button appears on row hover and focus (12/600 `#1d4ed8`, white, `1px #b9d0ff`, radius 7, padding `5px 9px`, eye 12). Clicking the row still selects it for the approval panel. | Hidden · shown on hover/focus · disabled for permission-denied docs |

**From the Knowledge base** the viewer opens over the page with the panel **closed**; the viewer header adds a button `Ask about this document ⌘J` (secondary, ring mark 14) that opens the panel with the document as context. (Button drawn only in the E5 note — `NOT IN DESIGN` placement: left of the header actions.)

---

## V4. Viewer anatomy

### V4.1 Tab strip

- Height **40**, bg `#f5f6f7`, bottom `1px #e6e7ea`, padding `0 10px`, tabs aligned to the bottom, gap 2.
- **Breadcrumb** first: `arrow-left` 14 + label of what's underneath (`Flights`, `Knowledge base`, `Chat`), 12.5/600 `#6c7079`, right border `1px #e6e7ea`, height 22, padding `0 10px 0 4px`. Click = close viewer (same as Esc).
- **Tab:** height 34, radius `9px 9px 0 0`, padding `0 8px 0 12px`, gap 8, max-width 260. Active: bg white, `1px #e6e7ea` border without bottom, `margin-bottom:-1px` so it joins the header; name mono 12/600 `#17181c`; icon `#3a3d44`. Inactive: transparent, name 500 `#6c7079`, icon `#9aa0a8`; hover bg `#eceef1` (`NOT IN DESIGN`). Type icon 13: `file-text` PDF/DOCX, `image`, `table-2`, `file-code` text, `file-question` unsupported. Close `x` 11 `#9aa0a8` in an 18×18 target, radius 5.
- **Max 6 tabs.** Opening a 7th closes the least recently viewed, with toast `Closed {file} · Undo` (toast style: base §2.6 layer 7; visual `NOT IN DESIGN`, spec default: dark `#17181c` toast, 13px, 6 s).
- Tabs belong to the thread (§V10 B3).

### V4.2 Header

Padding `12px 18px`, bottom `1px #eef0f2`, flex gap 14, align centre.

| Element | Values | Source |
|---|---|---|
| Type tile | 34×42, radius 5; PDF `#fdecec`/`#f7cfd0`/label `#e5484d`; XLSX `#e7f6ec`/`#c7ead2`/`#15803d`; DOCX `#e8effe`/`#cfe0ff`/`#1d4ed8`; PNG/TXT/KMZ `#f0f1f3`/`#e6e7ea`/`#6c7079`; label 8.5/800 | file type |
| File name | mono 14.5/600, ellipsis | file metadata |
| Revision chip | mono 11.5/600 `#3a3d44` on `#f0f1f3`, radius 5, padding `2px 7px`. Examples: `AIRAC 2610 · eff. 01 OCT 2026`, `rev 3`, `v3 · 18 SEP 2026`, `valid 23 SEP 0500 – 26 SEP 1800Z`. Superseded: `#b45309` on `#fef3e2`, `AIRAC 2609 · superseded 01 OCT`. Omitted when the file has none | `SOURCE UNKNOWN — developer to wire` |
| Meta line | 12 `#6c7079`, gap 8, items separated by 3px `#c9cdd3` dots: `{TYPE} · {size} · {n} pages` → tier (icon 12 + tier name 700 in tier colour + source name) → fetched/uploaded time mono 11.5 → authority badge (§V7) | tier/source per base §4.7 |
| Actions | secondary buttons 13/600, radius 8, padding `7px 11px`, icon 14, gap 6: `Attach to reply` (`paperclip`, tooltip `Attach to your next message`) · `Email` (`mail`, `Send by email · asks first`) · `Download` (`download`, `Download · ⌘S`) · `Open source` (`external-link`, `Open in AIP Portal` / `Open in Knowledge base` / hidden for attachments). Disabled: opacity .4 | — |
| Divider + Close | 1×24 `#e6e7ea`; close 34×34, `x` 17 `#3a3d44`, hover `#f0f1f3`, tooltip `Close · Esc` | — |

**Tier names used in the viewer meta:** `Internal` (AIP Portal, NOTAM sync), `Company` (knowledge base), and a new label **`Attachment`** (`paperclip`, `#3a3d44`) for files a user sent — `TOKEN MISSING`: add `color.tier.attachment = #3a3d44`. Attachments are not a source tier; they are never cited as company knowledge.

**Action behaviour:**
- `Attach to reply` → adds the file as an attachment chip to the composer (not sent). If the document is on a non-first page, the chip reads `{file} · p. {n}` and the agent receives the page. Spec default.
- `Email` → starts the email flow; ends in a standard confirmation (base §4.15 B). Never sends directly.
- `Download` → the original file (never the rendered DOCX preview).
- `Open source` → deep link to the page in the source system, new browser tab (§V10 B6).

### V4.3 Toolbar

Height **46**, padding `0 14px`, bottom `1px #eef0f2`, gap 6. Icon buttons 32×32 radius 8, icon 16 `#3a3d44`, hover `#f0f1f3`. Dividers 1×22 `#e6e7ea`, margin `0 4px`. Whole toolbar opacity .4 and inert while loading or showing a state card.

| Control | Values | States |
|---|---|---|
| Thumbnails | `panel-left`; tooltip `Thumbnails · T` | on: bg `#eef4ff`, icon `#1d4ed8` · off |
| Previous page | `chevron-up`; `Previous page · PgUp` | disabled on page 1 (opacity .35) |
| Page field | 44×30, `1px #d6d8dc`, radius 7, mono 13/600 centred; then `/ {total}` mono 13 `#6c7079` | editable: click selects, type a number, `⏎` jumps; out of range → field border `#e5484d` for 1 s and value reverts (`NOT IN DESIGN`) |
| Next page | `chevron-down`; `Next page · PgDn` | disabled on last page |
| Zoom out / in | `minus` / `plus`; `Zoom out · ⌘−` / `Zoom in · ⌘+` | steps **50 · 75 · 100 · 125 · 150 · 200%**; disabled at the ends |
| Zoom value | mono 12.5/600, 52px, centred. At fit-width shows the computed % (e.g. `113%`) | — |
| Fit width | text button 12.5/600, `move-horizontal` 14; `Fit width · ⌘0` | active (fit on): `#1d4ed8` on `#eef4ff`; any zoom step turns it off |
| Rotate | `rotate-cw`; `Rotate · R` | rotates the pages 90° clockwise per press; icon rotates to match; per document, not saved |
| Citation stepper | only when the thread has citations into this document: pill `#eef4ff`, `1px #dbe6ff`, radius 8, padding `3px 4px 3px 10px`, 12.5/600 `#1d4ed8`: `Citation {k} of {n}` + two 24×24 buttons `chevron-left` / `chevron-right` (`Previous citation · [`, `Next citation · ]`) | — |
| Search | right-aligned text button `search` 14 + `Search` + mono 11 `⌘F` at .7 | open: `#1d4ed8` on `#eef4ff` · disabled for scanned/unsupported (opacity .4, tooltip `No text layer — search unavailable`) |

Image type: page nav hidden; zoom steps extend to **400%**; fit becomes `Fit` (whole image). Table/text: page nav, zoom and rotate hidden; search stays. `NOT IN DESIGN` for the per-type toolbar reduction beyond what's drawn — spec default as stated.

### V4.4 Search row

Opens under the toolbar (`⌘F` or the Search button). Height 48, bg `#fbfbfc`, bottom `1px #eef0f2`, padding `0 14px`, gap 8.

- Field: max-width 420, height 34, white, `1px #2563eb` + `0 0 0 3px rgba(37,99,235,.1)`, radius 9, padding `0 10px`; `search` 14 `#9aa0a8`; query 13.5; count mono 12 `#6c7079` right: `{current} of {total}` (e.g. `1 of 5`). No matches: `No matches` in `#b91c1c` (`NOT IN DESIGN`).
- Prev / next: 32×32 secondary, `chevron-up` / `chevron-down`; tooltips `Previous match · ⇧⏎`, `Next match · ⏎`.
- Page list: 12 `#6c7079`: `Matches on pages 12, 13, 27` (pages mono). Over 8 pages: `Matches on 14 pages`.
- `Close Esc` ghost, right.
- **Match styling:** all matches bg `#fef3c7`, radius 2; current match bg `#fbbf24` + `0 0 0 2px #fbbf24`. Thumbnails with matches get a 10px `#f59e0b` dot bottom-right with a 2px `#f5f6f7` ring. `TOKEN MISSING`: add `color.search.match #fef3c7`, `color.search.current #fbbf24`.
- **Why yellow, not blue:** blue tint means "the agent cited this". Search is the user's own query; the two must never be confused on the same page.
- Behaviour: search runs over the text layer of loaded pages as you type (debounce 200 ms, spec default); progressive loads keep adding matches and the total updates. Moving to a match scrolls it to 96px below the canvas top. Case-insensitive; exact substring. Closing clears highlights.
- Source: text layer of the file (client-side). `SOURCE UNKNOWN` for server-side full-text on files over the load limit.

### V4.5 Banners

Full-width rows under the toolbar/search, stacked in this order: failed citation → superseded → offline → scanned / rendered-preview. Padding `10px 16px`, bottom border, gap 10; icon 16; text 13/1.5 `#3a3d44` with a bold lead in the icon colour; optional secondary button 12.5/600 right.

| Banner | Icon | Colours (fg / bg / border) | Copy (verbatim) | Action |
|---|---|---|---|---|
| Citation not found | `search-x` | `#b91c1c` / `#fdecec` / `#f7cfd0` | **Couldn't find cited passage 3 in this file.** The agent cited p. 12 for "Stands 1–6 are closed to parking overnight", but no matching text is on that page or anywhere else in the document. Treat the claim as unverified. | `Search the document` (opens search pre-filled with the claim's key words) |
| Superseded | `history` | `#b45309` / `#fef3e2` / `#f6ddb0` | **Superseded.** This is AIRAC 2609. AIRAC 2610 took effect on 01 Oct 2026 and changes AD 2.20 and AD 2.21. | `Open current (2610)` (opens in a new tab) |
| Offline | `wifi-off` | `#3a3d44` / `#f5f6f7` / `#e6e7ea` | **You're offline.** Showing the copy saved on this PC at 07:51Z. Search works; Download, Email and Open source need a connection. | — |
| Scanned | `scan-text` | neutral | **Scanned document — no text layer.** Search and citation highlights aren't available, and the agent can only read what it extracted when the file was indexed. | — |
| Rendered preview (DOCX) | `info` | neutral | **Rendered preview.** Layout may differ from Word. Download for the original file. | `Download original` |

Banners are not dismissible (spec default: they state facts about the file).

### V4.6 Thumbnail rail

132px, bg `#f5f6f7`, right `1px #e6e7ea`, padding `14px 0`, column centred, gap 12, scrolls independently.

- Thumb 78×101 (A4 ratio), white, `1px #e6e7ea`, radius 3; rendered page image in production (design uses grey lines). Page number under it mono 11.
- Current page: `2px solid #2563eb` + `0 0 0 3px rgba(37,99,235,.15)`, number 700 `#1d4ed8`.
- Citation badge: top-right `-6px`, 16px tall pill `#2563eb`, white 9.5/700, the citation numbers on that page (`1 2`).
- Search-hit dot: §V4.4.
- Not yet loaded (progressive): bg `#eceef1`, no lines.
- Click → jumps to the page. The rail auto-scrolls to keep the current thumb visible.

### V4.7 Canvas

- Background `#eceef1` (PDF/DOCX/scanned); `#e4e6ea` (image); `#fff` (table, text); `#fbfbfc` (state cards).
- Padding `24px 28px`; pages in a column, gap 20, centred.
- Page: white (scanned `#fbfaf6`), shadow `0 1px 3px rgba(16,18,22,.12), 0 8px 20px rgba(16,18,22,.05)`, no radius. Rendered from the file (PDF.js or equivalent — `SOURCE UNKNOWN`); the design's typeset AIP page is illustrative of what a real page contains, not a layout to recreate.
- Left margin reserved for citation markers: markers sit 40px left of the text column, inside the page's 56px left padding in the design; in production they're positioned in the canvas gutter left of the page edge (`NOT IN DESIGN` — spec default: 12px left of the page).
- Text layer: selectable, not editable. Copy copies the text as extracted.
- `TOKEN MISSING`: `color.viewer.canvas #eceef1`, `color.viewer.canvas.image #e4e6ea`, `color.viewer.page.scan #fbfaf6`.

---

## V5. Scrolling, reading position, focus

**Fixed vs scrolling:** tab strip, header, toolbar, search row and banners are fixed. The canvas and the thumbnail rail scroll, independently. The panel's thread scrolls independently as before.

**Two scrollers, one rule:** wheel/trackpad scroll goes to whatever is under the pointer. Keyboard scroll (`PgUp/PgDn`, arrows, `Space`) goes to the region with focus. **A citation click scrolls the viewer only, never the thread.** New tokens streaming into the thread never move the viewer.

**Reading position:** page = the page with the most visible area. It updates the page field, the current thumbnail and the context chip (chip debounced 500 ms). Per tab, the scroll offset and zoom are kept while the tab exists and restored when switching back or reopening the thread.

**Focus**

| Event | Focus goes to |
|---|---|
| Viewer opens from a card, chip or KB | The canvas region (`role="document"`, `tabindex="0"`, label `{file}, page {n} of {total}`) so arrows and PgDn work at once |
| Viewer opens from a citation | The highlighted passage's container; `aria-live="polite"` announces `Cited passage {k}, page {n}` (or `Cited passage {k} not found` when missing) |
| Search opens | Search field |
| Search closes | Canvas |
| State card shown | Its primary button |
| Viewer closes | The element that opened it (card button, chip, citation, KB row). If that element is gone, the composer |
| `F6` | Moves focus between viewer and panel |

---

## V6. Citation → document

**Locating.** A citation carries document ID, revision, page, and the exact cited source span — `SOURCE UNKNOWN — developer to wire` (the model must return spans). The viewer searches the cited page's text layer for the span (whitespace-normalised, case-sensitive), then the whole document. **Highlight only on an exact match.** No fuzzy match is ever shown as a highlight. **Why:** a near-match highlight tells the dispatcher the source says what the agent said when it doesn't.

**C1 Found.**
- Jump: the viewer scrolls so the passage's top sits **96px** below the canvas top.
- Highlight: bg `rgba(37,99,235,.12)`, `box-shadow: 0 0 0 3px rgba(37,99,235,.12)`, radius 3, padding `0 2px`. `TOKEN MISSING`: `color.cite.highlight rgba(37,99,235,.12)`.
- Margin marker: 22px circle `#2563eb`, white 11/700 citation number, top-aligned with the passage's first line. Rings once as it lands (§V11 A-V4).
- In the reply: the claim span gets bg `rgba(37,99,235,.10)`; the source row gets bg `#eef4ff`.
- Highlight stays until another citation is opened or the tab closes.

**C2 Spans a page break.** Both parts tinted; **only the first carries the marker**. Tags (11/600 `#1d4ed8` on `#eef4ff`, radius 5, padding `2px 7px`): end of first part, right-aligned `Passage continues on p. 13 ↓`; start of the next page, left-aligned `↑ Cited passage 2 continued from p. 12`. Jump lands on the first part.

**C3 Second citation into the open document.** Same tab, no reload. Scroll to the new passage. The previous passage drops to a **dashed outline** `1px dashed #93b4f5`, no fill, with a white marker (`#1d4ed8` text, `1px #93b4f5`) — both claims stay visible. The stepper reads `Citation {k} of {n}`; `[` / `]` step through citations into this document in reply order. Citations into a different file → new tab (§V10 B2).

**C4 Cannot be located.** **Must not look like success.**
- No tint, no marker anywhere in the document.
- Red banner (§V4.5) quoting the claim.
- The viewer still opens at the cited page number so the user can look.
- In the reply: superscript `#b91c1c` with label `{k} ?`, claim underline `#e5484d`, claim bg `#fdecec`; source row meta `not found` in `#b91c1c`, number badge `#b91c1c` on `#fdecec`.
- Logged to the Activity log as a failed citation check (kind `READ`, result `Citation not found` `#e5484d`). `SOURCE UNKNOWN` for the log write.

**Revision mismatch.** If the open file isn't the cited revision, open the cited revision when available. If only a newer one exists: superseded banner, search the newer file; if found, highlight and add tag `Found in AIRAC 2610, cited from 2609` (tag style as C2).

**From a verbatim block** (`Open source · p. 3`, base §4.8): open the authoritative document at the clause with the C1 highlight plus a tag `Quoted verbatim in the reply · text matches` (10.5/600 `#6d28d9` on `#f5f3ff`, `1px #ddd6fe`, radius 5). If the stored clause and the file text differ: tag turns red (`#b91c1c` on `#fdecec`, `1px #f7cfd0`) `Text differs from the quoted clause`, and the mismatch is logged as a data error. **Why:** the verbatim frame promises byte-for-byte text; the viewer is where that promise gets checked.

**Scanned documents:** citations open at the cited page with no highlight and the scanned banner (not the red not-found banner — the passage wasn't searched for).

---

## V7. Tier shown without the ink frame

Base §3 rules 1–3 apply. **The viewer never uses `#17181c` as a frame, header fill or border.** Tier is shown by a badge in the header meta line, in words.

| Tier | Badge (11.5/600, radius 999, padding `2px 9px 2px 7px`, icon 12) | Extra |
|---|---|---|
| Authoritative | `badge-check` · `Authoritative · approved by N. Ozola 02 SEP 2026` · `#6d28d9` on `#f5f3ff`, `1px #ddd6fe` | Clauses the thread quoted get a violet quote marker in the margin: 22×20, radius 5, `#f5f3ff`, `1px #ddd6fe`, `quote` icon 12 `#6d28d9` |
| Reference | `book-open` · `Reference · cited, not quotable` · `#3a3d44` on white, `1px #d6d8dc` | No quote markers. Blue citation tint only when a citation brought the user here |
| Awaiting approval | `clock` · `Awaiting approval · not quotable` · `#b45309` on `#fef3e2`, `1px #f6ddb0` | Amber strip under the header: bg `#fffaf0`, bottom `1px #f6ddb0`, padding `9px 16px`, 12.5/1.5: `Uploaded by Anna Kerimova 22 SEP. Not approved — the agent won't quote or rely on this document until N. Ozola approves it.` + button `Review in Knowledge base` **for approvers only** |

`TOKEN MISSING`: `color.tier.company.tint2 #f5f3ff`, `color.tier.company.border #ddd6fe`.

**Why violet, not black:** violet is already the Company tier colour, so "approved company document" reads as a stronger form of a colour the user knows. Black stays exclusive to the quoted text in the thread.

AIP documents (Internal tier, from EAD) carry no authority badge; the revision chip carries their validity.

---

## V8. File types

| Type | Drawn as | Toolbar | Notes |
|---|---|---|---|
| **PDF** | V hero, type PDF | full | Main case. Text layer, search, citations |
| **Scanned PDF** | type "Scanned PDF" | search disabled | Neutral scanned banner. Pages rendered as images. `TPL-CB-03_crew_brief_template.pdf · rev 3 · PDF · scanned · 4.8 MB · 6 pages` |
| **Image** (PNG, JPG) | type "Image" | zoom + fit only | Canvas `#e4e6ea`, cursor `grab` / `grabbing`; drag to pan; wheel + ⌘ zooms to pointer (spec default). Minimap bottom-right 16px inset: 168 wide, white, `1px #d6d8dc`, radius 10, shadow `0 6px 16px rgba(16,18,22,.14)`, padding 8; preview 112 tall with viewport rectangle `2px solid #2563eb` + `rgba(37,99,235,.08)`; footer 11 `Drag to pan` + zoom %. Minimap shows only when zoomed past fit. Meta `PNG · 1.9 MB · 4032 × 3024` |
| **Table** (CSV, XLSX) | type "Table" | search only | Extends §4.13 full-page table: header row 11/700/0.06em `#9aa0a8` on `#fbfbfc`, **frozen**; rows 13px padding `9px 12px`, dividers `#f2f3f5` both axes; row-number column 44px mono `#9aa0a8`; codes/dates/times mono; empty cell `—` `#c9cdd3`. Sheet tabs row (XLSX only): padding `10px 16px`, 12.5; active 700 white `1px #d6d8dc` radius 7; inactive 500 `#6c7079`. Right: `{rows} rows · {cols} columns · header row frozen`. Horizontal scroll is allowed here (full width, not the 372px panel). Sorting/filtering: `NOT IN DESIGN` — do not build |
| **Text / raw** (TXT, NOTAM, METAR) | type "Text / raw" | search only | Base §4.14 rules: `white-space: pre`, never reflowed, mono 13.5/1.75. Line numbers 56px column right-aligned `#c9cdd3`, not selectable. Cited lines tinted `rgba(37,99,235,.08)` full-width. Copy copies the original string |
| **DOCX / generated report** | type "DOCX" | page nav, zoom | Rendered to pages (server-side conversion — `SOURCE UNKNOWN`). Rendered-preview banner. Download gives the original. Generated PDFs from the agent (§4.12) are PDFs and use the PDF view |
| **No preview** (e.g. `.kmz`, `.zip`, `.dwg`) | type "No preview" | hidden | Centred state card: `file-question`, kind `NO PREVIEW`, title `Can't preview .kmz files`, body `Google Earth archive of obstacle data, 4.3 MB, from the AIP Portal. The agent can read its name and metadata, not its contents.`, actions `Download` (primary) · `Open in AIP Portal ↗` · `Email`, note `Viewable types: PDF, PNG, JPG, CSV, XLSX, TXT, DOCX.` |

**State card** (used by No preview and §V9): centred in the canvas, width 460, white, `1px {border}`, radius 14, padding 24, gap 12, shadow `0 1px 2px rgba(16,18,22,.04)`. Icon tile 40×40 radius 10 (tint + icon 20). Title 17/800/-0.01em + kind 11/700/0.08em in the kind colour. Body 14/1.55 `#3a3d44`. Diagnostic mono 11.5 `#9aa0a8`. Buttons 13/600 radius 8 padding `8px 12px` (first primary). Optional note 12.5 `#6c7079` above a top rule.

**Table result "Full view"** (base §4.13) now opens in the viewer as a Table tab named `Result · {n} {things}` (e.g. `Result · 6 flights`), tier Internal, source = the tool that produced it. This replaces the 900px sheet default.

---

## V9. States

Header renders immediately from metadata in every state (name, type, size, tier) so the user knows what they opened.

| State | What shows | Copy (verbatim) | Actions |
|---|---|---|---|
| **Loading** (< 1.5 s expected) | Toolbar inert (.4). One skeleton page at page width, 520 tall, 9 lines 10px `#f0f1f3` radius 3 pulsing (A7); under it 12.5 `#6c7079` | `Opening EV_AD_2_EVRA_en.pdf · 2.8 MB` | — |
| **Slow, progressive** (large PDF) | Pages render as they arrive. **The cited/target page is fetched first** (range requests). Progress row under the toolbar: padding `8px 16px 10px`; line 12.5: pulsing 8px `#2563eb` dot + text + elapsed mono 11.5 `#9aa0a8`; bar 3px track `#e6e7ea` fill `#2563eb`. Not-yet-loaded pages: white page with skeleton lines and centred mono 13 `#9aa0a8` `p. {n} · loading`; thumbnails `#eceef1` | `Loading page 14 of 212 · 14.2 of 48.0 MB · you can read and search the pages already loaded` | Everything works on loaded pages |
| **Empty** | State card `file`, neutral | kind `EMPTY` · `This file is empty` · `EVRA_handling_notes.txt is 0 bytes. There's nothing to show or ask about.` | `Remove from thread` |
| **Render failed** | State card `file-x`, red | kind `RENDER FAILED` · `Couldn't display this PDF` · `The file downloaded, but page 1 couldn't be drawn. The file may be damaged. The agent's answer was based on the indexed text, not this copy.` · diag `pdf.render → InvalidPDFException · xref table · p. 1` | `Retry` · `Download` · `Open in AIP Portal ↗` |
| **Too large** (> 100 MB) | State card `file-warning`, amber | kind `TOO LARGE` · `This file is 212 MB` · `The viewer opens files up to 100 MB. The AIP Portal pages large documents from the server, so open it there, or download it.` · note `The agent can still answer questions about it from the indexed text.` | `Open in AIP Portal ↗` (primary) · `Download` |
| **Password-protected** | State card `lock`, neutral, with a password field (38 tall, focused style) + `Open` primary | kind `PROTECTED` · `This PDF is password-protected` · `Enter the password to open it here.` · note `The password is used once to open the file on this PC and isn't stored. The agent can't read protected files.` | Wrong password: field border `#e5484d`, helper `Wrong password` 12 `#b91c1c` (`NOT IN DESIGN`) |
| **Fetch failed** | State card `cloud-off`, amber | kind `FETCH FAILED` · `Couldn't fetch the document from EAD` · `EAD didn't answer. A cached copy from 22 SEP 06:10Z (AIRAC 2609) is on the AIP Portal.` · diag `aip.get → EAD timeout 30 s · 08:12Z` | `Retry` · `Open cached copy` (opens with the superseded banner if applicable) |
| **Permission denied** | State card `lock`, red | kind `PERMISSION DENIED` · `You don't have access to this document` · `LIM-register_fleet_rev3.pdf is restricted to Ops Quality. The agent quoted from it because approved clauses are shared; the full document isn't. Ask N. Ozola or an admin.` · diag `kb.read → 403 · requires kb:quality` | `Request access` · `Copy request` |
| **Stale / superseded** | Document shown + amber banner + amber revision chip | see §V4.5 | `Open current (2610)` |
| **Offline** | Cached copy shown + offline banner; Email/Download/Open source disabled (.4) | see §V4.5 | Search works. Without a cached copy: state card `wifi-off` neutral, `You're offline` · `This document isn't saved on this PC. It will open when the connection returns.` (`NOT IN DESIGN` copy) |

Limits (`NOT IN DESIGN — spec default`, confirm with engineering): view limit 100 MB; progressive mode above 10 MB or 60 pages; cached copies kept for the last 20 documents opened per user.

**Permission note:** the permission-denied case exists because approved clauses can be quoted to users who can't open the full document. That is a product decision implied by the design copy; confirm it (§V13).

---

## V10. Behaviour while a document is open

**B1 The open document is the context.** Opening a document **replaces** the page context in the chip (base §4.21) with the document: icon = the type icon, text `Asking about {file} · p. {n}` (file in mono). The page number follows the reading position (debounced 500 ms). The agent receives document ID, revision and the visible page range — `SOURCE UNKNOWN`. Clearing the chip makes the question general; the viewer stays open. Closing the viewer restores the page context. The composer placeholder becomes `Ask about this document…`. Tool summary copy for reads of the open file: `Read {n} pages of the open document · {s} s`.

**B2 An answer cites a different document.** Citations never replace the document being read. A citation into another file opens it in a **new tab** and switches to it; the first tab keeps its page and highlights. Tooltip on such citations: `Opens in a new tab`.

**B3 A second document opens → tabs.** Decision: **tabs**, not replace or stack. Why: dispatchers compare two airports, or a brief against its AD 2. Opening a file that's already open switches to its tab. Max 6 (§V4.1). Tabs belong to the thread: switching threads swaps the tab set; reopening the thread restores it (per-tab page and zoom).

**B4 Panel minimised while reading** (base §6.13). The viewer widens to the right edge; the 44px minimised tab sits over the viewer's right margin. Context keeps tracking the page. `⌘J` restores the panel and the viewer narrows back. Closing the viewer while minimised returns to the console page with the tab still showing.

**B5 From the full-page chat.** Same O1 layout: the thread narrows to a 420px right column (360 below 1400 content width); breadcrumb reads `← Chat`. Closing returns the thread to its 800px column at the same scroll position.

**B6 Hand-off to the AIP Portal.** Files over 100 MB, and AIP amendment bundles, hand off. `Open source` and the Too-large state open the portal's viewer at the same document and page in a new browser tab — deep-link format `SOURCE UNKNOWN`. The agent's viewer never tries to replace the portal.

**Closing the viewer:** `Esc` (when no search/menu is open and focus is in the viewer), `×`, or the breadcrumb. Closes **all tabs** (spec default; tabs are restored if the thread is reopened). `⌘W` closes only the active tab; closing the last tab closes the viewer.

---

## V11. Register additions

### §14 Animation register — new rows

Easing tokens from base §2.4 (`ease.out` = `cubic-bezier(0.2,0,0,1)`, `ease.in` = `cubic-bezier(0.4,0,1,1)`), marked *(spec default)* where the design gives no value.

| ID | Element | Trigger | Property | From → to | Duration | Easing | Delay / stagger | Reduced motion |
|---|---|---|---|---|---|---|---|---|
| DV1 | Viewer open | Open / citation / KB | viewer opacity + translateX; console page opacity | 0, 24px → 1, 0; page 1 → 0 | 200 ms *(spec default)* | ease.out | page fade simultaneous | instant swap |
| DV2 | Viewer close | Esc / × / breadcrumb | reverse of DV1 | 1, 0 → 0, 24px | 160 ms *(spec default)* | ease.in | — | instant |
| DV3 | Panel narrowing to 360 on open (< 1400) | viewer opens | panel width | user width → 360 | 200 ms *(spec default)*, with DV1 | ease.out | — | instant |
| DV4 | Citation jump | citation click | canvas scrollTop | current → target − 96px | 300 ms, capped; over 6 pages away: instant jump then DV5 *(spec default)* | ease.out | — | instant |
| DV5 | Citation highlight in | jump lands | highlight bg alpha | 0 → .12 | 150 ms *(spec default)* | ease.out | after DV4 | appears at full alpha |
| DV6 | Citation marker ring | jump lands | box-shadow ring | `0 0 0 0 rgba(37,99,235,.35)` → `0 0 0 8px rgba(37,99,235,0)` | **700 ms, once** (design `cwring`) | ease-out | after DV5 | none |
| DV7 | Previous citation → dashed | second citation | fill → dashed outline | tint → `1px dashed #93b4f5` | 200 ms *(spec default)* | ease.out | — | instant |
| DV8 | Page navigation (buttons, field, thumbs, PgUp/PgDn) | nav | scrollTop | current → page top − 24px | 200 ms *(spec default)* | ease.out | — | instant |
| DV9 | Zoom step | ⌘+/⌘−/buttons | page width (re-render) | step → step, keeping the point under focus fixed | 120 ms *(spec default)*; re-render crisp after | ease.out | — | instant |
| DV10 | Rotate | R | page transform rotate | n → n + 90° | 200 ms *(spec default)* | ease.out | — | instant |
| DV11 | Search row open/close | ⌘F / Esc | height | 0 ↔ 48px | 120 ms *(spec default)* | ease.out / ease.in | — | instant |
| DV12 | Search match move | ⏎ / ⇧⏎ | scrollTop; current-match colour | → match − 96px; `#fef3c7` → `#fbbf24` | 200 ms / 100 ms *(spec default)* | ease.out | — | instant |
| DV13 | Progressive page arrives | page loaded | skeleton → page image | opacity 0 → 1 | 150 ms *(spec default)* | ease.out | per page as loaded | instant |
| DV14 | Progress bar | bytes received | width | 0 → 100% | real progress | linear | — | same |
| DV15 | Loading skeleton and slow-load dot | loading | opacity | .35 ↔ 1 | 1200 ms loop (design `cwpulse`) | ease-in-out | — | static at 1 |
| DV16 | Thumbnail rail toggle | T / button | rail width | 0 ↔ 132px | 160 ms *(spec default)* | ease.out | — | instant |
| DV17 | Tab open / switch | open second file / click tab | new tab width; canvas content | 0 → auto; cross-fade | 120 ms *(spec default)* | ease.out | — | instant |
| DV18 | Image pan | drag | transform translate | follows pointer | direct manipulation, no easing | — | — | same |
| DV19 | Context chip page change | reading position | chip text | old → new page | no animation; debounced 500 ms | — | — | same |

### §15 Keyboard register — new rows

Scope "viewer" = focus is inside the viewer region.

| Key | Where | Action |
|---|---|---|
| `⏎` / `Space` | focused Open button, file-name link, attachment chip, citation, KB row Open | Open in the viewer |
| `Esc` | viewer, search closed, no menu | Close the viewer (all tabs) |
| `Esc` | search row | Close search |
| `⌘W` | viewer | Close active tab |
| `Ctrl+Tab` / `Ctrl+⇧Tab` | viewer | Next / previous tab |
| `PgDn` / `PgUp` | viewer | Next / previous page |
| `Space` / `⇧Space` | viewer canvas | Scroll one screen down / up |
| `Home` / `End` | viewer canvas | First / last page |
| `⌘+` / `⌘−` | viewer | Zoom in / out (overrides browser zoom while the viewer has focus) |
| `⌘0` | viewer | Fit width (images: fit) |
| `R` | viewer | Rotate 90° clockwise |
| `T` | viewer | Toggle thumbnails |
| `⌘F` | viewer | Open search in the document (overrides browser find while the viewer has focus) |
| `⏎` / `⇧⏎` | search field | Next / previous match |
| `[` / `]` | viewer | Previous / next citation into this document |
| `⌘S` | viewer | Download |
| `F6` | viewer or panel | Move focus between viewer and panel |
| arrows | image, zoomed | Pan 40px per press (spec default) |

**Esc precedence** (replaces base §15 last line): menu → voice capture → search row → confirmation → streaming/speech → viewer close → panel close. `⌘J` still toggles the panel while the viewer is open; it does not close the viewer.

---

## V12. Changes to the base spec

Apply these to `agent-design-spec.md` (or treat this list as overriding it).

1. **§4.11 Document result** — actions are now `Open` (primary) · `Download` · `Email`. "Open → full-view sheet beside the panel" is replaced by §V2/§V4.
2. **§4.12 Generated file** — `Preview` renamed `Open`, primary; thumbnail opens too.
3. **§4.13 Table result** — "Full view … 900px sheet" is replaced: Full view opens a Table tab in the viewer (§V8).
4. **§4.18 Attachments** — sent chips are openable (§V3 E3). Uploading/failed/too-large are not.
5. **§4.7 Source attribution** — citations to files open the viewer at the passage; Web citations open the URL in a new browser tab. Claim ↔ source hover highlight uses `rgba(37,99,235,.10)` for Internal (resolves part of base §16.2 "Highlight colours for claim↔source hover").
6. **§4.8 Verbatim** — `Open source · p. 3` opens the viewer with the verbatim-match tag (§V6).
7. **§4.21 Context chip** — gains the document context (§V10 B1).
8. **§2.6 Z-order** — layer 5 "Full-view sheet" is now the viewer, which is **not** a layer: it sits in the page's place (layer 1). The panel stays at layer 2.
9. **§6.2 / §4.26** — new rule: panel drops to 360 while a document is open and the content area is < 1400px (§V2).
10. **§15** — Esc precedence replaced (§V11).
11. **Formatting fix:** the base spec file had every inline code span written as `` \` `` (escaped backticks), so none of it rendered as code. Fixed in place; no content changed.

---

## V13. Edges

### Designed and ready
- Layout decision with three options at 1280 and 1920; O1 built out at 1600.
- Five entry points with hover/focus.
- Tab strip, header, toolbar with all controls, search row, banners, thumbnails, canvas.
- Citation → document: found, page-break span, second citation, not found; revision mismatch and verbatim-match rules.
- Tier treatment: authoritative, reference, awaiting approval — no ink frame.
- Seven file-type views; eleven states.
- Behaviour: document context, citation into another file, tabs, minimised panel, full-page chat, portal hand-off. Focus, keyboard, animation rows.

### Designed but incomplete
- "Ask about this document ⌘J" button exact placement (KB entry).
- Tab hover state; 7th-tab toast visual.
- Page-field out-of-range feedback; search "No matches" state; wrong-password state.
- Offline with no cached copy (copy written here, not drawn).
- Per-type toolbar reduction for image/table/text (drawn in part).
- Generating state on the generated-file card.
- File-size and progressive-mode thresholds (engineering to confirm).
- **Permission model** implied by the permission-denied copy: approved clauses quotable to users who can't open the source. Confirm.
- `SOURCE UNKNOWN`: citation spans and revisions from the model; document fetch/range API; DOCX rendering service; portal deep-link format; cached-copy storage; failed-citation logging.

### Not designed
- Tablet and phone; the wall display.
- Editing, annotating, commenting, redaction.
- Printing from the viewer.
- Side-by-side compare of two documents in one view (tabs only).
- Table sorting, filtering, formulas.
- Review furniture in the design file: state switcher, option IDs, `RECOMMENDED` badge, section labels, scaled option frames, notes. **Do not build.**
