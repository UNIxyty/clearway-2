// The test that matters most in Stage 5 (2026-10-25): two clients with different scopes, and client A's session asking
// for client B's flight and B's passengers BY ID, straight at the endpoints — both 404 — while A's board, A's stream
// and A's NOTAM round never carry B. Then the forgery: A writes role: "admin", is_approved: true and a scope naming
// B's operator into their OWN metadata, refreshes, and tries everything again — still 404, still a client.
// Plus: a client is 404 everywhere else (portal pages, agent chat, wall writes, the display), their level gates the
// passenger routes (names → list but no reveal; off → nothing), and a staff user still sees both operators.
// On the sign-in rig the wall's mock Leon flies ONE operator (cwy-cwy) with four registrations, and the agent's mock Leon
// flies cwy-cwy, klj and artlw with other flight ids. So: A is scoped by REGISTRATION (LY-TST at the wall, LY-BGS at
// the agent), B by OPERATOR (cwy-cwy). B's flights include A's; "B's flight" below is one on another registration.
// Everything is created and removed here, with the service key; the clients rows stay "removed" at the end — a row is
// never deleted, which is also what production does.
//   node --env-file=.env.rig rig/client-scope-check.mjs
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(SB))) { console.error("Refused: the rig's local Supabase only."); process.exit(2); }
const B = "http://127.0.0.1:3989";
let failures = 0; const ok = (c, what, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${what}${d ? `  · ${String(d).slice(0, 170)}` : ""}`); if (!c) failures += 1; };
const H = { apikey: SVC, authorization: `Bearer ${SVC}`, "content-type": "application/json" };
const svc = (path, init = {}) => fetch(`${SB}${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
const PASSWORD = "rig-access-check-only";
const grant = async (email) => (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) })).json();
const cookieOf = (s) => `sb-${new URL(SB).hostname.split(".")[0]}-auth-token=base64-${Buffer.from(JSON.stringify(s)).toString("base64")}`;
const ask = async (s, path, init = {}) => { const r = await fetch(`${B}${path}`, { ...init, headers: { ...(init.headers ?? {}), cookie: cookieOf(s) }, redirect: "manual" }); const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ } return { status: r.status, text, json, location: r.headers.get("location") || "" }; };
const setOwnMeta = (s, data) => fetch(`${SB}/auth/v1/user`, { method: "PUT", headers: { apikey: ANON, authorization: `Bearer ${s.access_token}`, "content-type": "application/json" }, body: JSON.stringify({ data }) });

