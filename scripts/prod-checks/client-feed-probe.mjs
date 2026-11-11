// What a client of one operator is sent by the wall (2026-11-12, after the test client saw "No aircraft on your account
// yet"): the same feed the client's Timeline reads, as a check client scoped to CHECK_CLIENT_OPERATOR. Counts only:
// status, aircraft, flights, operators. Run: CHECK_CLIENT_OPERATOR=<oprId> scripts/check-accounts.sh run client-feed-probe
export const ROLES = ["client"];
export async function check({ base, accounts: [c], ok }) {
  const get = (p) => fetch(`${base}${p}`, { redirect: "manual", headers: { cookie: c.cookie } });
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)).toISOString();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 4)).toISOString();
  const r = await get(`/digital-wall/api/timeline/flights?allOperators=true&refresh=false&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  let d = null; try { d = await r.json(); } catch { /* judged below */ }
  const aircraft = d?.aircraft ?? [];
  const flights = aircraft.reduce((n, a) => n + (a.flights?.length ?? 0), 0);
  console.log(`      operator ${process.env.CHECK_CLIENT_OPERATOR || "(none)"}: ${r.status} · ${aircraft.length} aircraft · ${flights} flights · operators ${JSON.stringify(d?.operators ?? [])} · totalAircraft ${d?.totalAircraft ?? "?"}`);
  const me = await get("/api/client/me"); let mj = null; try { mj = await me.json(); } catch { /* */ }
  console.log(`      standing: ${me.status} · switches ${mj?.switches?.length ?? "?"} · level ${mj?.passengerLevel ?? "?"}`);
  ok(r.status === 200 && Array.isArray(d?.aircraft), "the wall's feed answers the client", r.status);
  ok(process.env.CHECK_CLIENT_OPERATOR ? aircraft.length > 0 : aircraft.length === 0, process.env.CHECK_CLIENT_OPERATOR ? "a client of a real operator is sent that operator's aircraft" : "a client whose scope matches nothing is sent nothing", `${aircraft.length} aircraft`);
}
