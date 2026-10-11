"use client";

// Mounts the agent's motion stylesheet once and exposes the shared tokens to
// it as CSS variables. The stylesheet cannot import JSON; this is the bridge,
// so agent.css carries no hex literal of its own.

import "./agent.css";

import { cw } from "@/lib/portal-tokens";

// Rendered by every agent surface. It used to render once per module load,
// which meant the FIRST page's <style> was removed on navigation and later
// pages had no variables — primary buttons then hovered to a transparent
// `var(--ag-primary-hover)` and "disappeared". Duplicate <style> tags are harmless.
export default function AgentStyles() {
  const vars = {
    "--ag-primary": cw.primary, "--ag-primary-hover": cw.primaryHover, "--ag-primary-border": cw.primaryTintBorder,
    "--ag-hover": cw.bgHover, "--ag-page": cw.bgPage, "--ag-suggest-hover": cw.primaryTint,
    "--ag-primary-tint": cw.primaryTint, "--ag-tab-hover": cw.bgActive, "--ag-search-match": cw.paperMatch, "--ag-search-current": cw.paperMatchCurrent, "--ag-cite-highlight": cw.citeHighlight, "--ag-cite-outline": cw.citeOutline, "--ag-quote-bg": cw.diffTint, "--ag-quote-line": cw.diffBorder, "--ag-quote-fg": cw.diffText, "--ag-quote-tint": cw.diffTint,
  } as Record<string, string>;
  // The agent stylesheet (agent.css) reads these --ag-* names; each is a portal --cw-* token, so it follows the theme.
  return <style id="ag-vars">{`:root{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";")}}`}</style>;
}
