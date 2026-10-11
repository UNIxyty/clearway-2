// The theme's first move, for the root layout (a plain module, so the server can inline the string).
// Inline in <head>, before any stylesheet: reads the choice (localStorage cw-theme: "system" | "light" | "dark") and sets
// data-theme and color-scheme on <html> before the first paint, so a dark-theme load never flashes white. With JS off,
// shared/portal-tokens.css's prefers-color-scheme block covers it. See components/portal/theme.ts.
// It also restores a collapsed sidebar (localStorage cw-shell-collapsed) as data-sidebar="rail", so the shell's CSS lays
// out the rail on the first paint instead of correcting it after load. Settings (stage 4): compact tables
// (cw-density → data-density="compact") and reduced motion (cw-motion → data-motion="reduce") apply the same way.
export const THEME_KEY = "cw-theme";
export const THEME_SCRIPT = `(function(){try{var c=localStorage.getItem("${THEME_KEY}"),t=c==="light"||c==="dark"?c:(window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"),d=document.documentElement;d.setAttribute("data-theme",t);d.style.colorScheme=t;if(localStorage.getItem("cw-shell-collapsed")==="1")d.setAttribute("data-sidebar","rail");if(localStorage.getItem("cw-density")==="compact")d.setAttribute("data-density","compact");if(localStorage.getItem("cw-motion")==="reduce")d.setAttribute("data-motion","reduce")}catch(e){}})();`;
