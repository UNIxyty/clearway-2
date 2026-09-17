"use client";

// The composer's block editor. Not a textarea: ops paste error messages, ICAO
// codes and log excerpts, so blocks are first-class. The slash menu filters on
// every keystroke, keeps group headings while more than one group matches,
// always highlights the top result so Enter is safe, and the typed "/cod"
// stays visible as text — dismissing never silently eats input.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HelpBlock } from "@/lib/help/shared";
import { HELP_ATTACHMENT_MAX_BYTES } from "@/lib/help/shared";
import { uploadAttachment, utcTime } from "@/components/help/helpApi";

// ── Editor line model (serialized to HelpBlocks on send) ────────────────────

export type EditorLine =
  | { key: string; kind: "heading" | "subheading" | "paragraph" | "quote" | "bullet" | "numbered" | "code"; text: string }
  | { key: string; kind: "check"; text: string; checked: boolean }
  | { key: string; kind: "divider" };

let keyCounter = 1;
export const newKey = () => `l${keyCounter++}-${Date.now().toString(36)}`;
export const paragraph = (text = ""): EditorLine => ({ key: newKey(), kind: "paragraph", text });
export const headingLine = (text: string): EditorLine => ({ key: newKey(), kind: "heading", text });

export function serializeLines(lines: EditorLine[]): HelpBlock[] {
  const blocks: HelpBlock[] = [];
  for (const line of lines) {
    if (line.kind === "divider") { blocks.push({ type: "divider" }); continue; }
    if (line.kind === "bullet" || line.kind === "numbered") {
      if (!line.text.trim()) continue;
      const prev = blocks[blocks.length - 1];
      if (prev && prev.type === line.kind) prev.items.push(line.text);
      else blocks.push({ type: line.kind, items: [line.text] });
      continue;
    }
    if (line.kind === "check") {
      if (!line.text.trim()) continue;
      const prev = blocks[blocks.length - 1];
      if (prev && prev.type === "checklist") prev.items.push({ text: line.text, checked: line.checked });
      else blocks.push({ type: "checklist", items: [{ text: line.text, checked: line.checked }] });
      continue;
    }
    if (line.kind === "code") { blocks.push({ type: "code", text: line.text }); continue; }
    if (!line.text.trim()) continue;
    blocks.push({ type: line.kind, text: line.text });
  }
  return blocks;
}

export function linesFromBlocks(blocks: HelpBlock[]): EditorLine[] {
  const lines: EditorLine[] = [];
  for (const b of blocks) {
    if (b.type === "divider") lines.push({ key: newKey(), kind: "divider" });
    else if (b.type === "bullet" || b.type === "numbered") b.items.forEach((t) => lines.push({ key: newKey(), kind: b.type, text: t }));
    else if (b.type === "checklist") b.items.forEach((it) => lines.push({ key: newKey(), kind: "check", text: it.text, checked: it.checked }));
    else if (b.type === "code") lines.push({ key: newKey(), kind: "code", text: b.text });
    else if (b.type === "heading" || b.type === "subheading" || b.type === "paragraph" || b.type === "quote")
      lines.push({ key: newKey(), kind: b.type, text: b.text });
  }
  return lines.length ? lines : [paragraph()];
}

// ── Slash menu content (8 basic blocks + 4 inserts, markdown shortcuts) ─────

