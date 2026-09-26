// Build-time constants. The console origin is stamped by build.mjs (CW_CONSOLE_ORIGIN) and is the ONLY host
// the extension can reach without the user granting a site.
declare const __CW_CONSOLE_ORIGIN__: string;
export const CONSOLE_ORIGIN: string = typeof __CW_CONSOLE_ORIGIN__ === "string" ? __CW_CONSOLE_ORIGIN__ : "https://clearway.verxyl.com";
export const AGENT_API = `${CONSOLE_ORIGIN}/agent/api`;
export const CONSOLE_HOST = new URL(CONSOLE_ORIGIN).host;

export const LIMITS = {
  selectionChars: 20_000,     // §E6.1
  pageChars: 100_000,         // §E6.3 (spec default)
  captureMaxPx: 2_000,        // §E6.2 long side (spec default)
  captureMinPx: 24,           // §E6.2
  undoSeconds: 30,            // §E9
  markerSeconds: 10,          // §E9
  answerLingerMs: 8_000,      // §E8
  pauseToSendMs: 1_500,       // §E8
  confirmMinutes: 5,          // §3 rule 8 (server-enforced; mirrored for the badge)
};

export const SHORTCUTS = { panel: "⌥⇧C", talk: "⌥⇧Space", capture: "⌥⇧S", selection: "⌥⇧E" } as const;
