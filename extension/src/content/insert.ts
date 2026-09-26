// Insert into page (§E9). Preview is an overlay, never part of the field. Commit is ONE plain-text edit through
// execCommand("insertText") (or the native value setter + InputEvent). Nothing here ever submits, presses Enter,
// sends keystrokes or clicks a button. Undo restores exactly the pre-insert state for 30 s or until the user edits.
import { createSurface, remove, ringMark, icon, keys, send, clamp, reducedMotion, MONO } from "./surface";

declare global { interface Window { __cwInsert?: { version: number } } }

type Kind = "input" | "textarea" | "contenteditable";
type Editable = { el: HTMLElement; kind: Kind };
type Caret = { start: number; end: number } | Range;
type Session = {
  id: string; el: HTMLElement; kind: Kind; text: string; caret: Caret;
  phase: "preview" | "inserted" | "undone" | "done";
  before?: string;                       // inputs: the value before the insert
  insertedRange?: Range | null;          // contenteditable: exactly what was inserted
  insertedNode?: Node | null;
  stops: Array<() => void>;              // watchers
  undoTimer?: number; countdown?: number; markerTimer?: number; toastTimer?: number;
  markerPrev?: { boxShadow: string; transition: string } | null;
  selfEdit: boolean;
};

const PREVIEW = "cw-insert-preview";
const TOAST = "cw-insert-toast";
const HINT = "cw-insert-hint";
const UNDO_SECONDS = 30;
const MARKER_SECONDS = 10;

const STYLE = `
.cw-prev { position: fixed; max-width: 640px; min-width: 120px; max-height: 45vh; overflow: auto; border: 1.5px dashed #2563eb; background: #f2f7ff; border-radius: 6px; padding: 8px 10px; color: #3a3d44; font-family: inherit; font-size: 13px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; pointer-events: none; }
.cw-prev-wrap { position: fixed; font-family: "CW Public Sans", "Public Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; pointer-events: none; }
.cw-prev-label { position: absolute; top: -8px; left: 8px; background: #fff; color: #1d4ed8; font-size: 10.5px; font-weight: 700; letter-spacing: .08em; line-height: 14px; padding: 0 5px; white-space: nowrap; border-radius: 3px; }
.cw-toast { position: fixed; display: inline-flex; align-items: center; gap: 10px; padding: 8px 8px 8px 12px; border-radius: 10px; font-size: 13px; white-space: nowrap; }
.cw-toast .cw-undo { font-size: 13px; font-weight: 600; border-radius: 7px; padding: 5px 10px; }
.cw-toast .cw-count { font-family: ${MONO}; font-size: 11.5px; color: #9aa0a8; min-width: 30px; text-align: right; }
.cw-toast .cw-toast-x { background: transparent; color: #9aa0a8; padding: 4px; border-radius: 6px; }
.cw-toast .cw-toast-x:hover { background: #f0f1f3; color: #17181c; }
.cw-hint { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); height: 44px; border-radius: 999px; padding: 0 14px; display: inline-flex; align-items: center; gap: 10px; white-space: nowrap; font-size: 13px; font-weight: 500; }
.cw-hint .cw-sec { color: #6c7079; font-weight: 400; }
.cw-hint .cw-key { color: #6c7079; font-size: 12px; }
.cw-hint .cw-x { background: transparent; color: #9aa0a8; padding: 4px; border-radius: 6px; }
.cw-hint .cw-x:hover { background: #f0f1f3; color: #17181c; }
`;