type MenuItem = { id: string; group: "BASIC BLOCKS" | "INSERT"; glyph: string; label: string; sub: string; shortcut: string };
const MENU: MenuItem[] = [
  { id: "heading", group: "BASIC BLOCKS", glyph: "H", label: "Heading", sub: "Section title", shortcut: "#" },
  { id: "subheading", group: "BASIC BLOCKS", glyph: "h", label: "Subheading", sub: "Smaller section title", shortcut: "##" },
  { id: "bullet", group: "BASIC BLOCKS", glyph: "•", label: "Bullet list", sub: "Plain list", shortcut: "-" },
  { id: "numbered", group: "BASIC BLOCKS", glyph: "1", label: "Numbered list", sub: "Ordered list", shortcut: "1." },
  { id: "check", group: "BASIC BLOCKS", glyph: "☑", label: "Checklist", sub: "With checkboxes", shortcut: "[]" },
  { id: "code", group: "BASIC BLOCKS", glyph: "{ }", label: "Code block", sub: "Monospaced, preserves line breaks", shortcut: "```" },
  { id: "quote", group: "BASIC BLOCKS", glyph: '"', label: "Quote", sub: "Quoted text", shortcut: ">" },
  { id: "divider", group: "BASIC BLOCKS", glyph: "—", label: "Divider", sub: "Horizontal rule", shortcut: "---" },
  { id: "attach", group: "INSERT", glyph: "⎘", label: "Attach file", sub: "Any file up to 10 MB", shortcut: "" },
  { id: "screenshot", group: "INSERT", glyph: "▣", label: "Insert screenshot", sub: "Or paste one", shortcut: "⌘V" },
  { id: "time", group: "INSERT", glyph: "◷", label: "Current time (UTC)", sub: "Inserted as text", shortcut: "" },
  { id: "url", group: "INSERT", glyph: "⌗", label: "This screen's URL", sub: "As inline code", shortcut: "" },
];

// ── Attachments ─────────────────────────────────────────────────────────────

export type PendingAttachment = {
  localId: string;
  file?: File;
  name: string;
  size: number;
  mime: string;
  isImage: boolean;
  previewUrl?: string;
  state: "uploading" | "attached" | "failed" | "toolarge";
  pct: number;
  id?: string; // server id once attached
  error?: string;
};

