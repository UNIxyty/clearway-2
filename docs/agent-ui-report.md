# Ops Agent UI — build report

Build of `docs/agent-design-spec.md` into the portal, 2026-09-24/25. Manifest: `docs/agent-ui-manifest.md`.
Verification: Playwright against the **production build** (`next build` → standalone server) with the
agent service in its local test mode; screenshots for every state listed below were taken on that build.

## 1. What fraction of the manifest is built

| Status | Rows (of 197) |
|---|---|
| ✅ built and seen working in the browser | 89 |
| present — built to the spec, typechecked, not exercised by the rig | 61 |
| partial | 7 |
| blocked (backend 30 · design 6 · cross-app 3) | 39 |
| missing (C7 email dark mode — outside this build) | 1 |

So 157 of 197 rows are built (89 of them seen working), 39 are explicitly blocked, 1 is untouched.
The §3 rules verifier ran again on the final agent code: **15/15**.

Every row is either ✅ (seen working in a browser on the production build), `present` (built to the spec,
typechecked, but the rig could not exercise it — see the manifest note), or explicitly `blocked` with the
reason. The email-template rows (C1–C7) were not part of this build and keep their Part 8 status.

## 2. §3 rules — each one tested

| Rule | Test | Evidence |
|---|---|---|
| 1 Verbatim from the stored clause by ID; error on failure; never model text | `scripts/agent-verify-ui-rules.mjs` (byte-for-byte compare against the wall store; 404 → error) + browser | 15/15; ink frame fetched by id in the panel and on the full page (`06-panel-verbatim`, `28-generated-file`) |
| 2 Ink frame used by exactly one thing | grep of `background: C.ink` | VerbatimFrame header only; the `/` command chip is the spec's permitted exception; the KB `AUTHORITATIVE` tag and `Approve as authoritative` button are drawn black in §10 |
| 3 Only authoritative tier in the frame | `/api/verbatim/(limitation|important|caa|tier1)/:id` serves stored records only | rules script |
| 4 Every factual reply carries attribution | source strip / `NO SOURCE · AGENT'S REASONING` eyebrow | `03-panel-read-reply`, `29-email-confirmation` (2 SOURCES) |
| 5 Tier colours fixed | `TIER` read from `shared/design-tokens.json`, never themed | tokens.ts |
| 6 Server-verified, blocking, not optimistic, double-fire safe | rules script: 3 parallel confirms + a retry → one action id; UI disables on first activation | 15/15; `04`/`05` |
| 7 Composer locked while pending | browser | `04-panel-confirmation` (“Confirm or cancel the change above to continue”); after reload the lock is re-checked with the server |
| 8 Expiry at 5 min, not reusable | rules script with `AGENT_CONFIRM_TTL_MS=1500`; countdown in the card | 15/15; `expires 22:37Z` in the header, `4:56 left` on the destructive bar |
| 9 Voice never confirms | rules script: a typed/spoken “yes” changes nothing; voice-origin tokens refused | 15/15 |
| 10 Verbatim never read aloud | no TTS exists; the frame carries the `not read aloud` label when it does | blocked:backend |
| 11 Offline never queues writes | browser: offline card queues the question only; the thread's `send` returns before any write | `20-panel-offline` |
| 12 Every tool call as the requester | rules script: `origin` other than `ui` cannot carry a token; audit rows carry the requester | 15/15 |
| 13 Never on the wall display | the wall console SPA contains no agent code; the portal shell renders the panel only for allowlisted users | grep |
| 14 Mono for codes | `mono()` on ids, times, ICAO, callsigns, arguments | screenshots |

## 3. Token mapping (§2 → `shared/design-tokens.json`)

Reused as-is: `page, card, sidebar, border, borderInner, text, textBody, textMuted, textFaint, primary,
primaryDeep, primaryTint, primaryWash, green, greenDeep, greenTint, amber, amberDeep, amberTint, red,
redDeep, greyTint, font.sans, font.mono, radius.*`.

Added (new names only, values from §2): `textDisabled, borderControl, dividerRow, navActive, hover,
bubbleUser, disabledFill, primaryTint3, primaryLine, primaryBorder, primaryOnTint, sendEmpty, primaryFocus,
primaryHalo, amberBorder, amberStrong, amberStrongTint, redTintSoft, redBorder, dangerDisabled, greenBorder,
slate, sky, skyTint, stop, stopTint, stopBorder, stopSquare, rowExpanded, rowRecord, amberWash, greenWash,
redWash, toggleOff, navSubBorder, suggestHover, redWashSoft, amberWashSoft, highlight`; groups `tier`,
`voice`, `wall`, `shadow`, `motion`, `agentPanel`; radius extras.

