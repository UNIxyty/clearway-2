// Selection behaviour for pdf.js text layers — a port of what pdfjs-dist's own
// TextLayerBuilder does (web/text_layer_builder.js, pdfjs-dist 5.4.296,
// `#bindMouse` and `#enableGlobalSelectionListener`). The viewer uses pdf.js's
// `TextLayer` directly rather than the full PDFViewer, so this part of the
// builder has to be carried over by hand:
//
// - An `.endOfContent` div is appended after the text spans. While a selection
//   is being made (`.selecting`), CSS stretches it over the whole layer, so a
//   pointer that is over the gaps between spans hits it instead of the layer
//   itself. Without it, the browser resolves a gap to "the end of the layer",
//   and the selection jumps to the last span on the page (the other column).
// - On every selectionchange it is moved next to the node the selection is
//   being extended from, so dragging through whitespace extends the selection
//   in reading order instead of snapping to a distant span.
// - `.selecting` is cleared on pointerup / blur / keyup / empty selection.
// - Copy puts the plain text only (no styled HTML from the invisible spans).
//   The text content is fetched with pdf.js's default normalisation, so the
//   builder's extra normalizeUnicode pass is not needed here.

const layers = new Map<HTMLElement, HTMLElement>();
let abort: AbortController | null = null;

function reset(end: HTMLElement, layer: HTMLElement) {
  layer.append(end);
  end.style.width = "";
  end.style.height = "";
  layer.classList.remove("selecting");
}

function enableGlobalListener() {
  if (abort) return;
  abort = new AbortController();
  const { signal } = abort;
  let isPointerDown = false;
  document.addEventListener("pointerdown", () => { isPointerDown = true; }, { signal });
  document.addEventListener("pointerup", () => { isPointerDown = false; layers.forEach(reset); }, { signal });
  window.addEventListener("blur", () => { isPointerDown = false; layers.forEach(reset); }, { signal });
  document.addEventListener("keyup", () => { if (!isPointerDown) layers.forEach(reset); }, { signal });

  let isFirefox: boolean | undefined;
  let prevRange: Range | null = null;
  document.addEventListener("selectionchange", () => {
    const selection = document.getSelection();
    if (!selection || selection.rangeCount === 0) { layers.forEach(reset); return; }
    const active = new Set<HTMLElement>();
    for (let i = 0; i < selection.rangeCount; i += 1) {
      const range = selection.getRangeAt(i);
      for (const layer of layers.keys()) if (!active.has(layer) && range.intersectsNode(layer)) active.add(layer);
    }
    for (const [layer, end] of layers) {
      if (active.has(layer)) layer.classList.add("selecting");
      else reset(end, layer);
    }
    const first = layers.keys().next().value;
    if (!first) return;
    isFirefox ??= getComputedStyle(first).getPropertyValue("-moz-user-select") === "none";
    if (isFirefox) return; // Firefox follows reading order without the trick

    const range = selection.getRangeAt(0);
    const modifyStart = !!prevRange && (range.compareBoundaryPoints(Range.END_TO_END, prevRange) === 0 || range.compareBoundaryPoints(Range.START_TO_END, prevRange) === 0);
    let anchor: Node | null = modifyStart ? range.startContainer : range.endContainer;
    if (anchor.nodeType === Node.TEXT_NODE) anchor = anchor.parentNode;
    if (!anchor) return;
    if (!modifyStart && range.endOffset === 0) {
      do {
        while (anchor && !anchor.previousSibling) anchor = anchor.parentNode;
        if (!anchor) return;
        anchor = anchor.previousSibling;
      } while (anchor && !anchor.childNodes.length);
      if (!anchor) return;
    }
    const parentLayer = (anchor as Element).parentElement?.closest<HTMLElement>(".textLayer") ?? null;
    const end = parentLayer ? layers.get(parentLayer) : undefined;
    if (parentLayer && end && anchor.parentElement) {
      end.style.width = parentLayer.style.width;
      end.style.height = parentLayer.style.height;
      anchor.parentElement.insertBefore(end, modifyStart ? anchor : anchor.nextSibling);
    }
    prevRange = range.cloneRange();
  }, { signal });
}

/** Call once pdf.js's TextLayer has finished rendering into `layer`. */
export function attachTextLayerSelection(layer: HTMLElement) {
  const end = document.createElement("div");
  end.className = "endOfContent";
  layer.append(end);
  layer.addEventListener("mousedown", () => { layer.classList.add("selecting"); });
  layer.addEventListener("copy", (event) => {
    const selection = document.getSelection();
    event.clipboardData?.setData("text/plain", (selection?.toString() ?? "").replace(/\x00/g, ""));
    event.preventDefault();
    event.stopPropagation();
  });
  layers.set(layer, end);
  enableGlobalListener();
}

/** Call when a text layer is removed (rebuilt for a new scale/rotation). With no argument, forgets
 * every layer that is no longer in the document (viewer closed); the listeners go with the last one. */
export function detachTextLayerSelection(layer?: HTMLElement) {
  if (layer) layers.delete(layer);
  for (const l of layers.keys()) if (!l.isConnected) layers.delete(l);
  if (layers.size === 0) { abort?.abort(); abort = null; }
}
