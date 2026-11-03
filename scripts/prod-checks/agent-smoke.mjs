// Every scheduled smoke call (agent/lib/smoke.mjs) once, now, on production — what each model and AI path does today.
// No account; alerts OFF (the schedule alerts; this is for reading). Records the run in `smoke:last` like the schedule.
// With AGENT_CODE=checkout it runs this checkout's smoke code before it is deployed.
export const ROLES = [];
export async function check({ ok }) {
  const { runSmokes } = await import(`${process.env.AGENT_ROOT || "/app"}/lib/smoke.mjs`);
  const r = await runSmokes({ alert: false });
  for (const [name, x] of Object.entries(r.results)) ok(x.ok, `${name.padEnd(16)} ${String(x.ms).padStart(6)} ms`, x.detail);
}
