// Reads past the database's 1000-row limit (2026-11-07). The Pick'em count stopped at 1000 a table and was reported as a
// total; 20 other reads did the same. This plants 1,100 invented rows and proves the helpers see all of them, and that a
// plain read does not (the control: the limit is real on this database too).
//   node --env-file=.env.rig rig/read-limit-check.mjs
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d !== "" ? `  · ${d}` : ""}`); if (!c) failures += 1; };
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY, H = { apikey: K, authorization: `Bearer ${K}`, "content-type": "application/json" };
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
const { rest, restAll, restCount } = await import("../agent/lib/knowledge/retrieval.mjs");
const { readAll } = await import("./lib/read-all.mjs");
const KIND = `rig.read-limit.${Date.now().toString(36)}`, N = 1100;
const del = () => fetch(`${SB}/rest/v1/agent_audit_log?kind=eq.${KIND}`, { method: "DELETE", headers: H });
try {
  for (let i = 0; i < N; i += 500) {
    const r = await fetch(`${SB}/rest/v1/agent_audit_log`, { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(Array.from({ length: Math.min(500, N - i) }, () => ({ kind: KIND, success: true }))) });
    if (!r.ok) throw new Error(`seed ${r.status}`);
  }
  const plain = (await rest(`agent_audit_log?kind=eq.${KIND}&select=id`)) ?? [];
  ok(plain.length === 1000, "control: a plain read stops at 1000 rows, without an error", `${plain.length} of ${N}`);
  const all = await restAll(`agent_audit_log?kind=eq.${KIND}&select=id&order=id.asc`);
  ok(all.length === N && new Set(all.map((x) => x.id)).size === N, "restAll returns every row, none twice", `${all.length} of ${N}`);
  ok((await restCount(`agent_audit_log?kind=eq.${KIND}`)) === N, "restCount gives the exact number", N);
  let refused = null; try { await readAll(`agent_audit_log?kind=eq.${KIND}&select=id`); } catch (e) { refused = e.message; }
  ok(Boolean(refused && /read 1000 of 1100/.test(refused)), "the rig's readAll refuses a read that came back short, and says by how much", refused ?? "it did not refuse");
  let noOrder = null; try { await restAll(`agent_audit_log?kind=eq.${KIND}&select=id`); } catch (e) { noOrder = e.message; }
  ok(Boolean(noOrder && /stable order/.test(noOrder)), "restAll refuses a read with no order (paging without one can skip or repeat rows)");
  let ceiling = null; try { await restAll(`agent_audit_log?kind=eq.${KIND}&select=id&order=id.asc`, { pageSize: 100, max: 500 }); } catch (e) { ceiling = e.message; }
  ok(Boolean(ceiling && /refusing to report a partial set/.test(ceiling)), "past its ceiling restAll throws: it never stops quietly");
} finally { await del(); }
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
