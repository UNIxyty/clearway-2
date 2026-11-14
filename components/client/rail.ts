// The client sidebar's collapse (design "Desktop Screen v3", the rail; 2026-11-13). One fact — collapsed or not — kept
// in this browser (localStorage) and shown as a class on <html>, so the styles alone draw the rail: 72 px wide, the
// "CW" mark for the logo, each item an icon over a short word. RAIL_SCRIPT runs inline, first thing in the client
// layout, so a collapsed sidebar is drawn collapsed from the first paint. When the choice cannot be kept (no storage)
// the button still works until the page is left.
export const RAIL_KEY = "cw-client-rail";
export const RAIL_CLASS = "cw-client-rail";

export function readRail(): boolean { try { return window.localStorage.getItem(RAIL_KEY) === "1"; } catch { return false; } }

export function writeRail(on: boolean): void {
  document.documentElement.classList.toggle(RAIL_CLASS, on);
  try { if (on) window.localStorage.setItem(RAIL_KEY, "1"); else window.localStorage.removeItem(RAIL_KEY); } catch { /* not kept: the class above still holds for this page */ }
}

export const RAIL_SCRIPT = `(function(){try{if(localStorage.getItem('${RAIL_KEY}')==='1')document.documentElement.classList.add('${RAIL_CLASS}')}catch(e){}})();`;
