// Address bar `cw` (§E11). Chrome draws the dropdown; we return ≤ 5 rows. Chrome's default suggestion is
// always the first row and the one Enter picks, so the best lookup result becomes the default suggestion.
import { apiJson } from "~/shared/api";
import { CONSOLE_ORIGIN } from "~/shared/config";

type Suggestion = { url: string | null; text: string; dim: string; ask?: string };
const cache = new Map<string, Suggestion[]>();
let timer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
function describe(s: Suggestion, words: string[]): string {
  // One pass over the raw text, so a match can never land inside another tag; each piece is escaped on its own.
  const terms = words.filter((w) => w.length >= 2).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const text = terms.length ? s.text.split(new RegExp(`(${terms.join("|")})`, "i")).map((piece, i) => (i % 2 ? `<match>${esc(piece)}</match>` : esc(piece))).join("") : esc(s.text);
  return `${text} <dim>— ${esc(s.dim)}</dim>`;
}
const askRow = (q: string): Suggestion => ({ url: null, text: `Ask Clearway: “${q}”`, dim: "opens the panel", ask: q });

export async function lookup(q: string): Promise<Suggestion[]> {
  const key = q.trim().toLowerCase(); if (!key) return [askRow(q)];
  const hit = cache.get(key); if (hit) return hit;
  const { status, body } = await apiJson<{ ok: boolean; suggestions: Suggestion[] }>(`/extension/lookup?q=${encodeURIComponent(q.trim())}`, { timeoutMs: 8000 });
  const rows = status === 200 && body?.ok && Array.isArray(body.suggestions) && body.suggestions.length ? body.suggestions.slice(0, 5) : [askRow(q)];
  if (!rows.some((r) => r.ask)) rows[rows.length - 1] = rows.length >= 5 ? askRow(q) : rows[rows.length - 1], rows.length < 5 && rows.push(askRow(q));
  cache.set(key, rows); if (cache.size > 50) cache.delete(cache.keys().next().value as string);
  return rows;
}

export function installOmnibox(onAsk: (text: string) => void) {
  chrome.omnibox.setDefaultSuggestion({ description: "Ask Clearway: “%s” <dim>— opens the panel</dim>" });
  chrome.omnibox.onInputChanged.addListener((text, suggest) => {
    if (timer) clearTimeout(timer);
    const my = ++seq;
    timer = setTimeout(async () => {
      const rows = await lookup(text); if (my !== seq) return;
      const words = text.trim().split(/\s+/);
      const [first, ...rest] = rows;
      try { chrome.omnibox.setDefaultSuggestion({ description: describe(first, words) }); } catch { /* invalid markup fallback */ chrome.omnibox.setDefaultSuggestion({ description: esc(first.text) }); }
      suggest(rest.map((r) => ({ content: r.url ?? `cw-ask:${r.ask ?? text}`, description: describe(r, words), deletable: false })));
    }, 150);
  });
  chrome.omnibox.onInputEntered.addListener(async (text, disposition) => {
    let target: string | null = null;
    if (text.startsWith("cw-ask:")) { onAsk(text.slice(7)); return; }
    if (/^https?:\/\//.test(text)) target = text;
    else { const [first] = await lookup(text); if (first.ask != null) { onAsk(first.ask); return; } target = first.url; }
    if (!target) { onAsk(text); return; }
    if (!target.startsWith(CONSOLE_ORIGIN) && !/^https?:\/\//.test(target)) return;
    if (disposition === "currentTab") { const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); if (t?.id) await chrome.tabs.update(t.id, { url: target }); else await chrome.tabs.create({ url: target }); }
    else await chrome.tabs.create({ url: target, active: disposition === "newForegroundTab" });
  });
}
