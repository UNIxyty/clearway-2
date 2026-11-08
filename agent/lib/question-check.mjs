// The question, checked before anything is searched (2026-11-03, the user's sections 8 and 12).
//
// Codes: every 4-letter ICAO-shaped code in the question is resolved — our own airports data first (the portal's
// /api/search, as get_web_aip_url does), the model's knowledge of location indicators second — and compared with any
// place name written next to it. "Hong Kong ZSPD" (ZSPD is Shanghai Pudong) or a code that is neither an aerodrome nor a
// FIR gets a question back, and NOTHING is searched: a search on the wrong aerodrome produces a plausible, cited answer
// to a question nobody asked. A code alone, or a name alone, goes ahead; the answer must name the aerodrome.
//
// Dates: every date written in the question is resolved here, in code, against today (UTC), and handed to the model
// with whether it is past — "08Oct2026" on 3 November is 26 days ago, which the answer must say, and may be a typo.
//
// The check itself can fail (the model did not answer, or not in JSON): the turn then goes ahead unchecked, and that
// is recorded as a fallback with its reason (falling back is fine; falling back quietly is not).
import { converseOnce } from "./bedrock.mjs";
import { portalGet } from "./tools/http.mjs";
import { logDetail } from "./public-errors.mjs";

const NOT_CODES = new Set(["ASAP", "INFO", "NOTE", "TODO", "PLEASE", "THANKS", "HELP", "URGENT", "WHAT", "WHEN", "THEN", "THIS", "THAT", "WITH", "FROM", "HAVE", "WILL", "DOES", "OPEN", "AOC", "AIRAC", "NOTAM", "PPR", "SLOT", "CREW", "FUEL", "JETA", "AVGAS", "IATA", "ICAO", "EASA", "CZIB"]);
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11, january: 0, february: 1, march: 2, april: 3, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };
const DAY = 86_400_000;

/** ICAO-shaped codes: four capitals standing alone (a route LTBS-LBBG-EDDS gives three). Words that are not codes are skipped. */
// Aircraft registrations are set aside first: a one- or two-character nationality mark, a dash, the rest (D-IMOI, G-ABCD,
// 9H-ABC, HB-JFA). 2026-11-08: "D-IMOI" gave "IMOI", the check asked about an airport that does not exist, and the
// flight picker's "Make the passenger manifest for DLV240 · D-IMOI · …" got a question instead of a manifest. A route's
// parts are four letters on both sides of the dash, so a route is never taken for a registration.
const REGISTRATION = /(?<![A-Za-z0-9-])[A-Z0-9]{1,2}-[A-Z0-9]{2,5}(?![A-Za-z0-9-])/g;
export function candidateCodes(q) {
  const text = String(q).replace(REGISTRATION, " ");
  return [...new Set((text.match(/(?<![A-Za-z0-9])[A-Z]{4}(?![A-Za-z0-9])/g) ?? []).filter((c) => !NOT_CODES.has(c)))].slice(0, 12);
}