export function useAttachments() {
  const [items, setItems] = useState<PendingAttachment[]>([]);

  const startUpload = useCallback((file: File) => {
    const localId = newKey();
    const isImage = file.type.startsWith("image/");
    const base: PendingAttachment = {
      localId,
      file,
      name: file.name || "pasted.png",
      size: file.size,
      mime: file.type || "application/octet-stream",
      isImage,
      previewUrl: isImage ? URL.createObjectURL(file) : undefined,
      state: file.size > HELP_ATTACHMENT_MAX_BYTES ? "toolarge" : "uploading",
      pct: 0,
    };
    setItems((prev) => [...prev, base]);
    if (base.state === "toolarge") return;
    let lastPct = 0;
    uploadAttachment(file, (pct) => {
      lastPct = pct;
      setItems((prev) => prev.map((a) => (a.localId === localId ? { ...a, pct } : a)));
    })
      .then((att) => setItems((prev) => prev.map((a) => (a.localId === localId ? { ...a, state: "attached", pct: 100, id: att.id } : a))))
      .catch((error: Error & { status?: number }) => {
        setItems((prev) =>
          prev.map((a) =>
            a.localId === localId
              ? {
                  ...a,
                  state: error.status === 413 ? "toolarge" : "failed",
                  // Failures say whether anything survived.
                  error:
                    error.message === "network"
                      ? `Connection dropped at ${lastPct}%. Nothing was saved.`
                      : error.status === 415
                        ? "This file type is not supported."
                        : "The server refused it. Nothing was saved.",
                }
              : a,
          ),
        );
      });
  }, []);

  const retry = useCallback((localId: string) => {
    setItems((prev) => {
      const found = prev.find((a) => a.localId === localId);
      if (found?.file) {
        const rest = prev.filter((a) => a.localId !== localId);
        setTimeout(() => startUpload(found.file!), 0);
        return rest;
      }
      return prev;
    });
  }, [startUpload]);

  const remove = useCallback((localId: string) => {
    setItems((prev) => {
      const found = prev.find((a) => a.localId === localId);
      if (found?.previewUrl) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((a) => a.localId !== localId);
    });
  }, []);

  const reset = useCallback(() => setItems([]), []);
  const attachedIds = items.filter((a) => a.state === "attached" && a.id).map((a) => a.id!);
  const uploading = items.some((a) => a.state === "uploading");
  return { items, startUpload, retry, remove, reset, attachedIds, uploading };
}

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(0)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function AttachmentsPanel({
  atts,
  compact = false,
}: {
  atts: ReturnType<typeof useAttachments>;
  compact?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const openPicker = () => fileRef.current?.click();

  return (
    <div className="flex flex-col gap-2.5">
      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          for (const f of Array.from(e.target.files || [])) atts.startUpload(f);
          e.target.value = "";
        }}
      />
      {atts.items.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {atts.items.map((a) => {
            if (a.state === "failed") {
              return (
                <div key={a.localId} className="flex flex-1 basis-full items-center gap-[11px] rounded-[11px] border border-[#f0c9ca] bg-[#fdf2f2] px-[13px] py-[11px]">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[8px] border border-[#f0c9ca] bg-white text-[14px] font-extrabold text-cw-red">!</span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[13px] font-bold text-[#b42318]">{a.name} did not upload</span>
                    <span className="text-[12px] text-[#8b3a3a]">{a.error}</span>
                  </div>
                  <button onClick={() => atts.retry(a.localId)} className="h-8 flex-none cursor-pointer rounded-[8px] border-none bg-cw-red px-3 text-[12.5px] font-bold text-white">Retry</button>
                  <button onClick={() => atts.remove(a.localId)} className="h-8 flex-none cursor-pointer rounded-[8px] border border-[#f0c9ca] bg-white px-3 text-[12.5px] font-bold text-[#b42318]">Remove</button>
                </div>
              );
            }
            if (a.state === "toolarge") {
              return (
                <div key={a.localId} className="flex flex-1 basis-full items-center gap-[11px] rounded-[11px] border border-[#f3e0c4] bg-[#fdf6ec] px-[13px] py-[11px]">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[8px] border border-[#f3e0c4] bg-white font-mono text-[10px] font-bold text-[#b45309]">
                    {a.mime.split("/")[1]?.toUpperCase().slice(0, 4) || "FILE"}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[13px] font-bold text-[#8a4b09]">{a.name} is too large</span>
                    <span className="text-[12px] text-[#8a5a23]">
                      {kb(a.size)} · the limit is 10 MB. Trim it, or describe what happens and attach a still.
                    </span>
                  </div>
                  <button onClick={() => atts.remove(a.localId)} className="h-8 flex-none cursor-pointer rounded-[8px] border border-[#f3e0c4] bg-white px-3 text-[12.5px] font-bold text-[#8a4b09]">Remove</button>
                </div>
              );
            }
            const uploading = a.state === "uploading";
            if (a.isImage) {
              return (
                <div key={a.localId} className="w-[190px] flex-none overflow-hidden rounded-[11px] border" style={{ borderColor: uploading ? "#dbe6ff" : "#e6e7ea", background: uploading ? "#f2f7ff" : "#fbfbfc" }}>
                  <div className="relative flex h-[104px] items-center justify-center bg-[#eceef1]">
                    {a.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.previewUrl} alt={a.name} className="h-full w-full object-cover" style={{ opacity: uploading ? 0.6 : 1 }} />
                    ) : (
                      <span className="text-[11.5px] text-cw-faint">image</span>
                    )}
                    {uploading && <span className="absolute bottom-0 left-0 h-[3px] bg-cw-primary" style={{ width: `${a.pct}%` }} />}
                  </div>
                  <div className="flex items-center gap-2 px-[11px] py-[9px]">
                    <div className="flex min-w-0 flex-1 flex-col gap-px">
                      <span className="truncate text-[12px] font-semibold text-cw-ink">{a.name}</span>
                      <span className="font-mono text-[10.5px]" style={{ color: uploading ? "#1d4ed8" : "#9aa0a8" }}>
                        {uploading ? `${a.pct}% · ${kb(a.size)}` : `${kb(a.size)} · attached`}
                      </span>
                    </div>
                    <button onClick={() => atts.remove(a.localId)} className="flex h-[22px] w-[22px] flex-none cursor-pointer items-center justify-center rounded-[6px] border border-cw-border bg-white text-[11px] text-cw-muted">✕</button>
                  </div>
                </div>
              );
            }
            return (
              <div key={a.localId} className="flex items-center gap-[11px] rounded-[11px] border border-cw-border bg-cw-page px-[13px] py-[11px]">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[8px] border border-cw-border bg-white font-mono text-[10px] font-bold text-cw-muted">
                  {a.mime.split("/")[1]?.toUpperCase().slice(0, 4) || "FILE"}
                </span>
                <div className="flex flex-col gap-px">
                  <span className="text-[13px] font-semibold text-cw-ink">{a.name}</span>
                  <span className="font-mono text-[11px]" style={{ color: uploading ? "#1d4ed8" : "#9aa0a8" }}>
                    {uploading ? `${a.pct}% · ${kb(a.size)}` : `${kb(a.size)} · attached`}
                  </span>
                </div>
                <button onClick={() => atts.remove(a.localId)} className="flex h-6 w-6 flex-none cursor-pointer items-center justify-center rounded-[6px] border border-cw-border bg-white text-[11px] text-cw-muted">✕</button>
              </div>
            );
          })}
        </div>
      )}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          for (const f of Array.from(e.dataTransfer.files || [])) atts.startUpload(f);
        }}
        className="flex items-center justify-center gap-2.5 rounded-[12px] border border-dashed px-4 text-center"
        style={{
          borderColor: dragOver ? "#2563eb" : "#d5d8de",
          background: dragOver ? "#f2f7ff" : "#fbfbfc",
          paddingTop: compact ? 10 : 16,
          paddingBottom: compact ? 10 : 16,
        }}
      >
        <span className="text-[13px] text-cw-muted">
          Drop files here,{" "}
          <button onClick={openPicker} className="cursor-pointer border-none bg-transparent p-0 text-[13px] font-bold text-cw-primary">choose a file</button>
          , or paste a screenshot with
        </span>
        <span className="rounded-[5px] border border-cw-border bg-white px-1.5 py-0.5 font-mono text-[12px] text-cw-body">⌘V</span>
      </div>
    </div>
  );
}

