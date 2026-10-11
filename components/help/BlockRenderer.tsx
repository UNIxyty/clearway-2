"use client";

// Renders stored HelpBlocks natively — the console side of the "structured
// content, not rendered HTML" rule. Inline `code` spans render as mono chips.

import type { HelpBlock } from "@/lib/help/shared";

export type AttachmentMeta = { id: string; name: string; size: number; mime: string; isImage: boolean };

export function InlineText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("`") && p.endsWith("`") && p.length > 2 ? (
          <span key={i} className="rounded-[4px] border border-cw-border bg-cw-bg-sunken px-[5px] py-px font-mono text-[0.92em]">
            {p.slice(1, -1)}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function AttachmentView({ att }: { att: AttachmentMeta }) {
  const href = `/api/help/attachments/${att.id}`;
  if (att.isImage) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="block w-[150px] overflow-hidden rounded-[9px] border border-cw-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={href} alt={att.name} className="h-[74px] w-full bg-cw-bg-hover object-cover" loading="lazy" />
      </a>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-9 items-center gap-2 self-start rounded-[9px] border border-cw-border bg-cw-bg-page px-3 no-underline"
    >
      <span className="font-mono text-[9.5px] font-bold text-cw-text-muted">{att.mime.split("/")[1]?.toUpperCase().slice(0, 4) || "FILE"}</span>
      <span className="text-[12.5px] text-cw-text-body">{att.name}</span>
      <span className="font-mono text-[11px] text-cw-text-muted">{kb(att.size)}</span>
    </a>
  );
}

export default function BlockRenderer({
  blocks,
  attachments,
}: {
  blocks: HelpBlock[];
  attachments?: Map<string, AttachmentMeta>;
}) {
  const out: React.ReactNode[] = [];
  let attRow: AttachmentMeta[] = [];
  const flushAtts = (key: string) => {
    if (!attRow.length) return;
    out.push(
      <div key={key} className="flex flex-wrap gap-[9px]">
        {attRow.map((a) => <AttachmentView key={a.id} att={a} />)}
      </div>,
    );
    attRow = [];
  };

  blocks.forEach((b, i) => {
    if (b.type === "attachment") {
      const meta = attachments?.get(b.id);
      if (meta) attRow.push(meta);
      return;
    }
    flushAtts(`atts-${i}`);
    switch (b.type) {
      case "heading":
        out.push(<div key={i} className="text-[14.5px] font-bold text-cw-text">{b.text}</div>);
        break;
      case "subheading":
        out.push(<div key={i} className="text-[13.5px] font-bold text-cw-text-body">{b.text}</div>);
        break;
      case "paragraph":
        out.push(
          <div key={i} className="text-[14px] leading-[1.6] text-cw-text">
            <InlineText text={b.text} />
          </div>,
        );
        break;
      case "quote":
        out.push(
          <div key={i} className="border-l-2 border-cw-border pl-3 text-[14px] italic leading-[1.6] text-cw-text-body">
            <InlineText text={b.text} />
          </div>,
        );
        break;
      case "code":
        out.push(
          <div key={i} className="whitespace-pre overflow-x-auto rounded-[9px] border border-cw-border bg-cw-bg-page px-[13px] py-[11px] font-mono text-[12px] leading-[1.7] text-cw-text">
            {b.text}
          </div>,
        );
        break;
      case "bullet":
      case "numbered":
        out.push(
          <div key={i} className="flex flex-col gap-[5px]">
            {b.items.map((it, j) => (
              <div key={j} className="flex items-start gap-2.5">
                <span className="text-[14px] leading-[1.6] text-cw-text-muted">{b.type === "bullet" ? "•" : `${j + 1}.`}</span>
                <span className="text-[14px] leading-[1.6] text-cw-text"><InlineText text={it} /></span>
              </div>
            ))}
          </div>,
        );
        break;
      case "checklist":
        out.push(
          <div key={i} className="flex flex-col gap-[5px]">
            {b.items.map((it, j) => (
              <div key={j} className="flex items-start gap-2.5">
                <span
                  className="mt-[3px] flex h-[15px] w-[15px] flex-none items-center justify-center rounded-[4px] border text-[10px] font-bold"
                  style={it.checked ? { background: "var(--cw-primary)", borderColor: "var(--cw-primary)", color: "var(--cw-text-on-primary)" } : { borderColor: "var(--cw-border-strong)", color: "transparent" }}
                >
                  ✓
                </span>
                <span className="text-[14px] leading-[1.6] text-cw-text"><InlineText text={it.text} /></span>
              </div>
            ))}
          </div>,
        );
        break;
      case "divider":
        out.push(<div key={i} className="my-1 h-px bg-cw-bg-hover" />);
        break;
      case "image": {
        // Inline, in its position in the flow — never detached into a list.
        const href = `/api/help/attachments/${b.id}`;
        out.push(
          <figure key={i} className="m-0 flex flex-col gap-1">
            <a href={href} target="_blank" rel="noreferrer" className="inline-block max-w-[440px] self-start overflow-hidden rounded-[11px] border border-cw-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={href} alt={b.caption || "image"} className="block max-h-[320px] max-w-full bg-cw-bg-hover object-contain" loading="lazy" />
            </a>
            {b.caption && <figcaption className="text-[12.5px] italic text-cw-text-muted">{b.caption}</figcaption>}
          </figure>,
        );
        break;
      }
    }
  });
  flushAtts("atts-end");
  return <div className="flex min-w-0 flex-col gap-[11px]">{out}</div>;
}
