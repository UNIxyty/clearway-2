"use client";

// Pipeline (§I5). One component: the stage list is data, so type 1's nine stages and type 2's eleven both draw here.

import Link from "next/link";
import { C, INTAKE, TONE, mono } from "../ui/tokens";
import { Icon, hmsZ } from "../ui/primitives";
import { PulseDot } from "./controls";
import type { Stage } from "./api";
import { CARD, fmtDur } from "./intake-shared";

const LOOK: Record<Stage["state"], { icon: string; color: string; word: string }> = {
  done: { icon: "circle-check", color: C.okDot, word: "Done" },
  prog: { icon: "circle-dot", color: C.primary, word: "In progress" },
  wait: { icon: "hourglass", color: INTAKE.amberIcon, word: "Waiting on a person" },
  fail: { icon: "circle-x", color: C.dangerBadge, word: "Failed" },
  part: { icon: "circle-alert", color: C.dangerBadge, word: "Partly failed" },
  hold: { icon: "circle-pause", color: C.dangerBadge, word: "Stopped" },
  skip: { icon: "circle-minus", color: C.disabled, word: "Skipped" },
  none: { icon: "circle", color: C.borderControl, word: "Not started" },
};

export function Pipeline({ typeLabel, stageNames, stages, now }: { typeLabel: string; stageNames: string[]; stages: Stage[]; now: number }) {
  // Draw whatever list the API gives, in its order; a stage the API has no record for is "not started".
  const byName = new Map(stages.map((s) => [s.name, s]));
  const list: Stage[] = stageNames.map((n) => byName.get(n) ?? { name: n, state: "none", at: null, ms: null, note: null });
  const reached = list.filter((s) => s.state !== "none" && s.state !== "skip").length;
  return (
    <section aria-label="Pipeline" style={{ ...CARD, padding: "16px 16px 6px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>Pipeline</span>
        <span style={{ fontSize: 12, color: C.muted }}>{typeLabel} · {reached} of {list.length} stages reached</span>
      </div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
        {list.map((s, i) => {
          const l = LOOK[s.state] ?? LOOK.none; const last = i === list.length - 1;
          const t = s.state === "done" ? s.doneAt ?? s.at : s.at;
          const running = s.state === "prog" && s.at ? `${fmtDur(now - Date.parse(s.at))} so far` : null;
          const boxed = s.note && (s.state === "fail" || s.state === "part" || s.state === "hold");
          const nameColor = s.state === "none" || s.state === "skip" ? C.faint : C.ink;
          return (
            <li key={`${s.name}-${i}`} style={{ display: "flex", gap: 10 }}>
              <div style={{ width: 18, flex: "none", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <Icon name={l.icon} size={18} color={l.color} />
                {!last && <span aria-hidden style={{ width: 2, flex: 1, minHeight: 10, background: s.state === "done" ? C.okBorder : C.divider, margin: "3px 0", borderRadius: 1 }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0, paddingBottom: 12, display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: nameColor, flex: 1 }}>{s.name}</span>
                  {t && <span style={{ ...mono({ fontSize: 11 }), color: C.muted }}>{hmsZ(t)}</span>}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {s.state === "prog" && <PulseDot color={C.primary} />}
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: s.state === "none" ? C.faint : l.color }}>{l.word}</span>
                  {(running || s.ms != null) && <span style={{ ...mono({ fontSize: 11 }), color: C.faint }}>{running ?? fmtDur(s.ms)}</span>}
                </div>
                {s.note && !boxed && <div style={{ fontSize: 12, lineHeight: 1.45, color: C.muted, overflowWrap: "anywhere" }}>{s.note}</div>}
                {boxed && (
                  <div style={{ marginTop: 4, background: s.state === "hold" || s.state === "fail" || s.state === "part" ? TONE.red.bg : TONE.amber.bg, border: `1px solid ${TONE.red.bd}`, borderRadius: 10, padding: "10px 11px", fontSize: 12, lineHeight: 1.5, color: C.body, overflowWrap: "anywhere" }}>{s.note}</div>
                )}
                {s.email && <Link href={`/agent/mailbox?m=${encodeURIComponent(s.email)}`} className="ag-focus" style={{ fontSize: 12, fontWeight: 600, color: C.primary, alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="mail" size={12} color={C.primary} />Email in the agent mailbox</Link>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
