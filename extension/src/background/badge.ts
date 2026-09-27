// Toolbar badge (§E10): one badge at a time, by priority; the pale icon when signed out. Sources are the
// stored `pending` state, so a restarted worker draws the same badge.
import { apiJson } from "~/shared/api";
import type { PendingConfirmation } from "~/shared/protocol";
import { getPending, getSession, setPending } from "~/shared/storage";
import { tellPanel } from "./state";

const ICONS_ON = { 16: "icons/app-16.png", 32: "icons/app-32.png", 48: "icons/app-48.png", 128: "icons/app-128.png" };
const ICONS_OFF = { 16: "icons/app-off-16.png", 32: "icons/app-off-32.png", 48: "icons/app-off-48.png", 128: "icons/app-off-128.png" };
const COLOURS = { confirm: "#d97706", notam: "#e5484d", job: "#2563eb", site: "#2563eb" } as const;
export async function applyBadge() {
  const session = await getSession();
  const pending = await prunePending();
  if (session.status !== "signed-in") {
    await chrome.action.setBadgeText({ text: "" });
    await chrome.action.setTitle({ title: session.status === "disconnected" ? "Clearway — disconnected" : "Clearway — signed out" });
    // The pale set (icons/app-off-*.png, 40 % opacity), generated with the normal set by extension/scripts/make-icons.mjs.
    await chrome.action.setIcon({ path: ICONS_OFF }).catch(() => {});
    return;
  }
  await chrome.action.setIcon({ path: ICONS_ON }).catch(() => {});
  await chrome.action.setTitle({ title: "Clearway Ops Agent" });
  const badge = pending.confirmations.some((c) => c.fromThisBrowser) ? { text: "!", color: COLOURS.confirm }
    : pending.notamReview > 0 ? { text: pending.notamReview > 9 ? "9+" : String(pending.notamReview), color: COLOURS.notam }
    : pending.jobs.length ? { text: "✓", color: COLOURS.job }
    : pending.approvedSites.length ? { text: "1", color: COLOURS.site }
    : { text: "", color: COLOURS.job };
  await chrome.action.setBadgeText({ text: badge.text });
  if (badge.text) { await chrome.action.setBadgeBackgroundColor({ color: badge.color }); try { await chrome.action.setBadgeTextColor({ color: "#ffffff" }); } catch { /* older Chrome */ } }
}

/** Drop expired confirmations (§3 rule 8) and set the alarm for the next expiry — alarms survive worker restarts. */
export async function prunePending() {
  const p = await getPending();
  const now = Date.now();
  const keep = p.confirmations.filter((c) => !c.expiresAt || new Date(c.expiresAt).getTime() > now);
  if (keep.length !== p.confirmations.length) { p.confirmations = keep; await setPending(p); tellPanel({ type: "pending", pending: p }); }
  const next = keep.map((c) => (c.expiresAt ? new Date(c.expiresAt).getTime() : Infinity)).filter((t) => Number.isFinite(t)).sort((a, b) => a - b)[0];
  if (next) await chrome.alarms.create("pending-expiry", { when: next + 500 }); else await chrome.alarms.clear("pending-expiry");
  return p;
}

export async function addPendingConfirmations(list: PendingConfirmation[]) {
  const p = await getPending();
  let changed = false;
  for (const c of list) {
    const i = p.confirmations.findIndex((x) => x.token === c.token);
    if (i < 0) { p.confirmations.push(c); changed = true; } else if (JSON.stringify(p.confirmations[i]) !== JSON.stringify(c)) { p.confirmations[i] = c; changed = true; }
  }
  if (changed) { await setPending(p); await applyBadge(); tellPanel({ type: "pending", pending: p }); }
  return changed;
}
export async function settleConfirmation(token: string) {
  const p = await getPending();
  const n = p.confirmations.length; p.confirmations = p.confirmations.filter((c) => c.token !== token);
  if (p.confirmations.length !== n) { await setPending(p); await applyBadge(); tellPanel({ type: "pending", pending: p }); }
}
export async function clearJobs() { const p = await getPending(); if (p.jobs.length) { p.jobs = []; await setPending(p); await applyBadge(); } }
export async function markSiteEnabled(host: string) { const p = await getPending(); const n = p.approvedSites.length; p.approvedSites = p.approvedSites.filter((h) => h !== host); if (n !== p.approvedSites.length) { await setPending(p); await applyBadge(); } }

/** Server-side sources (§E10 table rows 2–3): NOTAM review count and finished jobs, and confirmations this browser started that the server still holds. */
export async function pollBadge() {
  const session = await getSession(); if (session.status !== "signed-in") return;
  const { status, body } = await apiJson<{ ok: boolean; confirmations: { token: string; what: string | null; expiresAt: string | null; conversationId: string | null; toolName: string }[]; notamReview: number; jobs: { id: string; filename: string; at: string; conversationId: string | null }[] }>("/extension/badge");
  if (status !== 200 || !body?.ok) return;
  const p = await getPending();
  const known = new Set(p.confirmations.map((c) => c.token));
  // Only confirmations this browser started are badged; the server's list confirms which of ours are still pending.
  const live = new Set((body.confirmations ?? []).map((c) => c.token));
  p.confirmations = p.confirmations.filter((c) => live.has(c.token) || !c.fromThisBrowser || (c.expiresAt && Date.now() - new Date(c.expiresAt).getTime() < 0 && Date.now() - new Date(c.expiresAt).getTime() > -5 * 60_000 && !known.has(c.token)));
  p.notamReview = Number(body.notamReview) || 0;
  const seen = new Set(p.jobs.map((j) => j.id));
  for (const j of body.jobs ?? []) if (!seen.has(j.id)) p.jobs.push(j);
  await setPending(p); await applyBadge(); tellPanel({ type: "pending", pending: p });
}