// ── The editor ──────────────────────────────────────────────────────────────

export default function BlockEditor({
  lines,
  onChange,
  atts,
  screenUrl,
  compact = false,
  placeholder = "Start typing, or press / for commands",
  autoFocus = false,
}: {
  lines: EditorLine[];
  onChange: (lines: EditorLine[]) => void;
  atts: ReturnType<typeof useAttachments>;
  screenUrl: string;
  compact?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  const [menu, setMenu] = useState<{ lineKey: string; query: string; index: number; slashPos: number } | null>(null);
  const pendingFocus = useRef<{ key: string; pos: number } | null>(null);

  const filtered = useMemo(() => {
    if (!menu) return [];
    const q = menu.query.toLowerCase();
    return MENU.filter((m) => !q || m.label.toLowerCase().includes(q) || m.id.includes(q));
  }, [menu]);

  useEffect(() => {
    if (!pendingFocus.current) return;
    const { key, pos } = pendingFocus.current;
    const el = refs.current.get(key);
    if (el) {
      el.focus();
      try { el.setSelectionRange(pos, pos); } catch { /* code block etc. */ }
    }
    pendingFocus.current = null;
  });

  useEffect(() => {
    if (autoFocus && lines[0]) {
      const el = refs.current.get(lines[0].key);
      el?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  const update = (key: string, patch: Partial<EditorLine>) =>
    onChange(lines.map((l) => (l.key === key ? ({ ...l, ...patch } as EditorLine) : l)));

  const insertAfter = (key: string, line: EditorLine, focusPos = 0) => {
    const idx = lines.findIndex((l) => l.key === key);
    const next = [...lines.slice(0, idx + 1), line, ...lines.slice(idx + 1)];
    pendingFocus.current = { key: line.key, pos: focusPos };
    onChange(next);
  };

  const removeLine = (key: string) => {
    const idx = lines.findIndex((l) => l.key === key);
    if (idx === -1) return;
    const prev = lines[idx - 1];
    const next = lines.filter((l) => l.key !== key);
    if (prev && prev.kind !== "divider") pendingFocus.current = { key: prev.key, pos: ("text" in prev ? prev.text.length : 0) };
    onChange(next.length ? next : [paragraph()]);
  };

  // Apply a slash-menu (or markdown-shortcut) action to a line.
  const applyAction = (lineKey: string, actionId: string, textAfterStrip: string, caretPos: number) => {
    const line = lines.find((l) => l.key === lineKey);
    if (!line || line.kind === "divider") return;
    setMenu(null);
    switch (actionId) {
      case "heading": case "subheading": case "bullet": case "numbered": case "quote":
        pendingFocus.current = { key: lineKey, pos: caretPos };
        update(lineKey, { kind: actionId, text: textAfterStrip } as Partial<EditorLine>);
        break;
      case "check":
        pendingFocus.current = { key: lineKey, pos: caretPos };
        onChange(lines.map((l) => (l.key === lineKey ? { key: l.key, kind: "check", text: textAfterStrip, checked: false } : l)));
        break;
      case "code":
        pendingFocus.current = { key: lineKey, pos: 0 };
        update(lineKey, { kind: "code", text: textAfterStrip } as Partial<EditorLine>);
        break;
      case "divider": {
        const idx = lines.findIndex((l) => l.key === lineKey);
        const div: EditorLine = { key: newKey(), kind: "divider" };
        const para = paragraph(textAfterStrip);
        pendingFocus.current = { key: para.key, pos: 0 };
        onChange([...lines.slice(0, idx), div, para, ...lines.slice(idx + 1)]);
        break;
      }
      case "attach": case "screenshot": {
        update(lineKey, { text: textAfterStrip } as Partial<EditorLine>);
        // The panel owns the picker; simulate its choose button.
        const panel = document.querySelector<HTMLInputElement>("input[type=file].hidden, input[type=file][class*=hidden]");
        panel?.click();
        break;
      }
      case "time": {
        const t = `${textAfterStrip.slice(0, caretPos)}${utcTime()} ${textAfterStrip.slice(caretPos)}`;
        pendingFocus.current = { key: lineKey, pos: caretPos + 7 };
        update(lineKey, { text: t } as Partial<EditorLine>);
        break;
      }
      case "url": {
        const ins = `\`${screenUrl}\``;
        const t = `${textAfterStrip.slice(0, caretPos)}${ins}${textAfterStrip.slice(caretPos)}`;
        pendingFocus.current = { key: lineKey, pos: caretPos + ins.length };
        update(lineKey, { text: t } as Partial<EditorLine>);
        break;
      }
    }
  };

  const onTextChange = (line: EditorLine, value: string, el: HTMLTextAreaElement) => {
    if (line.kind === "divider") return;
    const caret = el.selectionStart ?? value.length;

    // Markdown shortcuts at line start (paragraphs only).
    if (line.kind === "paragraph") {
      const md: Array<[RegExp, string]> = [
        [/^# $/, "heading"], [/^## $/, "subheading"], [/^- $/, "bullet"],
        [/^1\. $/, "numbered"], [/^\[\] $/, "check"], [/^> $/, "quote"],
        [/^```$/, "code"], [/^---$/, "divider"],
      ];
      for (const [re, action] of md) {
        if (re.test(value)) { applyAction(line.key, action, "", 0); return; }
      }
    }

    // Slash menu: a '/' at a word boundary opens it; everything typed after
    // filters. The text (including "/cod") stays in the line.
    const upto = value.slice(0, caret);
    const slashMatch = /(^|\s)\/([a-zA-Z]*)$/.exec(upto);
    if (slashMatch && line.kind !== "code") {
      setMenu({ lineKey: line.key, query: slashMatch[2], index: 0, slashPos: caret - slashMatch[2].length - 1 });
    } else if (menu?.lineKey === line.key) {
      setMenu(null);
    }
    update(line.key, { text: value } as Partial<EditorLine>);
  };

  const onKeyDown = (line: EditorLine, e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;

    if (menu && menu.lineKey === line.key && filtered.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMenu({ ...menu, index: Math.min(menu.index + 1, filtered.length - 1) }); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMenu({ ...menu, index: Math.max(menu.index - 1, 0) }); return; }
      if (e.key === "Enter") {
        e.preventDefault();
        const item = filtered[menu.index] || filtered[0];
        if (line.kind !== "divider") {
          const text = line.text.slice(0, menu.slashPos) + line.text.slice((el.selectionStart ?? 0));
          applyAction(line.key, item.id, text, menu.slashPos);
        }
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); setMenu(null); return; }
    }

    if (line.kind === "code") {
      if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        insertAfter(line.key, paragraph());
      }
      return; // Enter inside code = newline, naturally
    }
    if (line.kind === "divider") return;

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const caret = el.selectionStart ?? line.text.length;
      const before = line.text.slice(0, caret);
      const after = line.text.slice(caret);
      const isList = line.kind === "bullet" || line.kind === "numbered" || line.kind === "check";
      if (isList && !line.text.trim()) {
        // Empty list line + Enter = leave the list.
        pendingFocus.current = { key: line.key, pos: 0 };
        onChange(lines.map((l) => (l.key === line.key ? paragraph() : l)));
        return;
      }
      const nextLine: EditorLine = isList
        ? line.kind === "check"
          ? { key: newKey(), kind: "check", text: after, checked: false }
          : { key: newKey(), kind: line.kind, text: after }
        : paragraph(after);
      update(line.key, { text: before } as Partial<EditorLine>);
      insertAfter(line.key, nextLine, 0);
      return;
    }

    if (e.key === "Backspace" && (el.selectionStart ?? 0) === 0 && (el.selectionEnd ?? 0) === 0) {
      if (line.kind !== "paragraph") {
        e.preventDefault();
        pendingFocus.current = { key: line.key, pos: 0 };
        onChange(lines.map((l) => (l.key === line.key ? { key: l.key, kind: "paragraph", text: line.text } : l)));
        return;
      }
      if (!line.text && lines.length > 1) {
        e.preventDefault();
        removeLine(line.key);
      }
    }
  };

  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  };

  const lineClass = (kind: EditorLine["kind"]) =>
    kind === "heading" ? "text-[16px] font-bold text-cw-ink"
    : kind === "subheading" ? "text-[14.5px] font-bold text-cw-body"
    : kind === "code" ? "font-mono text-[12.5px] leading-[1.7] text-cw-ink"
    : "text-[15px] leading-[1.65] text-cw-ink";

  return (
    <div
      className="flex flex-col gap-1.5"
      onPaste={(e) => {
        const files = Array.from(e.clipboardData?.files || []);
        if (files.length) {
          e.preventDefault();
          for (const f of files) atts.startUpload(f);
        }
      }}
    >
      {lines.map((line, li) => {
        if (line.kind === "divider") {
          return (
            <div key={line.key} className="group flex items-center gap-2 py-1">
              <div className="h-px flex-1 bg-cw-border" />
              <button
                onClick={() => removeLine(line.key)}
                className="hidden h-5 w-5 cursor-pointer items-center justify-center rounded border border-cw-border bg-white text-[10px] text-cw-muted group-hover:flex"
              >
                ✕
              </button>
            </div>
          );
        }
        const isList = line.kind === "bullet" || line.kind === "numbered" || line.kind === "check";
        const listIndex = line.kind === "numbered"
          ? lines.slice(0, li).reverse().reduce((n, l) => (l.kind === "numbered" ? n + 1 : n), 0) + 1
          : 0;
        return (
          <div key={line.key} className="relative">
            <div className={`flex items-start gap-2.5 ${line.kind === "code" ? "rounded-[10px] border border-cw-border bg-cw-page px-[13px] py-[11px]" : ""}`}>
              {line.kind === "bullet" && <span className="mt-[7px] text-[15px] leading-none text-cw-faint">•</span>}
              {line.kind === "numbered" && <span className="mt-[5px] text-[14px] leading-none text-cw-faint">{listIndex}.</span>}
              {line.kind === "check" && (
                <button
                  onClick={() => update(line.key, { checked: !line.checked } as Partial<EditorLine>)}
                  className="mt-[5px] flex h-[15px] w-[15px] flex-none cursor-pointer items-center justify-center rounded-[4px] border bg-white text-[10px] font-bold"
                  style={line.checked ? { background: "#2563eb", borderColor: "#2563eb", color: "#fff" } : { borderColor: "#c3c7ce", color: "transparent" }}
                >
                  ✓
                </button>
              )}
              {line.kind === "quote" && <span className="mt-0.5 w-[2px] self-stretch rounded bg-cw-border" />}
              <textarea
                ref={(el) => {
                  if (el) { refs.current.set(line.key, el); autoGrow(el); }
                  else refs.current.delete(line.key);
                }}
                rows={1}
                value={line.text}
                placeholder={li === 0 && !compact ? placeholder : line.kind === "code" ? "paste the error…" : ""}
                onChange={(e) => { autoGrow(e.currentTarget); onTextChange(line, e.currentTarget.value, e.currentTarget); }}
                onKeyDown={(e) => onKeyDown(line, e)}
                className={`w-full resize-none overflow-hidden border-none bg-transparent p-0 outline-none placeholder:text-[#c3c7ce] ${lineClass(line.kind)}`}
                spellCheck={line.kind !== "code"}
              />
            </div>

            {menu && menu.lineKey === line.key && filtered.length > 0 && (
              <div className="absolute left-0 top-full z-40 mt-1 w-[400px] overflow-hidden rounded-[13px] border border-cw-border bg-white shadow-[0_12px_32px_rgba(16,18,22,.14)]">
                <div className="flex items-center gap-2 border-b border-cw-borderInner px-3.5 py-2.5">
                  <span className="text-[12.5px] text-cw-faint">Blocks matching</span>
                  <span className="font-mono text-[12.5px] font-bold text-cw-ink">{menu.query || "anything"}</span>
                  <span className="ml-auto text-[12px] text-[#c3c7ce]">{filtered.length} of {MENU.length}</span>
                </div>
                <div className="flex max-h-[320px] flex-col gap-0.5 overflow-y-auto p-1.5">
                  {(["BASIC BLOCKS", "INSERT"] as const).map((group) => {
                    const items = filtered.filter((m) => m.group === group);
                    if (!items.length) return null;
                    return (
                      <div key={group}>
                        <div className="px-2.5 pb-1 pt-2 font-mono text-[9.5px] font-bold tracking-[0.1em] text-cw-faint">{group}</div>
                        {items.map((m) => {
                          const idx = filtered.indexOf(m);
                          const active = idx === menu.index;
                          return (
                            <div
                              key={m.id}
                              onMouseEnter={() => setMenu({ ...menu, index: idx })}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                const el = refs.current.get(line.key);
                                const caret = el?.selectionStart ?? line.text.length;
                                const text = line.text.slice(0, menu.slashPos) + line.text.slice(caret);
                                applyAction(line.key, m.id, text, menu.slashPos);
                              }}
                              className="flex cursor-pointer items-center gap-[11px] rounded-[9px] px-2.5 py-[9px]"
                              style={active ? { background: "#f2f7ff", border: "1px solid #dbe6ff" } : { border: "1px solid transparent" }}
                            >
                              <span
                                className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[8px] border font-mono text-[14px] font-bold"
                                style={active ? { background: "#fff", borderColor: "#dbe6ff", color: "#1d4ed8" } : { background: "#f5f6f7", borderColor: "#e6e7ea", color: "#3a3d44" }}
                              >
                                {m.glyph}
                              </span>
                              <div className="flex min-w-0 flex-1 flex-col gap-px">
                                <span className={`text-[13.5px] text-cw-ink ${active ? "font-bold" : "font-semibold"}`}>{m.label}</span>
                                <span className="truncate text-[12px] text-cw-muted">{m.sub}</span>
                              </div>
                              {active ? (
                                <span className="flex-none rounded-[5px] border border-[#dbe6ff] bg-white px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#1d4ed8]">⏎</span>
                              ) : m.shortcut ? (
                                <span className="flex-none font-mono text-[11px] text-[#c3c7ce]">{m.shortcut}</span>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                  <div className="mx-2.5 my-1 h-px bg-cw-borderInner" />
                  <div className="flex items-center gap-4 px-2.5 pb-2 pt-1">
                    {[["↑↓", "move"], ["⏎", "insert"], ["esc", "dismiss"]].map(([k, v]) => (
                      <span key={k} className="flex items-center gap-1.5">
                        <span className="rounded-[4px] border border-cw-border bg-cw-sidebar px-[5px] py-px font-mono text-[10.5px] text-cw-muted">{k}</span>
                        <span className="text-[11.5px] text-cw-faint">{v}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The formatting-shortcut footer strip from the design. */
export function ShortcutStrip({ trailing }: { trailing?: string }) {
  return (
    <div className="flex items-center gap-3.5">
      {[["/", "commands"], ["#", "heading"], ["-", "bullet"], ["`", "code"]].map(([k, v]) => (
        <span key={k} className="flex items-center gap-[7px]">
          <span className="rounded-[4px] border border-cw-border bg-cw-sidebar px-[5px] py-px font-mono text-[11px] text-cw-muted">{k}</span>
          <span className="text-[12px] text-cw-faint">{v}</span>
        </span>
      ))}
      {trailing && <span className="ml-auto text-[12px] text-cw-faint">{trailing}</span>}
    </div>
  );
}
