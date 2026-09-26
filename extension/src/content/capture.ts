// Region capture overlay (§E6.2, C1). Shown on `capture.begin`; the pixels are taken by the background with
// tabs.captureVisibleTab AFTER this overlay is gone, so removal happens synchronously before any message is sent.
import { createSurface, remove, icon, keys, send, reducedMotion, MONO } from "./surface";

declare global { interface Window { __cwCapture?: { version: number } } }

const SURFACE = "cw-capture";
const FLASH = "cw-flash";
const MIN = 24;
const CSS = `
.cw-cap { position: fixed; inset: 0; cursor: crosshair; user-select: none; touch-action: none; background: rgba(16,18,22,.45); }
.cw-cap.cw-dragging { background: transparent; }
.cw-box { position: fixed; display: none; border: 1.5px solid #fff; outline: 1px solid #2563eb; box-shadow: 0 0 0 9999px rgba(16,18,22,.45); pointer-events: none; }
.cw-chip { position: fixed; display: none; font-family: ${MONO}; font-size: 11.5px; font-weight: 600; line-height: 16px; color: #fff; background: #2563eb; border-radius: 5px; padding: 2px 7px; white-space: nowrap; pointer-events: none; }
.cw-hint { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); height: 44px; border-radius: 999px; padding: 0 14px; display: inline-flex; align-items: center; gap: 10px; white-space: nowrap; cursor: default; font-size: 13px; }
.cw-hint .cw-sec { color: #6c7079; }
.cw-hint .cw-key { color: #6c7079; font-size: 12px; }
.cw-hint .cw-lead { font-weight: 500; }
.cw-capbtn { font-size: 12.5px; font-weight: 600; border-radius: 999px; padding: 5px 11px; margin-left: 2px; }
.cw-flash { position: fixed; inset: 0; background: #fff; pointer-events: none; opacity: 0; }
`;

(() => {
  if (window.__cwCapture) return;
  window.__cwCapture = { version: 1 };

  let up = false;
  let overlay: HTMLElement | null = null;
  let box: HTMLElement | null = null;
  let chip: HTMLElement | null = null;
  let start: { x: number; y: number } | null = null;
  let rect: { x: number; y: number; w: number; h: number } | null = null;

  const teardown = (): void => {
    if (!up) return;
    up = false;
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("wheel", block, { capture: true } as EventListenerOptions);
    window.removeEventListener("touchmove", block, { capture: true } as EventListenerOptions);
    remove(SURFACE);
    overlay = box = chip = null; start = null; rect = null;
  };

  const finish = (message: Record<string, unknown>): void => {
    teardown();                        // synchronous: the overlay is out of the DOM before the message leaves
    send(message);
  };

  const block = (e: Event): void => { if (up) e.preventDefault(); };
  const onKey = (e: KeyboardEvent): void => {
    if (!up) return;
    if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); finish({ type: "capture.full" }); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish({ type: "capture.cancel" }); }
  };

  const draw = (x2: number, y2: number): void => {
    if (!start || !box || !chip) return;
    const x = Math.min(start.x, x2), y = Math.min(start.y, y2);
    const w = Math.abs(x2 - start.x), h = Math.abs(y2 - start.y);
    rect = { x, y, w, h };
    box.style.display = "block";
    box.style.left = `${x}px`; box.style.top = `${y}px`; box.style.width = `${w}px`; box.style.height = `${h}px`;
    chip.style.display = "block";
    chip.textContent = `${Math.round(w)} × ${Math.round(h)}`;
    chip.style.left = `${x}px`;
    const below = y + h + 6;
    chip.style.top = `${below + 20 > window.innerHeight ? Math.max(0, y - 26) : below}px`;
  };

  const begin = (): void => {
    if (up) return;
    up = true;
    const s = createSurface(SURFACE, CSS);
    overlay = document.createElement("div");
    overlay.className = "cw-cap" + (reducedMotion() ? "" : " cw-x3");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Capture a region of the page");
    box = document.createElement("div"); box.className = "cw-box";
    chip = document.createElement("div"); chip.className = "cw-chip";
    const hint = document.createElement("div");
    hint.className = "cw-surface cw-hint";
    hint.innerHTML = `${icon("scan", 14, "#2563eb")}<span class="cw-lead">Drag to capture</span><span class="cw-sep">·</span>` +
      `<span class="cw-sec">${keys("⏎")} whole visible area</span><span class="cw-sep">·</span>` +
      `<span class="cw-sec">${keys("Esc")} cancel</span>` +
      `<button type="button" class="cw-btn cw-primary cw-capbtn">Capture</button>`;
    hint.addEventListener("pointerdown", (e) => e.stopPropagation());
    hint.querySelector("button")!.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); finish({ type: "capture.full" }); });

    overlay.addEventListener("pointerdown", (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      start = { x: e.clientX, y: e.clientY };
      overlay!.classList.add("cw-dragging");
      try { overlay!.setPointerCapture(e.pointerId); } catch { /* not needed */ }
      draw(e.clientX, e.clientY);
    });
    overlay.addEventListener("pointermove", (e: PointerEvent) => { if (start) draw(e.clientX, e.clientY); });
    overlay.addEventListener("pointerup", (e: PointerEvent) => {
      if (!start) return;
      draw(e.clientX, e.clientY);
      const r = rect;
      start = null;
      if (!r || r.w < MIN || r.h < MIN) { finish({ type: "capture.cancel" }); return; }
      finish({ type: "capture.region", rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }, dpr: window.devicePixelRatio || 1 });
    });
    overlay.addEventListener("pointercancel", () => { start = null; if (box) box.style.display = "none"; if (chip) chip.style.display = "none"; overlay?.classList.remove("cw-dragging"); });
    overlay.addEventListener("contextmenu", (e) => e.preventDefault());
    overlay.addEventListener("click", (e) => e.stopPropagation());

    s.layer.appendChild(overlay);
    s.layer.appendChild(box);
    s.layer.appendChild(chip);
    s.layer.appendChild(hint);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("wheel", block, { capture: true, passive: false });
    window.addEventListener("touchmove", block, { capture: true, passive: false });
  };

  const flash = (): void => {
    const s = createSurface(FLASH, CSS);
    const f = document.createElement("div");
    f.className = "cw-flash cw-x5";
    s.layer.appendChild(f);
    setTimeout(() => remove(FLASH), reducedMotion() ? 20 : 200);
  };

  chrome.runtime.onMessage.addListener((msg: { type?: string }) => {
    if (!msg) return;
    if (msg.type === "capture.begin") begin();
    else if (msg.type === "capture.flash") flash();
    else if (msg.type === "capture.cancel") teardown();
  });
})();
