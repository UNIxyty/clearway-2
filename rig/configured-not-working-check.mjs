// Configured is not working (2026-11-03, success-too-early case 6). Two statuses that used to say "fine" because a
// setting was present now say what a real call found:
//   - the Intake page's Leon pill: it said "Reachable" when a refresh token was set; now Leon must answer a query
//   - the agent's health answer: ok because the process answered; now it carries the last smoke run's verdict, which
//     the service-status page reads (lib/service-checker.ts)
//   node --env-file=.env.rig rig/configured-not-working-check.mjs
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 160)}` : ""}`); if (!c) failures += 1; };
const leon = await import("../agent/lib/intake/leon-client.mjs");
const smoke = await import("../agent/lib/smoke.mjs");
const { rest } = await import("../agent/lib/knowledge/retrieval.mjs");

// 1. Leon: answered (the rig's mock Leon), no answer (a closed port), not set up (no token)
let r = await leon.leonReachable({ now: 1 });
ok(r.ok === true && r.state === "answered" && r.at, "Leon answers a real query on the rig's mock: ok, with the time it answered", JSON.stringify(r));
const savedBase = process.env.LEON_API_BASE; process.env.LEON_API_BASE = "http://127.0.0.1:9"; // nothing listens
r = await leon.leonReachable({ now: 10_000_000 });
ok(r.ok === false && r.state === "no_answer", "Leon not answering → not ok, though the token is set (it used to read 'Reachable')", JSON.stringify(r).slice(0, 140));
const savedTok = process.env.LEON_REFRESH_TOKEN; delete process.env.LEON_REFRESH_TOKEN; delete process.env.LEON_INTAKE_REFRESH_TOKEN;
r = await leon.leonReachable({ now: 20_000_000 });
ok(r.ok === false && r.state === "not_set_up", "no token → 'not set up', never 'not answering'", r.state);
process.env.LEON_API_BASE = savedBase; process.env.LEON_REFRESH_TOKEN = savedTok;

// 2. the health answer's smoke verdict, from the agent_settings row smoke:last
const before = await rest("agent_settings?id=eq.smoke%3Alast&select=reason").catch(() => null);
const put = (body) => rest("agent_settings", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ id: "smoke:last", enabled: true, reason: JSON.stringify(body) }]) });
const T = Date.parse("2026-11-03T12:00:00Z");
try {
  await rest("agent_settings?id=eq.smoke%3Alast", { method: "DELETE" });
  let h = await smoke.smokeHealth({ now: T });
  ok(h.state === "unchecked", "no smoke run yet → 'unchecked' (the status page shows unknown, not OK)", h.state);
  await put({ ranAt: new Date(T - 3600_000).toISOString(), everyHours: 6, results: { router: { ok: true }, knowledge: { ok: true } } });
  h = await smoke.smokeHealth({ now: T + 61_000 });
  ok(h.state === "working" && h.failing.length === 0, "a recent run, every path working → 'working'", h.state);
  await put({ ranAt: new Date(T - 3600_000).toISOString(), everyHours: 6, results: { router: { ok: true }, knowledge: { ok: false } } });
  h = await smoke.smokeHealth({ now: T + 122_000 });
  ok(h.state === "failing" && h.failing.join() === "knowledge", "a path failed → 'failing', naming it", JSON.stringify(h.failing));
  h = await smoke.smokeHealth({ now: T + 20 * 3600_000 });
  ok(h.state === "stale", "no run for 20 h (every 6 h) → 'stale'", h.state);
} finally {
  await rest("agent_settings?id=eq.smoke%3Alast", { method: "DELETE" }).catch(() => {});
  if (before?.[0]) await put(JSON.parse(before[0].reason)).catch(() => {});
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
