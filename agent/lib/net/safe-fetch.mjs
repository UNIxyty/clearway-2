// Fetching an address that came from outside (2026-11-02): an image URL in an email a stranger sent us. The mailbox's
// image proxy used plain fetch() with redirects followed, so a sender could point it at 127.0.0.1 — our own portal,
// wall gateway and agent, which trust loopback — and a staff member opening the mail made our server fetch it.
//
// Here, before any byte is sent:
//   · only http: and https:;
//   · the host is RESOLVED and every address it resolves to is checked — loopback, private (RFC 1918), link-local
//     (incl. 169.254.169.254, the cloud metadata address), carrier-grade NAT, unspecified, multicast, broadcast,
//     unique-local and IPv4-mapped IPv6 are refused;
//   · the connection goes to the address that was checked (the lookup is pinned), so a second DNS answer cannot swap it;
//   · no redirects: a 3xx is a refusal (the first hop passing says nothing about the second);
//   · a short timeout and a size cap, counted while reading.
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { lookup } from "node:dns/promises";

function v4Blocked(ip) {
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}
/** True when the address is not on the public internet (or cannot be told). */
export function blockedAddress(ip) {
  if (net.isIPv4(ip)) return v4Blocked(ip);
  if (!net.isIPv6(ip)) return true;
  const x = ip.toLowerCase();
  const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); if (mapped) return v4Blocked(mapped[1]);
  return x === "::" || x === "::1" || x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb") || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("ff") || x.startsWith("::ffff:") || x.startsWith("64:ff9b:");
}

/**
 * GET a public URL, carefully. Resolves { status, contentType, body } or throws an Error whose `reason` is one of:
 * scheme | address | redirect | timeout | too-large | network.
 */
export async function safeFetch(rawUrl, { timeoutMs = 8000, maxBytes = 5_000_000, accept = "image/*" } = {}) {
  let u; try { u = new URL(String(rawUrl)); } catch { throw Object.assign(new Error("not a URL"), { reason: "scheme" }); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw Object.assign(new Error("only http and https"), { reason: "scheme" });
  if (u.username || u.password) throw Object.assign(new Error("credentials in the URL"), { reason: "scheme" });
  const host = u.hostname.replace(/^\[|\]$/g, "");
  let addrs;
  if (net.isIP(host)) addrs = [{ address: host, family: net.isIP(host) }];
  else { try { addrs = await lookup(host, { all: true, verbatim: true }); } catch { throw Object.assign(new Error("the host does not resolve"), { reason: "network" }); } }
  if (!addrs.length || addrs.some((a) => blockedAddress(a.address))) throw Object.assign(new Error("not a public address"), { reason: "address" });
  const pinned = addrs[0];
  const mod = u.protocol === "https:" ? https : http;
  return await new Promise((resolve, reject) => {
    const req = mod.request(u, {
      method: "GET", headers: { accept, "user-agent": "Clearway-mail-image/1" }, timeout: timeoutMs,
      // the connection goes to the address that was checked, whatever DNS says the second time
      lookup: (_h, opts, cb) => (opts?.all ? cb(null, [{ address: pinned.address, family: pinned.family }]) : cb(null, pinned.address, pinned.family)),
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400) { res.resume(); reject(Object.assign(new Error("redirects are not followed"), { reason: "redirect" })); return; }
      const chunks = []; let n = 0;
      res.on("data", (c) => { n += c.length; if (n > maxBytes) { req.destroy(); reject(Object.assign(new Error("too large"), { reason: "too-large" })); } else chunks.push(c); });
      res.on("end", () => resolve({ status: res.statusCode, contentType: String(res.headers["content-type"] ?? ""), body: Buffer.concat(chunks) }));
      res.on("error", () => reject(Object.assign(new Error("read failed"), { reason: "network" })));
    });
    req.on("timeout", () => { req.destroy(); reject(Object.assign(new Error("timed out"), { reason: "timeout" })); });
    req.on("error", (e) => reject(e.reason ? e : Object.assign(new Error("connection failed"), { reason: "network" })));
    req.end();
  });
}
