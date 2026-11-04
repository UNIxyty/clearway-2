// The caller's address, for a limiter (2026-11-05). Only what the caller cannot write.
//
// Until today the signed-out limiters keyed on the FIRST x-forwarded-for value. Cloudflare appends to that header; it
// does not replace it, so the first value is whatever the visitor wrote: a fresh bucket on every request, and "8 an hour"
// was unlimited. On /api/client-requests every request that lands emails the ops notify list.
//
//   cf-connecting-ip, and nothing else. Cloudflare sets it on every request it forwards and overwrites any a visitor
//   sent. Production's portal is published on the server's loopback only (docker-compose.yml): every outside request
//   comes through Cloudflare's tunnel, and the wall's nginx passes the header on. The rig's proxy sets it the same way
//   (rig/proxy.mjs).
//   Without it: null, and the route refuses. Not the last x-forwarded-for either: Next's server adds no value of its
//   own, so with no proxy of ours in front every value in it is the caller's (2026-11-05, measured: ten direct requests
//   with ten invented values, none refused). A request without Cloudflare's header did not come through our front door.
//
// Plain module: route handlers and checks import it alike.

/** @param {{ get(name: string): string | null }} headers @returns {string | null} */
export function callerAddress(headers) {
  const cf = String(headers.get("cf-connecting-ip") ?? "").trim();
  return cf || null;
}

/** At most `max` per key in a rolling hour, in this process. `take(key)` → true when allowed (and counts it). */
export function hourlyLimit(max) {
  const seen = new Map();
  return {
    take(key) {
      const now = Date.now();
      const hits = (seen.get(key) ?? []).filter((t) => now - t < 3600e3);
      if (hits.length >= max) { seen.set(key, hits); return false; }
      seen.set(key, [...hits, now]);
      if (seen.size > 10_000) for (const [k, v] of seen) if (!v.some((t) => now - t < 3600e3)) seen.delete(k);   // keep it small
      return true;
    },
  };
}

/** The answer for a request with no address of ours on it. */
export const NO_ADDRESS = "This request did not come through the portal's own address, so it was not accepted.";
