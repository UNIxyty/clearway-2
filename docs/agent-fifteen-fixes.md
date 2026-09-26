# Ops Agent — fifteen fixes (2026-09-26)

Causes, what changed, and the evidence for each item. Screenshots are named `fx-*` in the verification
run; commands and scripts are in the session scratchpad.

## Causes (the ones asked for)

| # | Symptom | Actual cause |
|---|---|---|
| 3 | Everything answered by Sonnet | The router ran. 93% of production turns (203/218) went to standard because the Nova Micro classifier prompt told it "if you hesitate, standard" and defined standard as "the normal case", and a keyword floor (`add `, `set `, `chang`, `show … on the wall`) matched ordinary questions. Also "Sonnet" is Sonnet **4.6**: Sonnet 5 and Opus 5 are refused by AWS for this account, so the fallbacks run. |
| 8a | Thinking shown in full | Text the model wrote in a tool-calling round (thinking aloud before a tool call) was streamed straight into the reply body. |
| 8b | Answer shown twice | The components were already built from tool results; nothing told the model the console renders them, so it restated them as markdown lists and tables, and the markdown renderer drew its own tables. |
| 9 | Uploaded files not read | Two breaks: text extraction returned nothing for PDF/XLSX/images and DOCX was not accepted; and nothing but a one-line placeholder string ever reached the model — no document or image block was built, and earlier-turn attachments were never re-sent. |
| 12 | Flight is only an ID | The agent's flight tool read field names the wall does not produce (`callsign`, `std`, `nid`, `registration` instead of `flightNo`, `startTimeUTC`, `flightNid`, `aircraftRegistration`), cut the record to 10 fields, `get_flight_state` read keys `/api/flight-info` does not return, and the only source was the board's visibility window. |
| 13 | Selection lags and jumps columns | pdf.js 5.4 sizes text-layer spans with `--total-scale-factor` / `--scale-round-*`; only `--scale-factor` was set and `pdf_viewer.css` was not used, so every span fell back to 16px and was stretched, overlapping the next column. No `endOfContent` or selecting handling, and our CSS hid `<br>`. Highlights were done by wrapping text inside pdf.js's spans, re-merging text nodes on every render — that destroyed selections and caused the lag. |
| 14 | Search highlight hides the text | Opaque backgrounds on `<mark>` elements in the text layer, which sits above the canvas, covered the glyphs. |
| 15 | Every KB download fails | 22 of 23 Knowledge base rows were written by **my local verification rig**, which uses the production database but its own disk — the bytes were on this Mac, never on the server. The server volume was fine and persistent (`/mnt/ssd-cache/agent`), and the one real upload was there. Nothing was lost. |

## What changed, by item

1. Nav icon: the static ring mark as a CSS mask (`/icons/ring-mark.svg`), same geometry as `RingMark`. Reads clearly at 17–20px.
2. The agent topic's sub-items are always shown — expanded sidebar and 68px rail (icon + tooltip). Settings is open to every agent user (personal section); organisation sections stay admin-only. Deep contexts keep the pinned agent block. Only URL-reachable route: `/agent/doc` (the hand-off viewer from the wall console) — intended.
3. Routing: tier → model and escalation rules are in `agent/config/models.json`, overridable in Settings → Routing (stored in `agent_settings`, applied on the next turn, no deploy). Router returns a tier and a confidence; low confidence raises one tier. Escalation is one-way and can happen mid-turn: more than N tool calls, approved (authoritative) text, conflicting or superseded sources, the user asking for care, a failed first attempt (retried once, one tier up, only if nothing was shown). `/model <tier>` for one turn and a per-user default (a floor, never lowered). Every answer is an Activity log row with start tier, final tier, model, why, escalations, tokens and cost.
4. Settings → Your preferences → "Skip confirmation for low-risk actions", off by default, lockable by an admin for everyone. Only actions with a working before-state undo qualify; auto-confirmed actions are audited as `action.auto_confirmed` and the reply carries an Undo. Voice never skips. Kill switch re-checked per call.
5. Scribe v2 Realtime via a single-use token (the key never leaves the server), VAD commits, 250 ms chunks, partial tail rewritten in place, uncertain words from committed logprobs, forced final commit on release, batch fallback. Nothing acts on a partial. Keyterms per user (≤50 × 20 chars — the live API's limit).
6. Wall readout: see `docs/agent-wall-voice-readout.md`.
7. §8 voice flow: compact bar (5 states), overlay, show-or-say, speaking states with rule 10, O1–O6, W1, mic cards, keybinds. Not built: the dark wall-console bar (§16.2 #3 still open), the bar's V6 exit, an Account setting for reply mode.
8. Thinking moves into a "Thought for Ns" disclosure (tool-activity pattern). The prompt now says what the console renders and forbids restating it; a markdown table is never rendered as markdown (it becomes a §4.13 table, or is dropped when a component already shows the data), and list lines naming something a component shows are dropped.
9. See the attachments table in the report below (limits in `agent/config/attachments.json`).
10. `agent/config/commands.json` + admin override; 19 commands; shown only when the user has every tool the command needs. `@` mentions already covered flight, airport, operator, aircraft, document.
11. `generate_file` reports named steps; the thread shows a building card with the A7 pulse on the running step and Cancel (Stop aborts between steps).
12. Tools return the wall's own record (`digital-wall/lib/flight-record.mjs`, shared); new `find_flight`, `get_trip_legs`, `search_flights` filters, new wall endpoint `/api/flights/normalized` (additive).
13–14. pdf.js's own text layer, unmodified, with its stylesheet rules and scale variables; highlights drawn in a separate layer with `mix-blend-mode: multiply`; violet marks for approved clauses the thread quoted.
15. Bytes restored to the server volume. Rows whose file is absent show "File missing" with Re-upload (developer); a browser navigating to a missing file gets a readable page, never JSON; viewer shows a FILE MISSING card. Record editing in the viewer (title, version, effective date, source, ICAO, tags; tier and approval stay in the Knowledge base review). Selection → Ask / Limitation / IMPORTANT / Note, through the agent and the normal confirmation rules. A test rig can no longer write knowledge rows into production unless explicitly allowed.