`components/agent/ui/tokens.ts` maps the spec's names (`ink, body, muted, faint, warn, danger, ok…`) onto
those keys; `tailwind.config.ts` now reads the four sidebar keys from the same file. No hex literal is
inlined in `components/agent/**` (the only hex strings left are the mock-user email and the wall's own
dark palette, both in the token file).

## 4. Blocked rows

**Needs backend**
- Voice end to end (A3, A6, A64–A66, A68, A69, B10, B21, D2, D4, D7, D17–D28, E4–E9, E26, F10): no STT/TTS is
  wired (`ELEVENLABS_API_KEY` is present but unused; 0 recordings). The composer's voice button is not
  rendered rather than stubbed. The §8.2/8.3 cards are not built because there is nothing to proceed to.
- Per-claim citation spans (A16, D39 half): the model does not emit claim offsets.
- Stale/cached document marking: the document tools do not report cache age.

**Needs design**
- Command palette 1c (B20, E3), ⌘D (E27), edit/retry on a user message (A8 half), hover card for sent
  mention chips, short-answer card, cap editing, phonetic spelling, per-user voice preference.
- Voice bar over the wall (A67) — decision, see §8.

**Cross-app**
- The panel now runs on the wall console too (follow-up, commit `be5e852`): ⌘J / Ctrl+J opens the portal's
  `/agent/panel` in a 420 px dock beside the console content, with a pinned `Ops Agent ⌘J` sidebar row,
  context that follows the page, minimise, expand to the full page and the hand-back. The contract is four
  same-origin `postMessage` types (documented in `opsboard-react/src/hooks/useAgentDock.jsx`).
- Still blocked: the change-behind-the-panel ghost row / wall preview / applied-row highlight / banner
  (A42, B9) — the console pages would have to react to an agent write.

## 5. Spec defaults used

Tool summary collapsed after completion; stopped row keeps the partial reply; focus moves to Cancel when a
prompt appears; the confirm button shows a spinner while the server verifies; read rows in the Activity log
expand with `CONFIRMATION = Not required`; filter menus use the console `Dropdown`; paging is `Load more`;
History/Knowledge empty-loading-no-results use console `EmptyState`/`LoadingRows`; the Knowledge upload is
the existing console form; the rejection note is a textarea in the approval panel; the deep-context block
opens the panel; `Dashboard` carries no context (the greeting empty state applies); times of day for the
greeting are computed in UTC; toggle knob 150 ms ease-out.

## 6. Deviations from the design

- “Ask about {record}” sits in the airport page's own action row (that page draws its own header), not
  the shell header.
- The confirmation title is an imperative built by the backend from the tool input (`Add limitation “…”`),
  not the tool's source label; the target row is omitted when the title already names it.
- The Knowledge base lives under Ops Agent; `/developer/knowledge` redirects there.
- Settings' “who can do what” shows the allowlist (email as name) — the portal has no display-name
  directory the agent can read.
- The generated-file preview pane uses the browser's PDF viewer; headless Chromium shows its plugin
  fallback (real Chrome renders page 1).

## 7. What is wrong in the spec or the design

- §16.2 conflict 3 — the frame is the **wall display** (it uses the wall's dark timeline palette, and the
  console pages are light), so per round 3 nothing was built. Confirm or say it is a dark console view.
- §12 says the write switch cannot disable confirmation; Parts 7/8 decided *no* confirmation for
  standard wall writes. This build follows the spec: every write tool asks (levels low/standard/
  destructive from the backend table). The Part 7/8 verifiers were updated to confirm through the endpoint.
- §13.2 `From agent@clearway.aero` — the actual sender is `agent@verxyl.com` (Resend domain).
- §11 `SEND` reuses the Company violet (kept as drawn; consider a different colour).
- §10's “✓ matches page 2 of the PDF” cannot be produced honestly — the footer says which file the clause
  was extracted from instead.
- §4.7's claim underlines need model support the backend does not have; the strip and chips are built.

## 8. Step 4 decisions

1. **Voice bar over the wall** — not built; the frame is the wall display (see §7). Your call.
2. **§16.2 missing states** — built where the spec gives a pattern (listed in §5); the rest are in §4 as
   blocked with the reason.

## 8b. Follow-up fixes after first use (commit `be5e852`)

