type PickemSubmissionEmailInput = {
  to: string;
  displayName: string;
  competitionName: string;
  groupsSet?: number;
  groupsTotal?: number;
  matchesPredicted?: number;
  matchPicks?: Array<{
    homeName: string;
    awayName: string;
    homeScore: number;
    awayScore: number;
    homeFlag?: string;
    awayFlag?: string;
  }>;
  submittedAt?: string;
  daysToKickoff?: number;
};

const TEAM_FLAG_BY_NAME: Record<string, string> = {
  Mexico: "🇲🇽",
  Croatia: "🇭🇷",
  Egypt: "🇪🇬",
  "New Zealand": "🇳🇿",
  Canada: "🇨🇦",
  Morocco: "🇲🇦",
  "Ivory Coast": "🇨🇮",
  Sweden: "🇸🇪",
  Argentina: "🇦🇷",
  Norway: "🇳🇴",
  Japan: "🇯🇵",
  "Saudi Arabia": "🇸🇦",
  "United States": "🇺🇸",
  Switzerland: "🇨🇭",
  Paraguay: "🇵🇾",
  Qatar: "🇶🇦",
  Brazil: "🇧🇷",
  Senegal: "🇸🇳",
  "South Korea": "🇰🇷",
  Australia: "🇦🇺",
  France: "🇫🇷",
  Uruguay: "🇺🇾",
  Iran: "🇮🇷",
  Panama: "🇵🇦",
  England: "🏴",
  Colombia: "🇨🇴",
  Tunisia: "🇹🇳",
  Jordan: "🇯🇴",
  Spain: "🇪🇸",
  Denmark: "🇩🇰",
  Nigeria: "🇳🇬",
  "Costa Rica": "🇨🇷",
  Portugal: "🇵🇹",
  Austria: "🇦🇹",
  Ghana: "🇬🇭",
  Honduras: "🇭🇳",
  Germany: "🇩🇪",
  Turkey: "🇹🇷",
  Cameroon: "🇨🇲",
  Uzbekistan: "🇺🇿",
  Netherlands: "🇳🇱",
  Italy: "🇮🇹",
  Algeria: "🇩🇿",
  Peru: "🇵🇪",
  Belgium: "🇧🇪",
  Ecuador: "🇪🇨",
  Poland: "🇵🇱",
  Scotland: "🏴",
};

export function pickemTeamFlag(name: string): string {
  return TEAM_FLAG_BY_NAME[String(name).trim()] || "🏳️";
}

