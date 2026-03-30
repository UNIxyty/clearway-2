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
 * Group GEN hrefs by menu block (GEN_0 = GEN 0.x, GEN_1 = GEN 1.x, …).
 * @param {string[]} hrefs
 * @returns {Array<[string, string[]]>} [majorDigits, hrefsInPart][]
 */
export function groupGenHrefsByMenuPart(hrefs) {
  /** @type {Map<string, string[]>} */
  const byMajor = new Map();
  for (const h of hrefs) {
    const stem = htmlFileToPdfStem(h);
    const m = stem.match(/^GEN (\d+)\./);
    if (!m) continue;
    const major = m[1];
    if (!byMajor.has(major)) byMajor.set(major, []);
    byMajor.get(major).push(h);
  }
  for (const list of byMajor.values()) {
    list.sort((a, b) => htmlFileToPdfStem(a).localeCompare(htmlFileToPdfStem(b)));
  }
  return [...byMajor.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
}

/**
 * @param {import("node:readline/promises").Interface} rl
 * @param {string[]} hrefs GEN html hrefs
 * @returns {Promise<string[] | null>} hrefs to download, or null to cancel
 */
export async function promptPickGenHrefs(rl, hrefs) {
  const parts = groupGenHrefsByMenuPart(hrefs);
  const ungrouped = hrefs.filter((h) => !/^GEN \d+\./.test(htmlFileToPdfStem(h)));

  for (;;) {
    console.error("\nGEN (Part 1) — choose menu group (like GEN_0, GEN_1, … on the site):\n");
    for (let i = 0; i < parts.length; i++) {
      const [maj, list] = parts[i];
      console.error(`  ${String(i + 1).padStart(3)}. GEN_${maj} — ${list.length} section(s)`);
    }
    if (ungrouped.length > 0) {
      console.error(
        `  ${String(parts.length + 1).padStart(3)}. Other / ungrouped — ${ungrouped.length} entr(y/ies)`,
      );
    }
    console.error("");
    const topHint =
      parts.length === 0 && ungrouped.length > 0
        ? `Flat list mode — [1–${ungrouped.length}] one file  ·  [a]ll  ·  [q]uit: `
        : `[1–${parts.length + (ungrouped.length ? 1 : 0)}] pick GEN_n group  ·  [a]ll ${hrefs.length} GEN PDFs  ·  [l]ist everything flat  ·  [q]uit: `;

    const top = (await rl.question(topHint)).trim().toLowerCase();

    if (top === "q" || top === "quit" || top === "") return null;

    if (top === "a" || top === "all") {
      if (hrefs.length > 10) {
        const ok = (await rl.question(`Download all ${hrefs.length} PDFs? [y/N]: `)).trim().toLowerCase();
        if (ok !== "y" && ok !== "yes") continue;
      }
      return hrefs;
    }

    if (top === "l" || top === "list") {
      console.error("\nAll GEN sections (flat):\n");
      hrefs.forEach((h, i) => {
        console.error(`  ${String(i + 1).padStart(3)}. ${htmlFileToPdfStem(h)}`);
      });
      console.error("");
      const flat = (
        await rl.question(`[1–${hrefs.length}] one section  ·  [a]ll  ·  [b]ack to groups: `)
      )
        .trim()
        .toLowerCase();
      if (flat === "b" || flat === "") continue;
      if (flat === "a" || flat === "all") {
        if (hrefs.length > 10) {
          const ok = (await rl.question(`Download all ${hrefs.length} PDFs? [y/N]: `)).trim().toLowerCase();
          if (ok !== "y" && ok !== "yes") continue;
        }
        return hrefs;
      }
      const fn = parseInt(flat, 10);
      if (String(fn) === flat && fn >= 1 && fn <= hrefs.length) return [hrefs[fn - 1]];
      console.error("Invalid.");
      continue;
    }

    const pn = parseInt(top, 10);
    const hasOther = ungrouped.length > 0;
    const maxPartChoice = parts.length + (hasOther ? 1 : 0);

    if (parts.length === 0 && ungrouped.length > 0) {
      if (String(pn) === top && pn >= 1 && pn <= ungrouped.length) return [ungrouped[pn - 1]];
      console.error("Invalid choice.");
      continue;
    }

    if (String(pn) !== top || pn < 1 || pn > maxPartChoice) {
      console.error("Invalid choice.");
      continue;
    }

    const partList = pn <= parts.length ? parts[pn - 1][1] : ungrouped;
    const partLabel = pn <= parts.length ? `GEN_${parts[pn - 1][0]}` : "Other";

    for (;;) {
      console.error(`\n${partLabel} — pick section(s):\n`);
      partList.forEach((h, i) => {
        console.error(`  ${String(i + 1).padStart(3)}. ${htmlFileToPdfStem(h)}`);
      });
      console.error("");
      const sub = (
        await rl.question(
          `[1–${partList.length}] one section  ·  [a]ll in ${partLabel} (${partList.length})  ·  [b]ack: `,
        )
      )
        .trim()
        .toLowerCase();

      if (sub === "b" || sub === "back") break;
      if (sub === "a" || sub === "all") return partList;
      const sn = parseInt(sub, 10);
      if (String(sn) === sub && sn >= 1 && sn <= partList.length) return [partList[sn - 1]];
      console.error("Invalid choice.");
    }
  }
}