- **Every `/agent/*` page 404'd in production** (`No route for GET /history`): the tunnel routes
  `^/agent/.*` to the agent service, which also captures the portal's pages. The agent now passes
  non-API `/agent/*` requests through to the portal. The proper fix is one line on the server —
  `/etc/cloudflared/config.yml`: `path: ^/agent/.*` → `path: ^/agent/api/.*`, then
  `systemctl restart cloudflared` — which I was not permitted to apply; the pass-through makes it
  unnecessary for correctness but the ingress should still be narrowed.
- **`@` did nothing** with an empty query: the picker only rendered when it had rows. It now always opens
  with its type tabs, a hint, `Searching…`, `No matches`, and recent limitations while the query is empty.
- **⌘J on the wall console** — built (above).

## 8c. Editable shortcuts (commit `ec74070`)

Agent settings gained a **Keyboard shortcuts** card: the three chords that do something today — open/close
the panel (`Mod+J`), expand ↔ side panel (`Mod+Shift+J`), confirm a standard change (`Mod+Enter`) — each
recorded by clicking and pressing keys, saved immediately, admins only, logged. A switch chooses one
shared set (`Mod` = ⌘ on a Mac, Ctrl on Windows) or separate Mac / Windows sets. Esc stays fixed; a bare
key without a modifier is refused. Every keycap in the product (sidebar, Ask about…, panel titles,
confirm button, wall-console row) reads the organisation's binds. Stored in the existing `agent_settings`
row `keybinds` (no DDL). Verified in the browser: recorded ⌃⇧K, it opened the panel on the dashboard and on
the wall console while ⌘J no longer did; per-platform recorded Ctrl+Alt+K for Windows; reset to defaults.

## 8d. Second round of fixes after use (commit `9969cb8`)

- **`@` shows every type** — flights (today's wall window), airports (the portal's own search), operators,
  aircraft, limitations and documents, grouped under type headers; recents for each with an empty query.
  On the rig only limitations/documents have data (the sandbox wall has no operators or flights).
- **NOTAMs were empty** because the tool read `text` while the portal's cache stores the notice in
  `condition`; fixed, and every airport's NOTAMs now render as one mono box, each notice headed by its
  number, class and validity, separated by `—` (§4.14). The stale caches (May) are a NOTAM-sync issue on
  the portal side, not the agent.
- **Native controls gone**: a console-style `DateField` (month grid, Today, Clear) replaces the browser
  date inputs in the Activity log and the Knowledge upload.
- **Upload button vanished on hover**: `AgentStyles` rendered its `:root` variables once per page load;
  after in-app navigation the variables were gone and the primary button hovered to a transparent
  `var(--ag-primary-hover)`. Fixed (renders on every surface).
- **Voice shortcut** added to the editable set (hold ⌥ Space by default) and shown in the composer hint.
- **Flights on the wall**: new tools `show_flight_on_wall` / `close_flight_on_wall` (standard confirmation;
  the wall records who opened it). The confirmation flow was verified on the rig; the open itself needs
  a real flight on the wall, which the sandbox lacks.
- **Model under each reply**: `claude-sonnet-4-6 · standard · 2.9k in · 654 out · 11.8 s` (model id,
  routed tier, tokens, latency) on the full page and in the panel; persisted, so history shows it too.
- Not reproduced: the Knowledge base `internal_error` (no error in the agent log since the last restart)
  and "can't read important/CAA" — the audit shows `list_important` succeeding with 63 rows. Both need
  the exact time and question to chase.

## 8e. Three-way routing (commit `1e15a16`)

Operator decision 2026-09-25: the cheap router (Nova Micro) reads every request and picks **fast**
(Haiku 4.5), **standard** (Sonnet) or **reasoning** (Opus) by task. Rules kept: the router never
answers; the deterministic floor still keeps anything that can change data off the cheap tier;
escalation stays one-way. New: a **High-knowledge model** switch in Agent settings (on) — off returns the
router to fast/standard exactly as Part 10 left it. "Reasoning" is defined tightly in the classifier
(multi-source briefings, conflicting rules, many-record changes, argued safety/legality questions, or an
explicit ask to think hard). Every reply now says which tier answered and why (`· by router` /
`· floor` / `· pinned`).

Measured on the 69-query reference set: p50 router latency 336 ms (was ~1.1 s); modelled cost 13.8%
below flat Sonnet on that mix; the three reasoning-labelled reference queries route to reasoning; one
genuine under-route (`runway dimensions at EYVI` → fast), the classifier's known noise. Browser check:
"METAR for EVRA" → `claude-haiku-4-5 · fast · by router`; a reconcile-all-limitations question →
`claude-opus-4-6 · reasoning · by router`.

