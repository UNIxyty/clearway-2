// A report with no reader is not a check (2026-11-03). The agent's scheduled jobs used to write their result to the
// log, or swallow it: the intake retention sweep (the promise that passport data is deleted after its period) and the
// generated-files sweep (passenger manifests). Each now records its last run here, in the agent_settings row
// `job:<name>` — when, whether it worked, what it did — and the `scheduled-jobs` smoke check (lib/smoke.mjs) fails
// when a job failed or has not run on time. That puts the worst line in front of someone: the developers' alert, and
// the agent's row on the service-status page.
import { rest } from "./knowledge/retrieval.mjs";
import { logDetail } from "./public-errors.mjs";

export const JOBS = {
  "intake-retention": { everyHours: 24, what: "deletes intake mail, attachments and personal data past the retention period" },
  "generated-files": { everyHours: 24, what: "deletes generated files (passenger manifests among them) past their period" },
};

export async function recordJob(name, { ok, detail = null, counts = null, now = new Date() }) {
  const body = { ranAt: now.toISOString(), ok: Boolean(ok), detail: detail ? String(detail).slice(0, 300) : null, counts, everyHours: JOBS[name]?.everyHours ?? 24 };
  await rest("agent_settings", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ id: `job:${name}`, enabled: true, reason: JSON.stringify(body), updated_at: body.ranAt, updated_by_email: "jobs@check.invalid" }]) })
    .catch((e) => logDetail("jobs", `could not record the ${name} run`, e));
}

/** Every job's last run; a job that failed, never ran, or is overdue is a problem. Throws when the rows cannot be read. */
export async function jobProblems({ now = Date.now(), startedAt = 0 } = {}) {
  const rows = await rest(`agent_settings?id=like.job%3A*&select=id,reason`);
  if (!Array.isArray(rows)) throw new Error("the job records could not be read");
  const byName = Object.fromEntries(rows.map((r) => { try { return [r.id.slice(4), JSON.parse(r.reason)]; } catch { return [r.id.slice(4), null]; } }));
  const problems = [];
  for (const [name, job] of Object.entries(JOBS)) {
    const last = byName[name];
    const dueBy = (job.everyHours * 1.5 + 1) * 3600_000;
    if (!last) { if (now - startedAt > 2 * 3600_000) problems.push(`${name} has never recorded a run (${job.what})`); continue; }
    if (!last.ok) problems.push(`${name} FAILED at ${last.ranAt.slice(0, 16)}Z: ${last.detail ?? "no reason recorded"} (${job.what})`);
    else if (now - Date.parse(last.ranAt) > dueBy) problems.push(`${name} last ran ${last.ranAt.slice(0, 16)}Z, overdue (${job.what})`);
  }
  return Object.assign(problems, { seen: Object.keys(JOBS).map((n) => `${n} ${byName[n]?.ranAt ? `${byName[n].ok ? "ok" : "FAILED"} ${byName[n].ranAt.slice(0, 16)}Z` : "not run yet"}`) });
}
