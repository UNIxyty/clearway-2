// Web search, two passes and citations, through the WIRING (2026-11-03). The Leon verdict taught it: a check that calls
// a function passes while the route that should carry its result does not. So this one starts a real agent server
// (agent/server.mjs) against a stand-in for the Messages API and one for Tavily, asks /api/chat one question, and reads
// what the person would get: the SSE `done` event and the stored message. No key, no network.
//
//   1. the pure parts: domains cover subdomains; the mark sits on a claim whose every source is unapproved, never on an
//      industry or official one; dates as the mark shows them
//   2. a whole turn: pass one (the API's web_search with allowed_domains, Riga by city; Tavily with include_domains) →
//      widen_web_search → pass two unrestricted; the API's own blocks sent back whole; Tavily's results sent to the
//      model as search_result blocks; claims + numbered sources + the mark in `done` and in the stored message; the
//      searches by pass on the audit row; the turn's cost includes the searches
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
    { text: " SafeAirspace rates it do-not-fly.", citations: [{ type: "search_result_location", source: "https://safeairspace.net/sudan/", title: "safeairspace.net — Sudan" }] },
    { text: " Both agree on the west.", citations: [{ type: "web_search_result_location", url: "https://www.reuters.com/world/africa/x" }, { type: "web_search_result_location", url: "https://www.easa.europa.eu/czib" }] },
    { text: " Our manual forbids it.", citations: [{ type: "search_result_location", source: "kb:doc-1#p4", title: "Ops Manual, p. 4" }] },
    { text: " That is all." },
  ];
  const answer = "Thinking aloud before a tool. " + blocks.map((b) => b.text).join("");
  const r = citationsToClaims({ answer: blocks.map((b) => b.text).join(""), answerBlocks: blocks, sources: [{ n: 1, tier: "company", documentId: "doc-1", label: "Ops Manual" }], web: { settings: S, results: [{ url: "https://www.reuters.com/world/africa/x", title: "Sudan", pageAge: "1 day ago", pass: 2 }] }, toolCalls: [{ name: "tavily_search", ok: true, result: { pass: 1, results: [{ url: "https://safeairspace.net/sudan/", title: "Sudan", published: "2026-10-30" }] } }], now });
  const [c1, c2, c3, c4] = r.claims;
  ok(r.claims.length === 4, "one claim per cited block; the uncited one is the agent's own words", r.claims.length);
  ok(c1.mark === "not from an official source: reuters.com, 2 Nov", "a claim resting only on an unapproved source carries the mark, with host and date", c1.mark);
  ok(!c2.mark && !c3.mark && !c4.mark, "no mark on an industry claim, on a claim one official source also supports, or on the company's own document");
  ok(c4.n === 1 && r.sources.length === 4, "the knowledge base citation maps to the document's existing source; each web page is one numbered source", r.sources.map((s) => `${s.n}:${s.tierLabel ?? s.tier}`).join(" "));
  ok(r.sources.find((s) => s.href?.includes("reuters"))?.tierLabel === "Web · not approved" && r.sources.find((s) => s.href?.includes("safeairspace"))?.tierLabel === "Industry reference" && r.sources.find((s) => s.href?.includes("easa"))?.tierLabel === "Official", "each web source says what it is: Official, Industry reference, Web · not approved");
  const off = citationsToClaims({ answer, answerBlocks: blocks, sources: [], web: { settings: S, results: [] }, now });
  ok(off.claims[0]?.start === "Thinking aloud before a tool. ".length, "spans index the stored reply, after any text that was taken out as thinking", off.claims[0]?.start);
  const bad = citationsToClaims({ answer: "Something else entirely.", answerBlocks: blocks, sources: [], web: { settings: S }, now });
  ok(bad.claims.length === 0 && bad.dropped, "cited text that is not the stored reply places no claim, and says why (never a misplaced underline)", bad.dropped);
}