## 8f. Files and uploads (commit `1a3f5a4`)

- **Every file in a thread downloaded on reload**: the file card's preview `<object>` pointed at the
  download URL, which is served `Content-Disposition: attachment`. The files route now honours
  `?inline=1` (preview pane and Preview button); Download keeps the attachment. Verified: a thread with a
  generated PDF reloads with zero download events.
- **A thread now owns its URL**: `/agent` adopts `/agent/t/{id}` as soon as the conversation exists, so a
  reload (or a shared link) comes back to the same thread instead of "New chat".
- **Knowledge uploads were capped at 256 KB** (base64 JSON body → `400 body too large`). Uploads are now
  a raw body with the metadata in the query, up to **100 MB**, with a progress bar. Verified with 1.7 MB
  (API) and 1.5 MB (browser).
- The `api/confirmations/… 404` console lines came from old threads re-checking prompts the service has
  long forgotten; a prompt more than ~35 min past its expiry is now settled as expired locally, no request.

## 8g. Earlier files usable from any conversation (commit `6c92217`)

The files were on disk (the `/storage` volume is mounted and survives rebuilds); what failed was
`send_email` being handed the *filename* the model had seen in an earlier reply, where it expected a
generated-file id — and a new conversation had no way to look ids up. Now: `list_files` (the
dispatcher's own generated files, newest first, filterable); attachments resolve by id **or** filename
(newest match); a `precheck` hook runs before the confirmation prompt so a name that does not exist fails
immediately instead of after "Confirm"; the email prompt reads `Send “subject” to you with 1
attachment`. Rules verifier 15/15 on the final code.

## 8h. IMPORTANT and CAA verbatim frames (commit `9ffd715`)

"list me 10 important" rendered ten `VERBATIM NOT SHOWN` frames: the verbatim blocks carried no record
kind, so every frame re-fetched `/api/verbatim/limitation/IMP-001`; and the wall has no by-id GET for
IMPORTANT or CAA, so even the right kind would have 404'd. Now the block carries `kind`
(limitation / important / caa / tier1) and the route lists and matches IMPORTANT/CAA on id — still the
stored record, never the model's copy. Verified on the rig with a seeded IMPORTANT entry.

## 8i. Voice input (commit `4cb0923`)

Push-to-talk is now wired: hold the mic button or the voice shortcut (default ⌥ Space, editable) →
the bar docks into the composer (Invoked → Listening with live waveform and timer) → release →
Processing → the recording is transcribed once by ElevenLabs Scribe (`POST /api/voice/transcribe`,
audio never stored; audit keeps length and language only) → the text is sent as a voice-originated
message (rule 9 stays: a spoken change still needs the on-screen Confirm). Esc discards. First use shows
the §8.2 permission card; a denied mic shows the §8.3 card; no mic / nothing heard / voice switched off
are the spec's error rows. On the wall console the held shortcut opens the panel and records into it.
Gated by the Voice capability in Agent settings.

Stated deviations: the transcript does not stream while speaking and there is no uncertain-word popover
(batch STT); low confidence leaves the text in the field to check. Double-tap overlay, floating bar
without the panel, short-answer card and spoken replies (TTS) are not built. ICAO codes are the weak
point of any STT — the agent asks when it is unsure (seen in the test), and a vocabulary boost is the
next improvement.

Verified: API round trip 0.96 s on a spoken sample; in the browser with a fake microphone: bar states,
transcript sent with the mic mark, reply, Esc discard. Rules verifier 15/15.

## 8j. Shortcuts on a Mac keyboard (commit `f87d947`)

⌥ Space never fired and the recorder "sat on Press keys": macOS delivers ⌥ Space as a non-breaking
space (`key = "\u00a0"`) and ⌥+letter as a symbol (⌥J → ∆), so matching on `key` fails for every Alt
chord. All matching now uses the physical `code` (`Space`, `KeyJ`, `Digit1`…), in the shared matcher,
the composer's key-up, the console dock and the recorder. The recorder listens on the window while
recording, says "Add ⌘, ⌃ or ⌥ to that key" on a bare key, and Esc cancels. Verified with mac-style
events: ⌥ Space held → Listening → released → message sent; Esc discards; ⌘J via `KeyJ`; the recorder
saves ⌥ Space as `Alt+Space`.

## 8k. Document viewer (this commit)

Built from the viewer design project (`Ops Agent Document Viewer.dc.html`, `agent-design-spec-viewer.md`,
`Document Viewer - Features.md`). Layout O1 only: the viewer covers the console page between the sidebar
and the panel; the page underneath stays mounted; the panel narrows to 360 below 1400 of content width;
thumbnails start hidden when the canvas is under 900. Item-by-item status, blocked reasons and every
`NOT IN DESIGN — spec default` used: `docs/agent-viewer-manifest.md`.

**Citation → document, the two tests the prompt asked for (production build, Playwright):**

- *A citation that cannot be located.* Span "Stands 1-6 are closed to parking overnight and the apron is
  under water." against `EVRA_handling_probe.pdf` p. 1: highlights 0, markers 0 anywhere in the document,
  red banner "Couldn't find cited passage 1 in this file…", the page still opens, the reply's citation
  number turns red with `?`, Activity log row `citation.check → Citation not found` (`dv4`).
- *A quoted limitation whose file differs.* Verbatim record "2.1 Fuel uplift is by bowser only until the
  hydrant works are complete and stands 7-10 are reopened." (the file has no "and stands 7-10…"):
  highlights 0, red tag "Text differs from the quoted clause", Activity log row
  `verbatim.check → Data error · text differs` (`dv5`). The matching record shows the violet
  "Quoted verbatim in the reply · text matches" tag (`dv6`).
- Matching is exact and case-sensitive after whitespace normalisation (`locate.ts`); nothing fuzzy is
  ever drawn. Search hits are yellow, citations blue, so the two never read alike (`dv2`).

**Large PDF, requested page first.** `AMDT.pdf` (28.7 MB, 88 pages) opened at page 60: pdf.js runs with
range requests only (`disableStream`, `disableAutoFetch`, 64 KB chunks); the agent's range log shows the
xref chunk, then the header chunk, then the chunks for page 60. Page 60 is the first page drawn (render
order 60 → 59 → 61), with the progressive row "Loading page 60 of … · 19.9 of 28.7 MB · you can read and
search the pages already loaded" (`dv7`).

**Files behind the authenticated path.** Production, no session: `/files/*` → 307 to `/login`;
`/agent/api/files/:id`, `/agent/api/knowledge/documents/:id/file`, `/agent/api/attachments/:id`,
`/agent/api/documents/generated/:id` → 401; `/agent/doc?…` → 307 to `/login`. Signed in as another user,
a generated file requested by URL answers 404 and the viewer shows the PERMISSION DENIED card with the
file name (`dv8`). No `x-debug-runner-secret` anywhere in the viewer.

**Reduced motion.** With `prefers-reduced-motion: reduce` the viewer root, the citation marker and the
highlight all report `animation-name: none` (`dv10`).

**Deviations and spec defaults worth knowing:** `Attach to reply` pins the open document as the composer
context (the composer's attachment list holds uploads only); DOCX renders in the browser with `mammoth`
(no server-side conversion service exists); AIP `Open source` is a path-derived `/aip/…` link (deep-link
format unknown); below 1000 px of viewer width the header actions drop their labels so the header stays
one row at 1280 with the panel open; Undo after the seventh tab restores the closed tab and the strip
holds seven until the next open.

**Blocked (needs backend):** revision / superseded metadata and "open current" (nothing stores a revision or
a current-version pointer), cached offline copies (no store; the browser's HTTP cache only), spans for AIP
citations (the AIP tool returns page text, not the cited sentence), server-side text for files over the
100 MB limit. **Blocked (needs design):** none — every drawn state is built.

**Also fixed on the way:** tier-1 knowledge hits carried no document id, so no citation into an approved
clause was ever openable (`retrieval.mjs` now looks up document and page for the matched records);
`GET /api/documents/generated/:id` threw on an undefined helper; a knowledge file missing from storage
answered 500 instead of 404; the toolbar stayed inert after a tab switch (status reset raced the child
view's "ready"); the highlight variables were only injected by the panel, so citation highlights were
invisible when the panel was closed.

## 8l. Document revisions — unknown is not current (this commit)

Design and data model: `docs/agent-revisions.md`. What existed: EAD hands us the effective date and
AIRAC in its results table and in its filenames, and both were dropped at the storage key; the
knowledge base had `version`/`effective_date` columns with 0 of 18 rows filled; no AIRAC calendar
anywhere. What was added: a revision sidecar beside every cached AIP PDF (written by the sync worker
and by a backfill script), an AIRAC calendar (`lib/airac.ts`, `agent/lib/knowledge/revision.mjs`),
`revision` on the resolve/exists routes and on every document tool result, the four states in the
viewer, on source chips, document cards, the verbatim frame and the Knowledge base list, the
revision on citation audits, and `docs/supabase-agent-revisions.sql` for the columns the knowledge
base still lacks (feature-detected until run).

**Verified on the production build (Playwright, `rv1`–`rv13`):**
- Four viewer states: `rv1` current (AD 2 EVRA, AIRAC 2609), `rv2` not yet effective (UMGG, AIRAC
  2610 from 01 OCT 2026, blue banner), `rv3` superseded (knowledge v1 → amber banner + **Open
  current** to v2), `rv4` unknown (EHAM, italic chip + grey banner "It is not known whether this copy
  is current — do not treat it as such").
- Answer citing a superseded document (`rv6`): the reply opens with "that document (v1, effective
  2026-01-05) is **superseded** … The current version is v2" and answers from v2; the source chip
  and the document card carry `v1 · superseded`; the citation opens the viewer with the amber banner
  (`rv7`).
- Approved text from a superseded source (`rv6b`): the tier-1 record is still quoted word for word,
  ordered after the current one, with the note "The source document has been superseded — this
  approved wording may no longer match the current document" inside the frame, and the answer says so.
- Document cards from a real reply (`rv8`): EVRA current / UMGG not yet effective / EHAM revision
  unknown, and the answer states each ("EHAM — Revision unknown … cannot be confirmed as current").
- Cited-revision mismatch (`rv13`): "The answer cited AIRAC 2608; this copy is AIRAC 2609 · eff.
  03 SEP 2026. The cited revision was replaced under the same file, so the current copy is shown."
- The two banners side by side (`rv5`): red "Couldn't find cited passage … Treat the claim as
  unverified" vs grey "Nothing to highlight — not a failed check."
- The four previously untested cases: E1 document card → viewer (`rv9`), E3 sent attachment chip →
  viewer as Attachment (`rv12`), passage across a page break — three tinted parts on pages 1 and 2,
  one marker, both tags (`rv10`), second citation into the open document — same tab, previous passage
  dashed, stepper "Citation 2 of 2" (`rv11`).

**Migration.** Knowledge base: 18 pre-existing documents, none with a version or effective date → 18
unknown; the 5 fixtures added by this job carry revisions (3 current, 1 not yet effective, 1
superseded). AIP: production counts are in `docs/agent-build-status.md` stage 15 (the backfill runs
on the server after deploy).

**Design decision to confirm.** An AIP copy fetched before the cycle in force began is reported
**unknown** ("not checked against the source since AIRAC 2609 took effect"), not current. With no
scheduled re-check (syncs are on demand and EAD blocks datacenter IPs) every cached copy goes unknown
at each cycle boundary until re-fetched. That is the truthful state; a per-cycle re-check is the
follow-up.

**Also changed on the way:** tier-1 knowledge records now appear as verbatim frames in replies (the
frame builder only looked at limitation/IMPORTANT/CAA arrays, never at the knowledge tool's own
`verbatim` array — the frame rules are unchanged, the text is re-fetched by kind and id); a second
citation with the same reply number into an open document is numbered next instead of being treated
as the first; sent attachments show their chips at once (names travel with the ids); the text, table,
image and DOCX views fetched their file once per render (six requests for one text file);
`requireAuthenticatedUser` honours `DISABLE_AUTH_FOR_TESTING` like the middleware (test
environments only), which is what let the document-card path be exercised on the rig.

## 9. Also found on the rig (backend)

- After a cancelled `send_email`, the model re-proposed the same send unprompted on the next turn
  (“Two things pending in the console”). The UI did the right thing — a fresh card, nothing sent until
  clicked — but my verification script's generic “confirm” click hit that card, so one test email went to
  `ui-verify@example.com` from the rig. Worth a system-prompt rule: a cancelled action is not re-proposed.

- A generate_file write failure killed the whole agent process (`return persist()` inside a `try/finally`
  that awaits `browser.close()` → unhandled rejection → exit). Fixed with `return await`, plus a
  process-level `unhandledRejection` log so one tool can never take the service down.
- `agent_generated_files.expired_at` is still missing in Supabase (`docs/supabase-agent-hardening.sql`
  has not been run) — the retention sweep logs the 400 at every start.
