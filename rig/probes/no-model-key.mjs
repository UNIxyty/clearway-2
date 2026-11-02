// Does "no-model-key" (rig/known-failures.json) still hold? Exit 0: yes, it holds (no rig key in .env.rig, or the API
// refuses it) — its suites are skipped. Exit 1: the rig's key is present and the Anthropic API accepted it — the cause
// is gone and its suites run again. Never prints anything of the key.
//   node --env-file=.env.rig rig/probes/no-model-key.mjs
const k = String(process.env.ANTHROPIC_API_KEY || "").trim();
if (!k) { console.log("holds: no ANTHROPIC_API_KEY in .env.rig"); process.exit(0); }
try {
  const r = await fetch("https://api.anthropic.com/v1/models?limit=1", { headers: { "x-api-key": k, "anthropic-version": "2023-06-01" }, signal: AbortSignal.timeout(15_000) });
  if (r.ok) { console.log("cleared: the rig's key is present and the API accepted it"); process.exit(1); }
  console.log(`holds: the API answered ${r.status} for the rig's key`); process.exit(0);
} catch { console.log("holds: the API could not be reached"); process.exit(0); }
