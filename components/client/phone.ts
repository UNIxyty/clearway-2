// Where a client on a phone goes (v3, 2026-11-13). The desk pages are a desk's: at 699 px and under, Timeline, Flights,
// Account and the start page open the phone app instead, in the top window, with replace (so Back does not come back
// here). Settings is not sent anywhere: it stays usable on a phone, under a bar with a link back to the phone app.
// Two copies of one rule: PHONE_GO_SCRIPT runs inline, first thing in the client layout, before the desk UI is drawn on
// a full load; goPhone() is the same rule for the shell's effect (a move inside the app, a window made narrow).
// No loop: at most three sends in fifteen seconds per tab, counted in sessionStorage; when the count cannot be kept
// (no storage), nothing is sent and the bar's link is the way over.
export const PHONE_MAX = 699;
export const PHONE_APP = "/digital-wall/phone/";
const KEY = "cw-client-phone-go";

/** The phone app address for a desk address, or null when the page stays (Settings, anything else). */
export function phoneTarget(pathname: string): string | null {
  const p = pathname.replace(/\/+$/, "");
  if (p === "/client" || p === "/client/start") return PHONE_APP;
  if (p === "/client/flights") return `${PHONE_APP}?view=flights`;
  if (p === "/client/account") return `${PHONE_APP}#account`;
  return null;
}

/** Sends the top window to the phone app when this is a phone and the page has a phone twin. True when it did. */
export function goPhone(pathname: string): boolean {
  try {
    let w: Window = window;
    try { if (window.top && window.top.location.href) w = window.top; } catch { w = window; }
    if (!w.matchMedia(`(max-width: ${PHONE_MAX}px)`).matches) return false;
    const to = phoneTarget(pathname);
    if (!to) return false;
    const now = Date.now();
    const seen = (JSON.parse(window.sessionStorage.getItem(KEY) || "[]") as number[]).filter((t) => now - t < 15000);
    if (seen.length >= 3) return false;
    seen.push(now);
    window.sessionStorage.setItem(KEY, JSON.stringify(seen));
    document.documentElement.classList.add("cw-phone-go");
    window.setTimeout(() => document.documentElement.classList.remove("cw-phone-go"), 6000);   // never a blank page for good
    w.location.replace(to);
    return true;
  } catch { return false; }
}

// the same rule, as the layout's inline script (plain old JavaScript: it runs before anything else of the page)
export const PHONE_GO_SCRIPT = `(function(){try{var w=window;try{if(window.top&&window.top.location.href)w=window.top}catch(e){w=window}
if(!w.matchMedia('(max-width: ${PHONE_MAX}px)').matches)return;
var p=location.pathname.replace(/\\/+$/,'');
var to=(p==='/client'||p==='/client/start')?'${PHONE_APP}':p==='/client/flights'?'${PHONE_APP}?view=flights':p==='/client/account'?'${PHONE_APP}#account':'';
if(!to)return;
var now=Date.now();var seen=JSON.parse(sessionStorage.getItem('${KEY}')||'[]').filter(function(t){return now-t<15000});
if(seen.length>=3)return;
seen.push(now);sessionStorage.setItem('${KEY}',JSON.stringify(seen));
document.documentElement.classList.add('cw-phone-go');
setTimeout(function(){document.documentElement.classList.remove('cw-phone-go')},6000);
w.location.replace(to)}catch(e){}})();`;
