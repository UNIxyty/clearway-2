"use client";

// Context chip (design spec §4.21) and suggested questions (§4.22, §6.6, §7.3).
//
// The chip names the page or record the panel is about; it updates as the
// user navigates until they send, then the thread keeps its context and a
// "Now on…" chip offers the switch. Suggested questions come from what is
// happening now — live counts from /api/suggestions — not a fixed list.

import { useEffect, useState } from "react";
import { TIER, mono } from "../ui/tokens";
import { Icon } from "../ui/primitives";
import { AGENT_BASE, type AgentContext } from "../types";
import { cw } from "@/lib/portal-tokens";

const iconFor = (c: AgentContext) => c.icon ?? (c.kind === "flight" ? "plane" : c.kind === "airport" ? "map-pin" : c.kind === "notam-check" || c.kind === "wall" ? "file-check" : c.kind === "limitations" ? "triangle-alert" : "file-text");
const nameOf = (c: AgentContext) => c.kind === "flight" ? `flight ${c.label}` : c.kind === "airport" ? `${c.icao ?? c.label}${c.tab ? ` · ${c.tab}` : ""}` : c.kind === "limitations" ? "the Limitations page" : c.label;

export function ContextChip({ context, onClear, loading = false }: { context: AgentContext | null; onClear: () => void; loading?: boolean }) {
  if (loading) {
    return (
      <span style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600, color: cw.textMuted, background: cw.bgSunken, border: `1px dashed ${cw.borderControl}`, borderRadius: 999, padding: "4px 10px" }}>
        <span className="ag-pulse-1200" style={{ width: 8, height: 8, borderRadius: "50%", background: cw.neutral }} />
        Reading {context ? nameOf(context) : "the page"}…
      </span>
    );
  }
  if (!context) return null;
  if (context.kind === "document") {
    return (
      <span style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, color: cw.textLink, background: cw.primaryTint, border: `1px solid ${cw.primaryTintBorder}`, borderRadius: 999, padding: "4px 6px 4px 10px", maxWidth: "100%" }}>
        <Icon name="file-text" size={12} color={cw.textLink} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Asking about <span style={mono()}>{context.label}</span>{context.page ? <> · p. <span style={mono()}>{context.page}</span></> : null}</span>
        <button type="button" onClick={onClear} title="Clear context" aria-label="Clear context" className="ag-focus" style={{ width: 18, height: 18, borderRadius: "50%", background: cw.primaryWash, border: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, flex: "none" }}><Icon name="x" size={9} color={cw.textLink} /></button>
      </span>
    );
  }
  const code = context.kind === "flight" ? context.label : context.icao;
  return (
    <span style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, color: cw.textLink, background: cw.primaryTint, border: `1px solid ${cw.primaryTintBorder}`, borderRadius: 999, padding: "5px 6px 5px 11px" }}>
      <Icon name={iconFor(context)} size={12} color={cw.textLink} />
      <span>Asking about {context.kind === "flight" ? "flight " : ""}{code ? <span style={mono()}>{code}</span> : nameOf(context)}{context.kind === "airport" && context.tab ? ` · ${context.tab}` : ""}</span>
      <button type="button" onClick={onClear} title="Clear context" aria-label="Clear context" className="ag-focus" style={{ width: 18, height: 18, borderRadius: "50%", background: cw.primaryWash, border: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
        <Icon name="x" size={9} color={cw.textLink} />
      </button>
    </span>
  );
}

export function NowOnChip({ context, onSwitch }: { context: AgentContext; onSwitch: () => void }) {
  return (
    <button type="button" onClick={onSwitch} className="ag-hover ag-focus" style={{ alignSelf: "flex-start", fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: cw.textMuted, background: cw.bgSunken, border: `1px dashed ${cw.borderControl}`, borderRadius: 999, padding: "4px 11px", cursor: "pointer" }}>
      Now on {nameOf(context)} — switch?
    </button>
  );
}

// ── Suggested questions ───────────────────────────────────────────────────────
type Suggestion = { kind: string; color: string; icon?: string; question: string };
type Live = { greeting: string; flightsToday: number; delayed: number; delayedCallsigns: string[]; notamOutstanding: number | null; recent: Array<{ id: string; title: string; at: string }> };

export function useLiveSuggestions(context: AgentContext | null) {
  const [live, setLive] = useState<Live | null>(null);
  useEffect(() => {
    let alive = true;
    const q = context ? `?context=${encodeURIComponent(JSON.stringify({ kind: context.kind, icao: context.icao ?? null, flightId: context.flightId ?? null }))}` : "";
    fetch(`${AGENT_BASE}/api/suggestions${q}`, { credentials: "same-origin", cache: "no-store" }).then((r) => r.json()).then((b) => { if (alive && b?.ok) setLive(b); }).catch(() => {});
    return () => { alive = false; };
  }, [context?.kind, context?.icao, context?.flightId]); // eslint-disable-line react-hooks/exhaustive-deps
  return live;
}

