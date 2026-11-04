// An answer that hands the reader a check the agent could have made itself (2026-11-04, Dmitry): "check the current
// HSSS NOTAMs before planning" while get_notams is one call away. The turn makes the check, then answers in full. Once
// per turn, and only for a check one of the turn's own tools makes.
//
// The trigger relates the answer to the question (2026-11-05). It used to match words: "hey" got "I can look up
// flights, airport documents, NOTAMs…", the word NOTAMs raised a check nobody owed, and the reader got a partial-answer
// banner and three paragraphs about nothing having been checked. Now both must hold, and neither is enough alone:
//   1. the QUESTION named a subject — an airport or FIR code, a flight, a registration, a date, a country. Without one
//      there is nothing a check could be about, so no check can be outstanding;
//   2. a sentence of the ANSWER hands the reader a check on that subject — tells them to look something up that the
//      agent could have looked up itself ("Check the NOTAMs for EVRA before you go", "See GEN 1.2 for Bulgaria's
//      permit rule"), or says the agent did not make it ("I did not check the NOTAMs for LFMM").
// Never a deferred check: offering a capability ("I can look up NOTAMs", "I can pull the AIP if you want"), listing what
// the agent does, asking for what it needs ("Give me an ICAO code and I'll check"), naming a source it already used
// ("This comes from the HSSS NOTAM"). The difference is not which words appear; it is whether the reader has been
// handed work the agent could have done.
import { candidateCodes, datesIn } from "./question-check.mjs";

const CHECKS = [
  { tool: "get_notams", label: "the NOTAMs", object: /\bNOTAMs?\b/i },
  { tool: "read_gen_document", label: "the GEN 1.2", object: /\bGEN 1\.2\b/i },
  { tool: "get_aip_document", label: "the AD 2", object: /\b(AD ?2\b|aerodrome AIP|current AIP|the AIP)\b/i },
];

