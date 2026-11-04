// The resolved name is the only name an aerodrome code can carry in the answer (2026-11-04). Question 3 of the ten: the
// question check had resolved DAAT as Tamanrasset, and the answer still wrote "Djanet (DAAT)". Asking the model to
// remember is not wiring. So the model writes a checked code as {{DAAT}} and this writes the name; and where it wrote a
// name next to a checked code anyway — "Djanet (DAAT)", "DAAT (Djanet)", "DAAT/Djanet" — a name that is not the
// checked one is replaced by it, and the replacement is recorded. Pure; applied to each text block of the answer.

const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const STOP = new Set(["airport", "international", "intl", "the", "and", "airfield", "aerodrome", "fir", "acc", "for", "from", "into", "out"]);
const words = (s) => fold(s).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
/** Does a written name refer to the checked place? Any shared word with its short name or its full description. */
export function sameName(written, entry) {
  const w = words(written); if (!w.length) return true;   // "the airport (DAAT)" names nothing: leave it
  const known = new Set([...words(entry.short), ...words(entry.is)]);
  return w.some((x) => known.has(x));
}

/**
 * @param text   one text block of the answer
 * @param names  [{ code, short, is }] from the question check
 * @returns { text, corrections: [{ code, from, to }] }
 */
export function applyResolvedNames(text, names) {
  let out = String(text ?? ""); const corrections = [];
  for (const n of names ?? []) {
    if (!n?.code || !n.short) continue;
    const code = String(n.code).toUpperCase();
    const label = `${n.short} (${code})`;
    out = out.replace(new RegExp(`\\{\\{\\s*${code}\\s*\\}\\}`, "g"), label);
    // "Djanet (DAAT)": up to four capitalised words before the code in brackets
    out = out.replace(new RegExp(`((?:\\p{Lu}[\\p{L}'’.-]*)(?:[ -](?:\\p{Lu}[\\p{L}'’.-]*|de|del|la|le)){0,4})\\s*\\(${code}\\)`, "gu"), (all, name) => {
      if (sameName(name, n)) return all;
      corrections.push({ code, from: name, to: n.short });
      return label;
    });
    // "DAAT (Djanet)" and "DAAT/Djanet"
    out = out.replace(new RegExp(`\\b${code}\\s*\\((\\p{Lu}[^)]{1,40})\\)`, "gu"), (all, name) => (sameName(name, n) ? all : (corrections.push({ code, from: name, to: n.short }), label)));
    out = out.replace(new RegExp(`\\b${code}\\/(\\p{Lu}[\\p{L}'’.-]+)`, "gu"), (all, name) => (sameName(name, n) ? all : (corrections.push({ code, from: name, to: n.short }), `${code}/${n.short}`)));
  }
  return { text: out, corrections };
}
