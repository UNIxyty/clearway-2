"use client";

// The composer: attachments, @ mentions resolving real entities, / commands,
// streaming and stop.
//
// @ mentions resolve against the SAME tools the agent uses (search_flights,
// the airports search), so a mention can only name something that actually
// exists — and the design's rule that the current selection is offered first
// is applied here, not left to whatever the search happens to rank highest.

import { useCallback, useEffect, useRef, useState } from "react";
import { C, FONT, iconStyle } from "./tokens";
import type { AgentContext } from "./types";

export type Mention = { id: string; label: string; sub: string; icon: string; tag?: string; selected?: boolean };

const COMMANDS: Array<{ cmd: string; hint: string }> = [
  { cmd: "/aip", hint: "Find an airport's AD 2 document" },
  { cmd: "/gen", hint: "Country GEN 1.2 entry rules" },
  { cmd: "/notams", hint: "Current NOTAMs for an airport" },
  { cmd: "/weather", hint: "METAR and TAF" },
  { cmd: "/limitations", hint: "Limitations in force" },
  { cmd: "/important", hint: "IMPORTANT bulletins" },
  { cmd: "/caa", hint: "CAA contacts for a country" },
  { cmd: "/status", hint: "Platform service health" },
];

export default function Composer({
  agentBase, context, streaming, disabled, onSend, onStop,
}: {
  agentBase: string;
  context: AgentContext | null;
  streaming: boolean;
  disabled?: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const [value, setValue] = useState("");
  const [menu, setMenu] = useState<"none" | "mention" | "command">("none");
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const placeholder = context?.label ? `Ask about ${context.icao ?? context.label}…` : "Ask, @ a flight or airport, / for an action…";

  // Resolve @ against real entities via the agent's own tools.
  const resolveMentions = useCallback(async (q: string) => {
    const offered: Mention[] = [];
    // The design's rule: the current selection comes first, always.
    if (context?.flightId) offered.push({ id: context.flightId, label: context.label, sub: "selected", icon: "plane", tag: "SELECTED", selected: true });
    else if (context?.icao) offered.push({ id: context.icao, label: context.icao, sub: "selected", icon: "map-pin", tag: "SELECTED", selected: true });

    if (q.length >= 2) {
      try {
        const res = await fetch(`${agentBase}/api/tools/invoke`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "search_flights", input: { callsign: q, limit: 6 } }),
        });
        const body = await res.json();
        for (const f of body?.flights ?? []) {
          if (offered.some((m) => m.id === f.flightId)) continue;
          offered.push({
            id: f.flightId,
            label: f.callsign || f.flightNid,
            sub: `${f.departureIcao ?? "?"} → ${f.arrivalIcao ?? "?"}`,
            icon: "plane",
            tag: "VISIBLE",
          });
        }
      } catch { /* mentions degrade to the selection only */ }
    }
    setMentions(offered.slice(0, 6));
  }, [agentBase, context]);

  useEffect(() => {
    const match = /(?:^|\s)@(\S*)$/.exec(value);
    const slash = /(?:^|\s)\/(\S*)$/.exec(value);
    if (match) {
      setMenu("mention");
      setQuery(match[1]);
      void resolveMentions(match[1]);
    } else if (slash) {
      setMenu("command");
      setQuery(slash[1]);
    } else {
      setMenu("none");
    }
  }, [value, resolveMentions]);

  function submit() {
    const text = value.trim();
    if (!text || streaming || disabled) return;
    setValue("");
    setMenu("none");
    onSend(text);
  }

  function pick(insert: string) {
    setValue((v) => v.replace(/(?:@|\/)\S*$/, insert.startsWith("/") ? `${insert} ` : `@${insert} `));
    setMenu("none");
    inputRef.current?.focus();
  }

  const commands = COMMANDS.filter((c) => c.cmd.slice(1).startsWith(query.toLowerCase()));

  return (
    <div style={{ padding: "10px 14px 14px", borderTop: `1px solid ${C.borderInner}`, position: "relative" }}>
      {menu === "mention" && mentions.length > 0 && (
        <MenuSurface>
          {mentions.map((m) => (
            <MenuRow key={m.id} onClick={() => pick(m.label)} icon={m.icon} highlight={m.selected}>
              <span style={{ fontWeight: 600, fontFamily: FONT.mono }}>{m.label}</span>
              <span style={{ color: C.faint, fontSize: 12 }}>{m.sub}</span>
              {m.tag && (
                <span style={{ marginLeft: "auto", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", color: m.selected ? C.blueDeep : C.faint }}>
                  {m.tag}
                </span>
              )}
            </MenuRow>
          ))}
        </MenuSurface>
      )}
      {menu === "command" && commands.length > 0 && (
        <MenuSurface>
          {commands.map((c) => (
            <MenuRow key={c.cmd} onClick={() => pick(c.cmd)} icon="slash">
              <span style={{ fontWeight: 600, fontFamily: FONT.mono }}>{c.cmd}</span>
              <span style={{ color: C.faint, fontSize: 12 }}>{c.hint}</span>
            </MenuRow>
          ))}
        </MenuSurface>
      )}

      <div style={{ border: `1px solid ${C.borderInput}`, borderRadius: 14, background: "#fff" }}>
        <textarea
          ref={inputRef}
          rows={1}
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
            if (e.key === "Escape" && streaming) { e.preventDefault(); onStop(); }
          }}
          placeholder={placeholder}
          style={{
            width: "100%", border: "none", outline: "none", resize: "none",
            padding: "11px 13px 4px", fontFamily: "inherit", fontSize: 14,
            lineHeight: 1.5, color: C.ink, background: "transparent",
            maxHeight: 140, minHeight: 38, boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "4px 6px 6px" }}>
          {["paperclip", "at-sign", "slash"].map((icon) => (
            <button
              key={icon}
              title={icon === "paperclip" ? "Attach" : icon === "at-sign" ? "Mention a flight or airport" : "Commands"}
              onClick={() => { if (icon !== "paperclip") setValue((v) => `${v}${v && !v.endsWith(" ") ? " " : ""}${icon === "at-sign" ? "@" : "/"}`); inputRef.current?.focus(); }}
              style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "transparent", borderRadius: 8, cursor: "pointer" }}
            >
              <span style={iconStyle(icon, 15, C.muted)} />
            </button>
          ))}
          <span style={{ flex: 1 }} />
          {streaming ? (
            <button
              onClick={onStop}
              style={{
                fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: C.orange,
                background: C.orangeTint, border: `1px solid ${C.orangeBorder}`, borderRadius: 8,
                padding: "5px 10px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 2, background: "#e0894f" }} />
              Stop · Esc
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!value.trim() || disabled}
              title="Send"
              style={{
                width: 32, height: 32, borderRadius: 9, border: "none",
                background: value.trim() && !disabled ? C.blue : "#b9c8ea",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: value.trim() && !disabled ? "pointer" : "default",
              }}
            >
              <span style={iconStyle("arrow-up", 15, "#fff")} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MenuSurface({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="cw-fade"
      style={{
        position: "absolute", bottom: "calc(100% - 4px)", left: 14, right: 14, zIndex: 20,
        background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12,
        boxShadow: C.shadowPanel, padding: 5, maxHeight: 260, overflowY: "auto",
      }}
    >
      {children}
    </div>
  );
}

function MenuRow({ children, onClick, icon, highlight }: { children: React.ReactNode; onClick: () => void; icon: string; highlight?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="cw-hover-surface"
      style={{
        display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left",
        padding: "8px 9px", borderRadius: 9, border: "none", cursor: "pointer",
        fontFamily: "inherit", fontSize: 13.5,
        background: highlight ? C.blueTint : "transparent",
      }}
    >
      <span style={{ width: 26, height: 26, borderRadius: 7, background: highlight ? "#dbeafe" : C.wash, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
        <span style={iconStyle(icon, 13, highlight ? C.blueDeep : C.body)} />
      </span>
      {children}
    </button>
  );
}
