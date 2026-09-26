// The current selection, read once on an explicit user action (⌥⇧E, the menu item, the panel's Selection button).
// ONE self-contained function for chrome.scripting.executeScript({ func: readSelection }); no outside references.
export function readSelection(): { text: string; title: string; url: string; host: string; inEditable: boolean; chars: number } {
  let text = "";
  let inEditable = false;
  const editableOf = (n: Node | null): boolean => {
    let el: Element | null = n ? (n.nodeType === 1 ? (n as Element) : n.parentElement) : null;
    while (el) {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement).isContentEditable) return true;
      el = el.parentElement;
    }
    return false;
  };
  const active = document.activeElement;
  if ((active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement)) {
    let s: number | null = null, e: number | null = null;
    try { s = active.selectionStart; e = active.selectionEnd; } catch { /* type=email */ }
    if (typeof s === "number" && typeof e === "number" && e > s) { text = active.value.slice(s, e); inEditable = true; }
  }
  if (!text) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && !sel.isCollapsed) {
      text = sel.toString();
      inEditable = editableOf(sel.anchorNode) || editableOf(sel.focusNode);
    }
  }
  return { text, title: document.title || "", url: location.href, host: location.host, inEditable, chars: text.length };
}
