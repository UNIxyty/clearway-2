// Tiny read helper for rig checks: node --env-file=.env.rig rig/intake/db.mjs "<postgrest path>"
import { assertRigSafe } from "../../lib/rig-guard.mjs";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL; if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error("rig only");
const r = await fetch(`${url}/rest/v1/${process.argv[2]}`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } });
console.log(JSON.stringify(await r.json(), null, process.argv[3] === "pretty" ? 2 : 0));
void assertRigSafe;
