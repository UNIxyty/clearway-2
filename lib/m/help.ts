"use client";

// Help & support on a phone: the thread's blocks as plain text, and the status/type words — shared by /m/help and
// the developer's /m/inbox.
import type { HelpBlock, HelpStatus, HelpThreadType } from "@/lib/help/shared";
import type { Tone } from "@/components/m/tier2";

export const STATUS: Record<HelpStatus, { label: string; tone: Tone }> = { untouched: { label: "Waiting", tone: "warn" }, under_process: { label: "Being looked at", tone: "info" }, done: { label: "Done", tone: "ok" }, impossible: { label: "Can’t be done", tone: "bad" } };
export const TYPE: Record<HelpThreadType, string> = { bug: "Something’s wrong", request: "A request", question: "A question", urgent: "Urgent", chat: "Chat" };

/** A block as lines of plain text for a phone (headings bold, lists bulleted, attachments named). */
export function blockLines(b: HelpBlock, attachments: Array<{ id: string; name: string }> = []): Array<{ kind: "heading" | "text" | "mono" | "item" | "attachment"; text: string }> {
  switch (b.type) {
    case "heading": case "subheading": return [{ kind: "heading", text: b.text }];
    case "paragraph": case "quote": return [{ kind: "text", text: b.text }];
    case "code": return [{ kind: "mono", text: b.text }];
    case "bullet": case "numbered": return b.items.map((t, i) => ({ kind: "item" as const, text: b.type === "numbered" ? `${i + 1}. ${t}` : `• ${t}` }));
    case "checklist": return b.items.map((it) => ({ kind: "item" as const, text: `${it.checked ? "☑" : "☐"} ${it.text}` }));
    case "attachment": return [{ kind: "attachment", text: attachments.find((a) => a.id === b.id)?.name ?? "Attachment" }];
    case "divider": return [];
    default: { const img = b as { type: string; id?: string }; return img.type === "image" ? [{ kind: "attachment", text: attachments.find((a) => a.id === img.id)?.name ?? "Image" }] : []; }
  }
}
