// The email a client gets when ops decide (Stage 5; sent by us and recorded since 2026-11-02): approved (for an
// account made before 2026-11-02 — a new client gets the set-password link instead, lib/clients/onboarding.ts),
// refused, or access ended. Through lib/mail/send.ts: the brand's sender, a row in Mailbox › Sent, a delivery status.
// No flight data, no scope values — the decision and where to sign in. A decision is saved whether or not the mail went;
// the result comes back to the caller so the page can say which.
import { appUrl, layoutEmail, productName, sendPortalEmail, templateEmail, type SendResult } from "@/lib/mail/send";

export type DecisionMail = { to: string; personName: string; company: string; decision: "approved" | "refused" | "removed"; note?: string; ref?: string | null; by?: string | null };

export async function decisionEmail({ personName, company, decision, note }: DecisionMail) {
  const signIn = appUrl() ? `${appUrl()}/login` : "";
  // the designed templates (shared/email/templates.mjs, 2026-11-10): 09 refused, 10 removed; "approved" for an account
  // that exists already has no design of its own and uses the generic notice
  if (decision === "refused") return templateEmail("09-client-request-refused", { company, refusalNote: note || "" });
  if (decision === "removed") return templateEmail("10-client-access-removed", { company, removedAt: new Date() });
  const hi = personName ? `Hello ${personName},` : "Hello,";
  return { subject: `Your access for ${company} is approved`, ...layoutEmail({
    title: `Your access for ${company} is approved`,
    paragraphs: [hi, `${productName()} ops approved access for ${company}. Sign in with your email and password to see your flights.`, "What you see is set by ops and can change; the page always shows the current set."],
    button: signIn ? { label: "Sign in", url: signIn } : undefined,
    reason: "your request for client access was approved",
  }) };
}

export async function sendDecisionMail(mail: DecisionMail): Promise<SendResult> {
  const to = String(mail.to || "").trim();
  const { subject, html, text } = await decisionEmail(mail);
  return sendPortalEmail({ to, subject, html, text, kind: `client-${mail.decision}`, by: mail.by ?? null, ref: mail.ref ?? null });
}
