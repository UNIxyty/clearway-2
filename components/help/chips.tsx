"use client";

// The two chips that travel unchanged across every surface, plus the
// auto-collected context grid. Exact hues from the design.

import { HELP_CONTEXT_ORDER, HELP_STATUS_META, HELP_TYPE_META, helpContextFieldIsRed } from "@/lib/help/shared";
import type { HelpContext, HelpStatus, HelpThreadType } from "@/lib/help/shared";

export function TypeChip({ type, size = 22 }: { type: HelpThreadType; size?: number }) {
  const m = HELP_TYPE_META[type];
  return (
    <span
      className="inline-flex flex-none items-center rounded-[5px] border px-2 font-mono font-extrabold tracking-[0.05em]"
      style={{ height: size, background: m.bg, color: m.color, borderColor: m.border, fontSize: size <= 20 ? 9 : 9.5 }}
    >
      {m.chip}
    </span>
  );
}

export function StatusChip({ status, size = 21 }: { status: HelpStatus; size?: number }) {
  const m = HELP_STATUS_META[status];
  return (
    <span
      className="inline-flex flex-none items-center rounded-[5px] border px-[7px] font-mono font-extrabold tracking-[0.05em]"
      style={{ height: size, background: m.bg, color: m.color, borderColor: m.border, fontSize: 9.5 }}
    >
      {m.chip}
    </span>
  );
}

export function Reference({ value }: { value: string }) {
  return <span className="font-mono text-[10.5px] text-cw-faint">{value}</span>;
}

/** Six read-only mono fields, fixed order; two go red when they carry a problem. */
export function ContextGrid({ context, compact = false }: { context: HelpContext; compact?: boolean }) {
  return (
    <div className={compact ? "flex flex-wrap gap-x-[18px] gap-y-2" : "grid grid-cols-2 gap-x-[18px] gap-y-3 sm:grid-cols-3"}>
      {HELP_CONTEXT_ORDER.map(({ key, label }) => {
        const value = String(context[key] || "—");
        const red = helpContextFieldIsRed(key, value);
        return (
          <div key={key} className="flex min-w-0 flex-col gap-0.5">
            <span className="font-mono text-[9.5px] font-bold tracking-[0.09em] text-cw-faint">{label}</span>
            <span
              className="truncate font-mono text-[12.5px] font-semibold"
              style={{ color: red ? "#b42318" : "#17181c" }}
              title={value}
            >
              {value}
            </span>
          </div>
        );
      })}
    </div>
  );
}
