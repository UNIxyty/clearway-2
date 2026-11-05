// Web search, two passes and citations, through the WIRING (2026-11-03). The Leon verdict taught it: a check that calls
// a function passes while the route that should carry its result does not. So this one starts a real agent server
// (agent/server.mjs) against a stand-in for the Messages API, asks /api/chat one question, and reads what the person
// would get: the SSE `done` event and the stored message. No key, no network. (The API's own search is the one provider
// since Tavily was removed, 2026-11-05.)
//
//   1. the pure parts: domains cover subdomains; the mark sits on a claim whose every source is unapproved, never on an
//      industry or official one; dates as the mark shows them
//   2. a whole turn: pass one (the API's web_search with allowed_domains, Riga by city) → widen_web_search → pass two
//      unrestricted; the API's own blocks sent back whole; claims + numbered sources + the mark in `done` and in the
//      stored message; the searches by pass on the audit row; the turn's cost includes the searches
//   3. widen before any approved search is refused
//   4. the daily ceiling reached mid-turn: the turn stops and says so; it never answers unsearched
//   node --env-file=.env.rig rig/web-search-check.mjs
import http from "node:http";
import { spawn } from "node:child_process";
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 220)}` : ""}`); if (!c) failures += 1; };
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
const H = { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json" };

// ── 1. the pure parts ─────────────────────────────────────────────────────────────────────────────────────────────
const { classifyUrl, anthropicWebTool } = await import("../agent/lib/web-sources.mjs");
const { citationsToClaims, shortDate } = await import("../agent/lib/citations.mjs");
const S = { official: ["easa.europa.eu", "gov.uk", "ais.pansa.pl"], industry: ["safeairspace.net", "ops.group"] };
ok(classifyUrl("https://www.easa.europa.eu/x", S) === "official" && classifyUrl("https://assets.publishing.service.gov.uk/a.pdf", S) === "official" && classifyUrl("https://www.ais.pansa.pl/aip", S) === "official", "a listed domain covers its subdomains (as the API's filter does)");
ok(classifyUrl("https://pansa.pl/", S) === "other" && classifyUrl("https://notgov.uk/", S) === "other" && classifyUrl("https://ops.group.evil.example/", S) === "other", "…but not its parent, a look-alike, or a name that merely contains it");
ok(classifyUrl("https://safeairspace.net/sudan/", S) === "industry", "an industry reference is classed industry");
const now = new Date("2026-11-03T12:00:00Z");
ok(shortDate("1 day ago", now) === "2 Nov" && shortDate("2026-10-28", now) === "28 Oct" && shortDate("2025-12-01", now) === "1 Dec 2025" && shortDate("soon", now) === null, "dates as the mark shows them", [shortDate("1 day ago", now), shortDate("2025-12-01", now)].join(" · "));
const tool1 = anthropicWebTool(S, { widened: false }), tool2 = anthropicWebTool(S, { widened: true });
ok(tool1.allowed_domains?.includes("safeairspace.net") && tool1.allowed_domains.includes("easa.europa.eu") && !tool2.allowed_domains && tool1.max_uses === 5 && tool1.user_location.city === "Riga" && !tool1.user_location.country, "the API tool: pass one official + industry, pass two unrestricted, max_uses 5, Riga by city (the API refuses country LV)");
{
  const blocks = [
    { text: "Sudan's airspace is closed east of Khartoum.", citations: [{ type: "web_search_result_location", url: "https://www.reuters.com/world/africa/x", title: "Sudan" }] },
    { text: " SafeAirspace rates it do-not-fly.", citations: [{ type: "web_search_result_location", url: "https://safeairspace.net/sudan/", title: "Sudan" }] },
    { text: " Both agree on the west.", citations: [{ type: "web_search_result_location", url: "https://www.reuters.com/world/africa/x" }, { type: "web_search_result_location", url: "https://www.easa.europa.eu/czib" }] },
    { text: " Our manual forbids it.", citations: [{ type: "search_result_location", source: "kb:doc-1#p4", title: "Ops Manual, p. 4" }] },
    { text: " That is all." },
  ];
  const answer = "Thinking aloud before a tool. " + blocks.map((b) => b.text).join("");
  const r = citationsToClaims({ answer: blocks.map((b) => b.text).join(""), answerBlocks: blocks, sources: [{ n: 1, tier: "company", documentId: "doc-1", label: "Ops Manual" }], web: { settings: S, results: [{ url: "https://www.reuters.com/world/africa/x", title: "Sudan", pageAge: "1 day ago", pass: 2 }, { url: "https://safeairspace.net/sudan/", title: "Sudan", pageAge: "2026-10-30", pass: 1 }] }, now });
  const [c1, c2, c3, c4] = r.claims;
  ok(r.claims.length === 4, "one claim per cited block; the uncited one is the agent's own words", r.claims.length);
  ok(c1.mark === "not from an official source: reuters.com, 2 Nov", "a claim resting only on an unapproved source carries the mark, with host and date", c1.mark);
  ok(!c2.mark && !c3.mark && !c4.mark, "no mark on an industry claim, on a claim one official source also supports, or on the company's own document");
  ok(c4.n === 1 && r.sources.length === 4, "the knowledge base citation maps to the document's existing source; each web page is one numbered source", r.sources.map((s) => `${s.n}:${s.tierLabel ?? s.tier}`).join(" "));
  ok(r.sources.find((s) => s.href?.includes("reuters"))?.tierLabel === "Web · not approved" && r.sources.find((s) => s.href?.includes("safeairspace"))?.tierLabel === "Industry reference" && r.sources.find((s) => s.href?.includes("easa"))?.tierLabel === "Official", "each web source says what it is: Official, Industry reference, Web · not approved");
  const ours = citationsToClaims({ answer: "HSR5 covers Sudan.", answerBlocks: [{ text: "HSR5 covers Sudan.", citations: [{ type: "search_result_location", source: "cw:notam:HSSS:A0073/26", title: "NOTAM A0073/26 · HSSS · CrewBriefing cache 2026-11-03 21:42Z", cited_text: "x" }] }], sources: [], web: { settings: S }, now });
  ok(ours.sources[0]?.tierLabel === "Clearway data" && ours.sources[0].domainClass === "ours" && /CrewBriefing cache 2026-11-03 21:42Z/.test(ours.sources[0].label) && !ours.claims[0]?.mark && ours.counts.ours === 1, "a cited NOTAM is a 'Clearway data' source with its cache time, numbered beside the claim, never marked", ours.sources[0]?.label);
  const off = citationsToClaims({ answer, answerBlocks: blocks, sources: [], web: { settings: S, results: [] }, now });
  ok(off.claims[0]?.start === "Thinking aloud before a tool. ".length, "spans index the stored reply, after any text that was taken out as thinking", off.claims[0]?.start);
  const bad = citationsToClaims({ answer: "Something else entirely.", answerBlocks: blocks, sources: [], web: { settings: S }, now });
  ok(bad.claims.length === 0 && bad.dropped, "cited text that is not the stored reply places no claim, and says why (never a misplaced underline)", bad.dropped);
}

// ── 2. a whole turn through the route ─────────────────────────────────────────────────────────────────────────────
const seen = []; let script = "turn";
const sse = (res, events) => { res.writeHead(200, { "content-type": "text/event-stream" }); for (const e of events) res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`); res.end(); };
const start = (u = {}) => ({ type: "message_start", message: { usage: { input_tokens: 100, output_tokens: 1, ...u } } });
const text = (i, t, cites = []) => [{ type: "content_block_start", index: i, content_block: { type: "text", text: "" } }, ...cites.map((c) => ({ type: "content_block_delta", index: i, delta: { type: "citations_delta", citation: c } })), { type: "content_block_delta", index: i, delta: { type: "text_delta", text: t } }, { type: "content_block_stop", index: i }];
const search = (i, id, q, results) => [
  { type: "content_block_start", index: i, content_block: { type: "server_tool_use", id, name: "web_search", input: {} } },
  { type: "content_block_delta", index: i, delta: { type: "input_json_delta", partial_json: JSON.stringify({ query: q }) } },
  { type: "content_block_stop", index: i },
  { type: "content_block_start", index: i + 1, content_block: { type: "web_search_tool_result", tool_use_id: id, content: results.map((r) => ({ type: "web_search_result", encrypted_content: "rig-enc", page_age: "1 day ago", ...r })) } },
  { type: "content_block_stop", index: i + 1 },
];
const toolUse = (i, id, name, input) => [{ type: "content_block_start", index: i, content_block: { type: "tool_use", id, name, input: {} } }, { type: "content_block_delta", index: i, delta: { type: "input_json_delta", partial_json: JSON.stringify(input) } }, { type: "content_block_stop", index: i }];
const end = (stop, searches = 0, inTok = 100) => ({ type: "message_delta", delta: { stop_reason: stop }, usage: { input_tokens: inTok, output_tokens: 20, server_tool_use: { web_search_requests: searches } } });
const api = http.createServer(async (req, res) => {
  let b = ""; for await (const c of req) b += c; const body = JSON.parse(b || "{}");
  seen.push(body);
  // the API's own rule (measured 2026-11-03), so the stand-in cannot accept what production refuses
  const mixed = (body.messages ?? []).some((m) => Array.isArray(m.content) && m.content.some((c) => c.type === "tool_result" && Array.isArray(c.content) && c.content.some((x) => x.type === "search_result") && c.content.some((x) => x.type !== "search_result")));
  // and the API refuses a search the model asked for and never got an answer to, unless tool results follow it
  const msgs = body.messages ?? [];
  // (measured 2026-11-04: it runs such a search only when the next message is tool results and nothing else)
  const orphan = msgs.some((m, i) => m.role === "assistant" && Array.isArray(m.content) && m.content.some((c) => c.type === "server_tool_use" && !m.content.some((r) => r.type === "web_search_tool_result" && r.tool_use_id === c.id)) && !(Array.isArray(msgs[i + 1]?.content) && msgs[i + 1].content.length > 0 && msgs[i + 1].content.every((x) => x.type === "tool_result")));
  if (orphan) { res.writeHead(400, { "content-type": "application/json" }); return res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "web_search tool use was found without a corresponding web_search_tool_result block" } })); }
  if (mixed) { res.writeHead(400, { "content-type": "application/json" }); return res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "tool_result: if any blocks in a tool result are of type `search_result`, all blocks must be of that type" } })); }
  // the question check (lib/question-check.mjs): a mismatch in the rig's question gets the question back
  if (!body.stream && /You check a flight dispatcher's question/.test(JSON.stringify(body.system ?? ""))) {
    const q = JSON.stringify(body.messages ?? "");
    const verdict = /DAAT/.test(q) ? { codes: [{ code: "DAAT", is: "Aguenar – Hadj Bey Akhamok Airport, Tamanrasset, Algeria", short: "Tamanrasset", kind: "aerodrome", writtenAs: null, mismatch: false }], ask: null }
      : /ZSPD/.test(q)
      ? { codes: [{ code: "ZSPD", is: "Shanghai Pudong, China", kind: "aerodrome", writtenAs: "Hong Kong", mismatch: true }, { code: "VHHH", is: "Hong Kong International", kind: "aerodrome", writtenAs: "Macao", mismatch: true }], ask: "You've written Hong Kong ZSPD and Macao VHHH, but ZSPD is Shanghai Pudong and VHHH is Hong Kong — Macao is VMMC. Which pair did you mean?\n• Hong Kong VHHH and Macao VMMC\n• Shanghai ZSPD and Hong Kong VHHH" }
      : { codes: [{ code: "EVRA", is: "Riga International, Latvia", kind: "aerodrome", writtenAs: null, mismatch: false }], ask: null };
    res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(verdict) }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } }));
  }
  const isRouter = !(body.tools ?? []).length && /classif|tier/i.test(JSON.stringify(body.system ?? "")) ;
  if (isRouter || !body.stream) { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ content: [{ type: "text", text: '{"tier":"standard","confidence":0.9,"reason":"rig"}' }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } })); }
  const round = body.messages.filter((m) => m.role === "assistant").length;
  if (script === "turn") {
    if (round === 0) return sse(res, [start(), ...search(0, "srvtoolu_rig1", "EASA CZIB Russia", [{ url: "https://www.easa.europa.eu/en/czib/russia", title: "CZIB Russia" }]), ...search(2, "srvtoolu_rig1b", "Sudan airspace", [{ url: "https://safeairspace.net/sudan/", title: "Sudan" }]), ...toolUse(4, "toolu_rig_w", "widen_web_search", { reason: "current news on Sudan" }), end("tool_use", 2)]);
    return sse(res, [start(), ...text(0, "So I'll search the news as well."), ...search(1, "srvtoolu_rig2", "Sudan airspace news", [{ url: "https://www.reuters.com/world/africa/sudan-airspace", title: "Sudan airspace" }]),
      ...text(3, "Sudan's airspace is closed east of Khartoum.", [{ type: "web_search_result_location", url: "https://www.reuters.com/world/africa/sudan-airspace", title: "Sudan airspace", cited_text: "closed", encrypted_index: "x" }]),
      ...text(4, " SafeAirspace rates Sudan do-not-fly.", [{ type: "web_search_result_location", url: "https://safeairspace.net/sudan/", title: "Sudan", cited_text: "x", encrypted_index: "s" }]),
      ...text(5, " EASA advises against Russian airspace.", [{ type: "web_search_result_location", url: "https://www.easa.europa.eu/en/czib/russia", title: "CZIB Russia", cited_text: "advises", encrypted_index: "y" }]),
      end("end_turn", 1)]);
  }
  if (script === "pending") {
    // what production did (2026-11-03): searches asked for in the same response as widen_web_search, left without results
    const pending = [{ type: "content_block_start", index: 1, content_block: { type: "server_tool_use", id: "srvtoolu_pend", name: "web_search", input: {} } }, { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"query":"Yerevan Baku flights"}' } }];
    if (round === 0) return sse(res, [start(), ...toolUse(0, "toolu_p_w", "widen_web_search", { reason: "news" }), ...pending, end("tool_use", 0)]);
    // the API answers the pending search at the start of the next request, under that request's settings
    if (round === 1) return sse(res, [start(), { type: "content_block_start", index: 0, content_block: { type: "web_search_tool_result", tool_use_id: "srvtoolu_pend", content: [{ type: "web_search_result", url: "https://ops.group/armenia", title: "Armenia", encrypted_content: "e", page_age: "2 days ago" }] } }, ...toolUse(1, "toolu_p_w2", "widen_web_search", { reason: "news, again" }), end("tool_use", 1)]);
    return sse(res, [start(), ...text(0, "Done."), end("end_turn")]);
  }
  if (script === "must-search") {
    // a permit question answered from nothing, offering to search: it must search, then answer
    if (round === 0) return sse(res, [start(), ...text(0, "I couldn't find a rule in our records. I can search the wider web if you want."), end("end_turn")]);
    return sse(res, [start(), ...search(0, "srvtoolu_ms", "Bulgaria landing permit", [{ url: "https://safeairspace.net/sudan/", title: "Sudan" }]), ...text(2, "Yes: SafeAirspace rates it do-not-fly.", [{ type: "web_search_result_location", url: "https://safeairspace.net/sudan/", title: "Sudan", cited_text: "x", encrypted_index: "s" }]), end("end_turn", 1)]);
  }
  if (script === "empty-pass-one") {
    if (round === 0) return sse(res, [start(), ...search(0, "srvtoolu_e1", "DAAT handling", []), ...text(2, "The approved sources had nothing on handling delays there."), end("end_turn", 1)]);
    return sse(res, [start(), ...search(0, "srvtoolu_e2", "DAAT handling delays crews", [{ url: "https://safeairspace.net/sudan/", title: "Sudan" }]), ...text(2, "Crews report long waits for fuel.", [{ type: "web_search_result_location", url: "https://safeairspace.net/sudan/", title: "Sudan", cited_text: "x", encrypted_index: "s" }]), end("end_turn", 1)]);
  }
  if (script === "uncited") {
    if (round === 0) return sse(res, [start(), ...search(0, "srvtoolu_u1", "Westarctica", [{ url: "https://safeairspace.net/sudan/", title: "Sudan" }]), ...text(2, "SafeAirspace lists nothing for it.", [{ type: "web_search_result_location", url: "https://safeairspace.net/sudan/", title: "Sudan", cited_text: "x", encrypted_index: "s" }]), ...text(3, " Norway administers Peter I Island under the Antarctic Treaty arrangements."), end("end_turn", 1)]);
    return sse(res, [start(), ...text(0, "SafeAirspace lists nothing for it.", [{ type: "web_search_result_location", url: "https://safeairspace.net/sudan/", title: "Sudan", cited_text: "x", encrypted_index: "s" }]), end("end_turn")]);
  }
  if (script === "still-uncited") {
    // the draft and the redraft both keep the from-memory sentence: the answer read must carry the mark on it
    if (round === 0) return sse(res, [start(), ...search(0, "srvtoolu_s1", "Westarctica", [{ url: "https://safeairspace.net/sudan/", title: "Sudan" }]), ...text(2, "SafeAirspace lists nothing for it.", [{ type: "web_search_result_location", url: "https://safeairspace.net/sudan/", title: "Sudan", cited_text: "x", encrypted_index: "s" }]), ...text(3, " Norway administers Peter I Island under the Antarctic Treaty arrangements."), end("end_turn", 1)]);
    return sse(res, [start(), ...text(0, "SafeAirspace lists nothing for it.", [{ type: "web_search_result_location", url: "https://safeairspace.net/sudan/", title: "Sudan", cited_text: "x", encrypted_index: "s" }]), ...text(1, " Norway administers Peter I Island under the Antarctic Treaty arrangements."), end("end_turn")]);
  }
  if (script === "absence") {
    if (round === 0) return sse(res, [start(), ...text(0, "There are no restrictions for the Marseille FIR today."), end("end_turn")]);
    return sse(res, [start(), ...text(0, "No limitations are recorded in Clearway for the Marseille FIR. I did not check the NOTAMs or the AIP."), end("end_turn")]);
  }
  if (script === "orphan") {
    // a reply that ends with a search it never got an answer to, and advice the turn follows up
    if (round === 0) return sse(res, [start(), ...text(0, "Restricted. Check the current HSSS NOTAMs."), { type: "content_block_start", index: 1, content_block: { type: "server_tool_use", id: "srvtoolu_orphan", name: "web_search", input: {} } }, { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"query":"x"}' } }, end("end_turn")]);
    if (round === 1) return sse(res, [start(), ...toolUse(0, "toolu_o_n", "get_notams", { icao: "HSSS" }), end("tool_use")]);
    return sse(res, [start(), ...text(0, "FULL: restricted."), end("end_turn")]);
  }
  if (script === "names") return sse(res, [start(), ...text(0, "Djanet (DAAT) is a desert aerodrome and {{DAAT}} has one runway."), end("end_turn")]);
  if (script === "follow-up") {
    // the reply sends the reader to the NOTAMs; after the nudge the model reads them, then answers in full
    if (round === 0) return sse(res, [start(), ...text(0, "Sudan's airspace is restricted. Check the current HSSS NOTAMs before planning."), end("end_turn")]);
    if (round === 1) return sse(res, [start(), ...toolUse(0, "toolu_f_n", "get_notams", { icao: "HSSS" }), end("tool_use")]);
    return sse(res, [start(), ...text(0, "FULL: Sudan's airspace is restricted; the HSSS NOTAMs were read just now."), end("end_turn")]);
  }
  if (script === "widen-first") {
    if (round === 0) return sse(res, [start(), ...toolUse(0, "toolu_rig_w0", "widen_web_search", { reason: "skip ahead" }), end("tool_use")]);
    return sse(res, [start(), ...text(0, "I could not establish this."), end("end_turn")]);
  }
  if (script === "ceiling") {
    // the first round costs more than the ceiling (1,000,000 input tokens on the standard tier); the second must not happen
    if (round === 0) return sse(res, [start(), ...search(0, "srvtoolu_c", "Sudan", [{ url: "https://safeairspace.net/sudan/", title: "Sudan" }]), ...toolUse(2, "toolu_rig_c", "widen_web_search", { reason: "more" }), end("tool_use", 1, 1_000_000)]);
    return sse(res, [start(), ...text(0, "ANSWERED UNSEARCHED"), end("end_turn")]);
  }
});
await new Promise((r) => api.listen(0, "127.0.0.1", r));
const API = `http://127.0.0.1:${api.address().port}`;

// today's spend row, restored at the end: the ceiling test must not leave the rig's agent closer to its ceiling
const day = new Date().toISOString().slice(0, 10);
const spendBefore = (await (await fetch(`${SB}/rest/v1/agent_settings?id=eq.spend:${day}&select=*`, { headers: H })).json())?.[0] ?? null;

async function agent(port, extra = {}) {
  const child = spawn("node", ["--env-file=.env.rig", "agent/server.mjs"], { env: { ...process.env, PORT: String(port), DISABLE_AUTH_FOR_TESTING: "true", AGENT_TEST_ROLE: "developer", MODEL_PROVIDER: "anthropic", ANTHROPIC_BASE_URL: API, ANTHROPIC_API_KEY: "rig-stand-in", SMOKE_DISABLED: "1", ...extra }, stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; child.stdout.on("data", (d) => { out += d; }); child.stderr.on("data", (d) => { out += d; });
  for (let i = 0; i < 60; i += 1) { await new Promise((r) => setTimeout(r, 250)); try { const r = await fetch(`http://127.0.0.1:${port}/health`); if (r.status < 500) return { child, log: () => out }; } catch { /* starting */ } }
  throw new Error(`the agent did not start: ${out.slice(-400)}`);
}
async function chat(port, message) {
  const r = await fetch(`http://127.0.0.1:${port}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, tier: "standard" }) });
  const raw = await r.text(); const events = [];
  for (const f of raw.split("\n\n")) { const ev = /^event: (.+)$/m.exec(f)?.[1]; const data = /^data: (.+)$/m.exec(f)?.[1]; if (ev && data) events.push({ ev, data: JSON.parse(data) }); }
  return { status: r.status, events, done: events.find((e) => e.ev === "done")?.data ?? null, error: events.find((e) => e.ev === "error")?.data ?? null };
}

const A = await agent(5191);
try {
  const t = await chat(5191, "Rig check: is Sudan's airspace open, and what does EASA say about Russia?");
  const req0 = seen.find((b) => b.stream && b.messages.length === 1);
  const ws0 = req0?.tools?.find((x) => x.type === "web_search_20250305");
  ok(ws0 && ws0.allowed_domains?.includes("easa.europa.eu") && ws0.allowed_domains.includes("safeairspace.net") && ws0.user_location?.city === "Riga" && ws0.max_uses === 5, "round 1 offers the API's web search on the approved list only (official + industry), Riga, max 5", JSON.stringify(ws0 ?? null).slice(0, 160));
  ok(req0?.tools?.some((x) => x.name === "widen_web_search") && !req0?.tools?.some((x) => x.name === "tavily_search") && !req0?.tools?.some((x) => x.name === "web_search" && !x.type), "…and widen_web_search; no Tavily tool, and no client tool named web_search (the API's own owns that name)", (req0?.tools ?? []).map((x) => x.name).filter((n) => /search/.test(n)).join(" "));
  const req1 = seen.filter((b) => b.stream)[1];
  const echoed = req1?.messages?.find((m) => m.role === "assistant")?.content ?? [];
  ok(echoed.some((c) => c.type === "server_tool_use" && c.input?.query === "EASA CZIB Russia") && echoed.some((c) => c.type === "web_search_tool_result" && c.content?.[0]?.encrypted_content === "rig-enc"), "the API's own search blocks go back whole in the next round (their encrypted content is what citations need)");
  const ws2 = req1?.tools?.find((x) => x.type === "web_search_20250305");
  ok(ws2 && !ws2.allowed_domains, "after widen_web_search, the API's search is unrestricted (pass two)", JSON.stringify(ws2 ?? null).slice(0, 120));
  const d = t.done;
  ok(t.status === 200 && d && d.claims?.length === 3, "done carries the answer's three claims", `${t.status} · ${d?.claims?.length} · ${t.error ? JSON.stringify(t.error) : ""}`);
  const byHost = (h) => d?.sources?.find((s) => s.href?.includes(h));
  const reuters = d?.claims?.find((c) => c.n === byHost("reuters")?.n);
  ok(reuters?.mark?.startsWith("not from an official source: reuters.com"), "the Reuters claim carries the mark, on that claim", reuters?.mark);
  ok(d?.claims?.filter((c) => c.mark).length === 1, "…and only that one: the industry (SafeAirspace) and official (EASA) claims carry none");
  ok(byHost("reuters")?.domainClass === "other" && byHost("safeairspace")?.domainClass === "industry" && byHost("easa")?.domainClass === "official", "the sources are numbered and classed", d?.sources?.map((s) => `${s.n} ${s.domainClass ?? s.tier} ${s.host ?? ""}`).join(" · "));
  ok(!/So I'll search the news/.test(d?.content ?? "") && /So I'll search the news/.test(JSON.stringify(t.events.filter((e) => e.ev === "delta"))), "narration written before an in-response search streamed, and is not in the stored reply (8d)");
  const apiSteps = (d?.toolActivity ?? []).filter((a) => a.name === "web_search");
  ok(apiSteps.length === 3 && apiSteps.every((a) => /^Anthropic search · pass [12]/.test(a.summary)) && apiSteps.filter((a) => /pass 1/.test(a.summary)).length === 2, "the steps line lists each search, naming the provider and the pass, though there is only one provider", (d?.toolActivity ?? []).map((a) => `${a.name}: ${a.summary}`).join(" | "));
  ok(typeof d?.content === "string" && d.claims.every((c) => c.end <= d.content.length) && d.content.slice(d.claims[0].start, d.claims[0].end).startsWith("Sudan"), "spans index done.content (the stored reply)", d?.content?.slice(0, 60));
  // the stored message and the audit row
  const msg = (await (await fetch(`${SB}/rest/v1/agent_messages?conversation_id=eq.${d?.conversationId}&role=eq.assistant&select=content,blocks,sources&order=created_at.desc&limit=1`, { headers: H })).json())?.[0];
  ok(msg?.blocks?.claims?.length === 3 && msg.sources?.some((s) => s.domainClass === "other"), "the stored message keeps the claims and the classed sources (a reload shows the same)", `${msg?.blocks?.claims?.length} claims`);
  const auditRow = (await (await fetch(`${SB}/rest/v1/agent_audit_log?kind=eq.chat.response&conversation_id=eq.${d?.conversationId}&select=detail&limit=1`, { headers: H })).json())?.[0];
  const w = auditRow?.detail?.web;
  ok(w?.searches?.length === 3 && w.searches.map((s) => s.pass).join(",") === "1,1,2" && w.widened === true && w.anthropicSearches === 3 && w.provider === "anthropic", "the audit row has each search by provider and pass, and that the turn widened", JSON.stringify(w?.searches?.map((s) => `${s.provider}:${s.pass}`)));
  ok(auditRow?.detail?.citations?.marked === 1 && auditRow.detail.citations.claims === 3, "…and the citations: three claims, one marked", JSON.stringify(auditRow?.detail?.citations));
  ok((auditRow?.detail?.costUsd ?? 0) >= 0.03, "the turn's cost includes its three searches ($0.01 each)", auditRow?.detail?.costUsd);

  // ── 3. widen before any approved search is refused ──
  script = "widen-first"; seen.length = 0;
  const wf = await chat(5191, "Rig check: widen straight away.");
  const res1 = seen.filter((b) => b.stream)[1]?.messages?.at(-1)?.content?.find((c) => c.type === "tool_result");
  ok(res1?.is_error === true && /approved sources first/i.test(JSON.stringify(res1.content)), "widen_web_search before any approved search is refused, and says why", JSON.stringify(res1?.content ?? null).slice(0, 140));
  const ws1 = seen.filter((b) => b.stream)[1]?.tools?.find((x) => x.type === "web_search_20250305");
  ok(ws1?.allowed_domains?.length > 0, "…and the next round is still pass one", wf.done ? "answered" : "no answer");
  // ── 6. a search left pending next to widen_web_search runs under pass one, and pass two starts after it ──
  script = "pending"; seen.length = 0;
  const pd = await chat(5191, "Rig check: pending searches next to widen.");
  const calls = seen.filter((b) => b.stream);
  const wsOf = (b) => b?.tools?.find((x) => x.type === "web_search_20250305");
  ok(wsOf(calls[1])?.allowed_domains?.length > 0, "the request after widen still carries the approved list while a search the model asked for is unanswered (the API runs it under that request)", `${wsOf(calls[1])?.allowed_domains?.length ?? 0} domains`);
  ok(wsOf(calls[2]) && !wsOf(calls[2]).allowed_domains, "…and the round after it is pass two, unrestricted");
  const pdAudit = (await (await fetch(`${SB}/rest/v1/agent_audit_log?kind=eq.chat.response&conversation_id=eq.${pd.done?.conversationId}&select=detail&limit=1`, { headers: H })).json())?.[0]?.detail?.web;
  const ps = pdAudit?.searches?.find((s) => s.provider === "anthropic");
  ok(ps?.pass === 1 && ps.round === 1 && !ps.outsideApproved, "the pending search is labelled by the request it ran under (pass one, round 1), its result inside the list", JSON.stringify(ps));

  // ── 7. a reply that hands the reader a check the agent can make: the agent makes it, and the reader sees one answer.
  // Working out that it was needed is internal (2026-11-05): no partial-answer banner unless the check could not be made.
  script = "follow-up"; seen.length = 0;
  const fu = await chat(5191, "Rig check: what should I know about Sudan?");
  const fcalls = seen.filter((b) => b.stream);
  ok(fcalls.length === 3 && /hands the reader a check you can make yourself/.test(JSON.stringify(fcalls[1]?.messages?.at(-1) ?? "")), "the reply that said 'check the current HSSS NOTAMs' (the question named Sudan) is followed up: the model makes that check itself", `${fcalls.length} model calls`);
  ok(!fu.events.some((e) => e.ev === "partial") && fu.done?.thinking?.text?.includes("Check the current HSSS NOTAMs") && /^FULL:/.test(fu.done?.content ?? "") && !/Check the current HSSS NOTAMs/.test(fu.done?.content ?? ""), "the draft that pointed to the check goes to the thinking; the reader gets one answer, never a partial one shown first", (fu.done?.content ?? "").slice(0, 80));
  const nCall = fu.events.filter((e) => e.ev === "tool" && e.data.name === "get_notams");
  const nOk = nCall.some((e) => e.data.ok);
  ok(nOk ? !fu.done?.partial : /^The NOTAMs could not be checked: .+\.$/.test(fu.done?.partial?.line ?? ""), "a partial line only when the check could not be made, naming it and why — none when it was made", `get_notams ok=${nCall.map((e) => e.data.ok).join(",")} · ${fu.done?.partial?.line ?? "no partial line"}`);
  const fmsg = (await (await fetch(`${SB}/rest/v1/agent_messages?conversation_id=eq.${fu.done?.conversationId}&role=eq.assistant&select=content,blocks&limit=1`, { headers: H })).json())?.[0];
  ok(/^FULL:/.test(fmsg?.content ?? "") && (nOk ? !fmsg.blocks?.partial : fmsg.blocks?.partial?.line === fu.done?.partial?.line) && !fmsg?.blocks?.partial?.text, "stored the same way: a reload shows the one answer, and the missing check only if it was missing");
  const fuAudit = (await (await fetch(`${SB}/rest/v1/agent_audit_log?kind=eq.chat.response&conversation_id=eq.${fu.done?.conversationId}&select=detail&limit=1`, { headers: H })).json())?.[0]?.detail?.followUp;
  ok(fuAudit?.[0]?.kind === "check" && fuAudit[0].label === "the NOTAMs", "the audit row still records the follow-up the turn made, internal or not", JSON.stringify(fuAudit));
  const { deferredChecks, subjectsOf } = await import("../agent/lib/follow-up.mjs");
  const offered = new Set(["get_notams", "read_gen_document"]);
  const dc = (q, a, tools = offered) => deferredChecks(a, tools, subjectsOf(q)).length;
  ok(dc("Anything for LFMM?", "I did not check the NOTAMs for LFMM.") === 1 && deferredChecks("Then check GEN 1.2 for Bulgaria.", offered, subjectsOf("Does Bulgaria need a permit?"))[0]?.tool === "read_gen_document" && dc("Is Sudan open?", "Sudan's airspace is closed.") === 0 && dc("Anything for LFMM?", "Check the NOTAMs.", new Set()) === 0, "detection: a check handed to the reader on the asked subject, not a plain statement, and only for a tool the turn has");
  ok(dc("hey", "Hi! I can look up flights, airport documents, NOTAMs, weather and limitations. What do you need?") === 0 && dc("Any NOTAMs at EVRA?", "Give me an ICAO code and I'll check the NOTAMs.") === 0 && dc("Is Sudan open?", "This comes from the HSSS NOTAM A0073/26.") === 0 && dc("Anything for LFMM?", "Also check the NOTAMs for EGLL.") === 0, "…never: a capability offered, a request for what it needs, a source it already used, another airport than the one asked about, or any turn whose question named no subject");

  // ── 8. what a turn must do in code before it may answer (2026-11-04) ──
  const { nextAction } = await import("../agent/lib/turn-policy.mjs");
  const na = (t, cited = true) => nextAction({ reply: { text: t, blocks: cited ? [{ citations: [{ type: "web_search_result_location", url: "https://acukwik.com/x" }] }] : [] }, turn: { searches: [{ pass: 1, results: 10 }], widened: false }, policy: { mustSearch: true, kinds: ["handling and FBO"] }, webAvailable: true, done: new Set() })?.kind ?? null;
  ok(na("Handling is not mandatory. I did not widen the search to forums or blogs.") === "widen" && na("X.\n\n**What I could not establish**\n- crew reports") === "widen" && na("Nothing useful.", false) === "widen" && na("Handling is not mandatory.") === null, "pass one alone that cites nothing, or admits a part it could not establish, widens; a fully answered pass one does not (prompt 5)");
  {
    // an offer to search owes a search only when the question named something (2026-11-05, production: "what can you do"
    // → "I can … search the web" was taken for an offer and spent a turn searching nothing)
    const { subjectsOf: sOf } = await import("../agent/lib/follow-up.mjs");
    const offer = (q, t) => nextAction({ reply: { text: t, blocks: [] }, turn: { searches: [], widened: false }, policy: { mustSearch: false, kinds: [], subjects: sOf(q) }, webAvailable: true, done: new Set() })?.kind ?? null;
    ok(offer("what can you do", "I can look up flights, read AIPs and search the web if you want.") === null && offer("Is there fuel at DAAT?", "I can search the wider web if you want.") === "search", "a capability that mentions searching owes nothing when nothing was asked; an offer to search about a named place still searches");
  }
  script = "must-search"; seen.length = 0;
  const ms = await chat(5191, "Rig check: does Bulgaria require a landing permit?");
  const mcalls = seen.filter((b) => b.stream);
  const msSearches = (ms.done?.toolActivity ?? []).filter((a) => a.name === "web_search").length;
  ok(/always searched/.test(JSON.stringify(mcalls[1]?.messages?.at(-1) ?? "")) && msSearches === 1, "a permit question answered without a search is sent back to search: a rule in code, not a hope in the prompt", `${msSearches} search(es)`);
  ok(!ms.done?.partial && ms.done?.thinking?.text?.includes("I can search the wider web") && /^Yes: SafeAirspace/.test(ms.done?.content ?? ""), "the offer to search goes to the thinking; the searched answer is the one answer, with no partial banner", (ms.done?.content ?? "").slice(0, 60));
  script = "empty-pass-one"; seen.length = 0;
  const ep = await chat(5191, "Rig check: what do crews say about handling at the desert strip?");
  const epCalls = seen.filter((b) => b.stream).map((b) => b.tools?.find((x) => x.type === "web_search_20250305"));
  ok(epCalls.length === 2 && epCalls[0]?.allowed_domains?.length > 0 && epCalls[1] && !epCalls[1].allowed_domains, "pass one found nothing citable: pass two opens in code and the second search is unrestricted", epCalls.map((t) => (t?.allowed_domains ? "pass 1" : "pass 2")).join(", "));
  ok(!ep.done?.partial && /Crews report/.test(ep.done?.content ?? "") && ep.done?.thinking?.text?.includes("The approved sources had nothing"), "…and the reader sees only the widened answer; the empty first one is in the thinking");
  script = "uncited"; seen.length = 0;
  const un = await chat(5191, "Rig check: permits for the micronation?");
  ok(/cannot trace to a source/.test(JSON.stringify(seen.filter((b) => b.stream)[1]?.messages?.at(-1) ?? "")) && !/Norway/.test(un.done?.content ?? "") && /^SafeAirspace lists nothing for it\.$/.test(un.done?.content ?? ""), "a searched answer with an uncited sentence is sent back once; the reply has no unsourced substance", (un.done?.content ?? "").slice(0, 90));
  ok(!un.done?.partial && un.done?.thinking?.text?.includes("Norway"), "the defective draft is not shown as an answer (it is in the thinking, where it can be read)");
  const unAudit = (await (await fetch(`${SB}/rest/v1/agent_audit_log?kind=eq.chat.response&conversation_id=eq.${un.done?.conversationId}&select=detail&limit=1`, { headers: H })).json())?.[0]?.detail?.claimAudit;
  ok(unAudit?.[0]?.unsourced === 1 && unAudit?.[1]?.after === true && unAudit[1].unsourced === 0, "the audit row has the claim audit, before and after the redraft", JSON.stringify(unAudit?.map((a) => `${a.after ? "after" : "draft"} ${a.unsourced}/${a.absences}`)));
  script = "still-uncited"; seen.length = 0;
  const su = await chat(5191, "Rig check: permits for the micronation, again?");
  const suMark = (su.done?.claims ?? []).find((c) => c.mark === "no source given");
  ok(suMark && (su.done?.content ?? "").slice(suMark.start, suMark.end).startsWith("Norway administers"), "a sentence still unsourced after the redraft is marked 'no source given' beside it, so it cannot pass unmarked", suMark ? (su.done.content ?? "").slice(suMark.start, suMark.end).slice(0, 50) : JSON.stringify(su.done?.claims));
  script = "absence"; seen.length = 0;
  const ab = await chat(5191, "Rig check: anything for Marseille?");
  ok(/an absence about the world/.test(JSON.stringify(seen.filter((b) => b.stream)[1]?.messages?.at(-1) ?? "")) && /^No limitations are recorded in Clearway/.test(ab.done?.content ?? ""), "case seven: 'no restrictions' from nothing is sent back; the reply says what was recorded where, and what was not checked", (ab.done?.content ?? "").slice(0, 80));
  script = "orphan"; seen.length = 0;
  const or = await chat(5191, "Rig check: tell me about Khartoum.");
  ok(or.done && /^FULL:/.test(or.done.content ?? "") && !JSON.stringify(seen.filter((b) => b.stream)[1]?.messages ?? []).includes("srvtoolu_orphan"), "a search the model never got an answer to is left out of what is sent back after a follow-up (question 7's refusal)", or.error ? JSON.stringify(or.error) : (or.done?.content ?? "").slice(0, 40));
  script = "names"; seen.length = 0;
  const nm = await chat(5191, "Rig check: tell me about DAAT.");
  ok(nm.done?.content === "Tamanrasset (DAAT) is a desert aerodrome and Tamanrasset (DAAT) has one runway.", "the checked name is the only name a code carries: 'Djanet (DAAT)' and {{DAAT}} both become 'Tamanrasset (DAAT)'", nm.done?.content);
  const nmAudit = (await (await fetch(`${SB}/rest/v1/agent_audit_log?kind=eq.chat.response&conversation_id=eq.${nm.done?.conversationId}&select=detail&limit=1`, { headers: H })).json())?.[0]?.detail?.nameCorrections;
  ok(nmAudit?.[0]?.from === "Djanet" && nmAudit[0].to === "Tamanrasset", "the correction is recorded on the audit row", JSON.stringify(nmAudit));

  // ── 5. the question check: a code that does not match its place name is asked about, and nothing is searched ──
  script = "turn"; seen.length = 0;
  const q1 = await chat(5191, "Do you need to submit API or flight to Hong Kong ZSPD same as for flight to Macao VHHH.");
  ok(/ZSPD is Shanghai Pudong/.test(q1.done?.content ?? "") && /Which pair did you mean/.test(q1.done?.content ?? ""), "question 1 as written gets a question back, naming what each code actually is", (q1.done?.content ?? JSON.stringify(q1.error)).slice(0, 120));
  ok(seen.filter((b) => b.stream).length === 0 && q1.done?.routing?.source === "question-check", "…and nothing was searched: no turn, no web search (the router was not even asked)", `${seen.filter((b) => b.stream).length} turn call(s)`);
  const { candidateCodes, datesIn } = await import("../agent/lib/question-check.mjs");
  ok(JSON.stringify(candidateCodes("Direct flight possible? LTBS-LCLK, UDYZ-UBBB. B735 with 64PAX, FBO or GAT, ASAP")) === JSON.stringify(["LTBS", "LCLK", "UDYZ", "UBBB"]), "codes: four capitals standing alone, routes split, aircraft types, PAX and plain words left out");
  const d10 = datesIn("Any restrictions for Marsell FIR LFMM for 08Oct2026?", now)[0];
  ok(d10?.iso === "2026-10-08" && d10.past === true && d10.days === -26, "08Oct2026 on 3 Nov resolves to 8 October 2026, 26 days ago (past)", JSON.stringify(d10));
} finally { A.child.kill(); }

// ── 4. the ceiling reached mid-turn ──
script = "ceiling"; seen.length = 0;
// from an empty day: the rig's real-model suites spend from the same ledger, and a day already past $2 would refuse the
// first round instead of the second (2026-11-05). Today's row is restored as it was at the end.
await fetch(`${SB}/rest/v1/agent_settings?id=eq.spend:${day}`, { method: "DELETE", headers: H });
const C = await agent(5192, { AGENT_DAILY_CEILING_USD: "2" });
try {
  const c = await chat(5192, "Rig check: a search-heavy question at the ceiling.");
  const answered = JSON.stringify(c.events).includes("ANSWERED UNSEARCHED");
  ok(!answered && seen.filter((b) => b.stream).length === 1, "after the round that crossed the ceiling, no further model call is made: it cannot answer unsearched", `${seen.filter((b) => b.stream).length} model call(s)`);
  ok(c.error && /stopped for today|daily/i.test(JSON.stringify(c.error)), "the person is told the agent has stopped for today", JSON.stringify(c.error ?? c.done ?? null).slice(0, 200));
} finally { C.child.kill(); }

// restore today's spend row as it was
if (spendBefore) await fetch(`${SB}/rest/v1/agent_settings?on_conflict=id`, { method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([spendBefore]) });
else await fetch(`${SB}/rest/v1/agent_settings?id=eq.spend:${day}`, { method: "DELETE", headers: H });
api.close();
console.log(failures ? `${failures} FAILED` : "ALL PASSED"); process.exit(failures ? 1 : 0);
