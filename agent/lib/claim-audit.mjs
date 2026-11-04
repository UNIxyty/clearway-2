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
const EXEMPT_SECTION = /\b(could not|couldn't|cannot|can't) (establish|confirm|check|find|verify)|not established|not checked|not confirmed|gaps?\b|still open|what (i|you) need|questions? for you|what to do|before (you|relying|planning)|what i checked|sources?:?$/i;
const META = /^(I|I'm|I've|I'd|I'll|My|Me)\b|^(If you|Tell me|Please|Let me|Say if|Want me)\b/;
const ADVICE = /^(Check|Confirm|Contact|Ask|Use|Plan|Treat|Before|Send|Open|Pull|Get|Make sure|Do not|Don't|Apply|File|Read|Keep|Avoid|Expect|Allow|Book|Call)\b/i;
const ABSENCE = /\b(no|none|nothing|not any|never|all clear|clear of)\b[^.;:\n]{0,50}\b(restrictions?|limitations?|NOTAMs?|issues?|shortages?|warnings?|closures?|permits? (is |are )?(required|needed)|requirements?|advisor(y|ies)|bans?|problems?)\b|\bno restrictions?\b|\bnot restricted\b|\b(is|are) (open|clear)\b/i;
const NAMED_STORE = new RegExp(`${OURS.source}|\\b(recorded|configured|held|stored|listed) (in|on|by)\\b|\\bstore\\b|\\bcache\\b`, "i");
// what a sentence says about a source or about what could not be found, rather than about the world
const NOT_FOUND = /\bno (current )?(information|data|record|statement|source)s? (was |were )?found\b|\b(not|never) (found|established|confirmed|checked|cached)\b|\bunknown\b/i;
const EVALUATION = /\b(undated|is old|may no longer|suggests?|my (reading|guess|inference|view|reasoning)|not a finding|treat (it|this|that) as|unreliable|weak|the sources disagree|conflicts? with|I read (that|this|it) as)\b/i;
// comment on the sources just listed ("That is marketing, not feedback.", "None of them mentions handling.")
const SOURCE_COMMENT = /^(That|This|These|Those) (is|are|was|were)\b|^(The|This|That) (page|listing|result|source|site|entry|article)s?\b|^(None|Neither|Every one|Each|All|Most) of (them|these|those)\b|^Nothing is recorded in any of them\b/i;
const OWN_FINDING = /^(I|We) (found|saw|could|did|have|searched|checked)|\b(no|none of the) sources? I found\b|\bI( also)? (found|searched|checked)\b|\b(can't|cannot) say\b|\bfrom an official source\b/i;

/** Sentences of a reply with their offsets and the section heading above them. */
export function sentencesOf(text) {
  const out = []; let section = ""; let pos = 0;
  for (const rawLine of String(text ?? "").split("\n")) {
    const lineStart = pos; pos += rawLine.length + 1;
    const line = rawLine.trim();
    if (!line) continue;
    const plain = line.replace(/^[-*•]\s+|^\d+[.)]\s+/, "").replace(/\*\*/g, "").trim();
    // a heading: a short line ending in ':' or wholly bold, or a markdown heading
    if (/^#{1,4}\s/.test(line) || (/^\*\*[^*]+\*\*:?$/.test(line)) || (plain.length < 70 && /:$/.test(plain))) { section = plain.replace(/^#+\s*/, ""); continue; }
    // a bold lead-in ("**Not established:** …") is the section for the rest of its line
    const lead = /^(?:[-*•]\s+)?\*\*([^*]+)\*\*:?/.exec(line);
    const lineSection = lead && (EXEMPT_SECTION.test(lead[1]) || OURS.test(lead[1])) ? lead[1] : section;
    const offset = lineStart + rawLine.indexOf(line);
    // sentence ends: . ! ? followed by a space and a capital/digit/quote — not "GEN 1.2", "www.caa.bg" or "+/- 72"
    let from = 0; const parts = [];
    const re = /[.!?]+(?=\s+["“(*•A-Z0-9])/g; let m;
    while ((m = re.exec(line))) { parts.push([from, m.index + m[0].length]); from = m.index + m[0].length; }
    parts.push([from, line.length]);
    for (const [a, b] of parts) {
      const raw = line.slice(a, b); const s = raw.trim(); if (!s) continue;
      const start = offset + a + (raw.length - raw.trimStart().length);
      out.push({ text: s, start, end: start + s.length, section: lineSection });
    }
  }
  return out;
}

/**
 * @param text     the reply as stored
 * @param claims   [{ start, end }] the cited spans
 * @param searched whether the turn ran a web search (the unsourced rule applies then; the absence rule always)
 * @returns { unsourced: string[], absences: string[], sentences: number }
 */
export function auditClaims({ text, claims = [], searched = false }) {
  const unsourced = [], absences = [];
  const sents = sentencesOf(text);
  let prev = null;
  for (const s of sents) {
    const sameLine = prev && s.start - prev.end < 3;
    const inherits = sameLine && prev.ours && /^(It|This|That|The record|The entry|Its)\b/.test(s.text.replace(/\*\*/g, ""));
    prev = { end: s.end, ours: OURS.test(s.text) || inherits || (prev?.ours && sameLine && /^(It|Its)\b/.test(s.text)) };
    if (inherits) continue;
    // a short lead-in ("Status:", "Thailand:") is a label, not the claim
    const plain = s.text.replace(/\*\*/g, "").replace(/^[-*•]\s+/, "").replace(/^[^:.]{1,40}:\s+(?=\S)/, "").trim();
    const cited = claims.some((c) => c.start < s.end && c.end > s.start);
    if (cited || plain.split(/\s+/).length < 5 || /\?$/.test(plain)) continue;
    // a plain lead-in names the section too ("What I could not establish: who regulates it.")
    const leadIn = /^(?:[-*•]\s+)?\**([^:*]{1,48})\**:\s/.exec(s.text)?.[1] ?? "";
    const exempt = EXEMPT_SECTION.test(s.section) || EXEMPT_SECTION.test(leadIn);
    if (OURS.test(leadIn) && !ABSENCE.test(plain)) continue;
    // an absence about the world, not about a named store of ours, uncited: case seven — wherever it sits
    // case seven: "no restrictions" from our own data. Naming the store, or saying what a search did not find, is honest;
    // a bare absence is not — and with no search at all, even "I found no restrictions" rests on one store.
    if (ABSENCE.test(plain) && !NAMED_STORE.test(plain) && !NOT_FOUND.test(plain) && !(searched && OWN_FINDING.test(plain))) { absences.push(plain.slice(0, 220)); continue; }
    if (!searched || exempt || META.test(plain) || ADVICE.test(plain) || OURS.test(plain) || NOT_FOUND.test(plain) || EVALUATION.test(plain) || OWN_FINDING.test(plain) || SOURCE_COMMENT.test(plain)) continue;
    unsourced.push(plain.slice(0, 220));
  }
  return { unsourced, absences, sentences: sents.length };
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