function appOrigin(): string {
  return String(process.env.PORTAL_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://clearway.verxyl.com").trim();
}

export async function sendPickemSubmissionEmail(input: PickemSubmissionEmailInput): Promise<boolean> {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = String(process.env.PICKEM_EMAIL_FROM || "Clearway Pickem <no-reply@clearway.verxyl.com>").trim();
  if (!apiKey) return false;

  const subject = "Your World Cup picks are locked in";
  const origin = appOrigin().replace(/\/+$/, "");
  const pickemUrl = `${origin}/pickem`;
  const logoUrl = `${origin}/header_logo_white.svg`;
  const firstName = String(input.displayName || "there")
    .trim()
    .split(/\s+/)[0] || "there";
  const groupsSet = Number.isFinite(input.groupsSet) ? Number(input.groupsSet) : 0;
  const groupsTotal = Number.isFinite(input.groupsTotal) ? Number(input.groupsTotal) : 12;
  const matchesPredicted = Number.isFinite(input.matchesPredicted) ? Number(input.matchesPredicted) : 0;
  const daysToKickoff = Number.isFinite(input.daysToKickoff) ? Number(input.daysToKickoff) : 0;
  const submittedAt = String(input.submittedAt || "").trim() || new Date().toISOString();

  function esc(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  const picksRows =
    input.matchPicks && input.matchPicks.length
      ? input.matchPicks
          .map((pick) => {
            const homeFlag = esc(String(pick.homeFlag || ""));
            const awayFlag = esc(String(pick.awayFlag || ""));
            return `
                      <tr>
                        <td style="padding:13px 0; border-bottom:1px solid rgba(15,30,60,0.07);">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                            <td style="font-family:'Archivo',Arial,Helvetica,sans-serif; font-size:14px; font-weight:700; color:#0f1e3c; vertical-align:middle;">
                              <span style="font-size:18px;">${homeFlag}</span>${homeFlag ? "&nbsp;" : ""} ${esc(pick.homeName)}
                            </td>
                            <td width="70" align="center" style="font-family:'Archivo',Arial,Helvetica,sans-serif; font-size:16px; font-weight:900; color:#1a56db; vertical-align:middle; white-space:nowrap;">
                              ${pick.homeScore} &ndash; ${pick.awayScore}
                            </td>
                            <td align="right" style="font-family:'Archivo',Arial,Helvetica,sans-serif; font-size:14px; font-weight:700; color:#0f1e3c; vertical-align:middle;">
                              ${esc(pick.awayName)}${awayFlag ? "&nbsp;" : ""}<span style="font-size:18px;">${awayFlag}</span>
                            </td>
                          </tr></table>
                        </td>
                      </tr>`;
          })
          .join("\n")
      : `
                      <tr>
                        <td style="padding:13px 0; border-bottom:1px solid rgba(15,30,60,0.07); font-family:'Archivo',Arial,Helvetica,sans-serif; font-size:14px; font-weight:600; color:rgba(15,30,60,0.6);">
                          Match predictions are saved and available in your dashboard.
                        </td>
                      </tr>`;

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Your World Cup picks are locked in</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
<style>
  @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&display=swap');
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { -ms-interpolation-mode: bicubic; border: 0; line-height: 100%; outline: none; text-decoration: none; }
  body { margin: 0; padding: 0; width: 100% !important; height: 100% !important; }
  a { text-decoration: none; }
  .hover-darken:hover { background-color: #ea580c !important; }
  @media only screen and (max-width: 600px) {
    .container { width: 100% !important; }
    .px { padding-left: 24px !important; padding-right: 24px !important; }
    .stack { display: block !important; width: 100% !important; }
    .stack-gap { height: 12px !important; }
    .h1 { font-size: 28px !important; line-height: 34px !important; }
  }
</style>
</head>
<body bgcolor="#f5f5f5" style="margin:0; padding:0; background-color:#f5f5f5; font-family:'Archivo','Segoe UI',Arial,Helvetica,sans-serif;">
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#f5f5f5; opacity:0;">
    Locked in - ${groupsSet} groups and ${matchesPredicted} match scores submitted. Good luck, ${esc(firstName)}.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f5f5" style="background-color:#f5f5f5;">
    <tr>
      <td align="center" style="padding:24px 12px 40px;">
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px;">
          <tr>
            <td style="padding:4px 8px 18px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle; background-color:#0f1e3c; border-radius:8px; padding:8px 12px;">
                    <img src="${logoUrl}" alt="Clearway" width="132" style="display:block; width:132px; height:auto;">
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff; border-radius:18px; overflow:hidden; box-shadow:0 2px 10px rgba(0,0,0,0.04);">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="px" style="background-color:#0f1e3c; padding:38px 44px 34px;">
                    <p style="margin:0 0 14px; font-family:'Archivo',Arial,Helvetica,sans-serif; font-size:11px; font-weight:700; letter-spacing:2.5px; text-transform:uppercase; color:#f59e0b;">Picks Confirmed</p>
                    <h1 class="h1" style="margin:0; font-family:'Archivo',Arial,Helvetica,sans-serif; font-size:34px; line-height:40px; font-weight:900; letter-spacing:-0.5px; color:#ffffff;">
                      You're locked in, ${esc(firstName)}.
                    </h1>
                    <p style="margin:14px 0 0; font-family:'Archivo',Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; color:rgba(255,255,255,0.62);">
                      Your ${esc(input.competitionName)} predictions are saved. Here's a copy for your records.
                    </p>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="px" style="padding:28px 44px 6px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td class="stack" width="50%" style="vertical-align:top; padding-right:8px;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ebf3ff; border-radius:14px;">
                            <tr><td style="padding:18px 20px;">
                              <p style="margin:0 0 6px; font-family:'Archivo',Arial,Helvetica,sans-serif; font-size:11px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#1a56db;">Group Stage</p>
                              <p style="margin:0; font-family:'Archivo',Arial,Helvetica,sans-serif; font-size:30px; font-weight:900; color:#0f1e3c; line-height:1;">${groupsSet}<span style="font-size:15px; font-weight:700; color:rgba(15,30,60,0.4);"> / ${groupsTotal} groups</span></p>
                            </td></tr>
                          </table>
                        </td>
                        <td class="stack stack-gap" style="font-size:0; line-height:0; height:0;">&nbsp;</td>
                        <td class="stack" width="50%" style="vertical-align:top; padding-left:8px;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fff3e9; border-radius:14px;">
                            <tr><td style="padding:18px 20px;">
                              <p style="margin:0 0 6px; font-family:'Archivo',Arial,Helvetica,sans-serif; font-size:11px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#ea580c;">Match Scores</p>
                              <p style="margin:0; font-family:'Archivo',Arial,Helvetica,sans-serif; font-size:30px; font-weight:900; color:#0f1e3c; line-height:1;">${matchesPredicted}<span style="font-size:15px; font-weight:700; color:rgba(15,30,60,0.4);"> predicted</span></p>
                            </td></tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="px" style="padding:26px 44px 6px;">
                    <p style="margin:0 0 4px; font-family:'Archivo',Arial,Helvetica,sans-serif; font-size:12px; font-weight:800; letter-spacing:1.5px; text-transform:uppercase; color:#64748b;">Your match calls</p>
                  </td>
                </tr>
                <tr>
                  <td class="px" style="padding:0 44px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${picksRows}
                    </table>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="px" style="padding:22px 44px 4px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f7f8fa; border-radius:14px;">
                      <tr>
                        <td style="padding:16px 20px; font-family:'Archivo',Arial,Helvetica,sans-serif; font-size:12.5px; line-height:20px; color:#475569;">
                          <strong style="color:#0f1e3c;">How points work:</strong>
                          &nbsp;<span style="color:#1a56db; font-weight:800;">+1</span> team in the right group position &nbsp;&middot;&nbsp;
                          <span style="color:#1a56db; font-weight:800;">+1</span> correct match result &nbsp;&middot;&nbsp;
                          <span style="color:#ea580c; font-weight:800;">+3</span> exact score (total exact = 4)
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="px" align="center" style="padding:28px 44px 10px;">
                    <a href="${pickemUrl}" class="hover-darken" style="display:inline-block; background-color:#f97316; color:#ffffff; font-family:'Archivo',Arial,Helvetica,sans-serif; font-size:15px; font-weight:800; line-height:50px; text-align:center; text-decoration:none; width:280px; border-radius:11px;">Review my picks</a>
                  </td>
                </tr>
                <tr>
                  <td class="px" align="center" style="padding:4px 44px 38px;">
                    <p style="margin:0; font-family:'Archivo',Arial,Helvetica,sans-serif; font-size:13px; font-weight:600; color:rgba(15,30,60,0.45);">
                      Kickoff in <strong style="color:#0f1e3c;">${daysToKickoff} days</strong> &middot; submitted ${esc(submittedAt)}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:26px 24px 8px;" align="center">
              <p style="margin:0 0 8px; font-family:'Archivo',Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; color:rgba(15,30,60,0.4);">
                You're receiving this because you submitted predictions in the Clearway World Cup 2026 pool.
              </p>
              <p style="margin:0; font-family:'Archivo',Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; color:rgba(15,30,60,0.4);">
                <a href="${pickemUrl}" style="color:#1a56db; font-weight:700; text-decoration:none;">Manage picks</a>
              </p>
              <p style="margin:14px 0 0; font-family:'Archivo',Arial,Helvetica,sans-serif; font-size:11px; color:rgba(15,30,60,0.3);">&copy; ${new Date().getUTCFullYear()} Clearway. Not affiliated with FIFA.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  const text = `Hi ${firstName},\n\nYour picks are locked in for ${input.competitionName}.\nGroups set: ${groupsSet}/${groupsTotal}\nMatch scores predicted: ${matchesPredicted}\nReview picks: ${pickemUrl}\n\nClearway Pickem`;

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

