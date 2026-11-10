// The client's pages on production (2026-11-09), as an approved client and signed out: the front door, the three areas,
// Account, the wall's scoped feed, the onboarding pages, and what a client must not reach. Read-only: the one write it
// tries (the password route, with an empty form) must be refused because a check account can write nothing.
// Status codes, counts and yes/no only. The client is the most a client can be (every switch) on a scope that matches
// nothing, so its flight list is empty by design: the pages with flights on them are the rig's (rig/client-ui-check.mjs).
import { readFileSync } from "node:fs";
import path from "node:path";
export const ROLES = ["client"];
const INV = JSON.parse(readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "gate-inventory.json"), "utf8"));
export const CLIENT_SWITCHES = INV.clientSwitches;

export async function check({ base, accounts: [client], ok }) {
  const ask = async (p, { who = null, method = "GET", body } = {}) => {
    const r = await fetch(`${base}${p}`, { method, redirect: "manual", headers: { ...(who ? { cookie: who.cookie } : {}), "content-type": "application/json" }, body, signal: AbortSignal.timeout(30000) }).catch(() => null);
    if (!r) return { st: 0, to: "", text: "" };
    return { st: r.status, to: (r.headers.get("location") || "").replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, ""), text: await r.text().catch(() => "") };
  };
  // ── signed out: the doors ──
  const login = await ask("/login"), reqPage = await ask("/request-access"), welcome = await ask("/welcome?token=" + "x".repeat(43));
  ok(login.st === 200 && reqPage.st === 200 && welcome.st === 200, "signed out: sign-in, ask for access and the set-password page all open", `${login.st} ${reqPage.st} ${welcome.st}`);
  const link = await ask("/api/client-invite?token=" + "x".repeat(43));
  ok(link.st === 200 && /"state":"unknown"/.test(link.text) && !/"email":"[^"]/.test(link.text), "signed out: a made-up set-password link is unknown, and names nobody", link.st);
  const again = await ask("/api/client-invite/new-link", { method: "POST", body: JSON.stringify({ token: "x".repeat(43) }) });
  ok(again.st < 500 && !/"state":"sent"/.test(again.text), "signed out: asking for a new link with a made-up one sends nothing", again.st);
  for (const p of ["/client", "/client/flights", "/client/account", "/client/start"]) { const r = await ask(p); ok(r.st >= 300 && r.st < 400 && r.to === "/login", `signed out: ${p} asks for a sign-in`, `${r.st} → ${r.to}`); }
  const pwOut = await ask("/api/client/account/password", { method: "POST", body: "{}" });
  ok([401, 403, 404].includes(pwOut.st) || (pwOut.st >= 300 && pwOut.st < 400), "signed out: the password route answers nobody", pwOut.st);

  // ── the client ──
  const root = await ask("/", { who: client });
  ok(root.st >= 300 && root.st < 400 && (root.to === "/client" || root.to === "/client/flights"), "client: signing in lands on Timeline (/client), or Flights when they chose it", `${root.st} → ${root.to}`);
  const home = await ask("/client", { who: client });
  const menu = (/data-menu="([^"]*)"/.exec(home.text)?.[1] ?? "").split(" ").filter(Boolean);
  ok(home.st === 200 && /data-client-shell/.test(home.text) && !/data-cw-sidebar/.test(home.text), "client: Timeline opens in the client shell, with no staff shell", home.st);
  ok(JSON.stringify(menu) === JSON.stringify(["/client", "/client/flights", "/client/account"]) && /data-client-frame/.test(home.text), "client: the menu is Timeline, Flights, Account, and the page carries the wall's client frame", menu.join(" "));
  // the frame's own document, and the wall reads it makes (their scope only; this check account's scope matches nothing)
  const frameDoc = await ask("/digital-wall/timeline/?in=client&page=timeline", { who: client });
  ok(frameDoc.st === 200 && /<div id="root">/.test(frameDoc.text), "client: the wall's client surface answers the frame", frameDoc.st);
  const prefs = await ask("/api/client/prefs", { who: client }); let prefsJson = {}; try { prefsJson = JSON.parse(prefs.text); } catch { /* judged below */ }
  ok(prefs.st === 200 && prefsJson.ok === true && prefsJson.prefs && "start" in prefsJson.prefs, "client: their view preferences answer (start page, hidden operators and aircraft)", prefs.st);
  const prefsPut = await ask("/api/client/prefs", { who: client, method: "PUT", body: "{}" });
  ok(prefsPut.st === 403, "client: a check account's write to the preferences is refused (read-only)", prefsPut.st);
  for (const p of ["/digital-wall/api/aip-pdf?icao=EVRA", "/digital-wall/api/airports/search?q=EV", "/digital-wall/api/geo/airports", "/digital-wall/api/geo/countries", "/digital-wall/api/countries"]) { const r = await ask(p, { who: client }); ok(r.st === 404, `client: the retired wall read ${p.split("?")[0].replace("/digital-wall", "")} is 404`, r.st); }
  const clocks = await ask("/digital-wall/api/display/clocks", { who: client });
  ok(clocks.st === 200, "client: the room's clocks answer (the frame's clock bar)", clocks.st);
  const me = await ask("/api/client/me", { who: client }); let meJson = {}; try { meJson = JSON.parse(me.text); } catch { /* judged below */ }
  ok(me.st === 200 && meJson.ok === true && meJson.status === "approved" && Array.isArray(meJson.switches), "client: their own standing answers (approved, their switches)", `${me.st} · ${meJson.switches?.length ?? 0} switches`);
  const from = encodeURIComponent(new Date(Date.now() - 2 * 3600e3).toISOString()), to = encodeURIComponent(new Date(Date.now() + 7 * 86400e3).toISOString());
  const feed = await ask(`/digital-wall/api/flights/normalized?window=all-cached&limit=500&from=${from}&to=${to}`, { who: client }); let n = -1; try { n = (JSON.parse(feed.text).flights ?? []).length; } catch { /* judged below */ }
  ok(feed.st === 200 && n === 0, "client: the wall's feed answers, cut to their scope (this one matches nothing: 0 flights)", `${feed.st} · ${n} flights`);
  for (const [p, mark] of [["/client/flights", "data-client-frame"], ["/client/account", 'data-tab="account"'], ["/client/start", "data-client-start"]]) { const r = await ask(p, { who: client }); ok(r.st === 200 && r.text.includes(mark), `client: ${p} opens`, r.st); }
  for (const p of ["/client/airports", "/client/documents"]) { const r = await ask(p, { who: client }); ok(r.st === 404, `client: the retired page ${p} is 404`, r.st); }
  const acct = await ask("/client/account", { who: client });
  ok(acct.text.includes(client.email), "client: Account says who is signed in");
  // the address clients write to is a setting; the page must show exactly what the setting holds (never printed here)
  const SB = process.env.NEXT_PUBLIC_SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const set = await fetch(`${SB}/rest/v1/app_settings?select=value&key=eq.clients.support_email`, { headers: { apikey: K, authorization: `Bearer ${K}` } }).then((r) => r.json(), () => []);
  const address = String(set?.[0]?.value?.email ?? "");
  // Cloudflare's email obfuscation rewrites every mailto: in the HTML and decodes it in the browser (found 2026-11-09): the
  // address is read back out of that form here, so the page is held to the setting either way
  const cfDecode = (hex) => { const key = parseInt(hex.slice(0, 2), 16); let out = ""; for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key); return out; };
  const shown = [...acct.text.matchAll(/data-cfemail="([0-9a-f]+)"/g)].map((m) => cfDecode(m[1]));
  ok(address ? (acct.text.includes(`mailto:${address}`) || shown.includes(address)) : !acct.text.includes("data-client-contact"), address ? "client: Account shows the address clients write to (the Admin › Clients setting)" : "client: no address to write to is set, and Account shows none", address ? `set${shown.length ? " · through Cloudflare's obfuscation" : ""}` : "empty");
  const pw = await ask("/api/client/account/password", { who: client, method: "POST", body: "{}" });
  ok(pw.st === 403, "client: the password route is there, and a check account's write is refused (read-only)", pw.st);
  ok((await ask("/api/client/account/password", { who: client })).st === 404, "client: GET on the password route is 404");
  const closed = ["/dashboard", "/admin/clients", "/admin/users", "/account/profile", "/agent", "/aip", "/docs", "/client/refused", "/api/admin/clients", "/api/search?q=EVRA", "/agent/api/intake/requests", "/agent/api/mailbox/messages"];
  const res = []; for (const p of closed) { const r = await ask(p, { who: client }); res.push([p, r.st, r.to]); }
  ok(res.every(([p, st, to2]) => st === 404 || st === 401 || st === 403 || (p === "/client/refused" && to2 === "/client")), "client: staff pages, staff APIs, intake and the mailbox are all refused", res.filter(([p, st, to2]) => !(st === 404 || st === 401 || st === 403 || (p === "/client/refused" && to2 === "/client"))).map(([p, st]) => `${p} ${st}`).join(" · "));
  const id = "00000000-0000-4000-8000-000000000001";
  const scan = await ask(`/agent/api/intake/attachments/${id}`, { who: client }), raw = await ask(`/agent/api/mailbox/messages/${id}/raw`, { who: client });
  ok(scan.st === 404 && raw.st === 404, "client: a passport scan and a raw email answer 404", `${scan.st} ${raw.st}`);
}
