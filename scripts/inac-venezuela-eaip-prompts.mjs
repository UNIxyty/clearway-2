/**
 * readline prompts for INAC Venezuela eAIP CLI tools.
 */

import { ad21IcaoFromHtmlFile, htmlFileToPdfStem } from "./inac-venezuela-eaip-http.mjs";

/**
 * @param {import("node:readline/promises").Interface} rl
 * @param {string[]} hrefs sorted SV-AD2.1XXXX-en-GB.html
 * @returns {Promise<string>} upper-case ICAO
 */
export async function promptPickAd21Icao(rl, hrefs) {
  const rows = hrefs.map((h) => ad21IcaoFromHtmlFile(h)).filter(Boolean);
  console.error("\nAD 2.1 — aerodromes (INAC menu Part 3 → AD_2):\n");
  const cols = 4;
  const pad = 8;
  for (let i = 0; i < rows.length; i += cols) {
    const chunk = rows.slice(i, i + cols);
    console.error(chunk.map((icao, j) => `${String(i + j + 1).padStart(3)}. ${icao.padEnd(pad)}`).join("  "));
  }
  console.error("");
  const hint = `Pick [1–${rows.length}] or type ICAO (e.g. SVMC): `;
  for (;;) {
    const raw = (await rl.question(hint)).trim();
    if (!raw) continue;
    const n = parseInt(raw, 10);
    if (String(n) === raw && n >= 1 && n <= rows.length) return rows[n - 1];
    const up = raw.toUpperCase();
    if (/^[A-Z]{4}$/.test(up)) {
      if (rows.includes(up)) return up;
      console.error(`ICAO ${up} not in this menu. Try a number from the list.`);
      continue;
    }
    console.error("Enter a list number or a 4-letter ICAO.");
  }
}

/**
 * @param {import("node:readline/promises").Interface} rl
 * @param {string[]} hrefs GEN html hrefs
 * @returns {Promise<string[] | null>} hrefs to download, or null to cancel
 */
export async function promptPickGenHrefs(rl, hrefs) {
  console.error("\nGEN (Part 1) — sections from INAC menu:\n");
  hrefs.forEach((h, i) => {
    const stem = htmlFileToPdfStem(h);
    console.error(`  ${String(i + 1).padStart(3)}. ${stem}`);
  });
  console.error("");
  const ans = (
    await rl.question(`[a] Download all ${hrefs.length} PDFs  ·  [1–${hrefs.length}] one section  ·  [q] quit\nChoice: `)
  )
    .trim()
    .toLowerCase();

  if (ans === "q" || ans === "quit" || ans === "") return null;
  if (ans === "a" || ans === "all") {
    if (hrefs.length > 10) {
      const ok = (await rl.question(`Download all ${hrefs.length} PDFs? [y/N]: `)).trim().toLowerCase();
      if (ok !== "y" && ok !== "yes") return null;
    }
    return hrefs;
  }
  const n = parseInt(ans, 10);
  if (String(n) === ans && n >= 1 && n <= hrefs.length) return [hrefs[n - 1]];
  console.error("Invalid choice.");
  return null;
}
