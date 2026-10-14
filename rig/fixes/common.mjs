// Shared by the rig/fixes checks: sign in on the sign-in rig (proxy :3989) as a rig account, and PASS/FAIL output.
import { chromium } from "playwright";
export const BASE = "http://127.0.0.1:3989";
export const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const text = async (l) => (await l.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
export async function signedIn(who, { width = 1600, height = 1100 } = {}) {
  const browser = await chromium.launch();
  const sess = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: `rig-access-${who}@rig.invalid`, password: "rig-access-check-only" }) })).json();
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.addCookies([{ name: `sb-${new URL(SB).hostname.split(".")[0]}-auth-token`, value: `base64-${Buffer.from(JSON.stringify(sess)).toString("base64")}`, url: BASE }]);
  const page = await ctx.newPage();
  return { browser, ctx, page, userId: sess.user?.id };
}
let failed = 0;
export function ok(cond, label, detail = "") { if (!cond) failed++; console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? `  · ${detail}` : ""}`); }
export function done() { console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED"); process.exit(failed ? 1 : 0); }
export async function rest(pathAndQuery, init = {}) {
  const res = await fetch(`${SB}/rest/v1/${pathAndQuery}`, { ...init, headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json", ...(init.headers || {}) } });
  return res.status === 204 ? null : res.json().catch(() => null);
}
