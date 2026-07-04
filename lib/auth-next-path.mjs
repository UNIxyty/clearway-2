// Validation for the `next` (return-to) parameter carried through the sign-in
// flow. Every consumer of a user-supplied return URL — the login card, the
// middleware bounce for already-signed-in users, the auth callback — must go
// through safeNextPath so an attacker-crafted link can never redirect a fresh
// session to an external host (open redirect).
//
// Only same-origin relative paths survive:
//   "/digital-wall/console/flights?d=today"  -> kept as-is
//   "" / null / undefined                    -> fallback
//   "https://evil.com", "//evil.com"         -> fallback
//   "/\\evil.com" (backslash tricks)         -> fallback
//   values with control characters/spaces    -> fallback

export function safeNextPath(raw, fallback = "/") {
  if (typeof raw !== "string") return fallback;
  const value = raw.trim();
  if (!value.startsWith("/")) return fallback;
  // "//host" is protocol-relative; browsers also treat "\" as "/" when
  // resolving URLs, so "/\evil.com" would escape the origin too.
  if (value.startsWith("//") || value.includes("\\")) return fallback;
  // Control characters and raw whitespace can smuggle schemes past lenient
  // URL parsers; real paths arrive percent-encoded, so reject them outright.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0020\u007f]/.test(value)) return fallback;
  return value;
}
