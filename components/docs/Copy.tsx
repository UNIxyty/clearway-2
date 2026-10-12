"use client";

import { useState } from "react";
import MaskIcon from "@/components/portal/Icon";

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

// The link button on a task: copies the page address with the task's anchor (design 2.1, item 1).
export function CopyTaskLink({ id, title }: { id: string; title: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={`dx-copylink${done ? " done" : ""}`} aria-label={done ? "Link copied" : `Copy a link to “${title}”`}
      onClick={async () => { const url = `${window.location.origin}${window.location.pathname}#fn-${id}`; if (await copy(url)) { setDone(true); setTimeout(() => setDone(false), 2000); } }}>
      <MaskIcon name={done ? "check" : "link"} size={14} />
      {done && <span className="dx-copied" role="status">Copied</span>}
    </button>
  );
}

// A value someone would paste (design 2.4 / 2.6): mono, with a copy button that turns green and reads "Copied" for 2 s.
export function CopyValue({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <span className="dx-copyvalue">
      <code className="dx-mono">{value}</code>
      <button type="button" className={`dx-copybtn${done ? " done" : ""}`} aria-label={done ? "Copied" : `Copy ${value}`}
        onClick={async () => { if (await copy(value)) { setDone(true); setTimeout(() => setDone(false), 2000); } }}>
        <MaskIcon name={done ? "check" : "copy"} size={13} />{done && <span role="status">Copied</span>}
      </button>
    </span>
  );
}

// A block of text to copy (design 2.5): a title bar with Copy; lines starting with # explain the text, are shown muted
// and are left out of what is copied.
export function CodeBlock({ title, text }: { title: string; text: string }) {
  const [done, setDone] = useState(false);
  const lines = text.split("\n");
  const isNote = (l: string) => /^\s*#/.test(l);
  const toCopy = lines.filter((l) => !isNote(l)).join("\n").replace(/\n+$/, "");
  return (
    <div className="dx-codeblock">
      <div className="bar">
        <span className="t">{title}</span>
        <button type="button" className={`dx-codecopy${done ? " done" : ""}`} aria-label={done ? "Copied" : `Copy${title ? ` ${title}` : ""}`}
          onClick={async () => { if (await copy(toCopy)) { setDone(true); setTimeout(() => setDone(false), 2000); } }}>
          <MaskIcon name={done ? "check" : "copy"} size={13} /><span role={done ? "status" : undefined}>{done ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="dx-mono"><code>{lines.map((l, i) => (
        <span key={i} className={isNote(l) ? "note" : undefined}>{l}{i < lines.length - 1 ? "\n" : ""}</span>
      ))}</code></pre>
    </div>
  );
}
