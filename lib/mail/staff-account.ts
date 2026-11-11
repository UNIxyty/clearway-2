// The two staff-account emails that had templates and no sender until 2026-11-11: 02 (your account is waiting for
// approval, to the person, with 14 to the ops list) when a staff sign-up confirms their email, and 03 (your account is
// approved) when an admin approves — from Admin › Users or from the Telegram button. The ops list is the same one that
// hears about client requests (app_settings clients.notify_to, Admin › Clients); with an empty list only the person is
// written to. A failed send is recorded in Mailbox › Sent and changes nothing else.
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyList } from "@/lib/clients/onboarding";
import { sendPortalEmail, templateEmail } from "@/lib/mail/send";

const quiet = async (f: () => Promise<unknown>) => { try { await f(); } catch (e) { console.error("[mail] staff account email not sent", e); } };

export async function sendStaffPending(service: SupabaseClient, p: { userId: string; email: string; name?: string | null; signedUpAt?: Date | string | null }, request?: Request) {
  const name = p.name || p.email.split("@")[0];
  await quiet(async () => {
    const m = await templateEmail("02-staff-pending-approval", { name, email: p.email, signedUpAt: p.signedUpAt ?? new Date() }, request);
    await sendPortalEmail({ to: p.email, subject: m.subject, html: m.html, text: m.text, kind: "staff-pending", ref: p.userId });
  });
  await quiet(async () => {
    const to = await notifyList(service);
    if (!to.length) return;
    const { portalUrl } = await import("@/lib/mail/send").then((x) => x.mailOptions(request));
    const m = await templateEmail("14-ops-staff-waiting", { name, email: p.email, signedUpAt: p.signedUpAt ?? new Date(), adminLink: `${portalUrl}/admin/users` }, request);
    await sendPortalEmail({ to, subject: m.subject, html: m.html, text: m.text, kind: "staff-waiting-ops", ref: p.userId });
  });
}

export async function sendStaffApproved(p: { userId: string; email: string; name?: string | null; role?: string | null; approvedBy?: string | null }, request?: Request) {
  await quiet(async () => {
    const { portalUrl } = await import("@/lib/mail/send").then((x) => x.mailOptions(request));
    const m = await templateEmail("03-staff-approved", { name: p.name || p.email.split("@")[0], email: p.email, role: p.role || "User", approvedAt: new Date(), approvedBy: p.approvedBy || "An admin", link: `${portalUrl}/login` }, request);
    await sendPortalEmail({ to: p.email, subject: m.subject, html: m.html, text: m.text, kind: "staff-approved", ref: p.userId });
  });
}
