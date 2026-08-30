// Portal accessor for THE shared token source (shared/design-tokens.json).
// The console imports the same file (opsboard-react ui.jsx) — edit the JSON,
// never per-app copies.
import tokens from "@/shared/design-tokens.json";
export const T = tokens;
export const C = tokens.color;
export type StateChipKey = keyof typeof tokens.stateChip;
