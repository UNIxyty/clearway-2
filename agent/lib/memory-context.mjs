// Relevant memories, injected into every turn.
//
// WHY THIS IS NOT LEFT TO THE MODEL: a `recall` tool only helps if the model
// thinks to call it, and in a fresh conversation nothing prompts it to. The
// user's experience was that "remember this" worked in the chat where they said
// it — because the text was still in the history — and silently did nothing
// afterwards. A thing you were told is remembered must actually come back.
//
// So the backend does the recall: the user's notes for whatever they are
// looking at, plus their recent general ones, are put in front of the model on
// every turn. The `recall` tool stays for explicit lookups and deeper searches.
//
// Scoped per user in the query, exactly as the tool is — shared notes included,
// other people's private notes never fetched at all.

const REST_TIMEOUT_MS = 8_000;
const MAX_MEMORIES = 12;
const MAX_CHARS = 2_000;

function url() { return String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, ""); }
function key() { return String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(); }

/**
 * Returns { text, memories } — `text` is the system-prompt section, or null
 * when there is nothing to say. Never throws: a memory lookup failing must not
 * take the turn down, but it is reported on stderr rather than passing silently.
 */
export async function memoryContext({ user, context }) {
  if (!url() || !key() || !user?.userId) return { text: null, memories: [] };

  const scope = `or=(user_id.eq.${encodeURIComponent(user.userId)},is_shared.eq.true)`;
  const query = `agent_memories?${scope}&forgotten_at=is.null&select=id,content,relates_to,relates_to_kind,user_email,is_shared,user_id,created_at&order=created_at.desc&limit=60`;

  let rows;
  try {
    const response = await fetch(`${url()}/rest/v1/${query}`, {
      headers: { apikey: key(), Authorization: `Bearer ${key()}` },
      signal: AbortSignal.timeout(REST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`${response.status}`);
    rows = await response.json();
  } catch (error) {
    process.stderr.write(`[memory-context] lookup failed: ${error.message}\n`);
    return { text: null, memories: [] };
  }
  if (!Array.isArray(rows) || rows.length === 0) return { text: null, memories: [] };

  // What the user is looking at wins; everything else is recency-ordered. A
  // note about the airport on screen is worth more than a newer one about
  // somewhere else.
  const subject = String(context?.icao || context?.flightId || "").toUpperCase();
  const relevant = rows
    .map((r) => ({ ...r, onTopic: subject && String(r.relates_to ?? "").toUpperCase() === subject }))
    .sort((a, b) => (b.onTopic === true) - (a.onTopic === true))
    .slice(0, MAX_MEMORIES);

  const lines = [];
  let used = 0;
  for (const m of relevant) {
    const who = m.user_id === user.userId ? "" : ` (shared by ${m.user_email ?? "a colleague"})`;
    const about = m.relates_to ? `[${m.relates_to}] ` : "";
    const line = `- ${about}${String(m.content).replace(/\s+/g, " ")}${who}`;
    if (used + line.length > MAX_CHARS) break;
    lines.push(line);
    used += line.length;
  }
  if (lines.length === 0) return { text: null, memories: [] };

  const text =
    `## What this user has asked you to remember\n\n` +
    lines.join("\n") +
    `\n\nThese are the user's own notes, carried over from earlier conversations. ` +
    `They are NOT approved company rules and never override a company or internal source. ` +
    `Use one only when it is relevant, and when you do, say it is something they told you. ` +
    `Do not recite them unprompted.`;

  return { text, memories: relevant.slice(0, lines.length) };
}
