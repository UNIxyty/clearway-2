// Personal data in intake: where it may be, and how it is kept out of everywhere else.
//
// Identities (names, dates of birth, passport numbers, expiry dates, nationalities on a crew/pax row) live in
// exactly two places: intake_extractions.personal and the stored message itself (raw .eml, attachments).
// Everything else — review fields, notes, conflicts, understood blocks, list rows, search text, emails, audit
// rows, logs — is scrubbed with the tokens the extraction found PLUS a pattern fallback (when unsure, mask).
export const MASK = "••••••••";
export const REMOVED = "[personal data]";

const PASSPORTISH = /\b(?=[A-Z0-9]{6,12}\b)(?=(?:[A-Z]*\d){6})[A-Z]{0,3}\d[A-Z0-9]{5,11}\b/g;       // letters + ≥6 digits
const DOB_WITH_AGE = /\b\d{1,2}[ .\/-](?:[A-Za-z]{3}|\d{1,2})[ .\/-](?:19|20)\d{2}\s*\(\d{1,3}\)/g; // "03 Feb 1981 (45)"
const DOB_WORDED = /\b(?:DOB|D\.O\.B\.?|date of birth|born)\s*[:\-]?\s*\d{1,2}[ .\/-](?:[A-Za-z]{3,9}|\d{1,2})[ .\/-](?:19|20)?\d{2}/gi;

/** Every identity string the extraction found, longest first (so full names win over their parts). */
export function personalTokens(people = []) {
  const set = new Set();
  for (const p of people ?? []) {
    for (const k of ["dob", "passport", "expiry"]) if (p?.[k] && String(p[k]).trim().length >= 4) set.add(String(p[k]).trim());
    if (p?.name) {
      const n = String(p.name).trim(); if (n.length >= 3 && !/^-+$|^tba$/i.test(n)) set.add(n);
      const parts = n.replace(/,/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !/^(mr|mrs|ms|miss|dr)\.?$/i.test(w));
      for (const w of parts) set.add(w);
      if (parts.length >= 2) { set.add(`${parts[parts.length - 1]}, ${parts.slice(0, -1).join(" ")}`); set.add(`${parts[0]}, ${parts.slice(1).join(" ")}`); }
    }
  }
  return [...set].sort((a, b) => b.length - a.length);
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Replaces identities in a string (for anything that is not the message reader). */
export function scrubString(s, tokens, replacement = REMOVED) {
  if (s == null) return s;
  let out = String(s);
  for (const t of tokens) out = out.replace(new RegExp(`(?<![\\p{L}\\d])${esc(t)}(?:\\s*\\(\\d{1,3}\\))?(?![\\p{L}\\d])`, "giu"), replacement);
  return out.replace(DOB_WITH_AGE, replacement).replace(DOB_WORDED, replacement).replace(PASSPORTISH, (m) => (/^\d+$/.test(m) ? m : replacement));
}
/** Deep scrub of a JSON value's strings. */
export function scrubDeep(v, tokens) {
  if (typeof v === "string") return scrubString(v, tokens);
  if (Array.isArray(v)) return v.map((x) => scrubDeep(x, tokens));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrubDeep(x, tokens)]));
  return v;
}

/**
 * For the message reader: masks the SENSITIVE values (dates of birth, passport and ID numbers, expiry) and
 * leaves names readable, as the spec draws. Returns { text, count }. `mark` wraps each masked value so the
 * client can render the mask chip; the real value is never in the response.
 */
export function maskForReader(s, people = [], mark = (i) => `\u0000M${i}\u0000`) {
  const sensitive = new Set();
  for (const p of people ?? []) for (const k of ["dob", "passport", "expiry"]) if (p?.[k] && String(p[k]).trim().length >= 4) sensitive.add(String(p[k]).trim());
  let count = 0; let out = String(s ?? ""); const values = [];
  const hit = (m0) => { values.push(m0); return mark(count++, m0); };
  // A date of birth takes the age printed after it with it ("01 Jan 1980 (46)"): the age gives the year away.
  for (const t of [...sensitive].sort((a, b) => b.length - a.length)) out = out.replace(new RegExp(`(?<![\\p{L}\\d])${esc(t)}(?:\\s*\\(\\d{1,3}\\))?(?![\\p{L}\\d])`, "gu"), hit);
  out = out.replace(DOB_WITH_AGE, hit).replace(DOB_WORDED, hit).replace(PASSPORTISH, (m) => (/^\d+$/.test(m) ? m : hit(m)));
  return { text: out, count, values };
}

/** The search text for a message: agent-derived facts plus the body with identities removed. */
export function searchTextFor({ from, subject, reference, registrations = [], callsigns = [], airports = [], bodyText = "", people = [] }) {
  const tokens = personalTokens(people);
  const body = String(bodyText ?? "").split(/\r?\n/).filter((line) => !tokens.some((t) => t.length >= 4 && line.includes(t))).join("\n");
  const parts = [from, subject, reference, ...registrations, ...registrations.map((r) => String(r).replace(/-/g, "")), ...callsigns, ...airports, scrubString(body, tokens, " ")];
  return scrubString(parts.filter(Boolean).join("\n"), tokens, " ").replace(/[ \t]+/g, " ").slice(0, 20000);
}
