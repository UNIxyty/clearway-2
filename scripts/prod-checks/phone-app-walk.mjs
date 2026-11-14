// The phone app's address on production (v3, 2026-11-14): one address for staff and clients, and the old addresses lead
// to it. Read-only, as a "user" and a "client" check account. Status codes and yes/no only.
// A phone opening /digital-wall/timeline/ is sent on by the app itself (in the browser): that one is the rig's
// (rig/mobile/phone-v3-check.mjs, part "redirects"); the container this runs in has no browser.
export const ROLES = ["user", "client"];
export async function check({ base, accounts: [u, c], ok }) {
  const ask = async (p, who) => {
    const r = await fetch(`${base}${p}`, { redirect: "manual", headers: who ? { cookie: who.cookie } : {}, signal: AbortSignal.timeout(30000) }).catch(() => null);
    if (!r) return { st: 0, to: "", text: "" };
    return { st: r.status, to: (r.headers.get("location") || "").replace(/^https?:\/\/[^/]+/, ""), text: await r.text().catch(() => "") };
  };
  const moved = (r) => r.st >= 300 && r.st < 400;
  // the old phone wall's addresses
  const old = await ask("/m/wall", u);
  ok(moved(old) && /^\/digital-wall\/phone\/?$/.test(old.to), "staff: the old phone wall (/m/wall) leads to the phone app", `${old.st} → ${old.to}`);
  const oldFlight = await ask("/m/wall?flight=zzz%3A1", u);
  ok(moved(oldFlight) && /^\/digital-wall\/phone\/?\?flight=zzz(%3A|:)1$/.test(oldFlight.to), "staff: /m/wall?flight=<id> leads to the phone app and keeps the flight", `${oldFlight.st} → ${oldFlight.to}`);
  const oldPath = await ask("/m/wall/zzz%3A1", u);
  ok(moved(oldPath) && /^\/digital-wall\/phone\/?\?flight=zzz(%3A|:)1$/.test(oldPath.to), "staff: /m/wall/<id> leads to the phone app and keeps the flight", `${oldPath.st} → ${oldPath.to}`);
  // the one address
  const bare = await ask("/digital-wall/phone?flight=zzz%3A1", u);
  ok(bare.st === 301 && /^\/digital-wall\/phone\/\?flight=zzz(%3A|:)1$/.test(bare.to), "the address without its last slash is sent to the one with it, flight kept", `${bare.st} → ${bare.to}`);
  for (const [who, name] of [[u, "staff"], [c, "client"]]) {
    const page = await ask("/digital-wall/phone/", who);
    ok(page.st === 200 && /<div id="root">/.test(page.text), `${name}: the phone app answers at /digital-wall/phone/`, page.st);
    // the page must not shut the user's zoom
    ok(page.st === 200 && !/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/.test(page.text), `${name}: the page lets the user zoom (no user-scalable=no, no maximum-scale=1)`);
  }
  // the shipped code holds the phone app: the entry chunk names a PhoneApp chunk, and it answers
  const html = (await ask("/digital-wall/phone/", u)).text;
  const entry = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1])[0] || "";
  const js = entry ? (await ask(entry.startsWith("/") ? entry : `/digital-wall/timeline/${entry}`, u)).text : "";
  const phone = (js.match(/assets\/PhoneApp-[\w-]+\.js/) || [])[0] || "";
  const chunk = phone ? await ask(`/digital-wall/timeline/${phone}`, u) : { st: 0, text: "" };
  ok(chunk.st === 200 && chunk.text.includes("data-phone-app"), "the deployed wall app carries the phone app (its chunk answers)", `${chunk.st}${phone ? "" : " · no PhoneApp chunk named"}`);
  ok(chunk.st === 200 && !/mw-root|data-staff-phone/.test(chunk.text) && !/assets\/(PhoneWall|StaffPhone|ClientPhone)-/.test(js), "the old phone wall and last session's staff phone app are not in the shipped code");
  // signed out: the app's data is not served
  const out = await ask("/digital-wall/api/timeline/flights");
  ok(out.st === 401 || out.st === 403 || moved(out), "signed out: the wall's feed answers nobody", out.st);
  const health = await ask("/digital-wall/api/health", u);
  ok(health.st === 200, "the wall answers", health.st);
}
