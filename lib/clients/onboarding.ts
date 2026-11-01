// Client onboarding (2026-11-02): a request is a request, not a dormant account.
//   1. Someone asks for access (name, company, email, operator or broker, a note): a clients row, status requested, no
//      account. Nothing to sign in to yet.
//   2. Ops are emailed — the list in app_settings 'clients.notify_to', edited on Admin › Clients — with who is asking and
//      for which company, and a link to Admin › Clients.
//   3. Ops approve and set the scope and switches (lib/clients/admin.ts › saveAccess).
//   4. The client is emailed a link to set a password. Single use; it works for INVITE_TTL_HOURS; a newer link replaces
//      the older ones. Only its hash is stored.
//   5. Setting the password is where the account is made (role client, approved), and the row is linked to it.
// An expired link offers a new one: it goes to the address on the request, never to whoever asks.
// Every email goes through lib/mail/send.ts: our sender, recorded in Mailbox › Sent with its delivery status.
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { layoutEmail, productName, sendPortalEmail, type SendResult } from "@/lib/mail/send";

/** 72 hours: a request approved on a Friday afternoon still works on Monday morning; a link that makes an account should
 *  not work for weeks after it was forwarded or left in an inbox. */
export const INVITE_TTL_HOURS = 72;
const NEW_LINK_GAP_MS = 2 * 60_000;   // at most one new link per client every two minutes

