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
