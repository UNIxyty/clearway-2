// A rig read that knows whether it got everything (2026-11-07). The database answers at most 1000 rows a read and says
// nothing; a scan that reports "none found" over a partial read is a wrong answer. This asks for the exact count
// alongside the rows and throws if fewer came back than exist.
export async function readAll(pathAndQuery) {
  const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const r = await fetch(`${SB}/rest/v1/${pathAndQuery}`, { headers: { apikey: K, authorization: `Bearer ${K}`, Prefer: "count=exact" } });
  if (!r.ok && r.status !== 206) throw new Error(`${pathAndQuery.split("?")[0]} -> ${r.status}`);
  const rows = await r.json();
  const total = Number(String(r.headers.get("content-range") ?? "").split("/")[1]);
  if (!Number.isFinite(total) || rows.length < total) throw new Error(`${pathAndQuery.split("?")[0]}: read ${rows.length} of ${Number.isFinite(total) ? total : "an unknown number of"} rows — the scan would be partial`);
  return rows;
}
