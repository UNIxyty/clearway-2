// Bug report 8 item 2.4 on production (2026-11-10): a NOTAM read is never older than 6 hours. As a plain "user" check
// account, read the NOTAMs of the airports in the wall's window through the portal's own route (the one every page
// and the wall use). The route refreshes a stored file older than 6 h through the worker before it answers, so each
// read reports the age it found and the age it answered with. Counts and ages only; no NOTAM text is printed.
// Runs inside the portal container: scripts/check-accounts.sh run notam-freshness-walk
export const ROLES = ["user"];
const MAX_AIRPORTS = Number(process.env.NOTAM_WALK_MAX || 8);
export async function check({ base, accounts: [u], ok }) {
  const get = (p, ms = 170_000) => fetch(`${base}${p}`, { redirect: "manual", headers: { cookie: u.cookie }, signal: AbortSignal.timeout(ms) });
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2)).toISOString();
  const r = await get(`/digital-wall/api/timeline/flights?allOperators=true&refresh=false&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  let flights = [];
  try { const d = await r.json(); flights = (d.aircraft ?? []).flatMap((a) => a.flights ?? []); } catch { /* judged below */ }
  const icaos = [...new Set(flights.flatMap((f) => [f.adep?.icao, f.ades?.icao, f.dep, f.arr]).filter((x) => /^[A-Z]{4}$/.test(String(x ?? ""))))].slice(0, MAX_AIRPORTS);
  ok(r.status === 200 && icaos.length > 0, "the wall's window names airports to read", `${r.status} · ${flights.length} flights · ${icaos.length} airports`);
  const rows = [];
  for (const icao of icaos) {
    const t = Date.now();
    let status = 0; let body = null;
    try { const res = await get(`/api/notams?icao=${icao}`); status = res.status; body = await res.json(); } catch (e) { body = { error: String(e?.message ?? e) }; }
    const ageH = body?.updatedAt ? (Date.now() - Date.parse(body.updatedAt)) / 3_600_000 : null;
    rows.push({ icao, status, ageH, stale: body?.stale === true, counts: body?.counts ?? null, secs: Math.round((Date.now() - t) / 1000) });
  }
  const fresh = rows.filter((x) => x.status === 200 && x.ageH != null && x.ageH <= 6);
  for (const x of rows) console.log(`      ${x.icao}: ${x.status} · age ${x.ageH == null ? "?" : x.ageH.toFixed(1)} h${x.stale ? " (stale, refresh failed)" : ""} · ${x.counts ? `${x.counts.shown} shown, ${x.counts.expired} expired dropped, ${x.counts.unparsed} unparsed` : "no counts"} · ${x.secs} s`);
  ok(fresh.length === rows.length, "every airport read answers with data at most 6 h old (refreshed on the read when older)", `${fresh.length} of ${rows.length}`);
  ok(rows.every((x) => x.status !== 200 || (x.counts && typeof x.counts.expired === "number")), "every answer says how many expired NOTAMs it dropped", rows.map((x) => x.counts?.expired ?? "?").join(","));
}