const hash = (t: string) => createHash("sha256").update(t).digest("hex");
export const maskEmail = (e: string) => { const [u, d] = String(e).split("@"); return d ? `${u.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(6, u.length - 2)))}@${d}` : "•••"; };
const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// ── who is told about new requests ──────────────────────────────────────────────────────────────────────────────────
export async function notifyList(service: SupabaseClient): Promise<string[]> {
  const { data } = await service.from("app_settings").select("value").eq("key", "clients.notify_to").maybeSingle();
  const emails = ((data?.value as { emails?: unknown } | null)?.emails ?? []) as unknown[];
  return emails.map((e) => String(e).trim().toLowerCase()).filter(isEmail);
}
export async function setNotifyList(service: SupabaseClient, emails: string[], by: string | null) {
  const clean = [...new Set(emails.map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
  const bad = clean.filter((e) => !isEmail(e));
  if (bad.length) return { problems: [`Not an email address: ${bad.join(", ")}`] };
  const { error } = await service.from("app_settings").upsert({ key: "clients.notify_to", value: { emails: clean }, updated_at: new Date().toISOString(), updated_by_email: by }, { onConflict: "key" });
  if (error) throw error;
  return { emails: clean };
}

// ── 1 + 2. the request, and ops told ────────────────────────────────────────────────────────────────────────────────
export type RequestInput = { name: string; company: string; email: string; kind: string; note: string };
export async function createRequest(service: SupabaseClient, input: RequestInput, appUrl: string): Promise<{ problems: string[] } | { ok: true; opsNotified: boolean; opsNotice: string | null }> {
  const name = String(input.name ?? "").trim().slice(0, 120), company = String(input.company ?? "").trim().slice(0, 120);
  const email = String(input.email ?? "").trim().toLowerCase().slice(0, 200), note = String(input.note ?? "").trim().slice(0, 1000);
  const kind = String(input.kind ?? "").toLowerCase() === "broker" ? "broker" : "operator";
  const problems = [...(!name ? ["Your name is needed."] : []), ...(!company ? ["Your company is needed."] : []), ...(!isEmail(email) ? ["A work email address is needed."] : [])];
  if (problems.length) return { problems };
  // one open request per address: asking again updates it rather than making a second row
  const { data: open } = await service.from("clients").select("id,status,user_id").ilike("email", email).in("status", ["requested", "approved"]).order("requested_at", { ascending: false }).limit(1);
  const existing = open?.[0] as { id: string; status: string; user_id: string | null } | undefined;
  let clientId: string;
  if (existing && existing.status === "requested") {
    await service.from("clients").update({ person_name: name, company, kind, note, requested_at: new Date().toISOString() }).eq("id", existing.id);
    clientId = existing.id;
  } else if (existing) {
    return { ok: true, opsNotified: false, opsNotice: "already-approved" };   // approved already: nothing to ask; the page says to sign in or use the link
  } else {
    const { data: row, error } = await service.from("clients").insert({ user_id: null, email, person_name: name, company, kind, note, status: "requested", requested_at: new Date().toISOString() }).select("id").single();
    if (error) throw error;
    clientId = (row as { id: string }).id;
  }
  await service.from("client_decisions").insert({ client_id: clientId, kind: "requested", actor_id: null, actor_email: email, detail: { company, kind } });
  const to = await notifyList(service);
  if (!to.length) { console.error("[clients] a request arrived and nobody is on the notify list (Admin › Clients › Who is told)"); return { ok: true, opsNotified: false, opsNotice: "no-list" }; }
  const product = productName();
  const mail = layoutEmail({
    title: `${company} is asking for access`,
    paragraphs: [`${name} (${email}) is waiting for approval, for ${company}, as ${kind === "broker" ? "a broker" : "an operator"}.`, ...(note ? [`They wrote: “${note}”`] : []), `Nothing has been created yet: no account exists until you approve them and they set a password. Review the request, set what they can see, and approve or refuse it in Admin › Clients.`],
    button: appUrl ? { label: "Open Admin › Clients", url: `${appUrl}/admin/clients` } : undefined,
    footnote: `You get this because you are on the list of people ${product} tells about new client requests (Admin › Clients).`,
  });
  const sent = await sendPortalEmail({ to, subject: `Access request: ${company} (${name})`, html: mail.html, text: mail.text, kind: "client-request-ops", ref: clientId });
  return { ok: true, opsNotified: sent.ok, opsNotice: sent.ok ? null : "not-sent" };
}

// ── 4. the set-password link ────────────────────────────────────────────────────────────────────────────────────────
type ClientLite = { id: string; email: string; person_name: string; company: string; status: string; user_id: string | null };
export async function sendSetPasswordLink(service: SupabaseClient, client: ClientLite, appUrl: string, by: string | null): Promise<SendResult & { expiresAt: string }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600e3).toISOString();
  const now = new Date().toISOString();
  await service.from("client_invites").update({ replaced_at: now }).eq("client_id", client.id).is("used_at", null).is("replaced_at", null);
  const { error } = await service.from("client_invites").insert({ client_id: client.id, token_hash: hash(token), sent_to: client.email, expires_at: expiresAt, created_by_email: by });
  if (error) throw error;
  const product = productName();
  const url = `${appUrl}/welcome?token=${encodeURIComponent(token)}`;
  const mail = layoutEmail({
    title: `Your access to ${product} is approved`,
    paragraphs: [`Hello ${client.person_name || ""}`.trim() + ",", `${product} ops approved access for ${client.company}. Choose a password to finish: your account is made when you do, and you sign in with ${client.email} and that password from then on.`, `The link works once, for ${INVITE_TTL_HOURS} hours. If it has expired, the page it opens sends a new one to this address.`],
    button: { label: "Set your password", url },
    footnote: "If you did not ask for access, you can ignore this email: nothing happens unless the link is used.",
  });
  const sent = await sendPortalEmail({ to: client.email, subject: `Set your password for ${product}`, html: mail.html, text: mail.text, kind: "client-invite", by, ref: client.id });
  await service.from("client_decisions").insert({ client_id: client.id, kind: "link-sent", actor_id: null, actor_email: by, detail: { to: maskEmail(client.email), expiresAt, accepted: sent.ok } });
  return { ...sent, expiresAt };
}