// ── 2. a whole turn through the route ─────────────────────────────────────────────────────────────────────────────
const seen = []; const tavilySeen = []; let script = "turn";
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
  if (req.url.startsWith("/search")) { tavilySeen.push(body); res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ results: [{ title: "Sudan", url: "https://safeairspace.net/sudan/", content: "Sudan: do not fly. Risk level one.", published_date: "2026-10-30" }] })); }
  seen.push(body);
  // the API's own rule (measured 2026-11-03), so the stand-in cannot accept what production refuses
  const mixed = (body.messages ?? []).some((m) => Array.isArray(m.content) && m.content.some((c) => c.type === "tool_result" && Array.isArray(c.content) && c.content.some((x) => x.type === "search_result") && c.content.some((x) => x.type !== "search_result")));
  if (mixed) { res.writeHead(400, { "content-type": "application/json" }); return res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "tool_result: if any blocks in a tool result are of type `search_result`, all blocks must be of that type" } })); }
  // the question check (lib/question-check.mjs): a mismatch in the rig's question gets the question back
  if (!body.stream && /You check a flight dispatcher's question/.test(JSON.stringify(body.system ?? ""))) {
    const q = JSON.stringify(body.messages ?? "");
    const verdict = /ZSPD/.test(q)
      ? { codes: [{ code: "ZSPD", is: "Shanghai Pudong, China", kind: "aerodrome", writtenAs: "Hong Kong", mismatch: true }, { code: "VHHH", is: "Hong Kong International", kind: "aerodrome", writtenAs: "Macao", mismatch: true }], ask: "You've written Hong Kong ZSPD and Macao VHHH, but ZSPD is Shanghai Pudong and VHHH is Hong Kong — Macao is VMMC. Which pair did you mean?\n• Hong Kong VHHH and Macao VMMC\n• Shanghai ZSPD and Hong Kong VHHH" }
      : { codes: [{ code: "EVRA", is: "Riga International, Latvia", kind: "aerodrome", writtenAs: null, mismatch: false }], ask: null };
    res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(verdict) }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } }));
  }
  const isRouter = !(body.tools ?? []).length && /classif|tier/i.test(JSON.stringify(body.system ?? "")) ;
  if (isRouter || !body.stream) { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ content: [{ type: "text", text: '{"tier":"standard","confidence":0.9,"reason":"rig"}' }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } })); }
  const round = body.messages.filter((m) => m.role === "assistant").length;
  if (script === "turn") {
    if (round === 0) return sse(res, [start(), ...search(0, "srvtoolu_rig1", "EASA CZIB Russia", [{ url: "https://www.easa.europa.eu/en/czib/russia", title: "CZIB Russia" }]), ...toolUse(2, "toolu_rig_t", "tavily_search", { query: "Sudan airspace" }), end("tool_use", 1)]);
    if (round === 1) return sse(res, [start(), ...toolUse(0, "toolu_rig_w", "widen_web_search", { reason: "current news on Sudan" }), end("tool_use")]);
    return sse(res, [start(), ...search(0, "srvtoolu_rig2", "Sudan airspace news", [{ url: "https://www.reuters.com/world/africa/sudan-airspace", title: "Sudan airspace" }]),
      ...text(2, "Sudan's airspace is closed east of Khartoum.", [{ type: "web_search_result_location", url: "https://www.reuters.com/world/africa/sudan-airspace", title: "Sudan airspace", cited_text: "closed", encrypted_index: "x" }]),
      ...text(3, " SafeAirspace rates Sudan do-not-fly.", [{ type: "search_result_location", source: "https://safeairspace.net/sudan/", title: "safeairspace.net — Sudan", cited_text: "do not fly", search_result_index: 0, start_block_index: 0, end_block_index: 0 }]),
      ...text(4, " EASA advises against Russian airspace.", [{ type: "web_search_result_location", url: "https://www.easa.europa.eu/en/czib/russia", title: "CZIB Russia", cited_text: "advises", encrypted_index: "y" }]),
      end("end_turn", 1)]);
  }
  if (script === "pending") {
    // what production did (2026-11-03): searches asked for in the same response as widen_web_search, left without results
    const pending = [{ type: "content_block_start", index: 1, content_block: { type: "server_tool_use", id: "srvtoolu_pend", name: "web_search", input: {} } }, { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"query":"Yerevan Baku flights"}' } }];
    if (round === 0) return sse(res, [start(), ...toolUse(0, "toolu_p_t", "tavily_search", { query: "Armenia" }), ...pending, ...toolUse(2, "toolu_p_w", "widen_web_search", { reason: "news" }), end("tool_use", 0)]);
    // the API answers the pending search at the start of the next request, under that request's settings
    if (round === 1) return sse(res, [start(), { type: "content_block_start", index: 0, content_block: { type: "web_search_tool_result", tool_use_id: "srvtoolu_pend", content: [{ type: "web_search_result", url: "https://ops.group/armenia", title: "Armenia", encrypted_content: "e", page_age: "2 days ago" }] } }, ...toolUse(1, "toolu_p_t2", "tavily_search", { query: "Armenia news" }), end("tool_use", 1)]);
    return sse(res, [start(), ...text(0, "Done."), end("end_turn")]);
  }
  if (script === "widen-first") {
    if (round === 0) return sse(res, [start(), ...toolUse(0, "toolu_rig_w0", "widen_web_search", { reason: "skip ahead" }), end("tool_use")]);
    return sse(res, [start(), ...text(0, "I could not establish this."), end("end_turn")]);
  }
  if (script === "ceiling") {
    // the first round costs more than the ceiling (1,000,000 input tokens on the standard tier); the second must not happen
    if (round === 0) return sse(res, [start(), ...toolUse(0, "toolu_rig_c", "tavily_search", { query: "Sudan" }), end("tool_use", 0, 1_000_000)]);
    return sse(res, [start(), ...text(0, "ANSWERED UNSEARCHED"), end("end_turn")]);
  }
});
await new Promise((r) => api.listen(0, "127.0.0.1", r));
const API = `http://127.0.0.1:${api.address().port}`;

