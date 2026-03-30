import crypto from "crypto";

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function isValidPassword(password) {
  return typeof password === "string" && password.length >= 8;
}

export function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export function buildAppUrl(publicSiteUrl, requestOrigin) {
  const site = String(publicSiteUrl || "").trim();
  if (site) return site.replace(/\/+$/, "");
  return String(requestOrigin || "").trim().replace(/\/+$/, "");
}

export function randomToken() {
  return crypto.randomBytes(32).toString("hex");
}
