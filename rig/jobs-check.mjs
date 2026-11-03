// A report with no reader is not a check (2026-11-03). The agent's scheduled jobs record their runs (agent/lib/jobs.mjs),
// and the scheduled-jobs smoke check fails on a failed, overdue or never-run job. Rig database.
//   node --env-file=.env.rig rig/jobs-check.mjs
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 170)}` : ""}`); if (!c) failures += 1; };
const jobs = await import("../agent/lib/jobs.mjs");
const { rest } = await import("../agent/lib/knowledge/retrieval.mjs");
const before = await rest("agent_settings?id=like.job%3A*&select=id,enabled,reason");
const clear = () => rest("agent_settings?id=like.job%3A*", { method: "DELETE" });
const T = Date.parse("2026-11-03T12:00:00Z");
try {
  await clear();
  let p = await jobs.jobProblems({ now: T, startedAt: T - 3600_000 });
  ok(p.length === 0, "just started (under 2 h): a job with no run yet is not a problem yet");
  p = await jobs.jobProblems({ now: T, startedAt: T - 5 * 3600_000 });
  ok(p.length === 2 && p.every((x) => /never recorded a run/.test(x)), "up 5 h and no run recorded: both named, with what they do", p[0]);
  for (const n of Object.keys(jobs.JOBS)) await jobs.recordJob(n, { ok: true, counts: { n: 1 }, now: new Date(T - 3600_000) });
  p = await jobs.jobProblems({ now: T });
  ok(p.length === 0, "both ran an hour ago and worked: no problem");
  await jobs.recordJob("intake-retention", { ok: false, detail: "rig: storage unreachable", now: new Date(T - 3600_000) });
  p = await jobs.jobProblems({ now: T });
  ok(p.length === 1 && /intake-retention FAILED/.test(p[0]) && /storage unreachable/.test(p[0]) && /personal data/.test(p[0]), "a failed retention sweep is a problem, with its reason and what it is for", p[0]);
  await jobs.recordJob("intake-retention", { ok: true, now: new Date(T - 3600_000) });
  p = await jobs.jobProblems({ now: T + 2 * 864e5 });
  ok(p.length === 2 && p.every((x) => /overdue/.test(x)), "no run for two days (every 24 h): overdue");
  const saved = process.env.NEXT_PUBLIC_SUPABASE_URL; process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:9";
  let threw = null; try { await jobs.jobProblems({ now: T }); } catch (e) { threw = e; } process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
  ok(threw !== null, "the job records cannot be read: an error (the smoke check fails), never 'no problems'");
} finally {
  await clear().catch(() => {});
  if (before?.length) await rest("agent_settings", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(before) }).catch(() => {});
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