// today's spend row, restored at the end: the ceiling test must not leave the rig's agent closer to its ceiling
const day = new Date().toISOString().slice(0, 10);
const spendBefore = (await (await fetch(`${SB}/rest/v1/agent_settings?id=eq.spend:${day}&select=*`, { headers: H })).json())?.[0] ?? null;

async function agent(port, extra = {}) {
  const child = spawn("node", ["--env-file=.env.rig", "agent/server.mjs"], { env: { ...process.env, PORT: String(port), DISABLE_AUTH_FOR_TESTING: "true", AGENT_TEST_ROLE: "developer", MODEL_PROVIDER: "anthropic", ANTHROPIC_BASE_URL: API, ANTHROPIC_API_KEY: "rig-stand-in", TAVILY_API_KEY: "rig-stand-in", TAVILY_BASE_URL: API, AGENT_WEB_PROVIDER: "both", SMOKE_DISABLED: "1", ...extra }, stdio: ["ignore", "pipe", "pipe"] });
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
  ok(["tavily_search", "widen_web_search"].every((n) => req0?.tools?.some((x) => x.name === n)) && !req0?.tools?.some((x) => x.name === "web_search" && !x.type), "…and both client tools, with no client tool named web_search (the API's own owns that name)");
  ok(tavilySeen[0]?.include_domains?.includes("easa.europa.eu") && tavilySeen[0].include_domains.includes("ops.group"), "Tavily's first search is pass one: include_domains is the approved list", (tavilySeen[0]?.include_domains ?? []).length);
  const req1 = seen.filter((b) => b.stream)[1];
  const echoed = req1?.messages?.find((m) => m.role === "assistant")?.content ?? [];
  ok(echoed.some((c) => c.type === "server_tool_use" && c.input?.query === "EASA CZIB Russia") && echoed.some((c) => c.type === "web_search_tool_result" && c.content?.[0]?.encrypted_content === "rig-enc"), "the API's own search blocks go back whole in the next round (their encrypted content is what citations need)");
  const tr = req1?.messages?.at(-1)?.content?.find((c) => c.type === "tool_result");
  ok(tr?.content?.some((c) => c.type === "search_result" && c.source === "https://safeairspace.net/sudan/" && c.citations?.enabled === true) && tr.content.every((c) => c.type === "search_result"), "Tavily's results reach the model as citable search_result blocks, and nothing else in that result (the API's rule)", JSON.stringify(tr?.content?.map((c) => c.type)));
  ok(req1?.messages?.at(-1)?.content?.some((c) => c.type === "text" && /tavily_search .* also returned/.test(c.text) && /pass/.test(c.text)), "…the tool's note and pass go beside it, as text after the results");
  const req2 = seen.filter((b) => b.stream)[2];
  const ws2 = req2?.tools?.find((x) => x.type === "web_search_20250305");
  ok(ws2 && !ws2.allowed_domains, "after widen_web_search, the API's search is unrestricted (pass two)", JSON.stringify(ws2 ?? null).slice(0, 120));
  const d = t.done;
  ok(t.status === 200 && d && d.claims?.length === 3, "done carries the answer's three claims", `${t.status} · ${d?.claims?.length} · ${t.error ? JSON.stringify(t.error) : ""}`);
  const byHost = (h) => d?.sources?.find((s) => s.href?.includes(h));
  const reuters = d?.claims?.find((c) => c.n === byHost("reuters")?.n);
  ok(reuters?.mark?.startsWith("not from an official source: reuters.com"), "the Reuters claim carries the mark, on that claim", reuters?.mark);
  ok(d?.claims?.filter((c) => c.mark).length === 1, "…and only that one: the industry (SafeAirspace) and official (EASA) claims carry none");
  ok(byHost("reuters")?.domainClass === "other" && byHost("safeairspace")?.domainClass === "industry" && byHost("easa")?.domainClass === "official", "the sources are numbered and classed", d?.sources?.map((s) => `${s.n} ${s.domainClass ?? s.tier} ${s.host ?? ""}`).join(" · "));
  ok(typeof d?.content === "string" && d.claims.every((c) => c.end <= d.content.length) && d.content.slice(d.claims[0].start, d.claims[0].end).startsWith("Sudan"), "spans index done.content (the stored reply)", d?.content?.slice(0, 60));
  // the stored message and the audit row
  const msg = (await (await fetch(`${SB}/rest/v1/agent_messages?conversation_id=eq.${d?.conversationId}&role=eq.assistant&select=content,blocks,sources&order=created_at.desc&limit=1`, { headers: H })).json())?.[0];
  ok(msg?.blocks?.claims?.length === 3 && msg.sources?.some((s) => s.domainClass === "other"), "the stored message keeps the claims and the classed sources (a reload shows the same)", `${msg?.blocks?.claims?.length} claims`);
  const auditRow = (await (await fetch(`${SB}/rest/v1/agent_audit_log?kind=eq.chat.response&conversation_id=eq.${d?.conversationId}&select=detail&limit=1`, { headers: H })).json())?.[0];
  const w = auditRow?.detail?.web;
  ok(w?.searches?.length === 3 && w.searches.map((s) => s.pass).join(",") === "1,1,2" && w.widened === true && w.anthropicSearches === 2 && w.tavilySearches === 1, "the audit row has each search by provider and pass, and that the turn widened", JSON.stringify(w?.searches?.map((s) => `${s.provider}:${s.pass}`)));
  ok(auditRow?.detail?.citations?.marked === 1 && auditRow.detail.citations.claims === 3, "…and the citations: three claims, one marked", JSON.stringify(auditRow?.detail?.citations));
  ok((auditRow?.detail?.costUsd ?? 0) >= 0.028, "the turn's cost includes two API searches ($0.01 each) and one Tavily search ($0.008)", auditRow?.detail?.costUsd);

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

  // ── 5. the question check: a code that does not match its place name is asked about, and nothing is searched ──
  script = "turn"; seen.length = 0; tavilySeen.length = 0;
  const q1 = await chat(5191, "Do you need to submit API or flight to Hong Kong ZSPD same as for flight to Macao VHHH.");
  ok(/ZSPD is Shanghai Pudong/.test(q1.done?.content ?? "") && /Which pair did you mean/.test(q1.done?.content ?? ""), "question 1 as written gets a question back, naming what each code actually is", (q1.done?.content ?? JSON.stringify(q1.error)).slice(0, 120));
  ok(seen.filter((b) => b.stream).length === 0 && tavilySeen.length === 0 && q1.done?.routing?.source === "question-check", "…and nothing was searched: no turn, no web search (the router was not even asked)", `${seen.filter((b) => b.stream).length} turn call(s), ${tavilySeen.length} Tavily`);
  const { candidateCodes, datesIn } = await import("../agent/lib/question-check.mjs");
  ok(JSON.stringify(candidateCodes("Direct flight possible? LTBS-LCLK, UDYZ-UBBB. B735 with 64PAX, FBO or GAT, ASAP")) === JSON.stringify(["LTBS", "LCLK", "UDYZ", "UBBB"]), "codes: four capitals standing alone, routes split, aircraft types, PAX and plain words left out");
  const d10 = datesIn("Any restrictions for Marsell FIR LFMM for 08Oct2026?", now)[0];
  ok(d10?.iso === "2026-10-08" && d10.past === true && d10.days === -26, "08Oct2026 on 3 Nov resolves to 8 October 2026, 26 days ago (past)", JSON.stringify(d10));
} finally { A.child.kill(); }

// ── 4. the ceiling reached mid-turn ──
script = "ceiling"; seen.length = 0;
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