// ── accounts and rows ─────────────────────────────────────────────────────────────────────────────────────────
async function clientAccount(email, name) {
  let r = await svc("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name }, app_metadata: { role: "client", is_approved: false, client_status: "requested" } }) });
  let body = await r.json();
  if (!r.ok) { const list = await (await svc(`/auth/v1/admin/users?page=1&per_page=200`)).json(); body = (list.users ?? []).find((u) => u.email === email); if (!body) throw new Error(`cannot make ${email}`); }
  const uid = body.id;
  await svc(`/auth/v1/admin/users/${uid}`, { method: "PUT", body: JSON.stringify({ app_metadata: { role: "client", is_approved: false, client_status: "requested" }, user_metadata: { full_name: name } }) });
  await svc(`/rest/v1/clients?user_id=eq.${uid}`, { method: "DELETE" }).catch(() => {}); // a previous run's row, so the rig stays small (production never deletes)
  const row = await (await svc("/rest/v1/clients", { method: "POST", headers: { prefer: "return=representation" }, body: JSON.stringify({ user_id: uid, email, person_name: name, company: name.replace(/ \(.*$/, ""), kind: "operator", status: "requested" }) })).json();
  return { uid, email, rowId: row[0]?.id };
}
async function approve(c, scope, switches, passengerLevel = "names", consent = false) {
  await svc(`/rest/v1/clients?id=eq.${c.rowId}`, { method: "PATCH", body: JSON.stringify({ status: "approved", scope, switches, passenger_level: passengerLevel, consent, decided_at: new Date().toISOString() }) });
  await svc(`/auth/v1/admin/users/${c.uid}`, { method: "PUT", body: JSON.stringify({ app_metadata: { role: "client", is_approved: true, client_status: "approved" } }) });
}
async function setLevel(c, passengerLevel, consent) { await svc(`/rest/v1/clients?id=eq.${c.rowId}`, { method: "PATCH", body: JSON.stringify({ passenger_level: passengerLevel, consent }) }); await new Promise((r) => setTimeout(r, 10_500)); }
async function remove(c) {
  await svc(`/rest/v1/clients?id=eq.${c.rowId}`, { method: "PATCH", body: JSON.stringify({ status: "removed", scope: [], switches: [], passenger_level: "off" }) });
  await svc(`/auth/v1/admin/users/${c.uid}`, { method: "PUT", body: JSON.stringify({ app_metadata: { role: "client", is_approved: false, client_status: "removed" } }) });
}

const A = await clientAccount("rig-client-a@rig.invalid", "Rig Client A (registrations)");
const Bc = await clientAccount("rig-client-b@rig.invalid", "Rig Client B (operator cwy-cwy)");
const A_REGS = ["LY-TST", "LY-BGS"]; // LY-TST flies on the wall's mock, LY-BGS on the agent's (cwy-cwy:880003)
const A_AGENT_FLIGHT = "cwy-cwy:880003", B_AGENT_FLIGHT = "cwy-cwy:880001"; // EC-OMU: B's, not A's
const staff = await grant("rig-access-user@rig.invalid");

// 0. requested: the waiting screen and nothing else
let sA = await grant(A.email);
{
  const page = await ask(sA, "/"); ok(page.status === 307 && page.location.includes("/client/waiting"), "requested client · the root (where sign-in lands) → the waiting screen", `${page.status} ${page.location}`);
  const dash = await ask(sA, "/dashboard"); ok(dash.status === 404, "requested client · /dashboard: 404 (nothing outside their world exists, approved or not)", dash.status);
  const wall = await ask(sA, "/digital-wall/api/timeline/flights?allOperators=true"); ok(wall.status === 401, "requested client · the wall answers 401 (nobody yet)", wall.status);
  const waiting = await ask(sA, "/client/waiting");
  ok(waiting.status === 200 && !/data-cw-sidebar|Dashboard|\bAdmin\b|Flight intake|Ops Agent|Permissions|Developer/.test(waiting.text) && !/\b\d+ (flights|requests|notices)\b/.test(waiting.text), "waiting screen's page source: no navigation, no counts, no page titles of the portal", `${waiting.status} ${waiting.text.length}B`);
}

// 1. approved, different scopes
await approve(A, A_REGS.map((value) => ({ kind: "registration", value })), ["flight_board", "weather", "notams", "notam_check_status", "limitations"], "names");
await approve(Bc, [{ kind: "operator", value: "cwy-cwy" }], ["flight_board", "weather", "notams"], "documents", true);
sA = await grant(A.email); let sB = await grant(Bc.email);

const boardOf = async (s) => { const r = await ask(s, "/digital-wall/api/timeline/flights?allOperators=true"); const groups = r.json?.aircraft ?? []; return { status: r.status, groups, oprs: [...new Set(groups.map((g) => g.oprId))], regs: [...new Set(groups.map((g) => g.registration))], flights: groups.flatMap((g) => g.flights ?? []) }; };
const staffBoard = await boardOf(staff);
ok(staffBoard.status === 200 && staffBoard.regs.includes("LY-TST") && staffBoard.regs.length >= 2, "staff still see every registration of the operator", `${staffBoard.status} ${staffBoard.regs.join(",")} · ${staffBoard.flights.length} flights`);
const bFlight = staffBoard.groups.find((g) => g.oprId === "cwy-cwy" && g.registration !== "LY-TST" && g.registration !== "LY-BGS")?.flights?.[0]; const aFlight = staffBoard.groups.find((g) => g.registration === "LY-TST")?.flights?.[0];
ok(Boolean(bFlight && aFlight), "the rig wall holds a flight of A's registration and one B-only flight to ask about", `B ${bFlight?.flightNid} (${bFlight?.aircraftRegistration}) · A ${aFlight?.flightNid}`);
if (!bFlight || !aFlight) { console.log("cannot continue without both flights"); process.exit(2); }

const boardA = await boardOf(sA);
ok(boardA.status === 200 && boardA.regs.join(",") === "LY-TST" && boardA.flights.length > 0, "A's board: only LY-TST, and not empty", `${boardA.status} ${boardA.regs.join(",")} · ${boardA.flights.length} flights`);
ok(!JSON.stringify(boardA.groups).includes(String(bFlight.flightNid)) && !JSON.stringify(boardA.groups).includes(bFlight.aircraftRegistration ?? "LY-TSU"), "A's board carries nothing of B's other aircraft — not its registration, not a flight nid");
const normA = await ask(sA, "/digital-wall/api/flights/normalized?window=all-cached&limit=500");
ok(normA.status === 200 && (normA.json?.flights ?? []).every((r) => r.registration === "LY-TST") && (normA.json?.flights ?? []).length > 0, "A's normalized feed: only LY-TST", `${normA.status} ${(normA.json?.flights ?? []).length}`);
const direct = await ask(sA, `/digital-wall/api/flights/normalized?key=cwy-cwy:${bFlight.flightNid}`);
ok(direct.status === 200 && (direct.json?.flights ?? []).length === 0, "A asks for B's flight by key in the feed → an empty list, not the flight", `${direct.status} ${(direct.json?.flights ?? []).length}`);

// 2. THE test: A asks for B's flight and B's passengers by id, directly
const info = await ask(sA, `/digital-wall/api/flight-info?flightNid=${bFlight.flightNid}&oprId=cwy-cwy`);
ok(info.status === 404 && /not on your account/i.test(info.text), "A → B's flight by id at the wall: 404, 'not on your account'", `${info.status} ${info.text.slice(0, 60)}`);
const own = await ask(sA, `/digital-wall/api/flight-info?flightNid=${aFlight.flightNid}&oprId=cwy-cwy`);
ok(own.status === 200 && own.json?.flight, "A → A's own flight by id at the wall: 200", own.status);
ok(own.status === 200 && !("limitations" in (own.json ?? {})) && !("checks" in (own.json ?? {})), "…and the wall's internal pieces (checks, limitations list) are not in it");
const pax = await ask(sA, `/agent/api/flights/${B_AGENT_FLIGHT}/passengers`);
ok(pax.status === 404 && /not on your account/i.test(pax.text), "A → B's passengers by id at the agent: 404, 'not on your account'", `${pax.status} ${pax.text.slice(0, 60)}`);
const paxRev = await ask(sA, `/agent/api/flights/${B_AGENT_FLIGHT}/passengers/1/reveal`, { method: "POST" });
ok(paxRev.status === 404, "A → a reveal on B's flight at the agent: 404", paxRev.status);
const ownPax = await ask(sA, `/agent/api/flights/${A_AGENT_FLIGHT}/passengers`);
ok(ownPax.status !== 404 && ownPax.status !== 401 && ownPax.status !== 403, "A → A's own passengers at the agent: reaches the list (level names)", `${ownPax.status} ${ownPax.text.slice(0, 80)}`);
ok(ownPax.status !== 200 || ownPax.json?.canReveal === false, "…with canReveal false at level names", `${ownPax.json?.canReveal}`);
const PAX_ID = ownPax.json?.passengers?.[0]?.id ?? "1"; // a real passenger of A's flight, from the list A may read
const ownRev = await ask(sA, `/agent/api/flights/${A_AGENT_FLIGHT}/passengers/${PAX_ID}/reveal`, { method: "POST" });
ok(ownRev.status === 404, "A at level names → a reveal on A's own flight: 404 (documents are not on their account)", ownRev.status);

// 3. the stream and the NOTAM round
{
  const ac = new AbortController(); const frames = [];
  const streamP = fetch(`${B}/digital-wall/api/stream?surface=console`, { headers: { cookie: cookieOf(sA) }, signal: ac.signal }).then(async (r) => { const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = ""; while (true) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i; while ((i = buf.indexOf("\n\n")) >= 0) { frames.push(buf.slice(0, i)); buf = buf.slice(i + 2); } } }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
  const refresh = await ask(staff, "/digital-wall/api/timeline/flights?allOperators=true&refresh=true"); // staff pull the sync; the wall broadcasts flight.changed
  await ask(sA, "/digital-wall/api/timeline/refresh", { method: "POST" });
  await new Promise((r) => setTimeout(r, 4000)); ac.abort(); await streamP;
  const events = frames.map((f) => { const m = f.match(/^data: (.*)$/m); try { return m ? JSON.parse(m[1]) : null; } catch { return null; } }).filter(Boolean);
  const types = [...new Set(events.map((e) => e.type))];
  ok(events.some((e) => e.type === "hello"), "A's stream opens (hello)", types.join(","));
  ok(!events.some((e) => ["presence.changed", "devices.changed", "display.command", "reports.changed"].includes(e.type)), "A's stream carries no presence, device, display or report events", types.join(","));
  const fc = events.filter((e) => e.type === "flight.changed");
  ok(!JSON.stringify(fc).includes(String(bFlight.flightNid)) && fc.every((e) => [...(e.updated ?? []), ...(e.deleted ?? [])].every((k) => boardA.flights.some((f) => String(k?.key ?? k).endsWith(":" + f.flightNid)))), `A's stream's flight events (${fc.length}) carry only A's flight keys`, `refresh ${refresh.status}`);
}
const notamA = await ask(sA, "/digital-wall/api/notam-check/today");
const aAirports = new Set(boardA.flights.flatMap((f) => [f.adep?.icao, f.ades?.icao]).filter(Boolean));
ok(notamA.status === 200 && (notamA.json?.airports ?? []).every((a) => aAirports.has(a.icao)), "A's NOTAM round lists only airports of A's flights", `${notamA.status} ${(notamA.json?.airports ?? []).map((a) => a.icao).join(" ")} ⊆ ${[...aAirports].join(" ")}`);
ok(notamA.status === 200 && !("emailedTo" in (notamA.json ?? {})) && !("remindersSent" in (notamA.json ?? {})), "…without ops' email and reminder bookkeeping");
const notamB = await ask(sB, "/digital-wall/api/notam-check/today");
ok(notamB.status === 404, "B (switch off) → the NOTAM round: 404", notamB.status);

// 4. everything else is 404 for a client
for (const [what, path, init] of [
  ["portal /dashboard", "/dashboard"], ["portal /aip/EVRA", "/aip/EVRA"], ["portal /m/wall", "/m/wall"], ["portal /admin/users", "/admin/users"],
  ["portal API /api/notams", "/api/notams?icao=EVRA"], ["portal API /api/admin/status", "/api/admin/status"],
  ["agent chat", "/agent/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }], ["agent intake", "/agent/api/intake/requests"], ["agent settings", "/agent/api/settings/permissions"],
  ["wall display settings", "/digital-wall/api/display/settings"], ["wall devices", "/digital-wall/api/device/list"], ["wall operators", "/digital-wall/api/operators"], ["wall presence", "/digital-wall/api/presence"],
  ["wall write (clocks)", "/digital-wall/api/display/clocks", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ clocks: [] }) }],
  ["wall write (limitation)", "/digital-wall/api/timeline/limitations", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }],
]) { const r = await ask(sA, path, init); ok(r.status === 404, `client A → ${what}: 404`, `${r.status} ${r.location}`); }
const home = await ask(sA, "/client"); ok(home.status === 200, "client A → /client: 200 (their world)", home.status);
const me = await ask(sA, "/api/client/me"); ok(me.status === 200 && me.json?.status === "approved" && Array.isArray(me.json?.switches) && !("scope" in (me.json ?? {})), "client A → /api/client/me: their switches, not their scope's values", `${me.status} ${me.json?.switches?.join(",")}`);
const meStaff = await ask(staff, "/api/client/me"); ok(meStaff.status === 404, "staff → /api/client/me: 404", meStaff.status);

