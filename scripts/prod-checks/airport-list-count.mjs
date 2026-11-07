// The airport list reaches every visible airport (2026-11-07, 75bcbc7b): it stopped at the first 1000 of 6,400,
// alphabetically, so a dispatcher searching for a real airport late in the alphabet did not find it. Read-only, as a
// plain user (a check account, removed at the end). Counts only: the list's length against the database's own count.
export const ROLES = ["user"];
export async function check({ base, accounts: [u], ok }) {
  const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const r = await fetch(`${SB}/rest/v1/airports?visible=eq.true&select=icao`, { headers: { apikey: K, authorization: `Bearer ${K}`, Prefer: "count=exact", "Range-Unit": "items", Range: "0-0" } });
  const total = Number(String(r.headers.get("content-range") ?? "").split("/")[1]);
  ok(Number.isFinite(total) && total > 0, "the database counts the visible airports", Number.isFinite(total) ? `${total}` : `no count (${r.status})`);
  for (const p of ["/api/airports/list"]) {
    const res = await fetch(`${base}${p}`, { headers: { cookie: u.cookie } });
    const n = res.ok ? ((await res.json().catch(() => ({})))?.results ?? []).length : null;
    ok(res.ok && n === total, `${p} returns every visible airport, not the first 1000`, `${res.status} · ${n ?? "-"} of ${total}`);
  }
}
