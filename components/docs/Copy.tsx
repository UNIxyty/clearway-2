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