/** The sets in §6.6 (panel) and §7.3 (full page), filled with live data where the spec says it is live. */
export function suggestionsFor(context: AgentContext | null, live: Live | null, full = false): { headline: string; sub: string; items: Suggestion[]; recent?: Live["recent"] } {
  if (full) {
    return {
      headline: "Ask about flights, airports, documents or the wall.",
      sub: "Every answer shows where it came from. Limitations are quoted exactly. Nothing changes until you confirm it.",
      items: [
        { kind: "Company knowledge · quoted exactly", color: TIER.company.fg, icon: "book-open", question: "What limitations apply to our fleet today? Quote them exactly." },
        { kind: "Live data", color: cw.textLink, icon: "database", question: "Which flights today still have unreviewed NOTAMs?" },
        { kind: "Documents · email", color: cw.textLink, icon: "file-text", question: "Send me the AD 2 for EVRA." },
        { kind: "Changes the wall · asks first", color: cw.successText, icon: "shield-check", question: "Add a limitation for EVRA and show it on the wall." },
      ],
    };
  }
  if (context?.kind === "airport" && context.icao) {
    const icao = context.icao;
    return {
      headline: `What do you need to know about ${icao}?`,
      sub: `Using ${icao}.`,
      items: [
        { kind: "NOTAM", color: cw.textLink, question: `Any NOTAMs I should know about at ${icao}?` },
        { kind: "Weather", color: cw.textLink, question: `Will the TAF at ${icao} affect this afternoon's departures?` },
        { kind: "Documents", color: cw.textLink, question: `Email me the AD 2 for ${icao}.` },
        { kind: "Limitations", color: TIER.company.fg, question: `What limitations apply at ${icao} today?` },
      ],
    };
  }
  if (context?.kind === "notam-check") {
    const n = live?.notamOutstanding;
    return {
      headline: n != null ? `${n} airport${n === 1 ? "" : "s"} still need${n === 1 ? "s" : ""} checking today.` : "NOTAM Check.",
      sub: "Start with one of these, or ask anything else.",
      items: [
        { kind: "NOTAM Check", color: cw.dangerText, question: "Which airports still need checking today?" },
        { kind: "NOTAM Check", color: cw.textLink, question: "Summarise the new NOTAMs at the airports still unchecked." },
        { kind: "Wall · asks first", color: cw.successText, question: "Mark the ones I've read as checked." },
      ],
    };
  }
  if (context?.kind === "wall" || context?.kind === "limitations" || context?.kind === "page") {
    return {
      headline: `What do you need to know about ${context.label}?`,
      sub: "Start with one of these, or ask anything else.",
      items: [
        { kind: "This page", color: cw.textLink, question: `What should I know about ${context.label} right now?` },
        { kind: "Company knowledge · quoted exactly", color: TIER.company.fg, question: "What limitations apply at our airports today? Quote them exactly." },
        { kind: "Wall · asks first", color: cw.successText, question: "Add a limitation and show it on the wall." },
      ],
    };
  }
  if (context?.kind === "flight") {
    return {
      headline: `What do you need to know about ${context.label}?`,
      sub: "I can see the flight you have selected, its airports, NOTAMs, weather and any limitation that applies.",
      items: [
        { kind: "Now", color: cw.warningText, question: `Why is ${context.label} delayed?` },
        { kind: "Flight", color: cw.textLink, question: `What applies to ${context.label}?` },
        { kind: "NOTAM", color: cw.dangerText, question: `Any NOTAMs for ${context.label}'s airports?` },
      ],
    };
  }
  const items: Suggestion[] = [];
  if (live && live.delayed > 0) items.push({ kind: "Now", color: cw.warningText, question: live.delayedCallsigns.length ? `Why ${live.delayedCallsigns.length > 1 ? "are" : "is"} ${live.delayedCallsigns.join(" and ")} delayed?` : `Which ${live.delayed} flights are delayed and why?` });
  items.push({ kind: "Now", color: cw.dangerText, question: "Which flights still have unreviewed NOTAMs?" });
  items.push({ kind: "Documents", color: cw.textLink, question: "/aip EVRA AD 2" });
  return {
    headline: live ? `${live.greeting} ${live.flightsToday} flight${live.flightsToday === 1 ? "" : "s"} today${live.delayed ? `, ${live.delayed} delayed` : ""}.` : "What do you need?",
    sub: "Opened without a page to ask about. These come from what's happening now, not a fixed list.",
    items,
    recent: live?.recent,
  };
}

export function SuggestedQuestions({ items, onAsk, full = false }: { items: Suggestion[]; onAsk: (q: string) => void; full?: boolean }) {
  return (
    <div style={full ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } : { display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((s) => (
        <button key={s.question} type="button" onClick={() => onAsk(s.question)} className="ag-card-hover ag-hover ag-focus"
          style={{ display: "flex", flexDirection: "column", gap: full ? 7 : 4, alignItems: "flex-start", textAlign: "left", background: cw.bgSurface, border: `1px solid ${cw.border}`, borderRadius: full ? 12 : 11, padding: full ? "13px 15px" : "10px 12px", cursor: "pointer", fontFamily: "inherit" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: full ? 11 : 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: s.color }}>{s.icon && <Icon name={s.icon} size={12} color={s.color} />}{s.kind}</span>
          <span style={{ fontSize: full ? 14.5 : 14, fontWeight: 500, lineHeight: full ? 1.45 : 1.4, color: cw.text, ...(s.question.startsWith("/") ? mono() : {}) }}>{s.question}</span>
        </button>
      ))}
    </div>
  );
}
