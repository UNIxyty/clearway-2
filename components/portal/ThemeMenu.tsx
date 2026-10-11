"use client";

// The top bar's theme shortcut (portal redesign §1.3, item 21): sun in the light theme, moon in the dark one. It opens
// the same three choices the account setting has — Match this device, Light, Dark — and saves to the account.
import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import MaskIcon from "@/components/portal/Icon";
import { useTheme, type ThemeChoice } from "@/components/portal/theme";

const CHOICES: Array<{ id: ThemeChoice; label: string; icon: string }> = [
  { id: "system", label: "Match this device", icon: "laptop" },
  { id: "light", label: "Light", icon: "sun" },
  { id: "dark", label: "Dark", icon: "moon" },
];

export default function ThemeMenu() {
  const { choice, theme, setChoice } = useTheme();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const current = CHOICES.find((c) => c.id === choice)!;
  return (
    <div ref={wrap} className="relative flex-none">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Theme: ${current.label}`}
        title={`Theme: ${current.label}`}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] border-none bg-transparent text-cw-text-body hover:bg-cw-bg-hover"
      >
        <MaskIcon name={theme === "dark" ? "moon" : "sun"} size={17} />
      </button>
      {open && (
        <div role="menu" aria-label="Theme" className="absolute right-0 top-[calc(100%+6px)] z-50 w-[220px] rounded-[12px] border border-cw-border bg-cw-bg-raised p-1.5 shadow-cw-pop">
          {CHOICES.map((c, i) => (
            <button
              key={c.id}
              ref={i === 0 ? first : undefined}
              type="button"
              role="menuitemradio"
              aria-checked={choice === c.id}
              onClick={() => { setChoice(c.id); setOpen(false); }}
              onKeyDown={(e) => {
                const items = [...(wrap.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])];
                const at = items.indexOf(e.currentTarget);
                if (e.key === "ArrowDown") { e.preventDefault(); items[(at + 1) % items.length]?.focus(); }
                if (e.key === "ArrowUp") { e.preventDefault(); items[(at - 1 + items.length) % items.length]?.focus(); }
              }}
              className={clsx("flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-[8px] border-none px-2.5 text-left font-sans text-[13.5px] outline-none hover:bg-cw-bg-hover focus-visible:bg-cw-bg-hover",
                choice === c.id ? "bg-cw-bg-selected font-semibold text-cw-text" : "bg-transparent text-cw-text-body")}
            >
              <MaskIcon name={c.icon} size={15} color={choice === c.id ? "var(--cw-text-link)" : "var(--cw-text-muted)"} />
              <span className="flex-1">{c.label}</span>
              {choice === c.id && <MaskIcon name="check" size={14} color="var(--cw-text-link)" />}
            </button>
          ))}
          <div className="mt-1 border-t border-cw-divider px-2.5 pb-1 pt-2 text-[11.5px] leading-snug text-cw-text-muted">The Digital Wall keeps its own colours and fonts.</div>
        </div>
      )}
    </div>
  );
}
