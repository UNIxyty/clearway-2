// Every claim has a source (2026-11-04, the user's rule). The mark goes on citations, so a sentence written without one
// carries no mark at all: the policy was strongest against honestly-cited bad sources and weakest against unsourced
// assertion. In a turn that searched, every claim either carries a citation, is attributed to our own data by name, or
// sits under "what I could not establish". Nothing else.
//
// And case seven (docs/success-too-early.md): an absence stated about the world ("no restrictions for LFMM") on the
// strength of one internal store having been read. "No limitations are recorded in Clearway for LFMM" is true; "no
// restrictions" needs NOTAMs, the AIP or a search behind it — and a citation.
//
// Pure: sentences, the claim spans the console draws (lib/citations.mjs), and a few patterns. The turn uses it to send a
// defective draft back once (agent/lib/bedrock.mjs); the production checks count it.

const OURS = /\b(Clearway|the wall|wall's|on the wall|our (own )?(data|records?|knowledge base|stores?|airports data)|internal|CAA (record|store|entry)|limitations store|IMPORTANT (store|entr(y|ies)|bulletins?)|knowledge base|CrewBriefing|the platform|NOTAM (cache|feed)|store|configured|the (record|entry)|[A-Z]\d{4}\/\d{2}|cache|saved notes|revision check|date check|code check|the console)\b/i;
const EXEMPT_SECTION = /\b(turns on|depends on|what (it|this|the answer) (depends|turns))\b|\b(could not|couldn't|cannot|can't) (establish|confirm|check|find|verify)|not established|not checked|not confirmed|gaps?\b|still open|what (i|you) need|questions? for you|what to do|before (you|relying|planning)|what i checked|sources?:?$/i;
const META = /^(I|I'm|I've|I'd|I'll|My|Me)\b|^(If you|Tell me|Please|Let me|Say if|Want me)\b/;
const ADVICE = /^(Check|Confirm|Contact|Ask|Use|Plan|Treat|Before|Send|Open|Pull|Get|Make sure|Do not|Don't|Apply|File|Read|Keep|Avoid|Expect|Allow|Book|Call)\b/i;
const ABSENCE = /\b(no|none|nothing|not any|never|all clear|clear of)\b[^.;:\n]{0,50}\b(restrictions?|limitations?|NOTAMs?|issues?|shortages?|warnings?|closures?|permits? (is |are )?(required|needed)|requirements?|advisor(y|ies)|bans?|problems?)\b|\bno restrictions?\b|\bnot restricted\b|\b(is|are) (open|clear)\b/i;
const NAMED_STORE = new RegExp(`${OURS.source}|\\b(recorded|configured|held|stored|listed) (in|on|by)\\b|\\bstore\\b|\\bcache\\b`, "i");
// what a sentence says about a source or about what could not be found, rather than about the world
const NOT_FOUND = /\bcould(n't| not) (find|read|open|see)\b|\bno (current )?(information|data|record|statement|source)s? (was |were )?found\b|\b(not|never) (found|established|confirmed|checked|cached)\b|\bunknown\b/i;
const EVALUATION = /\b(undated|is old|may no longer|suggests?|my (reading|guess|inference|view|reasoning)|not a finding|treat (it|this|that) as|unreliable|weak|the sources disagree|conflicts? with|I read (that|this|it) as)\b/i;
// comment on the sources just listed ("That is marketing, not feedback.", "None of them mentions handling.")
const SOURCE_COMMENT = /^(That|This|These|Those) (is|are|was|were)\b|^(The|This|That) (page|listing|result|source|site|entry|article)s?\b|^(None|Neither|Every one|Each|All|Most) of (them|these|those)\b|^(Neither|None) (concerns?|mentions?|covers?|applies)\b|^Nothing is recorded in any of them\b/i;
const OWN_FINDING = /^(I|We) (found|saw|could|did|have|searched|checked)|\b(no|none of the) sources? I found\b|\bI( also)? (found|searched|checked)\b|\b(can't|cannot) say\b|\bfrom an official source\b/i;

/** Sentences of a reply with their offsets, the section heading above them, and where their line sits. */
export function sentencesOf(text) {
  const out = []; let section = ""; let pos = 0; let para = 0; let lineNo = -1; let sawHeading = false;
  for (const rawLine of String(text ?? "").split("\n")) {
    const lineStart = pos; pos += rawLine.length + 1;
    const line = rawLine.trim();
    if (!line) { para += 1; continue; }
    lineNo += 1;
    const indent = rawLine.length - rawLine.trimStart().length;
    const bullet = /^([-*•]|\d+[.)])\s+/.test(line);
    const plain = line.replace(/^[-*•]\s+|^\d+[.)]\s+/, "").replace(/\*\*/g, "").trim();
    // a heading: a short line ending in ':' or wholly bold, or a markdown heading
    if (/^#{1,4}\s/.test(line) || (/^\*\*[^*]+\*\*:?$/.test(line)) || (plain.length < 70 && /:$/.test(plain) && !bullet)) { section = plain.replace(/^#+\s*/, ""); sawHeading = true; para += 1; continue; }
    // a bold lead-in ("**Not established:** …") is the section for the rest of its line
    const lead = /^(?:[-*•]\s+)?\*\*([^*]+)\*\*:?/.exec(line);
    const lineSection = lead && (EXEMPT_SECTION.test(lead[1]) || OURS.test(lead[1])) ? lead[1] : section;
    const offset = lineStart + rawLine.indexOf(line);
    // sentence ends: . ! ? followed by a space and a capital/digit/quote — not "GEN 1.2", "www.caa.bg" or "+/- 72"
    let from = 0; const parts = [];
    const re = /[.!?]+(?=\s+["“(*•A-Z0-9])/g; let m;
    while ((m = re.exec(line))) { if (((line.slice(from, m.index).match(/["“”]/g) ?? []).length % 2) === 1) continue; parts.push([from, m.index + m[0].length]); from = m.index + m[0].length; }
    parts.push([from, line.length]);
    for (const [a, b] of parts) {
      const raw = line.slice(a, b); const s2 = raw.trim(); if (!s2) continue;
      const start = offset + a + (raw.length - raw.trimStart().length);
      out.push({ text: s2, start, end: start + s2.length, section: lineSection, line: lineNo, indent, bullet, para, opening: para === 0 && !bullet && !sawHeading });
    }
  }
  return out;
}

// what is not a claim about the world: judgement on a source, a pointer, what the answer turns on (2026-11-04: "these
// are the agent showing its judgement and are exactly what we want more of — they must not be penalised")
const JUDGEMENT = /\b(nothing changes|outside (the|that|this) (date|period|window)|does(n't| not) affect|the part of the page I saw|does(n't| not) say|secondary sources?|not official( ones)?|none confirmed|stricter than|looser than|takes precedence|differs? from|irrelevant|do(es)? not apply|cover(s)? other|only (general|hit)|returned only|is an official source|are industry references?|industry and non-official|news or (industry )?commentary|confirmed against|could read in full|described as|looks? (like )?(an )?old|disagree|did not use|didn't use|treat (it|them|this) as|indicative)\b/i;
const POINTER = /^(Until|For the exact|Then|Before)\b|\bI'd (check|confirm|ask|get)\b|\bis at [a-z0-9.-]+\.[a-z]{2,}|\bis the place to (confirm|check)\b|\bneeds? checking\b|\bshould (also )?be in\b|\bwill fetch it\b|\buse the .{0,40}page\b|\bconfirm (it |this )?with\b/i;
const TURNS_ON = /\b(depends on|turns? on|decides the answer)\b|^Whether\b/i;
const NOT_ABSENCE = /\b(doesn't|does not|did not|not) (prove|mean|say|tell)\b|\bis not a statement\b/i;

/**
 * @param text     the reply as stored
 * @param claims   [{ start, end, names? }] the cited spans; `names` are the cited sources' hosts and titles
 * @param searched whether the turn ran a web search (the unsourced rule applies then; the absence rule always)
 * @returns { unsourced: string[], absences: string[], spans: [{ start, end, text, kind }], sentences: number }
 */
export function auditClaims({ text, claims = [], searched = false }) {
  const unsourced = [], absences = [], spans = [];
  const sents = sentencesOf(text);
  const openingEnd = Math.max(0, ...sents.filter((s) => s.opening).map((s) => s.end));
  const detailFollows = claims.some((c) => c.start >= openingEnd);
  // a line is sourced once one of its sentences is cited or names our data; a nested bullet inherits its parent's
  // forward only: a sentence after a cited one on its line elaborates it; one BEFORE it does not (2026-11-04: "Connexion
  // France published a strike calendar." sat before a cited sentence and is a real miss)
  const parents = [];   // [{ indent, sourced }]
  const sourcedSentence = (s) => claims.some((c) => c.start < s.end && c.end > s.start) || OURS.test(s.text);
  const lineHasSource = new Map(); for (const s of sents) if (sourcedSentence(s)) lineHasSource.set(s.line, true);
  // a sentence that names the very source cited next on its line ("Connexion France published a strike calendar. It was
  // modified on 9 October. [connexionfrance.com]") is that citation landing one sentence late, not an unsourced claim
  const squash = (x) => String(x ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  const brand = (n) => squash(String(n).replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/]/)[0].replace(/\.(com|net|org|aero|group|gov|int|eu|co|uk|fr|de)(\.[a-z]{2})?$/, ""));
  const namesNext = (s) => {
    const next = sents.find((x) => x.line === s.line && x.start > s.start && claims.some((c) => c.start < x.end && c.end > x.start));
    if (!next) return false;
    const names = claims.filter((c) => c.start < next.end && c.end > next.start).flatMap((c) => c.names ?? []).map(brand).filter((b) => b.length >= 4);
    const here = squash(s.text);
    return names.some((b) => here.includes(b));
  };
  const sourcedBefore = new Map();   // line → a source has been seen on it so far
  const lineSourced = { get: (line) => sourcedBefore.get(line) === true };
  let lastLine = -1; let inheritedFromParent = false;
  for (const s of sents) {
    if (s.line !== lastLine) {
      lastLine = s.line;
      while (parents.length && parents.at(-1).indent >= s.indent) parents.pop();
      inheritedFromParent = s.bullet && s.indent > 0 && parents.length > 0 && parents.at(-1).sourced;
      if (s.bullet) parents.push({ indent: s.indent, sourced: lineHasSource.get(s.line) === true || inheritedFromParent });
    }
    // …and only a sentence that refers back to that source ("It also lists…", "The record gives…"): "Norway administers
    // Peter I Island" after a cited sentence is a new claim, from memory
    const priorSourced = sourcedBefore.get(s.line) === true && /^(?:[-*•]\s+)?(It|Its|This|That|These|They|Their|The (page|record|entry|same|bulletin|notice|plan|directive|document|report|article|listing|site|guide))\b/.test(s.text.replace(/\*\*/g, ""));
    if (sourcedSentence(s)) sourcedBefore.set(s.line, true);
    // a short lead-in ("Status:", "Thailand:") is a label, not the claim
    const plain = s.text.replace(/\*\*/g, "").replace(/^[-*•]\s+/, "").replace(/^[^:.]{1,40}:\s+(?=\S)/, "").trim();
    const cited = claims.some((c) => c.start < s.end && c.end > s.start);
    // a label ("State warnings still in force:") introduces what follows; it states nothing itself
    if (cited || plain.split(/\s+/).length < 5 || /[?:]$/.test(plain)) continue;
    const leadIn = /^(?:[-*•]\s+)?\**([^:*]{1,48})(?:\**:|:\**)\s/.exec(s.text)?.[1] ?? "";
    const exempt = EXEMPT_SECTION.test(s.section) || EXEMPT_SECTION.test(leadIn);
    // case seven: "no restrictions" from our own data. Naming the store, or saying what a search did not find, is honest;
    // a bare absence is not — and with no search at all, even "I found no restrictions" rests on one store.
    if (ABSENCE.test(plain) && !NAMED_STORE.test(plain) && !NOT_FOUND.test(plain) && !NOT_ABSENCE.test(plain) && !(searched && OWN_FINDING.test(plain)) && !priorSourced && !inheritedFromParent) { absences.push(plain.slice(0, 220)); spans.push({ start: s.start, end: s.end, text: plain, kind: "absence" }); continue; }
    if (!searched || exempt || priorSourced || inheritedFromParent || sourcedSentence(s) || namesNext(s) || (s.opening && detailFollows)) continue;
    if (META.test(plain) || ADVICE.test(plain) || POINTER.test(plain) || TURNS_ON.test(plain) || OURS.test(plain) || OURS.test(leadIn) || NOT_FOUND.test(plain) || EVALUATION.test(plain) || JUDGEMENT.test(plain) || OWN_FINDING.test(plain) || SOURCE_COMMENT.test(plain)) continue;
    unsourced.push(plain.slice(0, 220)); spans.push({ start: s.start, end: s.end, text: plain, kind: "unsourced" });
  }
  return { unsourced, absences, spans, sentences: sents.length };
}

export function repairPrompt({ unsourced, absences }) {
  const list = (a) => a.slice(0, 8).map((s) => `- "${s}"`).join("\n");
  return [
    "Your answer above has sentences the reader cannot trace to a source. Rewrite the WHOLE answer, complete on its own:",
    unsourced.length ? `\nThese state something with no citation and no named source of ours:\n${list(unsourced)}\nFor each: cite the search result it came from, or name our own data it came from (\"the wall's limitations store\", \"the CrewBriefing NOTAM cache\"), or move it under \"What I could not establish\", or delete it. Never describe a source without citing it: if it is worth a sentence, it is worth a citation. Nothing from memory.` : "",
    absences.length ? `\nThese state an absence about the world on the strength of our own data alone:\n${list(absences)}\nSay instead what was recorded where ("No limitations are recorded in Clearway for LFMM"), and BEFORE the conclusion say what you checked and what you did not (NOTAMs, the AIP, a search). "No restrictions" needs NOTAMs, the AIP or a search behind it, cited.` : "",
    "\nKeep everything that was cited. Do not search again unless a claim needs a source you do not have.",
  ].filter(Boolean).join("\n");
}
