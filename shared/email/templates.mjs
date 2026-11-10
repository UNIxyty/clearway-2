// Every email the platform sends (design "Clearway Emails", emails/manifest.json, 2026-11-10), one function each, all
// through the master layout. Each takes plain values (never HTML), escapes them in the layout, and returns
// { subject, preheader, html, text }. Times are passed already formatted with fmtZ ("12 Nov 2026 19:14Z").
// Common options on every template: { portalUrl, supportEmail }.
import { B, fmtZ, render } from "./layout.mjs";

const product = "Clearway";
const common = (o) => ({ portalUrl: o.portalUrl, supportEmail: o.supportEmail });
const t = (v) => (v instanceof Date || typeof v === "number" || /^\d{4}-\d{2}-\d{2}T/.test(String(v ?? "")) ? fmtZ(v) : String(v ?? ""));

export const TEMPLATES = {
  // ── Staff accounts ──
  "01-staff-confirm-email": (o) => render({ ...common(o), subject: `Confirm your email for ${product}`, preheader: `One step left: confirm ${o.email} to finish signing up.`, headline: "Confirm your email",
    blocks: [B.paragraph([{ t: `Hi ${o.name || "there"}, confirm ` }, { t: o.email, strong: true }, { t: ` to finish creating your ${product} staff account. After that, an admin reviews it.` }]), B.button("Confirm email", o.link), B.note(`This link works once and expires ${t(o.expiresAt)}. If you didn’t sign up, ignore this email and no account is created.`)],
    reason: "someone signed up for a staff account with this address" }),
  "02-staff-pending-approval": (o) => render({ ...common(o), subject: `Your ${product} account is waiting for approval`, preheader: "Your email is confirmed. An admin reviews new accounts, usually within one working day.", headline: "Your account is waiting for approval",
    blocks: [B.paragraph(`Thanks, ${o.name || "there"}. Your email is confirmed. An admin reviews every new staff account, usually within one working day. We’ll email you when it’s done.`), B.details([["Email", o.email], ["Signed up", t(o.signedUpAt), { mono: true }]]), B.note("You can’t sign in until the account is approved.")],
    reason: `you signed up for a ${product} staff account` }),
  "03-staff-approved": (o) => render({ ...common(o), subject: `Your ${product} account is approved`, preheader: `${o.approvedBy || "An admin"} approved your account. You can sign in now.`, headline: "Your account is approved",
    blocks: [B.paragraph(`${o.approvedBy || "An admin"} approved your ${product} account. You can sign in now.`), B.details([["Email", o.email], ["Role", o.role], ["Approved", t(o.approvedAt), { mono: true }]]), B.button("Sign in", o.link)],
    reason: "your staff account was approved" }),
  "04-staff-reset-password": (o) => render({ ...common(o), subject: `Reset your ${product} password`, preheader: `Use this link to choose a new password. It expires ${t(o.expiresAt)}.`, headline: "Reset your password",
    blocks: [B.paragraph([{ t: "Someone asked to reset the password for " }, { t: o.email, strong: true }, { t: ". If that was you, choose a new one." }]), B.button("Choose a new password", o.link), B.details([["Requested", t(o.requestedAt), { mono: true }], ["From", o.device]]), B.note(`This link works once and expires ${t(o.expiresAt)}. If you didn’t ask for this, ignore this email; your password stays as it is.`)],
    reason: "a password reset was requested for your account" }),
  "05-staff-confirm-new-email": (o) => render({ ...common(o), subject: "Confirm your new email address", preheader: `Confirm ${o.newEmail} to make it your ${product} sign-in address.`, headline: "Confirm your new email address",
    blocks: [B.paragraph([{ t: `You asked to change your ${product} sign-in email from ${o.oldEmail} to ` }, { t: o.newEmail, strong: true }, { t: ". Confirm to make the change." }]), B.button("Confirm new email", o.link), B.note(`This link expires ${t(o.expiresAt)}. Until you confirm, you keep signing in with ${o.oldEmail}. Didn’t ask for this? Write to ${o.supportEmail || "Clearway ops"}.`)],
    reason: "someone asked to change the sign-in email on your account" }),
  "06-staff-password-changed": (o) => render({ ...common(o), subject: `Your ${product} password was changed`, preheader: `The password for ${o.email} was changed on ${t(o.changedAt)}.`, headline: "Your password was changed",
    blocks: [B.paragraph([{ t: "The password for " }, { t: o.email, strong: true }, { t: " was changed. You’ve been signed out on your other devices." }]), B.details([["Changed", t(o.changedAt), { mono: true }], ["From", o.device]]), B.note("If this wasn’t you, reset your password now and tell Clearway ops."), B.button("Reset password", o.resetLink)],
    reason: "the password on your staff account changed" }),
  // ── Clients ──
  "07-client-request-received": (o) => render({ ...common(o), subject: "We received your access request", preheader: `Clearway ops will review your request for ${o.company}, usually within one working day.`, headline: "We received your access request",
    blocks: [B.paragraph([{ t: `Thanks, ${o.name || "there"}. Clearway ops will review your request for ` }, { t: o.company, strong: true }, { t: ` and write to you at ${o.email}, usually within one working day.` }]), B.details([["Name", o.name], ["Company", o.company], ["Email", o.email], ["Sent", t(o.requestedAt), { mono: true }]]), B.note("You don’t need to do anything until then.")],
    reason: `you asked for access to the ${product} client portal` }),
  "08-client-approved-set-password": (o) => render({ ...common(o), subject: `Your ${product} access is approved`, preheader: `Set a password to sign in. The link works once and expires ${t(o.expiresAt)}.`, headline: "Your access is approved",
    blocks: [B.paragraph([{ t: "Clearway ops approved client portal access for " }, { t: o.company, strong: true }, { t: ". Set a password to sign in." }]), B.button("Set your password", o.link), B.note([{ t: "This link works once and expires " }, { t: t(o.expiresAt), strong: true }, { t: ". If it expires, ask for a new one on the sign-in page." }]), B.details([["You can see", o.accessSummary], ["Approved", t(o.approvedAt), { mono: true }]])],
    reason: "your request for client access was approved" }),
  "09-client-request-refused": (o) => render({ ...common(o), subject: "Your access request was not approved", preheader: `Clearway ops reviewed your request for ${o.company}.`, headline: "Your access request was not approved",
    blocks: [B.paragraph([{ t: "Clearway ops reviewed your request for " }, { t: o.company, strong: true }, { t: " and can’t give access to the client portal." }]), o.refusalNote ? B.note(o.refusalNote) : null, B.paragraph(`If you think this is a mistake, write to ${o.supportEmail || "Clearway ops"}.`)],
    reason: `you asked for access to the ${product} client portal` }),
  "10-client-access-removed": (o) => render({ ...common(o), subject: `Your ${product} access was removed`, preheader: `Your client access for ${o.company} ended on ${t(o.removedAt)}.`, headline: "Your access was removed",
    blocks: [B.paragraph([{ t: "Your client portal access for " }, { t: o.company, strong: true }, { t: ` ended on ${t(o.removedAt)}. You’ve been signed out on every device.` }]), B.paragraph(`Questions about this go to ${o.supportEmail || "Clearway ops"}.`)],
    reason: `you had access to the ${product} client portal` }),
  "11-client-new-set-password-link": (o) => render({ ...common(o), subject: `A new link to set your ${product} password`, preheader: `Your earlier link expired. This one expires ${t(o.expiresAt)}.`, headline: "Here’s a new link to set your password",
    blocks: [B.paragraph(`Your earlier link expired. Use this one to set your password for the ${product} client portal.`), B.button("Set your password", o.link), B.note([{ t: "This link works once and expires " }, { t: t(o.expiresAt), strong: true }, { t: ". Earlier links no longer work." }])],
    reason: "you asked for a new set-password link" }),
  "12-client-password-changed": (o) => render({ ...common(o), subject: `Your ${product} password was changed`, preheader: `The password for ${o.email} was changed on ${t(o.changedAt)}.`, headline: "Your password was changed",
    blocks: [B.paragraph([{ t: "The password for your client portal account, " }, { t: o.email, strong: true }, { t: ", was changed. You’ve been signed out on your other devices." }]), B.details([["Changed", t(o.changedAt), { mono: true }], ["From", o.device]]), B.note(`If this wasn’t you, reset your password now and write to ${o.supportEmail || "Clearway ops"}.`), B.button("Reset password", o.resetLink)],
    reason: "the password on your client account changed" }),
  // ── To ops ──
  "13-ops-client-waiting": (o) => render({ ...common(o), subject: `Client waiting: ${o.name}, ${o.company}`, preheader: `${o.name} from ${o.company} asked for client access on ${t(o.requestedAt)}.`, eyebrow: "To Clearway ops", headline: "A client is waiting for approval",
    blocks: [B.paragraph([{ t: `${o.name} from ` }, { t: o.company, strong: true }, { t: " asked for client portal access." }]), B.details([["Name", o.name], ["Company", o.company], ["Type", o.clientType], ["Email", o.email], ["Asked", t(o.requestedAt), { mono: true }], ["Their note", o.note, { pre: true }]]), B.button("Review in Admin › Clients", o.adminLink)],
    reason: "you approve client access in Admin" }),
  "14-ops-staff-waiting": (o) => render({ ...common(o), subject: `Staff account waiting: ${o.name}`, preheader: `${o.name} (${o.email}) confirmed their email and needs approval.`, eyebrow: "To Clearway admins", headline: "A staff account is waiting for approval",
    blocks: [B.paragraph(`${o.name} confirmed their email and needs an admin to approve the account.`), B.details([["Name", o.name], ["Email", o.email], ["Signed up", t(o.signedUpAt), { mono: true }]]), B.button("Review in Admin › Users", o.adminLink)],
    reason: "you approve staff accounts in Admin" }),
  // ── Operational ──
  "15-flight-alert": (o) => render({ ...common(o), subject: `${o.flight} ${o.adep}→${o.ades}: ${o.changeSummary}`, preheader: `${o.changeSummary} · departs ${t(o.etd)}`, eyebrow: `Flight alert · ${o.alertType || ""}`, headline: `${o.flight}: ${o.changeSummary}`,
    blocks: [B.details([["Flight", `${o.flight}${o.registration ? ` · ${o.registration}` : ""}`, { mono: true }], ["Route", `${o.adep} → ${o.ades}`, { mono: true }], ["Departs", t(o.etd), { mono: true }], ["Arrives", t(o.eta), { mono: true }], ["What changed", o.change]]), B.code(o.notamText), B.button("Open flight", o.link)],
    reason: `you watch ${o.flight} in the ${product} portal` }),
  "16-aip-update": (o) => render({ ...common(o), subject: `AIP update: ${o.icao} ${o.document} (AIRAC ${o.airac})`, preheader: `${o.document} for ${o.icao} changed in AIRAC ${o.airac}, fetched ${t(o.fetchedAt)}.`, eyebrow: "AIP update", headline: `${o.document} for ${o.icao} changed`,
    blocks: [B.paragraph([{ t: "A new version of " }, { t: o.document, strong: true }, { t: ` for ${o.icao}${o.airportName ? ` (${o.airportName})` : ""} is in the library.` }]), B.details([["Airport", `${o.icao}${o.airportName ? ` · ${o.airportName}` : ""}`], ["Document", o.document], ["AIRAC cycle", `${o.airac}${o.effectiveAt ? ` · effective ${t(o.effectiveAt)}` : ""}`], ["Fetched", t(o.fetchedAt), { mono: true }], ["Source", o.source]]), B.button("Open document", o.link)],
    reason: `you follow AIP updates for ${o.icao}` }),
  "17-intake-request": (o) => render({ ...common(o), subject: `New flight request: ${o.reference} ${o.adep}→${o.ades}`, preheader: `${o.sender} sent a flight request that needs review.`, eyebrow: "Flight intake", headline: "A new flight request needs review",
    blocks: [B.paragraph(`${o.sender} sent a flight request. It’s in Flight intake.`), B.details([["From", o.sender], ["Reference", o.reference, { mono: true }], ["Route", `${o.adep} → ${o.ades}`, { mono: true }], ["Date", o.flightDate], ["Aircraft", o.aircraft], ["Missing", o.missing]]), B.button("Review in Flight intake", o.link)],
    reason: "you handle Flight intake requests" }),
  "18-system-alert": (o) => render({ ...common(o), subject: `[${String(o.level || "critical").toUpperCase()}] ${o.service}: ${o.statusText}`, preheader: `${o.service} ${o.statusText} since ${t(o.since)}.`, eyebrow: "System alert", headline: `${o.service}: ${o.statusText}`,
    blocks: [B.severity(o.level || "critical", t(o.since)), B.paragraph(`${o.service} failed its check.${o.impact ? ` ${o.impact}` : ""}`), B.details([["Service", o.service], ["Check", o.check], ["Since", t(o.since), { mono: true }], ["Last good", t(o.lastOk), { mono: true }]]), B.code(o.error), B.button("Open service status", o.link)],
    reason: `you’re an admin of the ${product} platform` }),
  "18c-system-alert-resolved": (o) => render({ ...common(o), subject: `[RESOLVED] ${o.service} is working again`, preheader: `${o.service} is back after ${o.duration}.`, eyebrow: "System alert", headline: `${o.service} is working again`,
    blocks: [B.severity("resolved", t(o.since)), B.paragraph(`${o.service} is working again.`), B.details([["Service", o.service], ["Check", o.check], ["Down for", o.duration], ["Last good", t(o.lastOk), { mono: true }]]), B.button("Open service status", o.link)],
    reason: `you’re an admin of the ${product} platform` }),
  // ── Generic ──
  /** { subject, preheader, headline, body (string or [strings]), details: [[k,v]], code, list: {title, lines}, buttonLabel, link, reason, eyebrow, blocks: extra B.* } */
  "19-notice": (o) => render({ ...common(o), subject: o.subject, preheader: o.preheader || "", eyebrow: o.eyebrow, headline: o.headline || o.subject,
    blocks: [...(Array.isArray(o.body) ? o.body : [o.body]).filter(Boolean).map((p) => B.paragraph(p)), o.details ? B.details(o.details) : null, o.list ? B.list(o.list.title, o.list.lines) : null, o.code ? B.code(o.code) : null, ...(o.blocks || []), o.link ? B.button(o.buttonLabel || "Open", o.link) : null],
    reason: o.reason || `you have an account on the ${product} platform`, signature: o.signature }),
};

