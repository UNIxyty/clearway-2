#!/usr/bin/env node
/**
 * Download Google Sheet content as JSON.
 *
 * Modes:
 * 1) Sheets API v4 (recommended): needs GOOGLE_SHEETS_API_KEY or --api-key
 *    Enable "Google Sheets API" in Google Cloud Console, create an API key,
 *    restrict it to Sheets API. The spreadsheet must be readable by that key
 *    (e.g. "Anyone with the link" viewer, or share with a service account if you use SA elsewhere).
 *
 * 2) Public CSV export (no API key): works only if the sheet is published /
 *    accessible via export. Uses /export?format=csv&gid=...
 *
 * Usage:
 *   node scripts/tools/download-google-sheet-to-json.mjs --id SPREADSHEET_ID --range "Sheet1!A:ZZ"
 *   node scripts/tools/download-google-sheet-to-json.mjs --id SPREADSHEET_ID --gid 0 --csv
 *   node scripts/tools/download-google-sheet-to-json.mjs --id SPREADSHEET_ID --range "A:Z" --header-row --out data/sheet.json
 *
 * Env:
 *   GOOGLE_SHEETS_API_KEY
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function arg(name, fallback = null) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((a) => a.startsWith(prefix));
  if (raw) return raw.slice(prefix.length);
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1) return process.argv[i + 1] ?? fallback;
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

/** Minimal CSV line parser (handles quoted fields with commas). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\r") continue;
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ""));
}

function rowsToObjects(rows, headerRow = true) {
  if (!rows.length) return [];
  if (!headerRow) return rows.map((r) => ({ cells: r }));
  const headers = rows[0].map((h, i) => String(h || "").trim() || `col_${i + 1}`);
  return rows.slice(1).map((r) => {
    const o = {};
    for (let i = 0; i < headers.length; i++) {
      o[headers[i]] = r[i] ?? "";
    }
    return o;
  });
}

async function fetchViaSheetsApi(spreadsheetId, range, apiKey) {
  const encRange = encodeURIComponent(range);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encRange}?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets API ${res.status}: ${body.slice(0, 500)}`);
  }
  const data = await res.json();
  const values = data.values;
  if (!Array.isArray(values)) return [];
  return values;
}

async function fetchViaPublicCsv(spreadsheetId, gid) {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`CSV export ${res.status}: ${body.slice(0, 300)}`);
  }
  const text = await res.text();
  return parseCsv(text);
}

async function main() {
  const spreadsheetId = arg("id") || arg("spreadsheet-id") || process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) {
    console.error(
      "Missing spreadsheet id. Use --id SHEET_ID or GOOGLE_SPREADSHEET_ID.\n" +
        "Example: node scripts/tools/download-google-sheet-to-json.mjs --id 1abc... --range 'Sheet1!A:ZZ'",
    );
    process.exit(1);
  }

  const apiKey = arg("api-key") || process.env.GOOGLE_SHEETS_API_KEY || "";
  const range = arg("range") || process.env.GOOGLE_SHEETS_RANGE || "Sheet1!A:ZZ";
  const gid = arg("gid") || process.env.GOOGLE_SHEETS_GID || "0";
  const forceCsv = hasFlag("csv");
  const headerRow = !hasFlag("no-header-row");
  const outPath = arg("out") || null;
  const pretty = hasFlag("pretty");

  let rows;
  if (forceCsv) {
    rows = await fetchViaPublicCsv(spreadsheetId, gid);
  } else if (apiKey) {
    rows = await fetchViaSheetsApi(spreadsheetId, range, apiKey);
  } else {
    rows = await fetchViaPublicCsv(spreadsheetId, gid);
  }

  const payload =
    headerRow && rows.length ? rowsToObjects(rows, true) : rows;

  const json = pretty ? JSON.stringify(payload, null, 2) : JSON.stringify(payload);

  if (outPath) {
    const abs = path.isAbsolute(outPath) ? outPath : path.join(process.cwd(), outPath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, json, "utf8");
    console.error(`Wrote ${payload.length} records to ${abs}`);
  } else {
    process.stdout.write(json);
    if (!outPath) process.stdout.write("\n");
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
