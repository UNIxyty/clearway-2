// An answer that sends the reader to a check the agent can make itself (2026-11-04, Dmitry): "check the current HSSS
// NOTAMs before planning" while get_notams is one call away. Such an answer is a PARTIAL answer: it is shown as one,
// the agent makes the check, and then gives the full answer from everything it now has. Once per turn, and only for a
// check one of the turn's own tools makes. Detected in code (the wording a reply uses), acted on by the model.
const CHECKS = [
  { tool: "get_notams", label: "the NOTAMs", re: [
    /\b(check|consult|review|read|pull|look up|get|verify|confirm|monitor)\b[^.\n]{0,80}\bNOTAMs?\b/i,
    /\b(did not|didn't|have not|haven't|could not|couldn't|not)\s+(check|pull|look at|read|retrieve)(ed)?\b[^.\n]{0,40}\bNOTAMs?\b/i,
    /\bNOTAMs?\b[^.\n]{0,40}\b(not checked|unchecked|were not checked)\b/i,
  ] },
  { tool: "read_gen_document", label: "the GEN 1.2", re: [
    /\b(check|consult|open|read|pull|look up|confirm|see)\b[^.\n]{0,60}\bGEN 1\.2\b/i,
    /\b(did not|didn't|have not|haven't)\s+(open|read|check)(ed)?\b[^.\n]{0,40}\bGEN 1\.2\b/i,
  ] },
  { tool: "get_aip_document", label: "the AD 2", re: [
    /\b(check|consult|open|read|pull|confirm)\b[^.\n]{0,60}\b(AD ?2\b|aerodrome AIP)/i,
  ] },
];

/** The checks a reply sends the reader to that this turn's tools can make: [{ tool, label }]. */
export function deferredChecks(text, offeredTools) {
  const t = String(text ?? "");
  return CHECKS.filter((c) => offeredTools.has(c.tool) && c.re.some((re) => re.test(t))).map(({ tool, label }) => ({ tool, label }));
}

export function followUpPrompt(found) {
  const labels = found.map((f) => f.label).join(" and ");
  return `Your answer above is partial: it tells the reader to check ${labels}, and you can do that yourself (${found.map((f) => f.tool).join(", ")}). Do it now, for the airports, FIRs or states this question is about. Then write the FULL answer, from the start and complete on its own, using everything you now know: the answer first, changed by what you found where it changes, and say what you checked and when. If the check needs something only the dispatcher can give (an airport the question does not name, a date it does not give), do not guess: keep the answer and say exactly what you need.`;
}
