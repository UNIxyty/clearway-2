// Every figure and switch on the agent's Settings page does something, or says it does not (2026-11-03). The page
// showed a "monthly cap" that enforced nothing; a switch nothing read; model rows for embeddings and rerank that
// nothing used; and a save that froze every tier on the models of that moment.
//   node --env-file=.env.rig rig/settings-truth-check.mjs
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 160)}` : ""}`); if (!c) failures += 1; };
const views = await import("../agent/lib/views.mjs");
const routing = await import("../agent/lib/routing.mjs");
const models = await import("../agent/lib/models.mjs");
const spend = await import("../agent/lib/spend.mjs");
const { rest } = await import("../agent/lib/knowledge/retrieval.mjs");

const u = await views.usageThisMonth();
ok(u.today && typeof u.today.usd === "number" && u.today.ceilingUsd === spend.ceilingUsd() && !("capEur" in u), "the usage card's figure is today's spend against the daily ceiling (the one that stops calls); no 'cap' that stops nothing", JSON.stringify(u.today));
ok(typeof u.spendUsd === "number", "the month is still there, as information", u.spendUsd);
const capKeys = views.CAPABILITIES.map((c) => c.key);
ok(!capKeys.includes("auto_approve_reference"), "no switch that nothing reads (auto-approve reference uploads is gone)", capKeys.join(", "));

const before = await rest("agent_settings?id=eq.routing&select=reason").catch(() => null);
try {
  const file = models.fileTiers();
  const form = Object.fromEntries(["router", "fast", "standard", "reasoning", "extraction"].map((t) => [t, { ...file[t] }]));
  let r = await routing.setRoutingSettings({ tiers: form }, { email: "rig-admin@rig.invalid" });
  let saved = JSON.parse((await rest("agent_settings?id=eq.routing&select=reason"))[0].reason);
  ok(Object.keys(saved.tiers).length === 0, "saving the form unchanged stores no tier override (it used to freeze every tier)", JSON.stringify(saved.tiers));
  r = await routing.setRoutingSettings({ tiers: { ...form, standard: { id: "claude-sonnet-5", fallbackId: null } } }, { email: "rig-admin@rig.invalid" });
  saved = JSON.parse((await rest("agent_settings?id=eq.routing&select=reason"))[0].reason);
  ok(Object.keys(saved.tiers).join() === "standard" && models.loadModelConfig().tiers.standard.id === "claude-sonnet-5" && models.loadModelConfig().tiers.fast.id === file.fast.id, "changing one tier stores only that tier, and it takes effect; the others follow the file", JSON.stringify(saved.tiers));
  ok(!("embeddings" in saved.tiers) && !("rerank" in saved.tiers), "no embeddings or rerank rows are stored");
} finally {
  await rest("agent_settings?id=eq.routing", { method: "DELETE" }).catch(() => {});
  if (before?.[0]) await rest("agent_settings", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ id: "routing", enabled: true, reason: before[0].reason }]) }).catch(() => {});
  await routing.routingSettings({ reload: true }).catch(() => {});
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