(() => {
  if (window.__cwInsert) return;
  window.__cwInsert = { version: 1 };

  let session: Session | null = null;
  let picker: { id: string; stop: () => void } | null = null;

  // ---- editable targets --------------------------------------------------------------------------------------
  const INPUT_TYPES = new Set(["text", "search", "url", "tel", "email", ""]);
  function editableFrom(node: Node | null | undefined): Editable | null {
    let el: Element | null = node ? (node.nodeType === 1 ? (node as Element) : node.parentElement) : null;
    if (!el) return null;
    if (el instanceof HTMLTextAreaElement) return el.readOnly || el.disabled ? null : { el, kind: "textarea" };
    if (el instanceof HTMLInputElement) return INPUT_TYPES.has((el.getAttribute("type") || "").toLowerCase()) && !el.readOnly && !el.disabled ? { el, kind: "input" } : null;
    if ((el as HTMLElement).isContentEditable) {
      while (el.parentElement && (el.parentElement as HTMLElement).isContentEditable) el = el.parentElement;
      return { el: el as HTMLElement, kind: "contenteditable" };
    }
    return null;
  }
  const stillEditable = (s: Session): boolean => {
    if (!s.el.isConnected) return false;
    const e = editableFrom(s.el);
    return !!e && e.el === s.el;
  };

  function recordCaret(t: Editable): Caret {
    if (t.kind !== "contenteditable") {
      const f = t.el as HTMLInputElement | HTMLTextAreaElement;
      let end = f.value.length;
      try { if (typeof f.selectionEnd === "number") end = f.selectionEnd; } catch { /* type=email throws */ }
      return { start: end, end };
    }
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const r = sel.getRangeAt(0);
      if (t.el.contains(r.startContainer) && t.el.contains(r.endContainer)) { const c = r.cloneRange(); c.collapse(false); return c; }
    }
    const r = document.createRange(); r.selectNodeContents(t.el); r.collapse(false); return r;
  }

  function textBefore(s: { el: HTMLElement; kind: Kind; caret: Caret }): string {
    if (s.kind !== "contenteditable") {
      const f = s.el as HTMLInputElement | HTMLTextAreaElement;
      return f.value.slice(0, (s.caret as { start: number }).start);
    }
    const r = document.createRange(); r.selectNodeContents(s.el);
    const c = s.caret as Range;
    try { r.setEnd(c.startContainer, c.startOffset); } catch { /* keep whole */ }
    return r.toString();
  }
  const after = (s: { el: HTMLElement; kind: Kind; caret: Caret }): string => textBefore(s).replace(/\s+/g, " ").trim().slice(-40);

  function fieldLabel(t: Editable): string {
    const el = t.el;
    const clean = (v: string | null | undefined) => (v || "").replace(/\s+/g, " ").trim();
    let v = clean(el.getAttribute("aria-label"));
    if (!v) {
      const by = el.getAttribute("aria-labelledby");
      if (by) v = clean(by.split(/\s+/).map((i) => document.getElementById(i)?.textContent || "").join(" "));
    }
    if (!v) v = clean(el.getAttribute("placeholder"));
    if (!v && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.labels && el.labels.length) v = clean(el.labels[0].textContent);
    if (!v && el.id) { const l = document.querySelector(`label[for="${CSS_escape(el.id)}"]`); if (l) v = clean(l.textContent); }
    if (!v) v = clean(el.getAttribute("name"));
    if (!v) v = clean(el.getAttribute("title"));
    if (v) return v.length > 60 ? v.slice(0, 57) + "…" : v;
    if (t.kind === "input") return "field";
    return el.getBoundingClientRect().height >= 80 ? "message body" : "field";
  }
  const CSS_escape = (s: string): string => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, "\\$&"));

  // ---- caret geometry ----------------------------------------------------------------------------------------
  const MIRROR_PROPS = ["boxSizing", "width", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "fontFamily", "fontSize", "fontWeight", "fontStyle", "fontVariant", "letterSpacing", "lineHeight", "textTransform", "textIndent", "wordSpacing", "tabSize", "whiteSpace", "wordWrap", "overflowWrap", "wordBreak", "textAlign"];
  function inputCaretRect(f: HTMLInputElement | HTMLTextAreaElement, pos: number): DOMRect | null {
    try {
      const cs = getComputedStyle(f);
      const m = document.createElement("div");
      for (const p of MIRROR_PROPS) (m.style as unknown as Record<string, string>)[p] = (cs as unknown as Record<string, string>)[p];
      m.style.position = "fixed"; m.style.top = "-9999px"; m.style.left = "0"; m.style.visibility = "hidden"; m.style.pointerEvents = "none";
      m.style.overflow = "hidden"; m.style.height = "auto";
      if (f instanceof HTMLInputElement) { m.style.whiteSpace = "pre"; m.style.width = "auto"; m.style.minWidth = cs.width; }
      else { m.style.whiteSpace = "pre-wrap"; m.style.wordWrap = "break-word"; }
      m.textContent = f.value.slice(0, pos);
      const span = document.createElement("span"); span.textContent = f.value.slice(pos) || "."; m.appendChild(span);
      document.documentElement.appendChild(m);
      const fr = f.getBoundingClientRect();
      const x = fr.left + span.offsetLeft - f.scrollLeft;
      const y = fr.top + span.offsetTop - f.scrollTop;
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3 || 18;
      m.remove();
      return new DOMRect(x, y, 1, lh);
    } catch { return null; }
  }
  function caretRect(s: { el: HTMLElement; kind: Kind; caret: Caret }): DOMRect | null {
    if (s.kind !== "contenteditable") return inputCaretRect(s.el as HTMLInputElement | HTMLTextAreaElement, (s.caret as { start: number }).start);
    const r = (s.caret as Range).cloneRange();
    const rects = r.getClientRects();
    if (rects.length) return rects[0];
    const b = r.getBoundingClientRect();
    if (b && (b.width || b.height)) return b;
    const n = r.startContainer;
    const el = n.nodeType === 1 ? (n as Element) : n.parentElement;
    if (el && el !== s.el) { const er = el.getBoundingClientRect(); return new DOMRect(er.left, er.top, 1, er.height || 18); }
    return null;
  }

  // ---- preview -----------------------------------------------------------------------------------------------
  let previewEl: HTMLElement | null = null;
  let previewBox: HTMLElement | null = null;
  function placePreview(s: Session): void {
    if (!previewEl || !previewBox) return;
    const fr = s.el.getBoundingClientRect();
    const cs = getComputedStyle(s.el);
    const padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0, padB = parseFloat(cs.paddingBottom) || 0;
    const width = clamp(fr.width - padL - padR, 120, 640);
    const cr = caretRect(s);
    let left = fr.left + padL, top: number;
    if (cr && cr.top >= fr.top - 2 && cr.top <= fr.bottom + 2) top = cr.bottom + 4;
    else top = fr.bottom - padB - 8;                       // fallback: the field's bottom-left, inside the field
    previewBox.style.width = `${Math.round(width)}px`;
    const vw = document.documentElement.clientWidth || window.innerWidth, vh = window.innerHeight;
    left = clamp(left, 8, Math.max(8, vw - width - 8));
    const h = previewEl.offsetHeight || 40;
    top = clamp(top, 12, Math.max(12, vh - h - 8));
    previewEl.style.left = `${Math.round(left)}px`;
    previewEl.style.top = `${Math.round(top)}px`;
  }
  function showPreview(s: Session): void {
    const sf = createSurface(PREVIEW, STYLE);
    previewEl = document.createElement("div");
    previewEl.className = "cw-prev-wrap" + (reducedMotion() ? "" : " cw-x9");
    previewBox = document.createElement("div");
    previewBox.className = "cw-prev";
    previewBox.textContent = s.text;
    const label = document.createElement("span");
    label.className = "cw-prev-label";
    label.textContent = "PREVIEW · NOT INSERTED";
    previewEl.appendChild(previewBox);
    previewEl.appendChild(label);
    sf.layer.appendChild(previewEl);
    placePreview(s);
    const re = () => placePreview(s);
    window.addEventListener("scroll", re, { capture: true, passive: true });
    window.addEventListener("resize", re);
    s.stops.push(() => { window.removeEventListener("scroll", re, { capture: true } as EventListenerOptions); window.removeEventListener("resize", re); });
  }
  function hidePreview(): void { previewEl = previewBox = null; remove(PREVIEW); }

  // ---- watching ----------------------------------------------------------------------------------------------
  function event(s: Session, ev: string, detail?: unknown): void {
    send(detail === undefined ? { type: "insert.event", id: s.id, event: ev } : { type: "insert.event", id: s.id, event: ev, detail });
  }
  function watch(s: Session): void {
    const onInput = () => {
      if (s.selfEdit) return;
      if (s.phase === "preview") { event(s, "fieldChanged"); endSession(s); }
      else if (s.phase === "inserted") expireUndo(s, "edited");
    };
    s.el.addEventListener("input", onInput);
    s.stops.push(() => s.el.removeEventListener("input", onInput));
    if (s.kind === "contenteditable") {
      const mo = new MutationObserver(() => onInput());
      mo.observe(s.el, { childList: true, characterData: true, subtree: true });
      s.stops.push(() => mo.disconnect());
    }
    const poll = window.setInterval(() => {
      if (stillEditable(s)) return;
      if (s.phase === "preview") { event(s, "targetLost"); endSession(s); }
      else if (s.phase === "inserted") expireUndo(s, "targetLost");
      else endSession(s);
    }, 500);
    s.stops.push(() => clearInterval(poll));
    const onHide = () => { if (s.phase === "preview") event(s, "targetLost"); else if (s.phase === "inserted") expireUndo(s, "pagehide"); endSession(s); };
    window.addEventListener("pagehide", onHide);
    s.stops.push(() => window.removeEventListener("pagehide", onHide));
  }
  function endSession(s: Session): void {
    for (const stop of s.stops.splice(0)) { try { stop(); } catch { /* ignore */ } }
    if (s.undoTimer) clearTimeout(s.undoTimer);
    if (s.countdown) clearInterval(s.countdown);
    if (s.toastTimer) clearTimeout(s.toastTimer);
    hidePreview();
    removeToast();
    if (s.phase !== "inserted") clearMarker(s);
    s.phase = "done";
    if (session === s) session = null;
  }

  // ---- marker + toast ----------------------------------------------------------------------------------------
  function setMarker(s: Session): void {
    s.markerPrev = { boxShadow: s.el.style.boxShadow, transition: s.el.style.transition };
    s.el.style.boxShadow = "inset 3px 0 0 #2563eb";
    s.markerTimer = window.setTimeout(() => fadeMarker(s), MARKER_SECONDS * 1000);
  }
  function fadeMarker(s: Session): void {
    if (!s.markerPrev) return;
    const prev = s.markerPrev;
    if (reducedMotion()) { clearMarker(s); return; }
    s.el.style.transition = "box-shadow 400ms ease-in";          // X10
    s.el.style.boxShadow = "inset 3px 0 0 rgba(37,99,235,0)";
    s.markerTimer = window.setTimeout(() => { s.el.style.transition = prev.transition; s.el.style.boxShadow = prev.boxShadow; s.markerPrev = null; }, 420);
  }
  function clearMarker(s: Session): void {
    if (s.markerTimer) { clearTimeout(s.markerTimer); s.markerTimer = undefined; }
    if (!s.markerPrev) return;
    s.el.style.transition = s.markerPrev.transition;
    s.el.style.boxShadow = s.markerPrev.boxShadow;
    s.markerPrev = null;
  }

  let toastEl: HTMLElement | null = null;
  function placeToast(el: HTMLElement, field: HTMLElement): void {
    const fr = field.getBoundingClientRect();
    const vw = document.documentElement.clientWidth || window.innerWidth, vh = window.innerHeight;
    const w = el.offsetWidth || 240, h = el.offsetHeight || 38;
    el.style.left = `${Math.round(clamp(fr.left + 16, 8, Math.max(8, vw - w - 8)))}px`;
    el.style.top = `${Math.round(clamp(fr.bottom - 16 - h, 8, Math.max(8, vh - h - 8)))}px`;
  }
  function showToast(s: Session, html: string): HTMLElement {
    removeToast();
    const sf = createSurface(TOAST, STYLE);
    toastEl = document.createElement("div");
    toastEl.className = "cw-surface cw-toast" + (reducedMotion() ? "" : " cw-x11");
    toastEl.setAttribute("role", "status");
    toastEl.innerHTML = html;
    sf.layer.appendChild(toastEl);
    placeToast(toastEl, s.el);
    const re = () => { if (toastEl) placeToast(toastEl, s.el); };
    window.addEventListener("scroll", re, { capture: true, passive: true });
    window.addEventListener("resize", re);
    s.stops.push(() => { window.removeEventListener("scroll", re, { capture: true } as EventListenerOptions); window.removeEventListener("resize", re); });
    return toastEl;
  }
  function removeToast(): void { toastEl = null; remove(TOAST); }

  // ---- the edit ----------------------------------------------------------------------------------------------
  function nativeSet(f: HTMLInputElement | HTMLTextAreaElement, value: string): void {
    const proto = f instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const d = Object.getOwnPropertyDescriptor(proto, "value");
    if (d && d.set) d.set.call(f, value); else f.value = value;
  }
  function restoreCaret(s: Session): void {
    if (s.kind !== "contenteditable") {
      const f = s.el as HTMLInputElement | HTMLTextAreaElement;
      const c = s.caret as { start: number; end: number };
      const len = f.value.length;
      try { f.setSelectionRange(Math.min(c.start, len), Math.min(c.end, len)); } catch { /* type=email */ }
      return;
    }
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange((s.caret as Range).cloneRange());
  }

  function commit(s: Session): number {
    hidePreview();
    s.selfEdit = true;
    try {
      s.el.focus({ preventScroll: false });
      restoreCaret(s);
      if (s.kind !== "contenteditable") {
        const f = s.el as HTMLInputElement | HTMLTextAreaElement;
        const c = s.caret as { start: number; end: number };
        s.before = f.value;
        let ok = false;
        try { ok = document.execCommand("insertText", false, s.text); } catch { ok = false; }
        if (!ok || f.value === s.before) {
          nativeSet(f, s.before.slice(0, c.start) + s.text + s.before.slice(c.end));
          try { f.setSelectionRange(c.start + s.text.length, c.start + s.text.length); } catch { /* ignore */ }
          f.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: false, inputType: "insertText", data: s.text }));
        }
      } else {
        const startR = (s.caret as Range).cloneRange(); startR.collapse(true);   // stays BEFORE inserted data (live range rule)
        const textBeforeEdit = s.el.textContent || "";
        let ok = false;
        try { ok = document.execCommand("insertText", false, s.text); } catch { ok = false; }
        const sel = window.getSelection();
        if (ok && (s.el.textContent || "") !== textBeforeEdit && sel && sel.rangeCount && s.el.contains(sel.getRangeAt(0).endContainer)) {
          const endR = sel.getRangeAt(0).cloneRange(); endR.collapse(false);
          const r = document.createRange();
          r.setStart(startR.startContainer, startR.startOffset);
          r.setEnd(endR.endContainer, endR.endOffset);
          s.insertedRange = r;
          s.insertedNode = null;
        } else {
          const node = document.createTextNode(s.text);
          const r = (s.caret as Range).cloneRange(); r.collapse(true); r.insertNode(node);
          const r2 = document.createRange(); r2.selectNode(node);
          s.insertedRange = r2; s.insertedNode = node;
          if (sel) { sel.removeAllRanges(); const c = document.createRange(); c.setStartAfter(node); c.collapse(true); sel.addRange(c); }
          s.el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: false, inputType: "insertText", data: s.text }));
        }
      }
    } finally {
      setTimeout(() => { s.selfEdit = false; }, 0);      // the MutationObserver delivers after this task
    }
    s.phase = "inserted";
    setMarker(s);
    startUndoWindow(s);
    return s.text.length;
  }

  function startUndoWindow(s: Session): void {
    let left = UNDO_SECONDS;
    const html = `${ringMark(14)}<span>Inserted by Clearway</span><button type="button" class="cw-btn cw-primary cw-undo">Undo</button><span class="cw-count">${fmt(left)}</span>`;
    const t = showToast(s, html);
    t.querySelector(".cw-undo")!.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); undo(s); });
    const count = t.querySelector(".cw-count") as HTMLElement;
    s.countdown = window.setInterval(() => { left = Math.max(0, left - 1); count.textContent = fmt(left); }, 1000);     // X12
    s.undoTimer = window.setTimeout(() => expireUndo(s, "timeout"), UNDO_SECONDS * 1000);
  }
  const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

  function expireUndo(s: Session, reason: string): void {
    if (s.phase !== "inserted") return;
    s.phase = "done";
    if (s.undoTimer) clearTimeout(s.undoTimer);
    if (s.countdown) clearInterval(s.countdown);
    event(s, "undoExpired", { reason });
    removeToast();
    for (const stop of s.stops.splice(0)) { try { stop(); } catch { /* ignore */ } }
    // The marker keeps its own 10 s clock; the session object stays referenced by the timer only.
    if (session === s) session = null;
  }

  function undo(s: Session): boolean {
    if (s.phase !== "inserted") return false;
    if (s.undoTimer) clearTimeout(s.undoTimer);
    if (s.countdown) clearInterval(s.countdown);
    s.selfEdit = true;
    try {
      if (s.kind !== "contenteditable") {
        const f = s.el as HTMLInputElement | HTMLTextAreaElement;
        nativeSet(f, s.before ?? "");
        restoreCaret(s);
        f.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: false, inputType: "deleteContentBackward", data: null }));
      } else if (s.insertedRange) {
        const r = s.insertedRange;
        const sel = window.getSelection();
        let done = false;
        if (sel && !s.insertedNode) {
          s.el.focus({ preventScroll: true });
          sel.removeAllRanges(); sel.addRange(r);
          const beforeText = s.el.textContent || "";
          try { done = document.execCommand("delete") && (s.el.textContent || "") !== beforeText; } catch { done = false; }
        }
        if (!done) {
          r.deleteContents();
          s.el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: false, inputType: "deleteContentBackward", data: null }));
        }
        if (sel) { sel.removeAllRanges(); const c = (s.caret as Range).cloneRange(); c.collapse(true); try { sel.addRange(c); } catch { /* ignore */ } }
      }
    } finally {
      setTimeout(() => { s.selfEdit = false; }, 0);
    }
    s.phase = "undone";
    clearMarker(s);
    event(s, "undone");
    showToast(s, `${icon("undo-2", 14, "#9aa0a8")}<span>Removed. The field is as it was</span>`);
    s.toastTimer = window.setTimeout(() => endSession(s), 3000);
    return true;
  }

  // ---- preview / pick ----------------------------------------------------------------------------------------
  type Reply = { ok: true; field: { label: string; kind: Kind }; after: string } | { ok: false; reason: string };
  function startPreview(id: string, text: string, target: Editable): Reply {
    if (session) endSession(session);
    const s: Session = { id, el: target.el, kind: target.kind, text, caret: recordCaret(target), phase: "preview", stops: [], selfEdit: false };
    session = s;
    showPreview(s);
    watch(s);
    return { ok: true, field: { label: fieldLabel(target), kind: target.kind }, after: after(s) };
  }
  function activeTarget(): Editable | null {
    let a: Element | null = document.activeElement;
    while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
    return editableFrom(a);
  }

  function stopPicker(): void { if (picker) { picker.stop(); picker = null; } remove(HINT); }
  function pick(id: string, text: string | undefined, reply: (r: Reply) => void): void {
    stopPicker();
    const sf = createSurface(HINT, STYLE);
    const hint = document.createElement("div");
    hint.className = "cw-surface cw-hint" + (reducedMotion() ? "" : " cw-x6");
    hint.innerHTML = `${icon("text-select", 14, "#2563eb")}<span>Click the field to insert into</span><span class="cw-sep">·</span><span class="cw-sec">${keys("Esc")} cancel</span>`;
    sf.layer.appendChild(hint);
    const done = (r: Reply) => { stopPicker(); reply(r); };
    const tryTarget = (n: Node | null) => {
      const t = editableFrom(n);
      if (!t) return;
      if (typeof text === "string") done(startPreview(id, text, t));
      else { pending = { id, target: t }; done({ ok: true, field: { label: fieldLabel(t), kind: t.kind }, after: after({ el: t.el, kind: t.kind, caret: recordCaret(t) }) }); }
    };
    const onFocus = (e: FocusEvent) => tryTarget(e.target as Node);
    const onClick = (e: MouseEvent) => setTimeout(() => tryTarget((e.target as Node) || document.activeElement), 0);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done({ ok: false, reason: "cancelled" }); } };
    document.addEventListener("focusin", onFocus, true);
    document.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey, true);
    picker = { id, stop: () => { document.removeEventListener("focusin", onFocus, true); document.removeEventListener("click", onClick, true); window.removeEventListener("keydown", onKey, true); } };
  }
  let pending: { id: string; target: Editable } | null = null;   // a picked field waiting for its text

  // ---- messages (registered synchronously) --------------------------------------------------------------------
  chrome.runtime.onMessage.addListener((msg: { type?: string; id?: string; text?: string }, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== "string" || !msg.type.startsWith("insert.")) return;
    const id = String(msg.id ?? "");
    switch (msg.type) {
      case "insert.preview": {
        let t = activeTarget();
        if (!t && pending && pending.id === id && pending.target.el.isConnected) t = pending.target;
        pending = null;
        if (!t) { sendResponse({ ok: false, reason: "noTarget" }); return true; }
        sendResponse(startPreview(id, String(msg.text ?? ""), t));
        return true;
      }
      case "insert.pick": {
        if (session) { endSession(session); }
        pick(id, typeof msg.text === "string" ? msg.text : undefined, (r) => sendResponse(r));
        return true;
      }
      case "insert.commit": {
        const s = session;
        if (!s || s.phase !== "preview" || (id && s.id !== id)) { sendResponse({ ok: false, reason: s ? "notEditable" : "noTarget" }); return true; }
        if (!stillEditable(s)) { event(s, "targetLost"); endSession(s); sendResponse({ ok: false, reason: "notEditable" }); return true; }
        const characters = commit(s);
        sendResponse({ ok: true, characters });
        event(s, "inserted", { characters });
        return true;
      }
      case "insert.undo": {
        const s = session;
        if (!s || (id && s.id !== id) || !undo(s)) { sendResponse({ ok: false, reason: "expired" }); return true; }
        sendResponse({ ok: true });
        return true;
      }
      case "insert.cancel": {
        stopPicker();
        const s = session;
        if (s && (!id || s.id === id)) { const was = s.phase; endSession(s); if (was === "preview") event(s, "cancelled"); }
        sendResponse({ ok: true });
        return true;
      }
    }
    return;
  });
})();
