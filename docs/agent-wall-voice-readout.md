# Voice readout on the wall display

When a dispatcher uses voice with the Ops Agent on a **console**, the ops room
**wall display** shows a read-only readout of it, bottom centre: who is
speaking, what they said, what the agent is doing, and how it ended.

This resolves design spec §16.2 item 3 ("voice bar over the wall"): the
compact voice bar is **not** built on the wall display (§3 rule 13: the agent
is never available on the wall). The wall gets a readout instead, at the bottom
centre rather than pinned top-right as the Alternatives file drew it, because
it is a mirror of console activity and must not sit in the header band.

## It is a readout, not a control

- No buttons, no focus, no keyboard handling, no tap targets; `pointer-events:
  none`. The only accessibility surface is an `aria-live="polite"` region (the
  provisional transcript tail is `aria-hidden` so it is not re-read on every
  partial).
- Nothing it does changes wall state. Showing the readout is not an "action"
  in the sense of rule 13 — wall changes still only happen through a confirmed
  action from a console.
- Shown on the full wall layout only (the display's desktop/room mode), not on
  the phone/tablet views of the display.

## What the wall shows, and what it withholds

The wall is a room screen with **no signed-in user**. The policy is enforced
**server-side in the agent service** (`agent/lib/voice/wall-readout.mjs`,
`sanitiseVoiceActivity`), so a modified console cannot widen it. The wall
backend then clamps shapes and lengths again (`digital-wall/lib/voice-readout.mjs`).
The sanitiser builds its output field by field from allowlists; it never copies
unknown request fields through.

| Part | Shown | Withheld |
|---|---|---|
| Speaker | First name + last-name initial (`Jane D.`), from the **server's** identity for the caller (profile `full_name`, or `firstname` + `lastname`). If the only name available is derived from the email address: `A dispatcher`. | Email address, user id, role, anything the console sends as a name. |
| Transcript | What the user said aloud: **committed** segments plus the current **partial**, keeping the **end**, about two lines (140 characters). E-mail addresses → `[email]`, phone-like digit runs (8+ digits) → `[number]`, URLs → `[link]`. Callsigns, ICAO codes, times, QNH survive. The partial is dropped once the turn ends. | The agent's reply text, conversation history, earlier turns. |
| Activity | Up to 3 most recent steps. For **operational** tools only — flights (`search_flights`, `get_flight`, `get_flight_state`, `get_flight_tracking`), NOTAMs (`get_notams`, `get_notam_check_status`), weather (`get_weather`), AIP (`get_aip_document`, `get_gen_document`, `get_web_aip_link`, `get_aip_service_status`), wall display (`get_wall_state`, `show_flight_on_wall`, `close_flight_on_wall`, `update_display_settings`), limitations (`list_limitations`, `create/update/delete/restore_limitation`) — a fixed human label (`Checking NOTAMs`) with its state. **Every other tool**, including unknown ones, is `Working…`; consecutive generic steps collapse into one, so the count is not revealed either. | Tool names, tool **arguments** and **results** (even for allowlisted tools: no ICAO, no flight id, no document name); email tools' recipients / subjects / bodies; attachment and file names; memory / notes; knowledge-base document names and contents; web results. |
| Outcome | A fixed phrase: `Done` (after the turn ends), optionally `Done · 2 flights shown` when the console's summary matches the strict grammar `<n> flights|NOTAMs|airports|limitations|results shown|found|checked|updated`, otherwise `Done · checked flights, weather` derived from the operational tools that succeeded; `Needs confirmation on the console`; `Couldn't complete`; `Cancelled`. | Any free-text summary from the console; error messages and diagnostics; what a pending confirmation would do. |
| Grouping id | An opaque 16-hex hash of (user id, console session id), only used to keep one readout per console session. | The console session id itself, the conversation id. |

**Known limit of the policy:** the transcript is what the person *said*. It is
shown on the assumption that speech on the ops floor is not private; a
dispatcher on a console outside the room is still mirrored. Redactions cover
addresses, numbers and links, not the meaning of the words. If this is not
acceptable for a deployment, leave `AGENT_WALL_EVENTS_SECRET` unset (the whole
readout is then off).

## Lifetime

- Auto-hides **6 s** after the turn ends (`done`, `error`, `cancelled`).
- Expires if events stop arriving: the wall backend keeps at most one readout
  per console session in memory with a **20 s** TTL and broadcasts
  `phase: "expired"` when it lapses; the display independently drops a readout
  20 s after its last event. A console that disconnects mid-turn cannot leave a
  stale readout.
- One readout is on screen at a time (the most recently updated); the backend
  tracks at most 8 sessions.

## Event flow

```
console voice flow
  └─ postVoiceActivity(body)            components/agent/thread/voiceActivity.ts (fire-and-forget)
      POST /agent/api/voice/activity    agent/server.mjs — signed-in agent user (assertMayUseAgent)
        · Voice capability off or secret unset → { ok: true, relayed: false }
        · sanitiseVoiceActivity(body, user)     ← the policy above
        · relayVoiceActivity: ≤ 5 events/s per session, latest state wins
          (partials coalesce; a terminal phase is never lost)
      POST http://digital-wall-backend:5174/internal/voice-activity
           header x-agent-events-secret: $AGENT_WALL_EVENTS_SECRET
        digital-wall/server.mjs — constant-time secret check, shape clamp,
        VoiceReadoutStore (1 per session, 20 s TTL)
      SSE  /api/stream  { type: "voice-activity", ... }   display streams only (not consoles)
  └─ opsboard-react/src/components/VoiceReadout.jsx on the wall display
```

Request body (console → agent):

```json
{ "sessionId": "…", "phase": "listening|transcribing|thinking|acting|done|error|cancelled",
  "partial": "…", "committed": "…",
  "tools": [{ "name": "get_notams", "state": "running|ok|error" }],
  "outcome": { "kind": "ok|confirm|error", "summary": "2 flights shown" } }
```

SSE event (wall backend → display):

```json
{ "type": "voice-activity", "id": "8a500d4faca6d863", "phase": "done", "speaker": "Jane D.",
  "transcript": { "committed": "email [email] the NOTAMs", "partial": "" },
  "activity": [{ "label": "Checking NOTAMs", "state": "ok" }, { "label": "Working…", "state": "ok" }],
  "outcome": { "kind": "ok", "text": "Done · checked NOTAMs" },
  "at": "…", "ttlMs": 20000 }
```

`{ "type": "voice-activity", "id": "…", "phase": "expired" }` removes a readout.
No existing event or endpoint changed.

## Configuration (server)

Add to the server's `.env` (read by both `agent-service` and
`digital-wall-backend`; never commit a value):

```
AGENT_WALL_EVENTS_SECRET=<openssl rand -hex 32>
```

Then recreate both containers. Unset = readout off; the agent route answers
`relayed: false` and the wall route is a 404. It is a dedicated secret — not the
`x-debug-runner-secret`. The agent reaches the wall at `DIGITAL_WALL_INTERNAL_URL`
(default `http://digital-wall-backend:5174`) on the compose network; the public
gateway refuses `/digital-wall/internal/*`.

## Verification

`node scripts/agent-verify-wall-voice-readout.mjs` feeds hostile payloads (email
tool with recipients, long transcript with an address / phone / URL, unknown
tool, reply text, spoofed speaker) through both hops, prints what would reach
the wall, and checks the rate limit, the TTL expiry and the secret check.
