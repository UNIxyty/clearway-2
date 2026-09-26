// "Send this page" (§E6.3). ONE self-contained function: it is serialised and run with
// chrome.scripting.executeScript({ func: extractPage }), so nothing in it may refer to anything outside its body.
// Readability-style: main content root, chrome stripped, never a form field's value, headings/lists/tables kept.
export function extractPage(): { title: string; url: string; host: string; text: string; words: number; headings: number; tables: number; chars: number } {
  const STRIP = "nav, header, footer, aside, form, input, textarea, select, button, script, style, noscript, iframe, svg, canvas, video, audio, template, [aria-hidden=true], [hidden], [contenteditable]:not([contenteditable=false])";
  const BAD = /cookie|consent|banner|advert|ads?-|sponsor|promo|newsletter|popup|modal|share|social|breadcrumb|sidebar|footer|nav/i;
  const BLOCK = new Set(["address", "article", "blockquote", "dd", "details", "dialog", "div", "dl", "dt", "fieldset", "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "li", "main", "ol", "p", "pre", "section", "summary", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul", "body"]);

  let headings = 0, tables = 0;
  const blocks: string[] = [];
  let cur = "";

  const norm = (s: string): string => s.replace(/[ \t\r\f\v ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{2,}/g, "\n").trim();
  const flush = (): void => { const t = norm(cur); if (t) blocks.push(t); cur = ""; };

  const hiddenOrJunk = (el: Element): boolean => {
    try { if (el.matches(STRIP)) return true; } catch { /* ignore */ }
    const cls = (el.getAttribute("class") || "") + " " + (el.id || "");
    if (cls.trim() && BAD.test(cls)) return true;
    const cs = window.getComputedStyle(el);
    return cs.display === "none" || cs.visibility === "hidden";
  };

  // Inline text of an element under the same filters (for headings and cells).
  const inlineText = (el: Element): string => {
    let out = "";
    const walk = (n: Node): void => {
      if (n.nodeType === 3) { out += (n.nodeValue || "").replace(/\s+/g, " "); return; }
      if (n.nodeType !== 1) return;
      const e = n as Element;
      if (hiddenOrJunk(e)) return;
      if (e.tagName === "BR") { out += " "; return; }
      const block = BLOCK.has(e.tagName.toLowerCase());
      if (block) out += " ";
      for (const c of Array.from(e.childNodes)) walk(c);
      if (block) out += " ";
    };
    walk(el);
    return norm(out).replace(/\n/g, " ");
  };

  const visit = (n: Node): void => {
    if (n.nodeType === 3) { cur += (n.nodeValue || "").replace(/\s+/g, " "); return; }
    if (n.nodeType !== 1) return;
    const el = n as Element;
    const tag = el.tagName.toLowerCase();
    if (hiddenOrJunk(el)) return;
    if (/^h[1-6]$/.test(tag)) {
      flush();
      const t = inlineText(el);
      if (t) { headings++; blocks.push("#".repeat(Number(tag[1])) + " " + t); }
      return;
    }
    if (tag === "table") {
      flush();
      const rows: string[] = [];
      for (const tr of Array.from(el.querySelectorAll("tr"))) {
        if (hiddenOrJunk(tr)) continue;
        const cells = Array.from(tr.children).filter((c) => /^(td|th)$/i.test(c.tagName) && !hiddenOrJunk(c)).map((c) => inlineText(c).replace(/\|/g, "/"));
        if (cells.some((c) => c)) rows.push(cells.join(" | "));
      }
      if (rows.length) { tables++; blocks.push(rows.join("\n")); }
      return;
    }
    if (tag === "br") { cur += "\n"; return; }
    if (tag === "pre") { flush(); const t = ((el as HTMLElement).innerText || el.textContent || "").replace(/\r/g, "").trim(); if (t) blocks.push(t); return; }
    if (tag === "li") {
      flush();
      cur = "- ";
      for (const c of Array.from(el.childNodes)) visit(c);
      if (norm(cur) === "-") cur = ""; else flush();
      return;
    }
    let block = BLOCK.has(tag);
    if (!block) { const d = window.getComputedStyle(el).display; block = d === "block" || d === "flex" || d === "grid" || d === "list-item" || d === "flow-root" || d.startsWith("table"); }
    if (block) flush();
    for (const c of Array.from(el.childNodes)) visit(c);
    if (block) flush();
  };

  const density = (el: Element): number => {
    if (hiddenOrJunk(el)) return 0;
    const t = ((el as HTMLElement).innerText || "").replace(/\s+/g, " ").trim();
    return t.length;
  };
  let root: Element | null = document.querySelector("main, [role=main]") || document.querySelector("article");
  if (!root || density(root) < 200) {
    let best: Element | null = null, bestScore = 0;
    for (const c of Array.from(document.body ? document.body.children : [])) {
      const s = density(c);
      if (s > bestScore) { bestScore = s; best = c; }
    }
    if (best && (!root || bestScore > density(root) * 1.5)) root = best;
  }
  if (!root) root = document.body || document.documentElement;
  // The root itself is trusted (a <main class="site-nav-wrap"> still counts); only its descendants are filtered.
  for (const c of Array.from(root.childNodes)) visit(c);
  flush();

  const text = blocks.join("\n\n");
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  return { title: document.title || "", url: location.href, host: location.host, text, words, headings, tables, chars: text.length };
}
