// What is this message? Decided by its CONTENT, offline: no portal, no network, and never by who sent it.
//
//   scheduled   a provider's flight notification: it says a flight exists and carries a reference that points
//               at a record in the provider's system. A trigger and a key; the data is in the portal.
//   handling    a handling request: it ASKS us to provide something (handling, services, a permit) and carries
//               the flight details itself.
//   not_for_us  neither. Routine: stored, calm, no action wanted.
//   ask         the agent is not sure. It does nothing and a person chooses the type.
//
// Two POSITIVE tests with "ask" between them. Nothing becomes a handling request because it failed to be a
// notification, and nothing becomes a notification because it mentions a flight. The dangerous direction is a
// notification read as a handling request (flights would be built from ten lines of body text instead of the
// provider's record), so anything notification-shaped is never type 2: it is a notification or it is "ask".
//
// The sender address is a confidence signal and nothing more: notifications and requests are forwarded, relayed
// and sent from other mailboxes. Whether the reference actually RESOLVES is checked later, as the first step of
// the type 1 pipeline (notification.mjs), so stray mail never causes a portal login.

/** Providers whose notifications we know. `block` keys are the `#Key:` lines of the notification body. */
export const PROVIDERS = [
  { id: "cnair", name: "CNAIR", refKey: "Ref", refPattern: /^\d{6,8}$/, blockKeys: ["Pax", "Cliente", "1", "2", "TCP", "Fra", "Ref", "Otros", "DATE", "ETD"], senderDomains: ["cnair.es"] },
];
export const CONFIDENT = 0.7;

// ── Automatic mail, by STRUCTURE ─────────────────────────────────────────────────────────────────────────────
/**
 * A bounce is a delivery report: multipart/report with report-type=delivery-status. Not "anything from
 * mailer-daemon@ or postmaster@": a real request relayed through such an address must not disappear, so the
 * sender is only noted as a hint. → { kind, title, reason, checks } or null.
 */