export const TEMPLATE_IDS = Object.keys(TEMPLATES);

/** Build one email by id. Throws on an unknown id (a programming error, never a runtime condition). */
export function buildEmail(id, vars) {
  const fn = TEMPLATES[id];
  if (!fn) throw new Error(`No email template "${id}"`);
  return fn(vars || {});
}

/** Sample values for every template (the rig's rendering check and the design's preview): invented data only. */
export function sampleVars(id, portalUrl = "https://portal.example.invalid") {
  const base = { portalUrl, supportEmail: "ops-sample@example.invalid", email: "sample.person@example.invalid", name: "Sample Person", link: `${portalUrl}/auth/confirm?token=sample`, expiresAt: "2026-11-12T19:14:00Z", company: "Sample Air (invented)" };
  const by = {
    "02-staff-pending-approval": { signedUpAt: "2026-11-10T09:30:00Z" },
    "03-staff-approved": { approvedBy: "An admin", role: "User", approvedAt: "2026-11-10T10:12:00Z", link: `${portalUrl}/login` },
    "04-staff-reset-password": { requestedAt: "2026-11-10T08:05:00Z", device: "Safari on iPhone", link: `${portalUrl}/auth/reset?token_hash=sample` },
    "05-staff-confirm-new-email": { oldEmail: "old.person@example.invalid", newEmail: "new.person@example.invalid" },
    "06-staff-password-changed": { changedAt: "2026-11-10T08:10:00Z", device: "Chrome on Windows", resetLink: `${portalUrl}/login?forgot=1` },
    "07-client-request-received": { requestedAt: "2026-11-10T07:40:00Z" },
    "08-client-approved-set-password": { accessSummary: "Flights of Sample Air · weather, NOTAMs · passenger names", approvedAt: "2026-11-10T10:00:00Z", link: `${portalUrl}/welcome?token=sample` },
    "09-client-request-refused": { refusalNote: "We could not match your company to an operator we handle." },
    "10-client-access-removed": { removedAt: "2026-11-10T11:00:00Z" },
    "11-client-new-set-password-link": { link: `${portalUrl}/welcome?token=sample2` },
    "12-client-password-changed": { changedAt: "2026-11-10T11:30:00Z", device: "Safari on iPhone", resetLink: `${portalUrl}/login?forgot=1` },
    "13-ops-client-waiting": { clientType: "Broker", requestedAt: "2026-11-10T07:40:00Z", note: "Two legs next week for a client of ours.", adminLink: `${portalUrl}/admin/clients` },
    "14-ops-staff-waiting": { signedUpAt: "2026-11-10T09:30:00Z", adminLink: `${portalUrl}/admin/users` },
    "15-flight-alert": { flight: "SMP123", adep: "EVRA", ades: "EGLF", changeSummary: "runway closed", etd: "2026-11-11T06:00:00Z", eta: "2026-11-11T08:40:00Z", alertType: "NOTAM", registration: "YL-SMP", change: "RWY 07/25 closed 06:00–09:00Z", notamText: "A1234/26 NOTAMN\nQ) EGTT/QMRLC/IV/NBO/A/000/999/5117N00047W005\nA) EGLF B) 2611110600 C) 2611110900\nE) RWY 07/25 CLSD DUE WIP", link: `${portalUrl}/digital-wall/console/flights` },
    "16-aip-update": { icao: "EVRA", document: "AD 2", airac: "2612", fetchedAt: "2026-11-10T03:10:00Z", airportName: "Riga", effectiveAt: "2026-11-27T00:00:00Z", source: "EAD", link: `${portalUrl}/aip/EVRA` },
    "17-intake-request": { reference: "REQ-2026-0411", adep: "EVRA", ades: "LFMN", sender: "sample.broker@example.invalid", flightDate: "14 Nov 2026", aircraft: "YL-SMP", missing: "Passenger list", link: `${portalUrl}/intake` },
    "18-system-alert": { level: "critical", service: "NOTAM sync", statusText: "not answering", since: "2026-11-10T05:00:00Z", impact: "NOTAM data is not refreshing.", check: "GET /health", lastOk: "2026-11-10T04:30:00Z", error: "connect ETIMEDOUT", link: `${portalUrl}/aip/service-status` },
    "18c-system-alert-resolved": { service: "NOTAM sync", duration: "42 min", since: "2026-11-10T05:42:00Z", check: "GET /health", lastOk: "2026-11-10T05:42:00Z", link: `${portalUrl}/aip/service-status` },
    "19-notice": { subject: "A sample notice", preheader: "A sample preheader.", headline: "A sample notice", body: "This is the generic notice template, used by every email that has no design of its own.", details: [["Example", "value"]], buttonLabel: "Open the portal", link: portalUrl, reason: "this is a sample" },
  };
  return { ...base, ...(by[id] || {}) };
}
