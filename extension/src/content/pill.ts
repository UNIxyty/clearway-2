// The floating "Ask Clearway" pill (§E6.1, F1.1). Approved hosts only. Until the pill is clicked, this script
// reads ONLY the length of the current selection (on mouseup, after 400 ms); the text leaves the page with the click.
import { createSurface, remove, ringMark, keys, send, clamp, reducedMotion } from "./surface";

declare global { interface Window { __cwPill?: { version: number } } }

const SURFACE = "cw-pill";
const CSS = `
.cw-pill {
  position: fixed; display: inline-flex; align-items: center; gap: 8px;
  padding: 6px 12px 6px 8px; border-radius: 999px; cursor: pointer; user-select: none;
  box-shadow: 0 0 0 3px rgba(255,255,255,.92), 0 8px 24px rgba(0,0,0,.24);
  font-size: 13px; font-weight: 600; line-height: 16px; white-space: nowrap; color: #17181c;
}
.cw-pill:hover { background: #fbfbfc; }
.cw-pill .cw-key { font-size: 11px; color: #9aa0a8; font-weight: 400; }
`;

(() => {
  if (window.__cwPill) return;
  window.__cwPill = { version: 1 };

  let enabled = true;
  let timer: number | undefined;
  let pill: HTMLButtonElement | null = null;
  let shownAtScroll = 0;
  let listening = false;

  const isEditableNode = (n: Node | null): boolean => {
    let el: Element | null = n ? (n.nodeType === 1 ? (n as Element) : n.parentElement) : null;
    while (el) {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return true;
      if ((el as HTMLElement).isContentEditable) return true;
      el = el.parentElement;
    }
    return false;
  };

  const hide = (): void => {
    if (timer) { clearTimeout(timer); timer = undefined; }
    if (!pill) return;
    const p = pill;
    pill = null;
    p.classList.remove("cw-x1");
    p.classList.add("cw-x2");
    const done = () => { p.remove(); if (!pill) remove(SURFACE); };
    if (reducedMotion()) done(); else setTimeout(done, 90);
  };

  const show = (): void => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { hide(); return; }
    // Only the length is looked at here; the text itself is dropped.
    const length = sel.toString().trim().length;
    if (length < 3) { hide(); return; }
    if (isEditableNode(sel.anchorNode) || isEditableNode(sel.focusNode)) { hide(); return; }
    const range = sel.getRangeAt(sel.rangeCount - 1);
    const rects = range.getClientRects();
    // The END of the selection: the bottom-most line box (some engines append zero-size or element rects).
    const valid = [...rects].filter((r) => r.width > 0 && r.height > 0).sort((a, b) => b.top - a.top || b.right - a.right);
    const end = valid[0] ?? range.getBoundingClientRect();
    if (!end || (end.width === 0 && end.height === 0)) { hide(); return; }

    const s = createSurface(SURFACE, CSS);
    if (!pill) {
      pill = document.createElement("button");
      pill.type = "button";
      pill.className = "cw-surface cw-pill cw-x1";
      pill.setAttribute("aria-label", "Ask Clearway about the selection");
      pill.innerHTML = `${ringMark(16)}<span>Ask Clearway</span>${keys("⌥⇧E")}`;
      pill.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); }); // keep the page selection
      pill.addEventListener("mouseup", (e) => e.stopPropagation());
      pill.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const cur = window.getSelection();
        const text = cur ? cur.toString() : "";
        if (text.trim().length) send({ type: "pill.ask", text, title: document.title, url: location.href, host: location.host });
        hide();
      });
      s.layer.appendChild(pill);
    }
    const w = pill.offsetWidth || 150;
    const h = pill.offsetHeight || 28;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = window.innerHeight;
    const flip = end.top < 48; // < 48px from the top → below the selection
    const top = flip ? end.bottom + 8 : end.top - 8 - h;
    const left = clamp(end.right - w / 2, 8, Math.max(8, vw - w - 8));
    pill.style.left = `${Math.round(left)}px`;
    pill.style.top = `${Math.round(clamp(top, 8, Math.max(8, vh - h - 8)))}px`;
    shownAtScroll = window.scrollY;
  };

  const onMouseUp = (e: MouseEvent): void => {
    if (!enabled) return;
    if ((e.target as Node | null) && (e.target as Element).id === SURFACE) return;
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(() => { timer = undefined; show(); }, 400);
  };
  const onSelectionChange = (): void => {
    if (!pill) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) hide();
  };
  const onKeyDown = (e: KeyboardEvent): void => {
    if (!pill && !timer) return;
    if (e.key === "Escape") { hide(); return; }
    if (["Shift", "Alt", "Control", "Meta", "CapsLock", "Fn"].includes(e.key)) return;
    hide();
  };
  const onScroll = (): void => {
    if (!pill) return;
    if (Math.abs(window.scrollY - shownAtScroll) > 40) hide();
  };

  const attach = (): void => {
    if (listening) return;
    listening = true;
    document.addEventListener("mouseup", onMouseUp, true);
    document.addEventListener("selectionchange", onSelectionChange);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
  };
  const detach = (): void => {
    if (!listening) return;
    listening = false;
    document.removeEventListener("mouseup", onMouseUp, true);
    document.removeEventListener("selectionchange", onSelectionChange);
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("scroll", onScroll, { capture: true } as EventListenerOptions);
  };

  // Registered synchronously at load: the background may configure the pill right after injecting it.
  chrome.runtime.onMessage.addListener((msg: { type?: string; enabled?: boolean }) => {
    if (!msg || msg.type !== "pill.config") return;
    enabled = msg.enabled !== false;
    if (enabled) attach(); else { hide(); detach(); }
  });
  attach();
})();
