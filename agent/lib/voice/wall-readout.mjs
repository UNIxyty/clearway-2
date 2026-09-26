// Voice readout on the wall display (item 6; docs/agent-wall-voice-readout.md).
//
// A dispatcher using voice with the agent on a CONSOLE is mirrored on the ops
// room WALL as a read-only strip, bottom centre. The wall is a room screen with
// no signed-in user, so everything that reaches it passes through the sanitiser
// in this file — server-side, never in the browser, so a modified console
// cannot put more on the wall than this policy allows.
//
// ─── WHAT THE WALL MAY SHOW (the policy; keep in sync with the doc) ─────────
//
//  speaker     First name + initial of the last name ("Dmitrijs S."), from the
//              SERVER's identity for the caller — never from the request body.
//              If the only name we have is derived from the email address
//              (no full_name / firstname in the profile), it is "A dispatcher".
//              Never the email, never the user id, never the role.
//  transcript  What the user said aloud: the COMMITTED segments plus the current
//              partial, tail-truncated to TRANSCRIPT_MAX chars (~2 lines on the
//              wall). E-mail addresses become "[email]", long digit runs that
//              look like phone numbers become "[number]", URLs become "[link]".
//              Callsigns, ICAO codes, times and registrations are kept.
//  activity    For tools in OPERATIONAL_TOOL_LABELS (flights, NOTAMs, weather,
//              AIP, wall display, limitations) the fixed human label below,
//              with its state (running / ok / error). Any other tool — email,
//              files, memory, knowledge base, web, reports, anything unknown —
//              is shown as the generic "Working…". Tool ARGUMENTS and RESULTS
//              are never shown (no ICAO, no flight id, no document name).
//  outcome     A fixed phrase only:
//                ok      → "Done", optionally "Done · 2 flights shown" when the
//                          console's summary matches the strict COUNT grammar
//                          below (a number + an operational noun + a verb);
//                          otherwise derived from the tools that ran.
//                confirm → "Needs confirmation on the console"
//                error   → "Couldn't complete"
//              The console's free-text summary is otherwise DROPPED.
//
// ─── WHAT IS WITHHELD (never leaves this file) ──────────────────────────────
//  - email address, user id, role, conversation id, the console sessionId
//    (the wall gets an opaque hash that only groups one console's events);
//  - the agent's reply text, in any phase;
//  - email tools' recipients / subjects / bodies, attachment and file names,
//    memory / notes, knowledge-base document names or contents, web results,
//    conversation history — by construction: the sanitiser builds the output
//    from an allowlist and never copies unknown fields through;
//  - tool arguments and tool results, including for allowlisted tools.
//
// Rule 13 (§3): the agent is NOT available on the wall. This is a readout, not
// a control — the wall cannot talk back, and nothing here changes wall state.

import { createHash } from "node:crypto";

export const PHASES = ["listening", "transcribing", "thinking", "acting", "done", "error", "cancelled"];
const TERMINAL = new Set(["done", "error", "cancelled"]);
const TOOL_STATES = new Set(["running", "ok", "error"]);

/** ~2 lines of the wall readout at its default size. */
export const TRANSCRIPT_MAX = 140;
const MAX_ACTIVITY = 3;

/**
 * The operational allowlist. Only these tool names ever surface with a label;
 * the label is fixed text, never derived from the call's input.
 */
export const OPERATIONAL_TOOL_LABELS = Object.freeze({
  // flights
  search_flights: "Searching flights",
  get_flight: "Looking up a flight",
  get_flight_state: "Checking flight status",
  get_flight_tracking: "Checking flight tracking",
  // NOTAMs
  get_notams: "Checking NOTAMs",
  get_notam_check_status: "Checking the NOTAM check",
  // weather
  get_weather: "Checking weather",
  // AIP
  get_aip_document: "Opening the AIP",
  get_gen_document: "Opening AIP GEN",
  get_web_aip_link: "Finding the AIP link",
  get_aip_service_status: "Checking the AIP service",
  // wall display
  get_wall_state: "Reading the wall",
  show_flight_on_wall: "Showing a flight on the wall",
  close_flight_on_wall: "Closing a flight on the wall",
  update_display_settings: "Adjusting the wall display",
  // limitations
  list_limitations: "Checking limitations",
  create_limitation: "Adding a limitation",
  update_limitation: "Updating a limitation",
  delete_limitation: "Removing a limitation",
  restore_limitation: "Restoring a limitation",
});
export const GENERIC_TOOL_LABEL = "Working…";

