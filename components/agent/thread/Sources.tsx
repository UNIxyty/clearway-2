"use client";

// Source attribution — per-claim citation, treatment 3c (design spec §4.7).
//
// Three surfaces, one rule: every factual sentence carries its source. When
// the model returns claim boundaries, each claim gets the tier underline and a
// superscript; when it does not, the reply still carries the numbered list
// and the panel strip — the underline is the only part that needs spans, and
// its absence is reported in the manifest rather than faked here.

import { useState, type ReactNode } from "react";
import { C, TIER, TIER_META } from "../ui/tokens";
import { Icon, Eyebrow } from "../ui/primitives";
import type { ClaimSpan, SourceRef, Tier } from "../types";

const tierOf = (t: Tier) => (t === "memory" ? null : TIER[t]);

/** The numbered badge shared by chips, rows and superscripts. */
export function SourceNumber({ n, tier, size = 18 }: { n: number; tier: Tier; size?: number }) {
  const t = tierOf(tier);
  return (
    <span style={{ minWidth: size, height: size, borderRadius: 4, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: size <= 16 ? 10 : 10.5, fontWeight: 700, color: t?.fg ?? C.info, background: t?.bg ?? C.infoTint, flex: "none", padding: "0 3px" }}>{n}</span>
  );
}

/**
 * Prose with claim underlines and superscripts (§4.7 A). `spans` index into
 * `text`. Hovering a claim highlights its source row and vice versa through
 * the shared `hot` state the parent owns.
 */
export function ClaimedProse({ text, spans, sources, hot, setHot, panel = false }: { text: string; spans: ClaimSpan[]; sources: SourceRef[]; hot: number | null; setHot: (n: number | null) => void; panel?: boolean }) {
  const byN = new Map(sources.map((s) => [s.n, s]));
  const parts: ReactNode[] = [];
  let cursor = 0;
  const ordered = [...spans].sort((a, b) => a.start - b.start);
  ordered.forEach((span, i) => {
    if (span.start > cursor) parts.push(<span key={`t${i}`}>{text.slice(cursor, span.start)}</span>);
    const src = byN.get(span.n);
    const tier = src ? tierOf(src.tier) : null;
    const highlight = hot === span.n;
    parts.push(
      <span key={`c${i}`} onMouseEnter={() => setHot(span.n)} onMouseLeave={() => setHot(null)}
        style={{ borderBottom: `2px solid ${tier?.underline ?? C.border}`, background: highlight ? (tier?.claimBg ?? tier?.bg ?? C.primaryTint2) : (src?.tier === "web" ? TIER.web.claimBg : "transparent"), borderRadius: 2, transition: "background-color 120ms" }}>
        {text.slice(span.start, span.end)}
        <sup style={{ fontSize: panel ? 9.5 : 10, fontWeight: 700, color: tier?.fg ?? C.muted, marginLeft: 1, lineHeight: 0 }}>{span.n}</sup>
      </span>,
    );
    cursor = span.end;
  });
  if (cursor < text.length) parts.push(<span key="tail" title="agent's reasoning">{text.slice(cursor)}</span>);
  return <span style={{ lineHeight: panel ? 1.6 : 1.8 }}>{parts}</span>;
}

/** Full-page source list: chip row for several, inline single (§4.7 B). */
export function SourceChips({ sources, hot, setHot }: { sources: SourceRef[]; hot?: number | null; setHot?: (n: number | null) => void }) {
  if (sources.length === 0) return <NoSource />;
  const single = sources.length === 1;
  return (
    <div style={{ display: "flex", flexDirection: single ? "row" : "column", alignItems: single ? "center" : "stretch", gap: single ? 10 : 8, borderTop: `1px solid ${C.divider}`, paddingTop: 12 }}>
      <Eyebrow>{single ? "Source" : `${sources.length} sources`}</Eyebrow>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {sources.map((s) => {
          const t = tierOf(s.tier); const meta = TIER_META[s.tier as keyof typeof TIER_META] ?? { label: s.tierLabel ?? "Remembered", icon: "bookmark" };
          const inner = (
            <>
              {!single && <SourceNumber n={s.n} tier={s.tier} />}
              <Icon name={meta.icon} size={13} color={t?.fg ?? C.info} />
              <span style={{ fontWeight: 600, color: t?.fg ?? C.info }}>{meta.label}</span>
              <span style={{ color: C.body }}>{s.label}</span>
              {s.href && <Icon name="arrow-up-right" size={12} color={C.faint} />}
            </>
          );
          const style = { display: "inline-flex", alignItems: "center", gap: 7, background: hot === s.n ? (t?.bg ?? C.primaryTint) : C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: single ? "5px 9px" : "5px 9px 5px 5px", fontSize: 12.5, color: C.body, textDecoration: "none", transition: "background-color 120ms" } as const;
          return s.href
            ? <a key={s.n} href={s.href} target={s.tier === "web" ? "_blank" : undefined} rel="noopener noreferrer" style={style} onMouseEnter={() => setHot?.(s.n)} onMouseLeave={() => setHot?.(null)}>{inner}</a>
            : <span key={s.n} style={style} onMouseEnter={() => setHot?.(s.n)} onMouseLeave={() => setHot?.(null)}>{inner}</span>;
        })}
      </div>
    </div>
  );
}

/** Panel width: 4 px strip, one line per source (§4.7 C). */
export function SourceStrip({ sources, hot, setHot }: { sources: SourceRef[]; hot?: number | null; setHot?: (n: number | null) => void }) {
  if (sources.length === 0) return <NoSource small />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, borderTop: `1px solid ${C.divider}`, paddingTop: 8 }}>
      <div style={{ display: "flex", gap: 2, height: 4, borderRadius: 2, overflow: "hidden", marginBottom: 4 }}>
        {sources.map((s) => <span key={s.n} style={{ flex: 1, background: tierOf(s.tier)?.strip ?? C.info }} />)}
      </div>
      {sources.map((s) => {
        const t = tierOf(s.tier); const meta = TIER_META[s.tier as keyof typeof TIER_META] ?? { label: s.tierLabel ?? "Remembered", icon: "bookmark" };
        const row = (
          <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: C.body, background: hot === s.n ? (t?.bg ?? C.primaryTint) : "transparent", borderRadius: 4, padding: "1px 2px", transition: "background-color 120ms" }} onMouseEnter={() => setHot?.(s.n)} onMouseLeave={() => setHot?.(null)}>
            <SourceNumber n={s.n} tier={s.tier} size={16} />
            <Icon name={meta.icon} size={11} color={t?.fg ?? C.info} />
            <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><span style={{ fontWeight: 600, color: t?.fg ?? C.info }}>{meta.label}</span> · {s.label}</span>
            {s.href && <Icon name="arrow-up-right" size={11} color={C.faint} />}
          </span>
        );
        return s.href ? <a key={s.n} href={s.href} target={s.tier === "web" ? "_blank" : undefined} rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit" }}>{row}</a> : <span key={s.n}>{row}</span>;
      })}
    </div>
  );
}

/** A reply with no source at all (§4.7 A, spec default): an eyebrow in the sources slot. */
export function NoSource({ small = false }: { small?: boolean }) {
  return <div style={{ borderTop: `1px solid ${C.divider}`, paddingTop: small ? 8 : 12 }}><Eyebrow small={small} color={C.faint}>No source · agent&apos;s reasoning</Eyebrow></div>;
}

/** Owns the claim↔row hover state for one reply. */
export function useHotSource() {
  const [hot, setHot] = useState<number | null>(null);
  return { hot, setHot };
}
