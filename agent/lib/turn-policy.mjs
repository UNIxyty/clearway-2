// What a turn must do before it may answer (2026-11-04, the user's item 4): rules in code, not hopes in the prompt.
//
//   kinds that always search   permits, overflight and airspace, entry and API requirements, fuel availability, handling
//                              and FBO, direct-route questions, and anything about a date in the past or the future —
//                              whatever our own data says. A reply without a web search is a partial answer; then it searches.
//   an empty pass one widens   pass one ran and the reply cites nothing from it: pass two opens, in code, and it searches again.
//   never offer to search      "I can search the wider web if you want" is the agent asking permission to do its job:
//                              it searches instead (pass one if none ran, otherwise pass two).
// Each at most once a turn. Pure: the turn (agent/lib/bedrock.mjs) asks, then acts.
import { datesIn } from "./question-check.mjs";

const KINDS = [
  ["permits", /\b(permits?|landing (permission|authori[sz]ation|clearance)|overflight (permission|clearance)|PPR|prior permission|traffic rights|TCO)\b/i],
  ["airspace", /\b(airspace|overfly|overflight|FIR|closed|closure|restrict(ed|ions?)?|conflict zone|CZIB|NOTAMs?|open\b|neutral waters|high seas)\b/i],
  ["entry and API", /\b(API|APIS|advance passenger|entry requirements?|visa|immigration|customs|crew (visa|entry))\b/i],
  ["fuel", /\b(fuel|jet ?a-?1|avgas|refuel(l)?ing)\b/i],
  ["handling and FBO", /\b(FBO|GAT|handl(er|ing)|ground handling|private terminal|business aviation terminal|ramp)\b/i],
  ["direct routes", /\b(direct flights?|direct route|fly direct(ly)?|non-?stop)\b/i],
  ["dated", /\b(today|tonight|tomorrow|yesterday|next (week|month)|last (week|month)|this (week|weekend))\b/i],
];

/** The kinds a question is, by its own words, and whether it must be searched. */
export function questionKinds(question, now = new Date()) {
  const q = String(question ?? "");
  const kinds = KINDS.filter(([, re]) => re.test(q)).map(([k]) => k);
  if (datesIn(q, now).length && !kinds.includes("dated")) kinds.push("dated");
  return { kinds, mustSearch: kinds.length > 0 };
}

const OFFER = /\b(if you (want|like|need)|if needed|want me to|shall I|I can|I could|I'd only|happy to|say if)\b[^.\n]{0,90}\b(search|look (it|this|that) up|look further|wider web|broader search)\b|\bsearch again\b|\bI (have not|haven't|did not|didn't) search(ed)? the web\b|\b(I'd|I would) only run that search\b/i;
export const offersToSearch = (text) => OFFER.test(String(text ?? ""));
// "nothing useful for a part of the question": the reply names a part it could not establish, or says it did not widen
// (2026-11-04, prompt 5: it cited AC-U-KWIK listings and said "I did not widen the search to forums or blogs" about
// the very thing asked)
const GAP = /\b(could not|couldn't|can't|cannot|was unable to) (find|establish|confirm)\b|\bnot (found|established)\b|\bno (current )?(information|crew reports?|reports?|data) (was |were )?found\b|\bdid(n't| not) widen\b|\bwhat i could not establish\b/i;
export const admitsGap = (text) => GAP.test(String(text ?? ""));

/** Did the reply cite anything from the web (either provider)? */
export const citesWeb = (blocks) => blocks.some((b) => (b.citations ?? []).some((c) => c.type === "web_search_result_location" || (c.type === "search_result_location" && /^https?:/.test(String(c.source)))));

/**
 * The one thing the turn must still do, or null.
 * @param reply   { text, blocks } — the reply's text and its cited text blocks
 * @param turn    { searches: [{ pass, results }], widened }
 * @param policy  { mustSearch, kinds }
 * @param webAvailable  a web search tool is on this turn
 * @param done    Set of kinds already acted on this turn
 */
export function nextAction({ reply, turn, policy, webAvailable, done }) {
  if (!webAvailable) return null;
  const searched = turn.searches.length > 0;
  if (!searched && !done.has("search") && (policy?.mustSearch || offersToSearch(reply.text))) {
    const why = policy?.mustSearch ? `This question is about ${policy.kinds.join(", ")}: it is always searched, whatever our own data says.` : "Your answer offers to search instead of searching.";
    return { kind: "search", label: "the web", tools: ["web_search"], prompt: `${why} Search now — the approved sources first — for what the question needs. Then write the FULL answer, from the start and complete on its own, citing what you found and saying what you could not establish. Never offer to search: search.` };
  }
  const pass1 = turn.searches.some((s) => s.pass === 1);
  if (searched && pass1 && !turn.widened && !done.has("widen") && (!citesWeb(reply.blocks) || offersToSearch(reply.text) || admitsGap(reply.text))) {
    return { kind: "widen", label: "sources beyond the approved list", tools: ["web_search"], widen: true, prompt: `Pass one (the approved sources) gave you nothing you could cite for this. Pass two is now open: search again, unrestricted, for what the question needs. Then write the FULL answer, from the start and complete on its own. Every claim from outside the approved list is marked in the console; name the site and its date in the sentence. If pass two finds nothing either, say plainly that it could not be established.` };
  }
  return null;
}
