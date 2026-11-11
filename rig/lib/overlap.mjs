// Nothing may overlap (2026-11-12, Dmitry's test): on a page or inside a frame, no two visible text elements' boxes
// intersect, unless one contains the other. Returns the offending pairs (texts and boxes), empty when the page is
// clean. `root` narrows the walk (a selector); `ignore` is a list of selectors whose elements are skipped (a scrim,
// a tooltip). Text elements are leaves that carry their own text (an element with a direct text node), so a card and
// the paragraph inside it never count as a pair, while two paragraphs drawn on top of each other do.
export async function textOverlaps(target, { root = "body", ignore = [], minPx = 3 } = {}) {
  return target.evaluate(({ root, ignore, minPx }) => {
    const base = document.querySelector(root) || document.body;
    const skip = ignore.length ? [...base.querySelectorAll(ignore.join(","))] : [];
    const els = [...base.querySelectorAll("*")].filter((el) => {
      if (skip.some((s) => s === el || s.contains(el))) return false;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
      if (!own) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2 && r.bottom > 0 && r.right > 0;
    }).map((el) => ({ el, r: el.getBoundingClientRect(), t: (el.textContent || "").trim().slice(0, 40) }));
    const out = [];
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const a = els[i], b = els[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (x > minPx && y > minPx) out.push({ a: a.t, b: b.t, x: Math.round(x), y: Math.round(y) });
    }
    return out.slice(0, 12);
  }, { root, ignore, minPx });
}

/** Clipped text: an element whose own text is wider than its box and is cut (overflow hidden / text-overflow clip) without an ellipsis. */
export async function clippedText(target, { root = "body" } = {}) {
  return target.evaluate(({ root }) => {
    const base = document.querySelector(root) || document.body;
    const out = [];
    for (const el of base.querySelectorAll("*")) {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
      if (!own) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      if (el.scrollWidth > el.clientWidth + 2 && /hidden|clip/.test(cs.overflowX) && cs.textOverflow !== "ellipsis") out.push({ t: (el.textContent || "").trim().slice(0, 40), over: el.scrollWidth - el.clientWidth });
    }
    return out.slice(0, 12);
  }, { root });
}