export function classifyAutomatic(parsed) {
  const h = parsed.headers; const get = (k) => String(h.get(k) ?? "");
  const ct = h.get("content-type"); const type = String(typeof ct === "object" ? ct?.value : ct ?? "").toLowerCase(); const reportType = String((typeof ct === "object" ? ct?.params?.["report-type"] : /report-type="?([\w-]+)/i.exec(String(ct ?? ""))?.[1]) ?? "").toLowerCase();
  if (type === "multipart/report" && reportType === "delivery-status") return { kind: "bounce", title: "Ignored as a bounce", reason: "Bounce", checks: [["Delivery report", "yes", "multipart/report · delivery-status"]] };
  const auto = get("auto-submitted");
  if (auto && !/^no$/i.test(auto) || /^(auto|automatic) ?reply|out of (the )?office/i.test(parsed.subject ?? "")) return { kind: "auto", title: "Ignored: automatic reply", reason: "Out of office", checks: [["Auto-Submitted header", auto ? "yes" : "maybe", auto || "subject reads as an automatic reply"]] };
  if (h.has("list-unsubscribe") || /^bulk|list$/i.test(get("precedence"))) return { kind: "newsletter", title: "Ignored: newsletter", reason: "Newsletter", checks: [["List-Unsubscribe", "yes", ""]] };
  return null;
}
export const isMailSystemSender = (addr) => /^(mailer-daemon|postmaster)@/i.test(String(addr ?? "").trim());

// ── Calendar parts ───────────────────────────────────────────────────────────────────────────────────────────
/** The few iCalendar properties that identify an invite: METHOD, and the first event's UID, SEQUENCE, STATUS. */
export function parseIcs(text) {
  const t = String(text ?? ""); if (!/BEGIN:VCALENDAR/i.test(t)) return null;
  const lines = t.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const prop = (name, from = lines) => { const l = from.find((x) => new RegExp(`^${name}(;[^:]*)?:`, "i").test(x)); return l ? l.slice(l.indexOf(":") + 1).trim() : null; };
  const start = lines.findIndex((l) => /^BEGIN:VEVENT/i.test(l)); const end = lines.findIndex((l, i) => i > start && /^END:VEVENT/i.test(l));
  const ev = start >= 0 ? lines.slice(start, end > start ? end : undefined) : [];
  const seq = prop("SEQUENCE", ev);
  // DESCRIPTION carries the organiser's text (Zimbra puts the invite body there, and it is the only place a
  // cancellation keeps the provider's #Key block): unescaped, so the block can be read from it.
  const unescape = (v) => v?.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1") ?? null;
  const description = unescape(prop("DESCRIPTION", ev));
  // LOCATION: the provider also puts the block there (padded, one key per line); an Outlook forward keeps it.
  const location = unescape(prop("LOCATION", ev));
  return { method: (prop("METHOD") ?? "").toUpperCase() || null, uid: prop("UID", ev), sequence: seq != null && /^\d+$/.test(seq) ? Number(seq) : null, status: (prop("STATUS", ev) ?? "").toUpperCase() || null, summary: prop("SUMMARY", ev), description, location };
}
/** Every calendar object in the message, at any depth (attachments is the expanded list: attached emails are opened). */
export function calendarsFrom(attachments) {
  const out = [];
  for (const a of attachments ?? []) {
    const looks = /calendar/i.test(String(a.declaredType ?? "")) || /\.(ics|ical|vcs)$/i.test(String(a.name ?? "")) || (a.content && a.content.subarray(0, 64).toString("latin1").includes("BEGIN:VCALENDAR"));
    if (!looks || !a.content) continue;
    const c = parseIcs(a.content.toString("utf8")); if (c) out.push({ ...c, where: a.parent ? `inside ${a.parent}` : "the message" });
  }
  return out;
}

// ── Test 1: is it notification-shaped? ───────────────────────────────────────────────────────────────────────
const stripPrefixes = (s) => String(s ?? "").replace(/^\s*((fw|fwd|re|tr|rv|canceled|cancelled|cancelada|cancelado|accepted|declined|aceptada|updated)\s*:\s*)+/i, "").trim();
const ROUTE = /^[A-Z]{4}(\s*-\s*[A-Z]{4}){1,7}$/;
// A `#Key:` token: any key name (the parser keeps every key it finds, known or not), an optional ordinal after a
// numbered key (`#1º:`, whose º some decoders turn into U+FFFD), any whitespace around the colon.
const KEY_TOKEN = /(^|[\s>])#\s*([A-Za-z0-9]{1,12})[ºª°\uFFFD]?\s*:/g;
const tokensOf = (line) => [...line.matchAll(KEY_TOKEN)].map((m) => ({ key: m[2].toLowerCase(), start: m.index + m[1].length, end: m.index + m[0].length }));
/**
 * The provider's `#Key: value` block, in every layout seen for real:
 *   - one key per line, the value after ANY run of whitespace (tabs, one space, many) and trailing padding trimmed
 *     (the provider's own body, both of its copies);
 *   - one key per line with the value on a FOLLOWING line (an HTML table flattened to text: Outlook's forward of the
 *     appointment) — used only when every key line in that text is bare, so an empty `#TCP:` never takes a value
 *     from the next line of a normal block;
 *   - several keys run together on one line ("Where: #Pax: 0/4 #Cliente: … #Ref: 2610228 #Otros" — the location
 *     line, which may be cut short) — used only for keys no one-per-line copy has.
 * Keys in any order, unknown keys kept (never a reason to stop). → Map key → value, with `.conflicts` (key →
 * the different non-empty values when the copies disagree; the first is kept in the map).
 */
export function hashBlock(text) {
  const lines = String(text ?? "").split(/\r\n|\r|\n/).map((l) => l.replace(/^[>\s]+/, ""));
  const keyLines = lines.map((l, i) => ({ i, l, t: tokensOf(l) })).filter((x) => x.t.length);
  const single = keyLines.filter((x) => x.t.length === 1 && x.t[0].start === 0);
  const run = keyLines.filter((x) => !(x.t.length === 1 && x.t[0].start === 0));
  const tableForm = single.length >= 2 && single.every((x) => !x.l.slice(x.t[0].end).trim());
  const primary = new Map(), secondary = new Map();
  const add = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const x of single) {
    let v = x.l.slice(x.t[0].end).trim();
    if (!v && tableForm) for (let j = x.i + 1; j < Math.min(lines.length, x.i + 4); j += 1) { const n = lines[j].trim(); if (!n) continue; if (!tokensOf(lines[j]).length) v = n; break; }
    add(primary, x.t[0].key, v);
  }
  for (const x of run) x.t.forEach((t, k) => {
    const seg = x.l.slice(t.end, x.t[k + 1]?.start ?? x.l.length);
    const cut = seg.search(/\s#[A-Za-z0-9]/); // a following key with no colon (a line cut short: "… #Otros")
    add(secondary, t.key, (cut >= 0 ? seg.slice(0, cut) : seg).trim());
  });
  const out = new Map(); out.conflicts = new Map();
  for (const [k, vs] of [...primary, ...[...secondary].filter(([k]) => !primary.has(k))]) {
    const filled = [...new Set(vs.filter(Boolean))];
    out.set(k, filled[0] ?? "");
    if (filled.length > 1) out.conflicts.set(k, filled);
  }
  return out;
}
/** HTML → text with a table's cells kept on their row (a `#Key:` cell and its value cell become one line). */
export function htmlToLines(html) {
  return String(html ?? "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, "\t")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)));
}
/**
 * Offline evidence that a message is a provider notification. `texts` = the body and the text of every attached
 * email (a forwarded notification keeps its block inside the attachment or the quoted body).
 * → { provider, reference, notification, evidence[], confidence, confident, shaped }
 */
export function notificationSignals({ subject, texts = [], calendars = [], fromAddr = "", attachedSubjects = [] }) {
  let best = null;
  for (const p of PROVIDERS) {
    let block = new Map(), src = null;
    // The block is searched for in every text AND in each calendar part's DESCRIPTION (a real cancellation keeps
    // it only there); the fullest block wins.
    const sources = [...texts.map((t, i) => ({ t, where: i === 0 ? "the message body" : `text ${i + 1}` })), ...calendars.flatMap((c) => [{ t: c.description ?? "", where: `the calendar description (${c.where})` }, { t: c.location ?? "", where: `the calendar location (${c.where})` }])];
    const blocks = sources.map((x) => ({ ...x, b: hashBlock(x.t) }));
    for (const x of blocks) { const n = p.blockKeys.filter((k) => x.b.has(k.toLowerCase())).length; if (n > p.blockKeys.filter((k) => block.has(k.toLowerCase())).length) { block = x.b; src = x.t; } }
    const keys = p.blockKeys.filter((k) => block.has(k.toLowerCase()));
    // The reference, across EVERY copy in the message: two different values is not a reference, it is a question.
    const rk = p.refKey.toLowerCase();
    const refs = [...new Set(blocks.flatMap((x) => [x.b.get(rk), ...(x.b.conflicts.get(rk) ?? [])]).filter((v) => v && p.refPattern.test(v)))];
    const refRaw = block.get(rk) || null;
    const reference = refs.length === 1 ? refs[0] : null;
    // What was searched, for the screen when the reference cannot be read: the `#` lines of each text, crew values
    // masked (the initials are not kept), so a person sees why.
    const CREW = new Set(["1", "2", "tcp"]);
    const searched = { where: sources.map((x) => x.where), refProblem: refs.length > 1 ? `the message gives different #${p.refKey} values (${refs.join(", ")})` : reference ? null : blocks.some((x) => x.b.has(rk)) ? (refRaw ? `#${p.refKey} reads "${String(refRaw).slice(0, 20)}", not a ${p.name} reference` : `#${p.refKey} is in the message but no value was found next to it`) : `no #${p.refKey} line in the message`,
      lines: [...new Set(blocks.flatMap((x) => x.t.split(/\r\n|\r|\n/).filter((l) => /#\s*[A-Za-z0-9]{1,12}[ºª°\uFFFD]?\s*:/.test(l)).map((l) => l.replace(/(#\s*(?:1|2|TCP)[ºª°\uFFFD]?\s*:\s*)([^#\s][^#]*?)(?=\s+#|\s*$)/gi, (m, k, v) => `${k}${"•".repeat(Math.min(v.length, 6))}`).trim().slice(0, 160))))].slice(0, 24) };
    const cal = calendars.find((c) => c.method === "REQUEST" || c.method === "CANCEL") ?? null;
    const subj = [subject, ...attachedSubjects].map(stripPrefixes).find((s) => ROUTE.test(s)) ?? null;
    const domain = String(fromAddr).toLowerCase().match(/@([a-z0-9.-]+)/)?.[1] ?? ""; const known = p.senderDomains.some((d) => domain === d || domain.endsWith(`.${d}`));
    const evidence = [
      { signal: "reference", found: !!reference, weight: 0.5, detail: reference ? `#${p.refKey}: ${reference}` : `Not read: ${searched.refProblem}` },
      { signal: "block", found: keys.length >= 4, weight: 0.25, detail: keys.length ? `${keys.length} of ${p.blockKeys.length} notification lines (${keys.map((k) => `#${k}`).join(" ")})` : "No notification block" },
      { signal: "calendar", found: !!cal, weight: 0.15, detail: cal ? `Calendar ${cal.method === "CANCEL" ? "cancellation" : "invite"} in ${cal.where}` : calendars.length ? `Calendar part, method ${calendars[0].method ?? "none"}` : "No calendar part" },
      { signal: "subject", found: !!subj, weight: 0.1, detail: subj ? `Route-shaped subject: ${subj}` : "Subject is not a route" },
      { signal: "sender", found: known, weight: 0.05, hint: true, detail: known ? `Sender is at ${domain} (a hint only)` : "Sender is not a known provider address (a hint only)" },
    ];
    const confidence = Math.min(1, evidence.reduce((n, e) => n + (e.found ? e.weight : 0), 0));
    // Confident: the key AND the block. Shaped: enough to look like one, not enough to be sure.
    const confident = !!reference && keys.length >= 4;
    const shaped = !confident && evidence.filter((e) => !e.hint).reduce((n, e) => n + (e.found ? e.weight : 0), 0) >= 0.25;
    // #ETD: one departure per leg, "HH:MM:SS-ICAO", in leg order (local time at that airport). #Pax: one count per
    // leg, slash-separated, in the same order ("0/5/5" on a three-leg trip). Both seen on real messages.
    const etd = String(block.get("etd") ?? "").split(/\s+/).map((x) => /^(\d{1,2}:\d{2})(?::\d{2})?-([A-Z]{4})$/.exec(x)).filter(Boolean).map((m) => ({ time: m[1].padStart(5, "0"), airport: m[2] }));
    const paxRaw = block.get("pax") ?? null; const paxPerLeg = paxRaw && /^\d{1,3}(\/\d{1,3})*$/.test(paxRaw.trim()) ? paxRaw.trim().split("/").map(Number) : null;
    const notification = { provider: p.id, providerName: p.name, reference, route: subj ? subj.split(/\s*-\s*/) : etd.map((e) => e.airport), date: block.get("date") ?? null, etd, pax: paxRaw, paxPerLeg, legs: etd.length || null, paxLegsAgree: paxPerLeg && etd.length ? paxPerLeg.length === etd.length : null, client: block.get("cliente") ?? null,
      crewNamed: ["1", "2", "tcp"].filter((k) => (block.get(k) ?? "").trim()).length,   // how many crew lines are filled; the initials themselves are not kept
      crewLines: { first: !!(block.get("1") ?? "").trim(), second: !!(block.get("2") ?? "").trim(), tcp: !!(block.get("tcp") ?? "").trim() }, // filled or not; never the initials
      calendar: cal ? { method: cal.method, uid: cal.uid, sequence: cal.sequence, status: cal.status } : null };
    const cand = { provider: p, reference, notification, evidence, confidence: Math.round(confidence * 100) / 100, confident, shaped, searched };
    if (!best || cand.confidence > best.confidence) best = cand;
  }
  return best;
}

/** What changed between two notifications of the same flight (for an update). → ["#ETD leg 1: 17:00 → 18:00", …] */
export function notificationChanges(a, b) {
  const out = [];
  const etd = (n) => (n?.etd ?? []).map((e) => `${e.time}-${e.airport}`);
  const ea = etd(a), eb = etd(b);
  for (let i = 0; i < Math.max(ea.length, eb.length); i += 1) if (ea[i] !== eb[i]) out.push(`ETD leg ${i + 1}: ${ea[i] ?? "none"} → ${eb[i] ?? "none"}`);
  for (const [k, label] of [["date", "Date"], ["pax", "Pax"], ["client", "Client"]]) if ((a?.[k] ?? null) !== (b?.[k] ?? null)) out.push(`${label}: ${a?.[k] ?? "none"} → ${b?.[k] ?? "none"}`);
  if ((a?.route ?? []).join("-") !== (b?.route ?? []).join("-")) out.push(`Route: ${(a?.route ?? []).join("-") || "none"} → ${(b?.route ?? []).join("-") || "none"}`);
  return out;
}

// ── Test 2: does it ask us for something? (the model reads; code verifies) ───────────────────────────────────
const norm = (s) => String(s ?? "").toLowerCase().replace(/[‘’“”"'`]/g, "").replace(/\s+/g, " ").trim();
/** The model must QUOTE the words that ask for a service; the quote has to be in the message. */
export function askVerified(ask, sourceTexts) {
  const q = norm(ask?.said); if (q.length < 6) return false;
  const src = norm(sourceTexts.join("\n"));
  if (src.includes(q)) return true;
  const words = q.split(" ").filter((w) => w.length >= 4); if (words.length < 3) return false;
  return words.filter((w) => src.includes(w)).length / words.length >= 0.8;
}

/**
 * The decision. `signals` from notificationSignals; `model` = the extraction (or null when it was not run).
 * → { type, confidence, reason, evidence[], decidedBy }
 */
export function decideType({ signals, model, sourceTexts = [], mailSystemSender = false }) {
  const ev = [...(signals?.evidence ?? []).map((e) => ({ test: "notification", signal: e.signal, found: e.found, detail: e.detail }))];
  if (signals?.confident) return { type: "scheduled", confidence: signals.confidence, decidedBy: "content", reason: `A ${signals.provider.name} flight notification: it carries the reference ${signals.reference} and the notification block.`, evidence: ev };
  if (!model) return { type: "ask", confidence: signals?.confidence ?? 0, decidedBy: "content", reason: "Not read yet.", evidence: ev };
  const legs = (model.legs ?? []).length; const services = (model.legs ?? []).reduce((n, l) => n + (l.services ?? []).filter((s) => !s.isNote).length, 0);
  const conf = typeof model.typeConfidence === "number" ? model.typeConfidence : null;
  const asked = askVerified(model.ask, sourceTexts);
  const workShaped = (model.legs ?? []).some((l) => (l.std?.value?.date || l.sta?.value?.date) && (l.registration?.value || l.flightNumber?.value));
  ev.push({ test: "handling", signal: "asks", found: asked, detail: asked ? `Asks for something: "${String(model.ask.said).slice(0, 120)}"` : model.ask?.said ? "The words the model quoted as the request are not in the message" : "Does not ask us to provide anything" });
  ev.push({ test: "handling", signal: "schedule", found: legs > 0, detail: legs ? `Carries its own schedule: ${legs} leg${legs === 1 ? "" : "s"}${services ? `, ${services} service line${services === 1 ? "" : "s"}` : ""}` : "No schedule in the message" });
  ev.push({ test: "model", signal: "reading", found: conf != null && conf >= CONFIDENT, detail: `The agent read it as "${model.requestType}"${conf != null ? `, confidence ${conf.toFixed(2)}` : ", with no confidence given"}: ${String(model.whyType ?? "").slice(0, 160)}` });
  if (mailSystemSender) ev.push({ test: "hint", signal: "sender", found: true, detail: "Sent from a mail-system address (mailer-daemon / postmaster), but it is not a delivery report, so it was read like any other message" });
  const out = (type, confidence, reason) => ({ type, confidence: Math.round(Math.max(0, Math.min(1, confidence)) * 100) / 100, decidedBy: "content", reason, evidence: ev });
  // Notification-shaped but not certain: never a handling request.
  if (signals?.shaped) return out("ask", signals.confidence, `Looks like a provider's flight notification, but ${signals.reference ? "the notification block is incomplete" : "it has no reference the agent could look up"}.`);
  if (model.requestType === "scheduled") return out("ask", conf ?? 0, "Reads like a notification that a flight exists, but it has no provider reference to look up.");
  if (model.requestType === "handling") {
    if (!asked) return out("ask", Math.min(conf ?? 0, 0.5), "Has flight details, but the agent could not point to words that ask us to provide anything.");
    if (!legs) return out("ask", Math.min(conf ?? 0, 0.5), "Asks for something, but carries no schedule the agent could read.");
    if (conf == null || conf < CONFIDENT) return out("ask", conf ?? 0, `Reads like a handling request, but the agent is not sure enough${conf != null ? ` (confidence ${conf.toFixed(2)})` : ""}.`);
    return out("handling", conf, "A handling request: it asks us to provide something and carries the flight details itself.");
  }
  // "other"
  if (workShaped || asked) return out("ask", Math.min(conf ?? 0, 0.5), asked ? "Asks for something, but the agent did not read it as a handling request." : "Has a dated schedule with an aircraft or flight number, but asks for nothing and is not a notification the agent knows.");
  if (conf == null || conf < CONFIDENT) return out("ask", conf ?? 0, `The agent is not sure what this is${conf != null ? ` (confidence ${conf.toFixed(2)})` : ""}.`);
  return out("not_for_us", conf, String(model.whyType ?? "Not a handling request and not a flight notification."));
}
