/**
 * readline prompts for M-NAV North Macedonia eAIP CLI tools.
 */

/**
 * Group GEN tree entries by major part (LW_GEN_0_* → "0", LW_GEN_1_* → "1").
 * @param {{ label: string, rel: string }[]} entries
 * @returns {Array<[string, { label: string, rel: string }[]]>}
 */
export function groupMnavGenEntriesByMajor(entries) {
  /** @type {Map<string, { label: string, rel: string }[]>} */
  const byMajor = new Map();
  for (const e of entries) {
    const m = e.rel.match(/LW_GEN_(\d+)_/);
    if (!m) continue;
    const major = m[1];
    if (!byMajor.has(major)) byMajor.set(major, []);
    byMajor.get(major).push(e);
  }
  for (const list of byMajor.values()) {
    list.sort((a, b) => a.rel.localeCompare(b.rel));
  }
  return [...byMajor.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
}

/**
 * @param {import("node:readline/promises").Interface} rl
 * @param {string[]} icaos sorted uppercase
 * @returns {Promise<string>} ICAO
 */
export async function promptPickMnavAd2Icao(rl, icaos) {
  const rows = [...icaos];
  console.error("\n--- AD 2 Aerodromes — Textpages — your input ---\n");
  console.error("Option A: type a 4-letter ICAO (e.g. LWSK) and press Enter.");
  console.error("Option B: press Enter to show the numbered list.\n");

  const first = (await rl.question("ICAO (or Enter to show list): ")).trim().toUpperCase();
  if (first.length > 0) {
    if (/^[A-Z]{4}$/.test(first)) {
      if (rows.includes(first)) {
        console.error(`Using ICAO ${first}.\n`);
        return first;
      }
      console.error(
        `\n"${first}" is not in tree_items AD 2 list (${rows.length} aerodrome(s)). Showing the list.\n`,
      );
    } else {
      console.error("\nExpected four letters (or empty for the list). Showing the list.\n");
    }
  }

  console.error("AD 2 — ICAOs with Textpages PDF in this eAIP:\n");
  const cols = 4;
  const pad = 8;
  for (let i = 0; i < rows.length; i += cols) {
    const chunk = rows.slice(i, i + cols);
    console.error(chunk.map((icao, j) => `${String(i + j + 1).padStart(3)}. ${icao.padEnd(pad)}`).join("  "));
  }
  console.error("");
  const hint = `Enter list number (1–${rows.length}) or ICAO, then Enter: `;
  for (;;) {
    const raw = (await rl.question(hint)).trim();
    if (!raw) {
      console.error("(empty input — type a number or 4-letter ICAO.)");
      continue;
    }
    const n = parseInt(raw, 10);
    if (String(n) === raw && n >= 1 && n <= rows.length) {
      const picked = rows[n - 1];
      console.error(`Using ${picked}.\n`);
      return picked;
    }
    const up = raw.toUpperCase();
    if (/^[A-Z]{4}$/.test(up)) {
      if (rows.includes(up)) {
        console.error(`Using ${up}.\n`);
        return up;
      }
      console.error(`ICAO ${up} is not in the list above. Try again.`);
      continue;
    }
    console.error("Enter only the list number, or exactly four letters (ICAO).");
  }
}

/**
 * @param {import("node:readline/promises").Interface} rl
 * @param {{ label: string, rel: string }[]} entries
 * @returns {Promise<{ label: string, rel: string }[] | null>}
 */
export async function promptPickMnavGenEntries(rl, entries) {
  const parts = groupMnavGenEntriesByMajor(entries);
  const ungrouped = entries.filter((e) => !/LW_GEN_\d+_/.test(e.rel));

  for (;;) {
    console.error("\nGEN (Part 1) — choose menu group (GEN 0, GEN 1, …):\n");
    for (let i = 0; i < parts.length; i++) {
      const [maj, list] = parts[i];
      console.error(`  ${String(i + 1).padStart(3)}. GEN_${maj} — ${list.length} section(s)`);
    }
    if (ungrouped.length > 0) {
      console.error(`  ${String(parts.length + 1).padStart(3)}. Other — ${ungrouped.length} entr(y/ies)`);
    }
    console.error("");
    const topHint =
      parts.length === 0 && ungrouped.length > 0
        ? `Flat list mode — [1–${ungrouped.length}] one PDF  ·  [a]ll  ·  [q]uit: `
        : `[1–${parts.length + (ungrouped.length ? 1 : 0)}] pick group  ·  [a]ll ${entries.length} GEN PDFs  ·  [l]ist flat  ·  [q]uit: `;

    const top = (await rl.question(topHint)).trim().toLowerCase();

    if (top === "q" || top === "quit" || top === "") return null;

    if (top === "a" || top === "all") {
      if (entries.length > 10) {
        const ok = (await rl.question(`Download all ${entries.length} PDFs? [y/N]: `)).trim().toLowerCase();
        if (ok !== "y" && ok !== "yes") continue;
      }
      return entries;
    }

    if (top === "l" || top === "list") {
      console.error("\nAll GEN sections (flat):\n");
      entries.forEach((e, i) => {
        console.error(`  ${String(i + 1).padStart(3)}. ${e.label}`);
      });
      console.error("");
      const flat = (await rl.question(`[1–${entries.length}] one  ·  [a]ll  ·  [b]ack: `)).trim().toLowerCase();
      if (flat === "b" || flat === "") continue;
      if (flat === "a" || flat === "all") {
        if (entries.length > 10) {
          const ok = (await rl.question(`Download all ${entries.length} PDFs? [y/N]: `)).trim().toLowerCase();
          if (ok !== "y" && ok !== "yes") continue;
        }
        return entries;
      }
      const fn = parseInt(flat, 10);
      if (String(fn) === flat && fn >= 1 && fn <= entries.length) return [entries[fn - 1]];
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
      partList.forEach((e, i) => {
        console.error(`  ${String(i + 1).padStart(3)}. ${e.label}`);
      });
      console.error("");
      const sub = (
        await rl.question(`[1–${partList.length}] one  ·  [a]ll in ${partLabel} (${partList.length})  ·  [b]ack: `)
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