// ── 5. the link, read and used ──────────────────────────────────────────────────────────────────────────────────────
export type LinkState = { state: "valid" | "used" | "expired" | "replaced" | "unknown" | "closed"; email?: string; company?: string; clientId?: string };
export async function readLink(service: SupabaseClient, token: string): Promise<LinkState & { invite?: { id: string; client_id: string } }> {
  if (!token || token.length < 20) return { state: "unknown" };
  const { data } = await service.from("client_invites").select("id,client_id,sent_to,expires_at,used_at,replaced_at").eq("token_hash", hash(token)).maybeSingle();
  const inv = data as { id: string; client_id: string; sent_to: string; expires_at: string; used_at: string | null; replaced_at: string | null } | null;
  if (!inv) return { state: "unknown" };
  const { data: c } = await service.from("clients").select("id,email,company,status,user_id").eq("id", inv.client_id).maybeSingle();
  const client = c as { id: string; email: string; company: string; status: string; user_id: string | null } | null;
  const base = { email: maskEmail(inv.sent_to), company: client?.company, clientId: inv.client_id, invite: { id: inv.id, client_id: inv.client_id } };
  if (inv.used_at || client?.user_id) return { state: "used", ...base };
  if (!client || client.status !== "approved") return { state: "closed", ...base };
  if (inv.replaced_at) return { state: "replaced", ...base };
  if (Date.parse(inv.expires_at) <= Date.now()) return { state: "expired", ...base };
  return { state: "valid", ...base };
}

/** Make the account with the password and link the row. The one place a client account is created in this flow. */
export async function activate(service: SupabaseClient, token: string, password: string): Promise<{ problems: string[] } | { ok: true; email: string }> {
  if (String(password).length < 10) return { problems: ["The password needs at least 10 characters."] };
  const link = await readLink(service, token);
  if (link.state !== "valid" || !link.invite) return { problems: [link.state === "used" ? "This link was used already. Sign in with your email and password." : link.state === "expired" ? "This link has expired." : "This link no longer works."] };
  // claim the link first (single use even if two tabs press at once): only one update can set used_at
  const { data: claimed } = await service.from("client_invites").update({ used_at: new Date().toISOString() }).eq("id", link.invite.id).is("used_at", null).select("id");
  if (!claimed?.length) return { problems: ["This link was used already. Sign in with your email and password."] };
  const { data: c } = await service.from("clients").select("id,email,person_name,company").eq("id", link.invite.client_id).single();
  const client = c as { id: string; email: string; person_name: string; company: string };
  const { data: made, error } = await service.auth.admin.createUser({ email: client.email, password, email_confirm: true, user_metadata: { full_name: client.person_name, name: client.person_name }, app_metadata: { role: "client", is_approved: true, client_status: "approved" } }); // metadata-ok: their name, for display; the role and approval are app_metadata
  if (error || !made?.user) {
    await service.from("client_invites").update({ used_at: null }).eq("id", link.invite.id);   // give the link back: nothing was made
    const exists = /already|registered|exists/i.test(error?.message ?? "");
    console.error("[clients] account not created", error?.message);
    return { problems: [exists ? "There is already an account for this email address. Sign in with it, or write to ops if you can't." : "The account could not be made just now. Try again in a minute."] };
  }
  await service.from("clients").update({ user_id: made.user.id }).eq("id", client.id);
  await service.from("client_decisions").insert({ client_id: client.id, kind: "activated", actor_id: made.user.id, actor_email: client.email, detail: {} });
  return { ok: true, email: client.email };
}

/** An expired or replaced link: a new one to the address on the request, if the client is still approved and has no
 *  account. Never to whoever is asking. At most one every two minutes. */
export async function newLink(service: SupabaseClient, token: string, appUrl: string): Promise<{ state: "sent" | "not-sent" | "too-soon" | "used" | "closed" | "unknown"; to?: string }> {
  const link = await readLink(service, token);
  if (link.state === "unknown") return { state: "unknown" };
  if (link.state === "used") return { state: "used" };
  if (link.state === "closed") return { state: "closed" };
  const { data: last } = await service.from("client_invites").select("created_at").eq("client_id", link.clientId!).order("created_at", { ascending: false }).limit(1);
  if (last?.[0] && Date.now() - Date.parse((last[0] as { created_at: string }).created_at) < NEW_LINK_GAP_MS) return { state: "too-soon", to: link.email };
  const { data: c } = await service.from("clients").select("id,email,person_name,company,status,user_id").eq("id", link.clientId!).single();
  const sent = await sendSetPasswordLink(service, c as ClientLite, appUrl, null);
  return { state: sent.ok ? "sent" : "not-sent", to: maskEmail((c as ClientLite).email) };
}