/** Dates written in the question, resolved in code: 08Oct2026, 8 Oct 2026, 8 October 2026, 2026-10-08, 08.10.2026, 08/10/2026. */
export function datesIn(q, now = new Date()) {
  const out = []; const s = String(q);
  const push = (written, y, m, d) => {
    const t = Date.UTC(y, m, d); const dt = new Date(t);
    if (dt.getUTCMonth() !== m || dt.getUTCDate() !== d) return;
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const days = Math.round((t - today) / DAY);
    out.push({ written, iso: dt.toISOString().slice(0, 10), days, past: days < 0, words: `${d} ${dt.toLocaleString("en-GB", { month: "long", timeZone: "UTC" })} ${y}` });
  };
  for (const m of s.matchAll(/\b(\d{1,2})\s?([A-Za-z]{3,9})\s?(\d{4})\b/g)) { const mo = MONTHS[m[2].toLowerCase()]; if (mo != null) push(m[0], Number(m[3]), mo, Number(m[1])); }
  for (const m of s.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) push(m[0], Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  for (const m of s.matchAll(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/g)) push(m[0], Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return out;
}

async function ourData(code, user) {
  try {
    const data = await portalGet(`/api/search?q=${encodeURIComponent(code)}`, user, { timeoutMs: 6_000 });
    const m = (data?.results ?? []).find((r) => String(r.icao || "").toUpperCase() === code);
    if (!m) return { code, ours: "not in our airports data" };
    const name = /EAD UNDEFINED|^\w{4} Airport$/i.test(String(m.name ?? "")) ? null : m.name;
    return { code, ours: [name, m.city, m.country].filter(Boolean).join(", ") || "in our data, no name recorded" };
  } catch { return { code, ours: "our airports data could not be asked" }; }
}

const SYSTEM = `You check a flight dispatcher's question BEFORE it is researched. You do not answer it.

For every code listed, say what it is: an aerodrome (name, city, country) or a FIR/ACC. Use OUR DATA when it names the place; otherwise your knowledge of ICAO location indicators. If you do not know a real aerodrome or FIR with exactly that code, it is "unknown" — never the nearest match (URML and URMM are different airports).

Then read the question. A place name written next to a code ("Hong Kong ZSPD", "ZSPD Hong Kong", "Macao VHHH") is what the writer believes the code is. If that place is NOT the code's place, it is a mismatch. A country or region that contains the aerodrome, or the FIR it lies in, is not a mismatch ("Bulgarian ... LBBG" is fine). A misspelled name for the right place is not a mismatch ("Marsell FIR LFMM" is Marseille).

Return ONLY JSON:
{"codes":[{"code":"ZSPD","is":"Shanghai Pudong International, China","short":"Shanghai Pudong","kind":"aerodrome|fir|unknown","writtenAs":"Hong Kong"|null,"mismatch":true|false}],"ask":null|"..."}
"short" is how a dispatcher names the place in a sentence: the city, plus the airport's name where the city has more than one ("Tamanrasset", "Riyadh King Khalid", "Paris Le Bourget", "Marseille FIR").

Set "ask" when any code is unknown or mismatched. Write it to the dispatcher, plainly: what they wrote, what each code actually is, and the likely intended pairs as bullet lines starting "• ". Example: "You've written Hong Kong ZSPD and Macao VHHH, but ZSPD is Shanghai Pudong and VHHH is Hong Kong — Macao is VMMC. Which pair did you mean?\\n• Hong Kong VHHH and Macao VMMC\\n• Shanghai ZSPD and Hong Kong VHHH". For an unknown code: "I don't recognise URXX as an ICAO code. Which airport did you mean?" Otherwise "ask" is null.`;

/**
 * → { ask: string|null, note: string|null, codes, dates, fallback: { kind, reason }|null }
 * `ask`: reply with this and research nothing. `note`: a line for the turn's system prompt (the resolved codes and dates).
 */
export async function checkQuestion(question, user, { now = new Date() } = {}) {
  const codes = candidateCodes(question);
  const dates = datesIn(question, now);
  const dateNote = dates.length ? `Dates in the question, resolved (today is ${now.toISOString().slice(0, 10)}): ${dates.map((d) => `"${d.written}" = ${d.words} — ${d.days === 0 ? "today" : d.past ? `${-d.days} day${d.days === -1 ? "" : "s"} AGO (past)` : `in ${d.days} day${d.days === 1 ? "" : "s"}`}`).join("; ")}. Say in the answer what each date resolved to. A past date is answered with what was in force THEN, or you say you cannot retrieve what applied on that date — never today's data in its place. A past date in the last few weeks may be a typo for a future one: answer for the date as written, and ask in one line whether they meant a future date.` : null;
  if (!codes.length) return { ask: null, note: dateNote, codes: [], dates, fallback: null };
  const ours = await Promise.all(codes.map((c) => ourData(c, user)));
  let parsed = null; let reason = null;
  try {
    const r = await converseOnce({ tier: "fast", system: SYSTEM, messages: [{ role: "user", content: `QUESTION:\n${question}\n\nCODES AND OUR DATA:\n${ours.map((o) => `${o.code}: ${o.ours}`).join("\n")}` }], maxTokens: 1500 });
    const m = /\{[\s\S]*\}/.exec(r.text ?? "");
    parsed = m ? JSON.parse(m[0]) : null;
    if (!parsed || !Array.isArray(parsed.codes)) { reason = "the check did not answer in the expected form"; parsed = null; }
  } catch (e) { reason = `the check could not run: ${String(e?.code ?? e?.message ?? e).slice(0, 120)}`; logDetail("agent", "question check failed; the turn goes ahead unchecked", e); }
  if (!parsed) return { ask: null, note: dateNote, codes: ours, dates, fallback: { kind: "question-check", reason } };
  // what a code IS comes from our own data when it names the place (2026-11-04: "Liepaja EVRA" came back as
  // "EVRA = Liepāja" from the model while our data says Riga); the model only judges the match
  const named = new Map(ours.filter((o) => !/^(not in our|our airports data could not|in our data, no name)/.test(o.ours)).map((o) => [o.code, o.ours]));
  const resolved = parsed.codes.filter((c) => c?.code).map((c) => (named.has(String(c.code).toUpperCase()) ? { ...c, is: named.get(String(c.code).toUpperCase()), source: "our data" } : { ...c, source: "model" }));
  const ask = typeof parsed.ask === "string" && parsed.ask.trim() && resolved.some((c) => c.mismatch === true || c.kind === "unknown") ? parsed.ask.trim() : null;
  // the name is not the model's to remember (2026-11-04, DAAT written as "Djanet"): it writes {{CODE}} and lib/names.mjs
  // writes the checked name; any other name next to a checked code is replaced by it
  for (const c of resolved) if (!c.short) c.short = String(c.is ?? c.code).split(",")[0].replace(/\s+(International\s+)?Airport$/i, "").trim();
  const codeNote = resolved.length ? `Codes in the question, checked before this turn: ${resolved.map((c) => `${c.code} = ${c.is ?? "unknown"}${c.kind === "fir" ? " (FIR)" : ""}`).join("; ")}. Write each of these as {{CODE}} — {{${resolved[0].code}}} — and the console writes its checked name and code ("${resolved[0].short} (${resolved[0].code})"). Never write another name for them.` : null;
  return { ask, note: [codeNote, dateNote].filter(Boolean).join("\n") || null, codes: resolved, dates, fallback: null };
}
