// The scheduled smoke calls' alarm (agent/lib/smoke.mjs) and the wall's watch over them (digital-wall/lib/
// agent-smoke-watch.mjs), without a model and without Telegram: the smokes are replaced by stand-ins, Telegram by a
// local stand-in that can accept or refuse, and the clock is passed in. The record is the rig database's
// agent_settings row `smoke:last`.        node --env-file=.env.rig rig/smoke-alarm-check.mjs
import http from "node:http";
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 160)}` : ""}`); if (!c) failures += 1; };
const sent = []; let refuse = false;
const tg = http.createServer(async (req, res) => { let b = ""; for await (const c of req) b += c; if (refuse) { res.writeHead(403, { "content-type": "application/json" }); return res.end(JSON.stringify({ ok: false, description: "rig: refused" })); } sent.push(JSON.parse(b).text); res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true })); });
await new Promise((r) => tg.listen(0, "127.0.0.1", r));
Object.assign(process.env, { TELEGRAM_API_BASE: `http://127.0.0.1:${tg.address().port}`, TELEGRAM_BUG_BOT_TOKEN: "rig-not-a-token", TELEGRAM_BUG_ALLOWED_CHAT_IDS: "1" });
const smoke = await import("../agent/lib/smoke.mjs");
const watch = await import("../digital-wall/lib/agent-smoke-watch.mjs");
const { rest } = await import("../agent/lib/knowledge/retrieval.mjs");
const saved = { ...smoke.SMOKES }; for (const k of Object.keys(smoke.SMOKES)) delete smoke.SMOKES[k];
let fail = false;
smoke.SMOKES.alpha = async () => "fine";
smoke.SMOKES.beta = async () => { if (fail) throw Object.assign(new Error("rig: refused by the API"), { status: 403 }); return "fine"; };
const T0 = Date.parse("2026-11-03T06:00:00Z"); const at = (h) => () => new Date(T0 + h * 3600_000);
const before = await rest("agent_settings?id=eq.smoke%3Alast&select=reason").catch(() => null);
await rest("agent_settings?id=eq.smoke%3Alast", { method: "DELETE" }).catch(() => {});
try {
  ok(smoke.startSmokeSchedule() === false, "the schedule does not start on a rig (local database)");
  let r = await smoke.runSmokes({ now: at(0) });
  ok(sent.length === 0 && r.results.alpha.ok && r.results.beta.ok, "all working: no alert, the run recorded");
  fail = true; r = await smoke.runSmokes({ now: at(6) });
  ok(sent.length === 1 && /✗ beta: refused \(403\); the detail is in the server log/.test(sent[0]) && !/rig: refused by the API/.test(sent[0]) && !/alpha/.test(sent[0]), "a path fails: alerted, naming it and the kind of failure; the provider's own text stays in the log (2026-11-07)", sent[0]);
  r = await smoke.runSmokes({ now: at(12) });
  ok(sent.length === 1, "still failing six hours later: not alerted again the same day");
  r = await smoke.runSmokes({ now: at(30.5) });
  ok(sent.length === 2 && /✗ beta/.test(sent[1]), "still failing a day later: alerted again");
  refuse = true; r = await smoke.runSmokes({ now: at(56) });
  ok(r.lastAlert?.sent === false && sent.length === 2, "Telegram refuses the alert: recorded as NOT sent");
  refuse = false; r = await smoke.runSmokes({ now: at(57) });
  ok(sent.length === 3 && /✗ beta/.test(sent[2]), "an alert that was not sent is tried again on the next run, not counted as done");
  fail = false; r = await smoke.runSmokes({ now: at(63) });
  ok(sent.length === 4 && /✓ beta works again/.test(sent[3]) && !r.alerts.beta, "it recovers: said so, and the alert clock cleared");
  const row = (await rest("agent_settings?id=eq.smoke%3Alast&select=reason"))?.[0];
  ok(JSON.parse(row.reason).ranAt === new Date(T0 + 63 * 3600_000).toISOString(), "each run is the agent_settings row smoke:last");

  // the wall's watch: read through the same database, judged against the clock
  const nowMs = T0 + 63 * 3600_000;
  ok(await watch.smokeProblem({ now: nowMs + 3600_000 }) === null, "watch: a run an hour ago is fine");
  ok(/last ran 14\.0 h ago/.test(await watch.smokeProblem({ now: nowMs + 14 * 3600_000 }) ?? ""), "watch: no run for 14 h (every 6 h) is a stopped schedule");
  ok(/could not be read \(database answered 500\)/.test(await watch.smokeProblem({ now: nowMs, fetchImpl: async () => new Response("x", { status: 500 }) }) ?? ""), "watch: the record cannot be read → a problem, never fine");
  ok(/could not be read/.test(await watch.smokeProblem({ now: nowMs, fetchImpl: async () => { throw new Error("connect ECONNREFUSED"); } }) ?? ""), "watch: the database cannot be reached → a problem");
  ok(/never recorded/.test(await watch.smokeProblem({ now: nowMs, fetchImpl: async () => new Response("[]", { status: 200 }) }) ?? ""), "watch: no record at all → a problem");
  watch.resetForTest(); const told = [];
  const send = async (t) => (told.push(t), true);
  await watch.checkOnce({ now: nowMs + 14 * 3600_000, send }); await watch.checkOnce({ now: nowMs + 14.5 * 3600_000, send });
  ok(told.length === 1 && /stopped/.test(told[0]), "watch: alerted once, not every 30 minutes");
  await watch.checkOnce({ now: nowMs + 39 * 3600_000, send });
  ok(told.length === 2, "watch: alerted again a day later while it holds");
  await smoke.runSmokes({ now: () => new Date(nowMs + 39.2 * 3600_000), alert: false });
  await watch.checkOnce({ now: nowMs + 39.5 * 3600_000, send });
  ok(told.length === 3 && /running again/.test(told[2]), "watch: says when the smoke checks run again");
  ok(watch.startSmokeWatch() === false, "watch: does not start on a rig");
} finally {
  Object.assign(smoke.SMOKES, saved);
  await rest("agent_settings?id=eq.smoke%3Alast", { method: "DELETE" }).catch(() => {});
  if (before?.[0]) await rest("agent_settings", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ id: "smoke:last", enabled: true, reason: before[0].reason }]) }).catch(() => {});
  tg.close();
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