// 5. THE FORGERY: A writes admin, approval and B's operator into their own metadata, refreshes, tries again
{
  const w = await setOwnMeta(sA, { role: "admin", roles: ["admin", "developer"], is_admin: true, is_developer: true, is_approved: true, client_status: "approved", scope: [{ kind: "operator", value: "cwy-cwy" }], switches: ["flight_board", "documents"], passenger_level: "documents" });
  ok(w.ok, "Supabase accepts A's own user_metadata write (the services must not believe a word of it)", w.status);
  sA = await (await fetch(`${SB}/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ refresh_token: sA.refresh_token }) })).json();
  const b2 = await boardOf(sA); ok(b2.status === 200 && b2.regs.join(",") === "LY-TST", "after the forgery · A's board: still only LY-TST", b2.regs.join(","));
  const i2 = await ask(sA, `/digital-wall/api/flight-info?flightNid=${bFlight.flightNid}&oprId=cwy-cwy`); ok(i2.status === 404, "after the forgery · B's flight by id: still 404", i2.status);
  const p2 = await ask(sA, `/agent/api/flights/${B_AGENT_FLIGHT}/passengers`); ok(p2.status === 404, "after the forgery · B's passengers by id: still 404", p2.status);
  const r2 = await ask(sA, `/agent/api/flights/${A_AGENT_FLIGHT}/passengers/${PAX_ID}/reveal`, { method: "POST" }); ok(r2.status === 404, "after the forgery · a reveal on A's own flight: still 404 (level is ops' to set)", r2.status);
  const d2 = await ask(sA, "/dashboard"); ok(d2.status === 404, "after the forgery · /dashboard: still 404, still a client", d2.status);
  const s2 = await ask(sA, "/api/admin/status"); ok(s2.status === 404, "after the forgery · /api/admin/status: 404 (a client has no admin status to read)", s2.status);
  const c2 = await ask(sA, "/digital-wall/api/display/clocks", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ clocks: [] }) }); ok(c2.status === 404, "after the forgery · a wall write: still 404", c2.status);
  await setOwnMeta(sA, { role: null, roles: null, is_admin: null, is_developer: null, is_approved: null, client_status: null, scope: null, switches: null, passenger_level: null });
}

// 6. the level is ops' to set: documents → the reveal route exists for their own flight; off → nothing
await setLevel(A, "documents", true);
const rev3 = await ask(sA, `/agent/api/flights/${A_AGENT_FLIGHT}/passengers/${PAX_ID}/reveal`, { method: "POST" });
ok(rev3.status !== 404 && rev3.status !== 401 && rev3.status !== 403, "A at level documents → a reveal on A's own flight reaches the route (Leon decides the rest)", `${rev3.status} ${rev3.text.slice(0, 70)}`);
const rev3b = await ask(sA, `/agent/api/flights/${B_AGENT_FLIGHT}/passengers/1/reveal`, { method: "POST" }); ok(rev3b.status === 404, "…and on B's flight: still 404", rev3b.status);
await setLevel(A, "off", false);
const list4 = await ask(sA, `/agent/api/flights/${A_AGENT_FLIGHT}/passengers`); ok(list4.status === 404, "A at level off → even A's own passenger list: 404", list4.status);

// 7. removed: nothing exists, the row stays
await remove(A); await remove(Bc); sA = await grant(A.email);
const after = await ask(sA, "/digital-wall/api/timeline/flights?allOperators=true"); ok(after.status === 401, "removed client · the wall: 401", after.status);
const page = await ask(sA, "/"); ok(page.status === 307 && page.location.includes("/client/removed"), "removed client · the root → the removed page", `${page.status} ${page.location}`);
const gone = await ask(sA, "/client"); ok(gone.status === 307 && gone.location.includes("/client/removed"), "removed client · their old front door → the removed page", `${gone.status} ${gone.location}`);
const rows = await (await svc(`/rest/v1/clients?select=status,scope,switches&user_id=in.(${A.uid},${Bc.uid})`)).json();
ok(rows.length === 2 && rows.every((r) => r.status === "removed" && r.scope.length === 0 && r.switches.length === 0), "both rows kept, emptied, status removed", JSON.stringify(rows).slice(0, 120));
console.log(failures ? `${failures} FAILED` : "ALL PASSED");
process.exit(failures ? 1 : 0);
