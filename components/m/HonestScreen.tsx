"use client";

// Tier 3 on the phone (mobile-portal-spec.md › Tier 3): one honest screen instead of a broken table or a disabled
// button. It says what the page is and why it needs room, with a way back and a way to send the link to a desk.
import MaskIcon from "@/components/portal/Icon";
import { useIdentity } from "@/components/portal/Shell";
import { MButton } from "./ui";
import { usePhonePage } from "./chrome";

export type Honest = { id: string; icon: string; name: string; what: string; section: string; back: string; desktop: string };

export default function HonestScreen({ p }: { p: Honest }) {
  const { email } = useIdentity();
  usePhonePage({ title: p.name, subtitle: "Needs a wider screen", back: p.back, tab: "more" });
  const link = typeof window !== "undefined" ? `${window.location.origin}${p.desktop}` : p.desktop;
  const mail = `mailto:${email ?? ""}?subject=${encodeURIComponent(`Clearway · ${p.name}`)}&body=${encodeURIComponent(`${p.name} needs a wider screen. Open it on a laptop or a tablet held sideways:\n\n${link}`)}`;
  return (
    <div className="flex min-h-full flex-col justify-center gap-5 px-6 pb-12 pt-8">
      <span className="flex h-[52px] w-[52px] items-center justify-center rounded-[14px] border border-cw-border bg-cw-bg-surface text-cw-text-body"><MaskIcon name={p.icon} size={24} color="currentColor" /></span>
      <div className="flex flex-col gap-2.5">
        <h1 className="m-0 text-[26px] font-extrabold leading-[1.15] tracking-[-.02em] text-cw-text">{p.name} needs a wider screen</h1>
        <p className="m-0 text-[16px] leading-[1.55] text-cw-text-body">{p.what}</p>
      </div>
      <div className="flex items-center gap-2.5 rounded-[12px] border border-cw-border bg-cw-bg-sunken px-3.5 py-3 text-[14px] leading-[1.45] text-cw-text-body"><MaskIcon name="monitor" size={18} color="var(--cw-text-muted)" className="flex-none" />Open it on a laptop or a tablet held sideways, at least 1024 px wide.</div>
      <div className="flex flex-col gap-2.5">
        <MButton kind="primary" icon="arrow-left" href={p.back}>Back to {p.section}</MButton>
        <MButton icon="mail" href={mail}>Email me the link</MButton>
      </div>
    </div>
  );
}
