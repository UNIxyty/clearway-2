// Server-side HTML sanitiser for the mailbox reader (§M8). Whitelist, not blacklist: only the tags and
// attributes below survive. Scripts, event handlers, forms, frames, objects, <base>, <meta>, <link> and every
// remote URL in CSS are dropped. Links are NOT live: <a> becomes a span carrying the real URL beside the text
// (the client shows both, and asks before opening). Remote images are replaced by placeholders unless the
// caller passes showRemote, and even then they point at OUR proxy, never at the sender's host. cid: images
// resolve to the message's own inline attachments. The result is rendered in a sandboxed iframe with a CSP.
import { Parser } from "htmlparser2";

const KEEP = new Set(["p", "div", "span", "br", "hr", "b", "strong", "i", "em", "u", "s", "small", "big", "sub", "sup", "font", "center",
  "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code", "tt", "ul", "ol", "li", "dl", "dt", "dd",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col", "img", "a", "abbr", "address", "cite", "q", "section", "article", "header", "footer"]);
const DROP_WITH_CONTENT = new Set(["script", "style", "noscript", "template", "iframe", "object", "embed", "applet", "form", "select", "textarea", "button", "input", "svg", "math", "head", "title", "meta", "link", "base", "frame", "frameset", "video", "audio", "canvas"]);
const ATTRS = new Set(["colspan", "rowspan", "align", "valign", "width", "height", "border", "cellpadding", "cellspacing", "bgcolor", "color", "face", "size", "dir", "lang", "title", "alt"]);
const VOID = new Set(["br", "hr", "img", "col"]);
const escText = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => escText(s).replace(/"/g, "&quot;");

function cleanStyle(style) {
  const out = [];
  for (const decl of String(style).split(";")) {
    const i = decl.indexOf(":"); if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase(); const val = decl.slice(i + 1).trim();
    if (!/^[a-z-]+$/.test(prop) || /url\s*\(|expression\s*\(|@import|javascript:|behaviou?r|-moz-binding|position\s*:\s*fixed/i.test(val)) continue;
    if (prop === "position") continue;
    out.push(`${prop}:${val}`);
  }
  return out.join(";");
}

/**
 * @returns { html, remoteImages: [{host, name}], links: [{text, url, host}] }
 * `cidUrl(cid)` → a same-origin URL for an inline image, or null. `proxyUrl(url)` → our image proxy URL.
 */
export function sanitizeEmailHtml(input, { showRemote = false, cidUrl = () => null, proxyUrl = () => null } = {}) {
  let out = ""; let skip = 0; const stack = []; const remoteImages = []; const links = [];
  let linkIdx = -1;
  const parser = new Parser({
    onopentag(name, attrs) {
      name = name.toLowerCase();
      if (skip || DROP_WITH_CONTENT.has(name)) { if (!VOID.has(name)) skip += 1; return; }
      if (!KEEP.has(name)) { stack.push(null); return; }
      let a = "";
      for (const [k0, v] of Object.entries(attrs)) { const k = k0.toLowerCase(); if (ATTRS.has(k)) a += ` ${k}="${escAttr(v)}"`; }
      if (attrs.style) { const st = cleanStyle(attrs.style); if (st) a += ` style="${escAttr(st)}"`; }
      if (name === "img") {
        const src = String(attrs.src ?? "").trim();
        if (/^cid:/i.test(src)) { const u = cidUrl(src.slice(4).replace(/^<|>$/g, "")); out += u ? `<img${a} src="${escAttr(u)}">` : `<span class="cw-img-blocked">Image not in message · ${escText(attrs.alt || "inline")}</span>`; }
        else if (/^data:image\/(png|gif|jpeg|webp);base64,/i.test(src) && src.length < 200000) out += `<img${a} src="${escAttr(src)}">`;
        else if (/^https?:\/\//i.test(src)) {
          let host = ""; try { host = new URL(src).host; } catch { /* bad url */ }
          const nameOnly = src.split(/[?#]/)[0].split("/").pop() || "image";
          remoteImages.push({ host, name: nameOnly });
          const p = showRemote ? proxyUrl(src) : null;
          out += p ? `<img${a} src="${escAttr(p)}">` : `<span class="cw-img-blocked">Image blocked · ${escText(nameOnly)} · from ${escText(host)}</span>`;
        }
        return;
      }
      if (name === "a") {
        const href = String(attrs.href ?? "").trim();
        if (/^(https?:|mailto:|tel:)/i.test(href)) { let host = ""; try { host = new URL(href).host || href.split(":")[0]; } catch { /* keep */ } links.push({ text: "", url: href, host }); linkIdx = links.length - 1; out += `<span class="cw-link" data-link="${linkIdx}">`; stack.push("span-link"); return; }
        out += "<span>"; stack.push("span"); return;
      }
      if (name === "font") { out += `<span${a}>`; stack.push("span"); return; }
      out += `<${name}${a}>`; if (!VOID.has(name)) stack.push(name);
    },
    ontext(t) { if (skip) return; out += escText(t); if (linkIdx >= 0 && stack.includes("span-link")) links[linkIdx].text += t; },
    onclosetag(name) {
      name = name.toLowerCase();
      if (DROP_WITH_CONTENT.has(name)) { if (skip) skip -= 1; return; }
      if (skip || VOID.has(name)) return;
      const top = stack.pop();
      if (top === "span-link") { const l = links[linkIdx]; out += `</span><span class="cw-link-url" data-link="${linkIdx}"> ${escText(l.url)}</span>`; linkIdx = -1; return; }
      if (top === "span") { out += "</span>"; return; }
      if (top) out += `</${top}>`;
    },
  }, { decodeEntities: true, lowerCaseTags: true, recognizeSelfClosing: true });
  parser.write(String(input ?? "")); parser.end();
  return { html: out, remoteImages, links };
}
