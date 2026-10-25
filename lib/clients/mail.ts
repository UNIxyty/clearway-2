// The email a client gets when ops decide (Stage 5): approved, refused, or access ended. "You will get an email when it
// is decided" is the only promise the waiting screen makes, so this is what keeps it. Resend, as the wall and the agent
// use it (RESEND_API_KEY; RESEND_BASE_URL points the rig at its capture server). Plain text and a small HTML body, no
// flight data, no scope values — the decision and where to sign in. Failures are logged, never thrown: a decision is
// saved whether or not the mail went.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function configured() { return Boolean(String(process.env.RESEND_API_KEY || "").trim()); }
function endpoint() { return `${String(process.env.RESEND_BASE_URL || "https://api.resend.com").trim().replace(/\/+$/, "")}/emails`; }
function from() { return String(process.env.CLIENT_EMAIL_FROM || process.env.DIGITAL_WALL_EMAIL_FROM || "").trim() || "Clearway <no-reply@clearway.verxyl.com>"; }
function site() { return String(process.env.NEXT_PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || "https://clearway.verxyl.com").replace(/\/+$/, ""); }

export type DecisionMail = { to: string; personName: string; company: string; decision: "approved" | "refused" | "removed"; note?: string };

export function decisionText({ personName, company, decision, note }: DecisionMail) {
  const hi = personName ? `Hello ${personName},` : "Hello,";
  const signIn = `${site()}/login`;
  if (decision === "approved") return {
    subject: `Your access for ${company} is approved`,
    text: `${hi}\n\nClearway ops have approved access for ${company}. Sign in with your email and password to see your flights:\n${signIn}\n\nWhat you see is set by Clearway ops and can change; the page always shows the current set.\n\nClearway ops`,
  };
  if (decision === "refused") return {
    subject: `Your access request for ${company}`,
    text: `${hi}\n\nClearway ops looked at your request for ${company} and could not approve it.${note ? `\n\nNote from ops: ${note}` : ""}\n\nIf you think that is a mistake, reply to this email, or send a new request from the sign-in page:\n${signIn}\n\nClearway ops`,
  };
  return {
    subject: `Your access for ${company} has ended`,
    text: `${hi}\n\nClearway ops ended access for ${company}. You can still sign in, but there are no flights to show. Write to Clearway ops if that should change.\n\nClearway ops`,
  };
}

export async function sendDecisionMail(mail: DecisionMail): Promise<{ ok: boolean; id?: string | null; error?: string }> {
  const to = String(mail.to || "").trim();
  if (!to) return { ok: false, error: "no recipient" };
  if (!configured()) { console.error(`[clients/mail] NOT sending "${mail.decision}" to a client: RESEND_API_KEY is not configured.`); return { ok: false, error: "mail not configured" }; }
  const { subject, text } = decisionText(mail);
  const html = `<div style="font:15px/1.6 system-ui,sans-serif;color:#1b1f24;max-width:560px">${text.split("\n\n").map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>").replace(/(https?:\/\/\S+)/g, '<a href="$1">$1</a>')}</p>`).join("")}</div>`;
  try {
    const r = await fetch(endpoint(), { method: "POST", headers: { authorization: `Bearer ${String(process.env.RESEND_API_KEY).trim()}`, "content-type": "application/json" }, body: JSON.stringify({ from: from(), to: [to], subject, text, html }), signal: AbortSignal.timeout(10_000) });
    if (!r.ok) { console.error(`[clients/mail] Resend answered ${r.status} for "${mail.decision}"`); return { ok: false, error: `HTTP ${r.status}` }; }
    const data = (await r.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id ?? null };
  } catch (e) { console.error(`[clients/mail] send failed: ${e instanceof Error ? e.message : String(e)}`); return { ok: false, error: "send failed" }; }
}
