type PickemSubmissionEmailInput = {
  to: string;
  displayName: string;
  competitionName: string;
};

function appOrigin(): string {
  return String(process.env.PORTAL_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://clearway.verxyl.com").trim();
}

export async function sendPickemSubmissionEmail(input: PickemSubmissionEmailInput): Promise<boolean> {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = String(process.env.PICKEM_EMAIL_FROM || "Clearway Pickem <no-reply@clearway.verxyl.com>").trim();
  if (!apiKey) return false;

  const subject = `${input.competitionName} picks submitted`;
  const pickemUrl = `${appOrigin().replace(/\/+$/, "")}/pickem`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
      <h2 style="margin:0 0 12px">Your picks are in</h2>
      <p style="margin:0 0 10px">Hi ${input.displayName || "there"},</p>
      <p style="margin:0 0 10px">
        You successfully submitted all predictions for <strong>${input.competitionName}</strong>.
      </p>
      <p style="margin:0 0 10px">
        You can review your picks and standings anytime:
        <a href="${pickemUrl}">${pickemUrl}</a>
      </p>
      <p style="margin:16px 0 0;color:#6b7280;font-size:12px">Clearway Pickem</p>
    </div>
  `;
  const text = `Hi ${input.displayName || "there"},\n\nYou successfully submitted all predictions for ${input.competitionName}.\nReview your picks: ${pickemUrl}\n\nClearway Pickem`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject,
        html,
        text,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

