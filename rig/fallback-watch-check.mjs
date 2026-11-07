// Falling back quietly (2026-11-03): every fallback is recorded with why, and the rate alarms. The model client's
// trace, the watch's thresholds and its alarm, with invented audit rows and a stand-in for the alert.
//   node --env-file=.env.rig rig/fallback-watch-check.mjs
import http from "node:http";
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 160)}` : ""}`); if (!c) failures += 1; };
const w = await import("../agent/lib/fallback-watch.mjs");
const { rest } = await import("../agent/lib/knowledge/retrieval.mjs");

// 1. the model client says when it fell back, and why (a stand-in API: the primary is "not found", the fallback answers)
const api = http.createServer(async (req, res) => { let b = ""; for await (const c of req) b += c; const body = JSON.parse(b || "{}");
  if (body.model === "claude-rig-primary") { res.writeHead(404, { "content-type": "application/json" }); return res.end(JSON.stringify({ type: "error", error: { type: "not_found_error", message: "model: claude-rig-primary" } })); }
  res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ content: [{ type: "text", text: "OK" }], stop_reason: "end_turn", usage: { input_tokens: 3, output_tokens: 1 } })); });
await new Promise((r) => api.listen(0, "127.0.0.1", r));
Object.assign(process.env, { MODEL_PROVIDER: "anthropic", ANTHROPIC_BASE_URL: `http://127.0.0.1:${api.address().port}`, ANTHROPIC_API_KEY: "rig-stand-in", ANTHROPIC_MODEL_FAST: "claude-rig-primary" });
const models = await import("../agent/lib/models.mjs"); const cfg = models.loadModelConfig({ reload: true }); cfg.tiers.fast.fallbackId = "claude-haiku-5-5";
const { converseOnce } = await import("../agent/lib/bedrock.mjs");
const once = await converseOnce({ tier: "fast", messages: [{ role: "user", content: "x" }], maxTokens: 8 });
ok(once.modelId === "claude-haiku-5-5" && once.fallback?.kind === "model" && once.fallback.from === "claude-rig-primary" && /^model_unavailable; the detail is in the server log$/.test(once.fallback.reason), "a model fallback is returned with the call: from, to, and why (the kind of failure; the provider's own text only in the log, 2026-11-07)", JSON.stringify(once.fallback));
api.close();

// 2. the thresholds
const turn = (fb) => ({ detail: fb === "router-old" ? { route: { source: "fallback" } } : fb ? { fallbacks: [{ kind: fb }] } : { fallbacks: [] } });
let v = w.judge({ chatRows: [turn(null), turn(null)] });
ok(v.chat.problem === null, "no fallback: no alarm");
v = w.judge({ chatRows: [{ detail: { fallbacks: [{ kind: "router", reason: "router unavailable" }] } }] });
ok(/1 of 1 chat turn/.test(v.chat.problem ?? "") && /router: router unavailable/.test(v.chat.problem) && v.chat.rule === "any", "at today's volume ONE fallback alarms, with its reason (one turn in the window is 100% of it)", v.chat.problem);
v = w.judge({ chatRows: [turn("model"), ...Array(9).fill(turn(null))] });
ok(v.chat.problem !== null, "one fallback in ten turns (under the 20-turn switch): alarm");
v = w.judge({ chatRows: [turn("router-old")] });
ok(/1 of 1/.test(v.chat.problem ?? ""), "rows from before the trace (route.source fallback) count too");
v = w.judge({ chatRows: [turn("model"), turn("model"), ...Array(23).fill(turn(null))] });
ok(v.chat.rule === "share" && v.chat.problem === null, `from ${w.SWITCH_AT} turns in a window the share rule takes over: 2 of 25 does not alarm`);
v = w.judge({ chatRows: [turn("model"), turn("model"), turn("router"), turn("model"), ...Array(21).fill(turn(null))] });
ok(v.chat.rule === "share" && /4 of 25/.test(v.chat.problem ?? ""), "4 of 25 (at least 3, at least 15%) alarms under the share rule");
v = w.judge({ uploadRows: [{ detail: { fallbacks: [{ kind: "ingest-classify" }] } }] });
ok(/1 knowledge upload/.test(v.ingest.problem ?? ""), "any tier proposal that fell back: alarm (each is a model that did not answer)");
const sendRow = (from) => ({ delivery_detail: { fallback: { kind: "sender", from, to: "no-reply@verxyl.com" } } });
v = w.judge({ senderRows: [sendRow("Clearway <no-reply@clearway.verxyl.com>")], domains: { "clearway.verxyl.com": "pending", "verxyl.com": "verified" } });
ok(v.sender.problem === null && v.sender.exempt === 1, "a sender fallback while Resend reports the domain not verified: exempt (expected until the DNS is in)");
v = w.judge({ senderRows: [sendRow("Clearway <no-reply@clearway.verxyl.com>")], domains: { "clearway.verxyl.com": "verified" } });
ok(/clearway\.verxyl\.com is verified/.test(v.sender.problem ?? ""), "once Resend reports it verified, the exemption lapses by itself: a sender fallback alarms", v.sender.problem);
v = w.judge({ senderRows: [sendRow("no-reply@clearway.verxyl.com")], domains: null });
ok(/Resend could not be asked/.test(v.sender.problem ?? ""), "Resend cannot be asked: no exemption, it alarms");

// 3. the alarm: once, again a day later, back to normal; an alert not sent is not counted
const before = await rest("agent_settings?id=eq.fallbacks%3Alast&select=reason").catch(() => null);
await rest("agent_settings?id=eq.fallbacks%3Alast", { method: "DELETE" }).catch(() => {});
const told = []; let accept = true; const send = async (t) => (told.push(t), accept);
const bad = { chatRows: [turn("router"), turn("router")] }, good = { chatRows: [turn(null)] };
const T = Date.parse("2026-11-03T12:00:00Z");
try {
  await w.checkFallbacks({ now: T, input: bad, send });
  ok(told.length === 1 && /✗ 2 of 2 chat turns/.test(told[0]), "fallbacks over the threshold: alerted", told[0]);
  await w.checkFallbacks({ now: T + 3600_000, input: bad, send });
  ok(told.length === 1, "an hour later, still: not alerted again the same day");
  accept = false; await w.checkFallbacks({ now: T + 25 * 3600_000, input: bad, send });
  accept = true; await w.checkFallbacks({ now: T + 26 * 3600_000, input: bad, send });
  ok(told.length === 3 && /✗/.test(told[2]), "a day later: alerted again; an alert Telegram refused is tried again next hour");
  await w.checkFallbacks({ now: T + 27 * 3600_000, input: good, send });
  ok(told.length === 4 && /back to normal/.test(told[3]), "it clears: said so");
  const r = await w.checkFallbacks({ now: T + 28 * 3600_000, input: { get chatRows() { throw new Error("audit log unreachable"); } }, send });
  ok(/could not read the audit log/.test(r.verdict.read?.problem ?? "") && /could not read/.test(told.at(-1)), "the audit log cannot be read: alarmed, never 'no fallbacks'");
  ok(w.startFallbackWatch() === false, "the watch does not start on a rig");
} finally {
  await rest("agent_settings?id=eq.fallbacks%3Alast", { method: "DELETE" }).catch(() => {});
  if (before?.[0]) await rest("agent_settings", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ id: "fallbacks:last", enabled: true, reason: before[0].reason }]) }).catch(() => {});
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