// the reader is sent to do it: an instruction at the head of the sentence (after "Also", "Before you go,", "Please"…),
// or "you should / you'll want to / it is worth" + the verb; or the agent says it did not make the check
const VERB = "(check|consult|review|read|look up|look at|pull|verify|confirm|monitor|refer to|see|open|get)";
const TELLS_READER = new RegExp(`^(?:[-*•]\\s+)?(?:\\*\\*[^*]{0,40}\\*\\*:?\\s*)?(?:(?:also|then|so|please|first|finally|still|always|and)\\b,?\\s+|(?:before|when|if)\\b[^,]{0,60},\\s+)*${VERB}\\b`, "i");
const YOU_SHOULD = new RegExp(`\\b(you|crews?|the crew|dispatch(ers)?|operators?)\\s+(should|must|need to|will need to|'ll need to|will want to|'ll want to|may want to|might want to|ought to)\\s+(also\\s+)?${VERB}\\b|\\b(it is|it's)\\s+(worth|best|advisable|wise)\\s+(to\\s+)?${VERB}\\b|\\bmake sure (you|to)\\s+${VERB}\\b`, "i");
const NOT_MADE = /\b(I|we)\s+(did not|didn't|have not|haven't|could not|couldn't)\s+(check|pull|look at|read|retrieve|open|consult)(ed)?\b|\b(not|never)\s+(checked|pulled|read|retrieved|consulted)\b/i;
// what is never a deferred check, whatever the words around it
const OFFER = /\b(I|we)\s+(can|could|will|'ll|am able to|are able to|would)\b|\bI'll\b|\bif you (want|like|need|wish)\b|\bwant me to\b|\b(shall|should) I\b|\blet me know\b|\b(give|send|tell|share with) me\b|\bask me\b|\bonce you (give|send|tell|share|name)\b|\b(what|which) (airport|flight|aircraft|route|date|ICAO|code)\b/i;
const NAMES_SOURCE = /\b(comes? from|according to|per the|as (stated|published) in|source:|from the [^.]{0,40}\bNOTAM\b)/i;

// every country and territory name the runtime knows (no data file: the agent image carries none)
let COUNTRIES = null;
function countries() {
  if (COUNTRIES) return COUNTRIES;
  const names = new Set();
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
    for (let a = 65; a <= 90; a += 1) for (let b = 65; b <= 90; b += 1) {
      const code = String.fromCharCode(a, b), n = dn.of(code);
      if (n && n !== code && !/\d/.test(n)) for (const v of [n, n.replace(/\s*\(.*\)$/, ""), n.replace(/^(The|the)\s+/, "")]) if (v.length >= 4) names.add(v);
    }
  } catch { /* no ICU: codes, flights and dates still name subjects */ }
  return (COUNTRIES = [...names]);
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * What the question is about: { codes, terms, any } — codes are ICAO-like codes; terms are every word that names one of
 * the subjects (codes, the checked place and country of each, flights, registrations, FIR names, countries); `any` is
 * whether the question named a subject at all (a date alone counts). A place in plain words counts after the word that
 * points at it ("about Khartoum").
 * @param question  the dispatcher's message
 * @param names     the checked codes ({ code, short, is }) from the question check, when it ran
 */
export function subjectsOf(question, names = [], now = new Date()) {
  const q = String(question ?? "");
  const codes = new Set(candidateCodes(q).map((c) => c.toUpperCase()));
  const terms = new Set(codes);
  for (const n of names ?? []) {
    if (n?.code) { codes.add(String(n.code).toUpperCase()); terms.add(String(n.code).toUpperCase()); }
    for (const part of [n?.short, ...String(n?.is ?? "").split(/,\s*/)]) if (part && String(part).trim().length >= 3) terms.add(String(part).trim());
  }
  for (const m of q.matchAll(/\b([A-Z]{2,3}\s?\d{1,4}[A-Z]?)\b/g)) if (!/^[A-Z]{2,3}\s?\d{1,2}$/.test(m[1]) || /\d{3,}/.test(m[1])) terms.add(m[1]);   // flights (BTI472), not "GEN 1"
  for (const m of q.matchAll(/\b([A-Z]{1,2}-[A-Z]{3,4}|N\d{1,5}[A-Z]{0,2})\b/g)) terms.add(m[1]);                                                      // registrations
  for (const m of q.matchAll(/\b([A-Z][a-z]+(?:[- ][A-Z][a-z]+)?)\s+FIR\b/g)) terms.add(m[1]);                                                         // "Marseille FIR"
  for (const c of countries()) if (new RegExp(`\\b${esc(c)}\\b`, "i").test(q)) terms.add(c);
  // a place named in plain words, after the word that points at it: "about Khartoum", "at Le Bourget", "into Riga"
  for (const m of q.matchAll(/\b(?:about|at|in|for|to|from|over|into|near|via|around)\s+((?:[A-Z][a-zà-ÿ'’]+)(?:[ -](?:[A-Z][a-zà-ÿ'’]+|de|du|la|le|el|al))*)/g)) if (!/^(I|It|This|That|The|A|An|Me|You|My|Our|Your|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/.test(m[1])) terms.add(m[1]);
  const dated = datesIn(q, now).length > 0 || /\b(today|tonight|tomorrow|yesterday)\b/i.test(q);
  return { codes: [...codes], terms: [...terms], any: terms.size > 0 || dated };
}

/** Sentences, each with its own line (a bullet is its own sentence). */
function sentencesOf(text) {
  return String(text ?? "").split(/\n+/).flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z*"(])/)).map((s) => s.trim()).filter(Boolean);
}

/** Does this sentence hand the reader a check on one of the question's subjects? */
function handsOver(sentence, subjects) {
  const plain = sentence.replace(/\*\*/g, "");
  if (OFFER.test(plain) || NAMES_SOURCE.test(plain)) return false;
  if (!(TELLS_READER.test(plain) || YOU_SHOULD.test(plain) || NOT_MADE.test(plain))) return false;
  // the same subject: named in the sentence; or no place named at all ("Check the NOTAMs before you go": the one asked
  // about); or a location code when the question named a place without one (Sudan → HSSS). A code the question did not
  // name, when it named codes, is another airport: not what was asked about.
  if (subjects.terms.some((t) => new RegExp(`\\b${esc(t)}\\b`, "i").test(plain))) return true;
  const codesHere = (plain.match(/\b[A-Z]{4}\b/g) ?? []).filter((c) => !/^(NOTAM|ICAO|IATA|AIRAC|CZIB|EASA|FAA|UTC|NOTE)$/.test(c));
  if (!codesHere.length) return true;
  return subjects.codes.length === 0;
}

/**
 * The checks an answer hands the reader that this turn's tools can make: [{ tool, label }]. Nothing when the question
 * named no subject.
 * @param text          the answer
 * @param offeredTools  Set of the turn's tool names
 * @param subjects      subjectsOf(question, names)
 */
export function deferredChecks(text, offeredTools, subjects) {
  if (!subjects?.any) return [];
  const sentences = sentencesOf(text);
  return CHECKS.filter((c) => offeredTools.has(c.tool) && sentences.some((s) => c.object.test(s) && handsOver(s, subjects))).map(({ tool, label }) => ({ tool, label }));
}

export function followUpPrompt(found) {
  const labels = found.map((f) => f.label).join(" and ");
  return `Your answer above hands the reader a check you can make yourself: ${labels} (${found.map((f) => f.tool).join(", ")}). Make it now, for the airports, FIRs or states this question is about. Then write the answer again, from the start and complete on its own, using everything you now know: the answer first, changed by what you found where it changes, and the check cited like any source. Do not describe this step, and do not say what you did not check unless it is something the question asked for. If the check needs something only the dispatcher can give (an airport the question does not name, a date it does not give), do not guess: keep the answer and say in one line what you need.`;
}
