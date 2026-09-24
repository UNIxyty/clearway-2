"use client";

// Mounts the agent's motion stylesheet once and exposes the shared tokens to
// it as CSS variables. The stylesheet cannot import JSON; this is the bridge,
// so agent.css carries no hex literal of its own.

import "./agent.css";
import { C } from "./tokens";

// Rendered by every agent surface. It used to render once per module load,
// which meant the FIRST page's <style> was removed on navigation and later
// pages had no variables — primary buttons then hovered to a transparent
// `var(--ag-primary-hover)` and "disappeared". Duplicate <style> tags are harmless.
export default function AgentStyles() {
  const vars = {
    "--ag-primary": C.primary, "--ag-primary-hover": C.primaryHover, "--ag-primary-border": C.primaryBorder,
    "--ag-hover": C.hover, "--ag-page": C.page, "--ag-suggest-hover": C.suggestHover,
  } as Record<string, string>;
  // #f7faff is the suggested-question hover wash (§4.22); it is the only value
  // the shared file has no name for and is set here so it stays in one place.
  return <style id="ag-vars">{`:root{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";")}}`}</style>;
}
