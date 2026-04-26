#!/usr/bin/env node
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { collectMode, printCollectJson } from "./_collect-json.mjs";

export async function runBlockedScraper({
  country,
  entryUrl,
  blockReason,
  ad2Icaos = [],
}) {
  const downloadAd2Icao = (() => {
    const i = process.argv.indexOf("--download-ad2");
    return i >= 0 ? String(process.argv[i + 1] || "").trim().toUpperCase() : "";
  })();
  const downloadGen12 = process.argv.includes("--download-gen12");

  if (collectMode()) {
    printCollectJson({
      effectiveDate: null,
      ad2Icaos: ad2Icaos.map((x) => String(x || "").trim().toUpperCase()).filter(Boolean),
    });
    return;
  }

  if (downloadGen12 || downloadAd2Icao) {
    throw new Error(`${country} source is currently blocked for automation (${blockReason}). Entry: ${entryUrl}`);
  }

  const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
  try {
    const mode = (
      await rl.question("Download:\n  [1] GEN 1.2\n  [2] AD 2 airport PDF\n  [0] Quit\n\nChoice [1/2/0]: ")
    ).trim();
    if (mode === "0") return;
    throw new Error(`${country} source is currently blocked for automation (${blockReason}). Entry: ${entryUrl}`);
  } finally {
    rl.close();
  }
}

