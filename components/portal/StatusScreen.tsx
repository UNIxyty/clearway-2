"use client";

// One screen for every "you cannot have this" state (2026-11-11): a page that is not on the account, a page a role does
// not cover, a page for admins, a client whose request was refused or whose access ended, a set-password link that was
// used or expired, a page that does not exist, and an error. The same layout as the maintenance screen: centred, the
// Clearway logo (currentColor, so white on the dark theme), an eyebrow, a headline, one short line and one button.
// The words are each caller's and stay honest; none of them says whether the hidden thing exists. `embedded` draws the
// same card inside a shell (the staff frame, the phone shell) without the full-page backdrop.
// On a phone (699 px and under) the full-page screen is the v3 phone layout (design "Mobile Pages v3", 2026-11-13;
// status-screen.css): a 52 px logo bar, an icon, a code line such as "404 · NOT FOUND", the headline, the line, the
// quiet line, one 48 px blue button and a footer with the company's name and — when the caller hands it in — the
// address for questions (the support-address setting; never written here). One markup for both; a desk is unchanged.
import type { ReactNode } from "react";
import { ClearwayLogo } from "@/components/portal/ClearwayLogo";
import MaskIcon from "@/components/portal/Icon";
import "@/components/portal/status-screen.css";

/** The company's name in the phone footer. */
export const STATUS_COMPANY = "Clearway Handling & Operations";
/** The phone layout's code line and icon for a kind; a caller may hand in its own. */
export function statusCode(kind: string, eyebrow: string): string {
  if (kind === "not-found" || kind === "client-not-found" || kind === "unknown-role") return "404 · NOT FOUND";
  if (kind === "forbidden") return "403 · NO ACCESS";
  if (kind === "link-expired") return "LINK EXPIRED";
  return eyebrow.toUpperCase();
}
export function statusIcon(kind: string): string {
  if (kind === "not-found" || kind === "client-not-found" || kind === "link-unknown") return "search-x";
  if (kind === "forbidden" || kind === "for-admins" || kind === "unknown-role" || kind === "client-refused" || kind === "client-removed") return "circle-slash";
  if (kind === "error" || kind === "link-error") return "triangle-alert";
  if (kind.startsWith("link-") || kind === "reset-link-invalid") return "link-2-off";
  return "circle-alert";
}

export type StatusAction = { label: string; href: string } | { label: string; onClick: () => void; busy?: boolean; attr?: string };

export default function StatusScreen({ eyebrow, title, line, action, note, tone = "neutral", embedded = false, kind, children, code, icon, support = "" }: {
  eyebrow: string;
  title: string;
  line: string;
  action: StatusAction;
  /** one more quiet line under the button (a contact address, the person's own email) */
  note?: ReactNode;
  tone?: "neutral" | "danger";
  embedded?: boolean;
  /** data-status-screen value, for the UI checks */
  kind: string;
  children?: ReactNode;
  /** the phone layout's code line (default: by kind, else the eyebrow in capitals) and icon (public/icons name) */
  code?: string;
  icon?: string;
  /** the address for questions, for the phone footer: the support-address setting, handed in by the caller; empty shows the company's name alone */
  support?: string;
}) {
  const pill = tone === "danger"
    ? "border-cw-danger-border bg-cw-danger-tint text-cw-danger-text"
    : "border-cw-primary/30 bg-cw-primary/10 text-cw-text-link";
  const button = "inline-flex h-11 min-w-[160px] items-center justify-center rounded-[10px] border border-transparent bg-cw-ink px-6 text-[14px] font-semibold text-cw-on-ink no-underline hover:border-cw-border-strong hover:opacity-90 focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--cw-focus-halo)] disabled:opacity-60";
  const card = (
    <div className={`relative w-full max-w-2xl rounded-[16px] border border-cw-border/70 bg-cw-bg-surface/95 p-5 shadow-2xl backdrop-blur-sm sm:p-8 ${embedded ? "mx-auto" : ""}`} data-status-screen={kind} role="region" aria-labelledby="cw-status-title">
      <div className="flex flex-wrap items-center justify-between gap-3" data-status-brand="">
        <span className="text-cw-text"><ClearwayLogo height={40} className="h-8 sm:h-10" title="Clearway" /></span>
        <span className="inline-flex items-center" data-status-maker="">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/verxyl-footer.png" srcSet="/brand/verxyl-footer.png 1x, /brand/verxyl-footer@2x.png 2x, /brand/verxyl-footer@3x.png 3x" alt="Verxyl" className="h-5 w-auto sm:h-6" style={{ display: "var(--cw-show-light)" }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/verxyl-footer-white.png" srcSet="/brand/verxyl-footer-white.png 1x, /brand/verxyl-footer-white@2x.png 2x, /brand/verxyl-footer-white@3x.png 3x" alt="Verxyl" className="h-5 w-auto sm:h-6" style={{ display: "var(--cw-show-dark)" }} />
        </span>
      </div>
      <div data-status-body="">
      <span data-status-icon="" aria-hidden><MaskIcon name={icon ?? statusIcon(kind)} size={20} /></span>
      <div className={`mt-5 inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${pill}`} data-status-eyebrow=""><span data-status-words="">{eyebrow}</span><span data-status-code="">{code ?? statusCode(kind, eyebrow)}</span></div>
      <h1 id="cw-status-title" className="mt-3 text-[22px] font-bold leading-tight text-cw-text sm:text-[26px]" style={{ textWrap: "balance" } as React.CSSProperties}>{title}</h1>
      <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-cw-text-body" data-status-line="">{line}</p>
      {children}
      <div className="mt-6" data-status-actions="">
        {"href" in action
          ? <a href={action.href} className={button} data-status-action="">{action.label}</a>
          : <button type="button" onClick={action.onClick} disabled={action.busy} className={button} data-status-action="" {...(action.attr ? { [action.attr]: "" } : {})}>{action.busy ? "One moment…" : action.label}</button>}
      </div>
      {note && <p className="mt-4 text-[13px] text-cw-text-muted" data-status-note="">{note}</p>}
      </div>
      <p data-status-foot="">{STATUS_COMPANY}{support ? <> · <a href={`mailto:${support}`}>{support}</a></> : null}</p>
    </div>
  );
  if (embedded) return <div className="flex w-full flex-1 items-start justify-center px-4 py-8 sm:py-12">{card}</div>;
  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-cw-bg-page px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))] sm:px-6 lg:px-10" data-status-page="">
      <div data-status-backdrop="" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--primary)/0.14),transparent_40%),radial-gradient(circle_at_80%_20%,hsl(var(--accent)/0.12),transparent_40%),radial-gradient(circle_at_50%_80%,hsl(var(--muted-foreground)/0.08),transparent_50%)]" />
      {card}
    </div>
  );
}
