// Bug report 8 item 2.1 on production (2026-11-10): what the deployed wall holds as unconfirmed, and that the deployed
// display draws the ring for it. Read-only, as a "user" check account: the wall's own feed (counts and flight numbers
// only, no passenger or person data), the display's shipped chunks (the ring's marker and its rule), and the wall's
// health. Runs inside the portal container (scripts/check-accounts.sh run wall-ring-walk). A screenshot needs a
// browser, which this container has none of: the rendered proof is the rig's (rig/.scratch/shots/wall-ring-*.png).
export const ROLES = ["user"];
export async function check({ base, accounts: [u], ok }) {
  const get = (p, init = {}) => fetch(`${base}${p}`, { redirect: "manual", ...init, headers: { cookie: u.cookie, ...(init.headers ?? {}) } });
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)).toISOString();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 4)).toISOString();
  const r = await get(`/digital-wall/api/timeline/flights?allOperators=true&refresh=false&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  let flights = [];
  try { const d = await r.json(); flights = (d.aircraft ?? []).flatMap((a) => a.flights ?? []); } catch { /* judged below */ }
  ok(r.status === 200 && flights.length > 0, "the wall's feed answers a user with the flights of the window", `${r.status} · ${flights.length} flights`);
  const unconfirmed = flights.filter((f) => f.isConfirmed === false);
  const statuses = {}; for (const f of flights) { const k = `${f.status ?? "?"}${f.timesToBeConfirmed ? "+TBC" : ""}`; statuses[k] = (statuses[k] ?? 0) + 1; }
  ok(flights.every((f) => "isConfirmed" in f), "every flight in the feed carries the unconfirmed signal (isConfirmed)", JSON.stringify(statuses));
  console.log(`      unconfirmed in the window now: ${unconfirmed.length}${unconfirmed.length ? ` (${unconfirmed.map((f) => f.flightNo).slice(0, 10).join(", ")})` : " (none: nothing to ring at this moment)"}`);
  // the deployed display: its entry page lists the chunks; the ring's marker and rule must be in the shipped code
  const page = await get("/digital-wall/timeline/");
  const html = await page.text();
  const chunks = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]);
  let found = false; let where = "";
  for (const c of chunks) {
    const js = await (await get(c.startsWith("/") ? c : `/digital-wall/timeline/${c}`)).text();
    const deps = [...js.matchAll(/"(assets\/[A-Za-z]+-[\w-]+\.js)"/g)].map((m) => m[1]);
    for (const d of [...new Set(deps)]) { const t = await (await get(`/digital-wall/timeline/${d}`)).text(); if (t.includes("data-unconfirmed-ring")) { found = true; where = d; break; } }
    if (found) break;
  }
  ok(found, "the deployed display carries the unconfirmed ring (its marker in a shipped chunk)", where);
  const health = await get("/digital-wall/api/health");
  ok(health.status === 200, "the wall answers", health.status);
}