// "Done · …" nouns derived from the tools that succeeded, when the console
// sends no acceptable count.
const DONE_NOUN = {
  search_flights: "flights", get_flight: "flights", get_flight_state: "flights", get_flight_tracking: "flights",
  get_notams: "NOTAMs", get_notam_check_status: "NOTAMs",
  get_weather: "weather",
  get_aip_document: "AIP", get_gen_document: "AIP", get_web_aip_link: "AIP", get_aip_service_status: "AIP",
  get_wall_state: "wall", show_flight_on_wall: "wall", close_flight_on_wall: "wall", update_display_settings: "wall",
  list_limitations: "limitations", create_limitation: "limitations", update_limitation: "limitations",
  delete_limitation: "limitations", restore_limitation: "limitations",
};

// The ONLY console summary that is passed through: "2 flights shown".
const COUNT_GRAMMAR = /^(\d{1,3}) (flights?|NOTAMs?|airports?|limitations?|results?) (shown|found|checked|updated)$/;

export const OUTCOME_TEXT = Object.freeze({
  ok: "Done",
  confirm: "Needs confirmation on the console",
  error: "Couldn't complete",
  cancelled: "Cancelled",
});

/** First name + last-name initial, or a neutral label. Never the email. */
export function speakerLabel(user) {
  const meta = user?.userMetadata ?? {};
  const full = String(meta.full_name || meta.name || "").trim()
    || [meta.firstname, meta.lastname].filter(Boolean).join(" ").trim();
  let name = full;
  if (!name) {
    // auth.mjs falls back to the email's local part — that IS the email in all
    // but name, so do not use it unless it clearly is not derived from one.
    const n = String(user?.name ?? "").trim();
    const local = user?.email ? String(user.email).split("@")[0] : null;
    if (n && n !== local && !n.includes("@") && n !== "User") name = n;
  }
  if (!name || name.includes("@")) return "A dispatcher";
  const parts = name.split(/\s+/).filter(Boolean).map((p) => p.replace(/[^\p{L}\p{M}'-]/gu, "")).filter(Boolean);
  if (!parts.length) return "A dispatcher";
  const first = parts[0].slice(0, 24);
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  return last ? `${first} ${last[0].toUpperCase()}.` : first;
}

function cleanSpoken(raw) {
  return String(raw ?? "")
    .replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, " ")
    .replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, "[link]")
    .replace(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu, "[email]")
    // Phone-like: 8+ digits, optionally with spaces / dashes / a leading +.
    // Callsigns (BTI472), times (07:20), QNH (1009) are shorter and survive.
    .replace(/\+?\d[\d\s-]{6,}\d/g, (m) => (m.replace(/\D/g, "").length >= 8 ? "[number]" : m))
    .replace(/\s+/g, " ")
    .trim();
}

/** Keep the END of what was said (the words scroll off the left on the bar too). */
function tail(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(text.length - max);
  const space = cut.indexOf(" ");
  return "…" + (space > 0 && space < 24 ? cut.slice(space + 1) : cut);
}

/** The opaque id the wall groups events by: one per (user, console session). */
export function readoutId(user, sessionId) {
  return createHash("sha256").update(`${user?.userId ?? "anon"}\u0000${String(sessionId ?? "")}`).digest("hex").slice(0, 16);
}

/**
 * Build the wall payload from a console body + the SERVER's view of the user.
 * Output is constructed field by field; nothing from `body` is spread through.
 * Returns null for a body that is not a readout at all.
 */
export function sanitiseVoiceActivity(body, user) {
  const phase = String(body?.phase ?? "");
  if (!PHASES.includes(phase)) return null;
  const sessionId = String(body?.sessionId ?? "").slice(0, 128);
  if (!sessionId) return null;

  const committed = cleanSpoken(body?.committed);
  const partial = TERMINAL.has(phase) ? "" : cleanSpoken(body?.partial);
  const joined = [committed, partial].filter(Boolean).join(" ");
  const shown = tail(joined, TRANSCRIPT_MAX);
  // Split the shown tail back into its committed / provisional parts so the
  // wall can colour the provisional tail muted, like the bar does.
  let committedShown = shown, partialShown = "";
  if (partial) {
    if (shown.endsWith(partial)) { partialShown = partial; committedShown = shown.slice(0, shown.length - partial.length).trim(); }
    else { partialShown = shown; committedShown = ""; }
  }

  const tools = Array.isArray(body?.tools) ? body.tools.slice(-12) : [];
  const activity = [];
  for (const t of tools) {
    const name = String(t?.name ?? "");
    const state = TOOL_STATES.has(t?.state) ? t.state : "running";
    const label = Object.prototype.hasOwnProperty.call(OPERATIONAL_TOOL_LABELS, name) ? OPERATIONAL_TOOL_LABELS[name] : GENERIC_TOOL_LABEL;
    // Consecutive generic steps collapse into one, so a chain of email /
    // memory calls does not even reveal how many there were.
    const prev = activity[activity.length - 1];
    if (prev && prev.label === GENERIC_TOOL_LABEL && label === GENERIC_TOOL_LABEL) {
      prev.state = state === "error" || prev.state === "error" ? "error" : state;
      continue;
    }
    activity.push({ label, state });
  }

  let outcome = null;
  const kind = String(body?.outcome?.kind ?? "");
  if (phase === "error" || kind === "error") outcome = { kind: "error", text: OUTCOME_TEXT.error };
  else if (kind === "confirm") outcome = { kind: "confirm", text: OUTCOME_TEXT.confirm };
  else if (phase === "cancelled") outcome = { kind: "cancelled", text: OUTCOME_TEXT.cancelled };
  else if (phase === "done") {
    // "Done" only once the turn has actually ended — an ok outcome sent
    // mid-turn is ignored rather than shown early.
    const summary = String(body?.outcome?.summary ?? "").trim();
    const m = COUNT_GRAMMAR.exec(summary);
    let detail = null;
    if (m) detail = `${Number(m[1])} ${m[2]} ${m[3]}`;
    else {
      const nouns = [];
      for (const t of tools) {
        const noun = t?.state === "ok" ? DONE_NOUN[String(t?.name ?? "")] : null;
        if (noun && !nouns.includes(noun)) nouns.push(noun);
      }
      if (nouns.length) detail = `checked ${nouns.slice(0, 3).join(", ")}`;
    }
    outcome = { kind: "ok", text: detail ? `${OUTCOME_TEXT.ok} · ${detail}` : OUTCOME_TEXT.ok };
  }

  return {
    id: readoutId(user, sessionId),
    phase,
    speaker: speakerLabel(user),
    transcript: { committed: committedShown, partial: partialShown },
    activity: activity.slice(-MAX_ACTIVITY),
    outcome,
    at: new Date().toISOString(),
  };
}

// ─── Relay: rate limit per session, coalesce, forward server-to-server ─────

const MIN_INTERVAL_MS = 200; // ≤ 5 events per second per console session
const RELAY_TIMEOUT_MS = 2_000;
const MAX_TRACKED = 500;
const sessions = new Map(); // readout id -> { lastSentAt, pending, timer, touchedAt }

export function wallEventsSecret() {
  return String(process.env.AGENT_WALL_EVENTS_SECRET || "").trim();
}

function wallBase() {
  return String(process.env.DIGITAL_WALL_INTERNAL_URL || "http://digital-wall-backend:5174").replace(/\/+$/, "");
}

async function post(payload) {
  const secret = wallEventsSecret();
  if (!secret) return;
  try {
    const response = await fetch(`${wallBase()}/internal/voice-activity`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-agent-events-secret": secret },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
    });
    if (!response.ok) process.stderr.write(`[voice-readout] wall answered ${response.status}\n`);
  } catch (error) {
    // Best effort: a readout that does not arrive only means the wall shows
    // less. It never fails the user's voice turn.
    process.stderr.write(`[voice-readout] relay failed: ${error?.message || error}\n`);
  }
}

