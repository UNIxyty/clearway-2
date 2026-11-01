// The email a client gets when ops decide (Stage 5; sent by us and recorded since 2026-11-02): approved (for an
// account made before 2026-11-02 — a new client gets the set-password link instead, lib/clients/onboarding.ts),
// refused, or access ended. Through lib/mail/send.ts: the brand's sender, a row in Mailbox › Sent, a delivery status.
// No flight data, no scope values — the decision and where to sign in. A decision is saved whether or not the mail went;
// the result comes back to the caller so the page can say which.
import { appUrl, layoutEmail, productName, sendPortalEmail, type SendResult } from "@/lib/mail/send";

export type DecisionMail = { to: string; personName: string; company: string; decision: "approved" | "refused" | "removed"; note?: string; ref?: string | null; by?: string | null };

export function decisionEmail({ personName, company, decision, note }: DecisionMail) {
  const product = productName();
  const hi = personName ? `Hello ${personName},` : "Hello,";
  const signIn = appUrl() ? `${appUrl()}/login` : "";
  if (decision === "approved") return { subject: `Your access for ${company} is approved`, ...layoutEmail({
    title: `Your access for ${company} is approved`,
    paragraphs: [hi, `${product} ops approved access for ${company}. Sign in with your email and password to see your flights.`, "What you see is set by ops and can change; the page always shows the current set."],
    button: signIn ? { label: "Sign in", url: signIn } : undefined,
  }) };
  if (decision === "refused") return { subject: `Your access request for ${company}`, ...layoutEmail({
    title: `About your request for ${company}`,
    paragraphs: [hi, `${product} ops looked at your request for ${company} and could not approve it.`, ...(note ? [`Note from ops: ${note}`] : []), "If you think that is a mistake, reply to this email, or send a new request from the sign-in page."],
    button: signIn ? { label: "Go to the sign-in page", url: signIn } : undefined,
  }) };
  return { subject: `Your access for ${company} has ended`, ...layoutEmail({
    title: `Your access for ${company} has ended`,
    paragraphs: [hi, `${product} ops ended access for ${company}. You can still sign in, but there are no flights to show. Write to ops if that should change.`],
  }) };
}

export async function sendDecisionMail(mail: DecisionMail): Promise<SendResult> {
  const to = String(mail.to || "").trim();
  const { subject, html, text } = decisionEmail(mail);
  return sendPortalEmail({ to, subject, html, text, kind: `client-${mail.decision}`, by: mail.by ?? null, ref: mail.ref ?? null });
}