function prune(now) {
  if (sessions.size <= MAX_TRACKED) return;
  for (const [id, s] of sessions) {
    if (!s.timer && now - s.touchedAt > 60_000) sessions.delete(id);
    if (sessions.size <= MAX_TRACKED / 2) break;
  }
}

/**
 * Queue a sanitised payload for the wall. At most one send per session every
 * MIN_INTERVAL_MS; anything arriving sooner replaces the pending payload
 * (the latest state wins — partials coalesce, a terminal phase is never lost
 * because it is always the latest). Returns { relayed, coalesced }.
 */
export function relayVoiceActivity(payload, { send = post, now = Date.now() } = {}) {
  if (!wallEventsSecret()) return { relayed: false, coalesced: false };
  let s = sessions.get(payload.id);
  if (!s) { s = { lastSentAt: 0, pending: null, timer: null, touchedAt: now }; sessions.set(payload.id, s); prune(now); }
  s.touchedAt = now;
  const wait = s.lastSentAt + MIN_INTERVAL_MS - now;
  if (wait <= 0 && !s.timer) {
    s.lastSentAt = now;
    send(payload);
    return { relayed: true, coalesced: false };
  }
  s.pending = payload;
  if (!s.timer) {
    s.timer = setTimeout(() => {
      s.timer = null;
      const next = s.pending; s.pending = null;
      if (!next) return;
      s.lastSentAt = Date.now();
      send(next);
    }, Math.max(0, wait));
    if (typeof s.timer.unref === "function") s.timer.unref();
  }
  return { relayed: true, coalesced: true };
}
