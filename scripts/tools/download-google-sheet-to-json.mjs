#!/usr/bin/env node
/**
 * Download Google Sheet content as JSON.
 *
 * Modes:
 * 1) Sheets API v4 (recommended): needs GOOGLE_SHEETS_API_KEY or --api-key
 *    Use Credentials → Create credentials → API key (often starts with AIza), not OAuth client secret (GOCSPX-...).
 *    Enable Google Sheets API; restrict the key to Sheets API. The spreadsheet must be readable by that key
 *    (e.g. "Anyone with the link" viewer, or share with a service account if you use SA elsewhere).
 *
 * 2) Public CSV export (no API key): works only if the sheet is published /
 *    accessible via export. Uses /export?format=csv&gid=...
 *
 * Usage:
 *   node scripts/tools/download-google-sheet-to-json.mjs --id SPREADSHEET_ID --list-sheets
 *   node scripts/tools/download-google-sheet-to-json.mjs --id SPREADSHEET_ID --range "'My Tab'!A:ZZ"
 *   node scripts/tools/download-google-sheet-to-json.mjs --id SPREADSHEET_ID --gid 0 --csv
 *   node scripts/tools/download-google-sheet-to-json.mjs --id SPREADSHEET_ID --out data/sheet.json
 *   (Omit --range to use the first tab and columns A:ZZ; tab names are auto-quoted for the API.)
 *
 * Range must be A1 notation: "Sheet1!A:ZZ" or "Sheet1!A1:F100". A lone "Sheet1ZZ"
 * (missing !) is invalid; the script may rewrite SheetName+digits+COLS to Name!A:COLS.
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

/** OAuth client secrets are not valid for ?key= on the Sheets API. */
function assertNotOAuthClientSecret(key) {
  const k = String(key).trim();
  if (/^GOCSPX-/i.test(k) || /^GOC-/i.test(k)) {
    throw new Error(
      "GOOGLE_SHEETS_API_KEY looks like an OAuth 2.0 client secret (e.g. GOCSPX-...), not an API key.\n" +
        "Google Cloud Console → APIs & Services → Credentials → Create credentials → **API key**.\n" +
        "Enable **Google Sheets API** on that project. Sheet API keys usually start with **AIza**.\n" +
        "If that value was exposed, delete/rotate the OAuth client secret in Credentials.",
    );
  }
}

/**
 * Google ranges need "SheetName!A1:B2" or "SheetName!A:ZZ".
 * Common typo: "Sheet1ZZ" (no !) — treat as sheet "Sheet1" + last columns "ZZ" → "Sheet1!A:ZZ".
 */
/** Google A1: wrap sheet title in single quotes; double any ' inside the title. */
function quoteSheetTitle(title) {
  const s = String(title).replace(/'/g, "''");
  return `'${s}'`;
}

/**
 * Ensure sheet segment uses quoted form (e.g. Sheet1!A1 → 'Sheet1'!A1) so the API parser is unambiguous.
 * Leaves ranges that already start with a quote before ! unchanged.
 */
function quoteSheetInA1Range(range) {
  const t = String(range ?? "").trim();
  const bang = t.indexOf("!");
  if (bang === -1) return t;
  const sheetPart = t.slice(0, bang);
  const cellPart = t.slice(bang + 1);
  if (sheetPart.startsWith("'")) return t;
  return `${quoteSheetTitle(sheetPart)}!${cellPart}`;
}

function normalizeRange(range, { logFix = () => {} } = {}) {
  const t = String(range ?? "").trim();
  if (!t) return "";
  if (t.includes("!")) return t;
  // Sheet/tab name ends with a digit, then only column letters (no row digits): Sheet1ZZ → Sheet1!A:ZZ
  const gluedCols = t.match(/^(.+\d)([A-Z]{1,3})$/);
  if (gluedCols) {
    const [, sheet, cols] = gluedCols;
    const fixed = `${sheet}!A:${cols}`;
    logFix(t, fixed);
    return fixed;
  }
  // Unadorned A1:B2 is valid for the API (first sheet)
  if (/^[A-Za-z]{1,3}\d/.test(t)) return t;
  throw new Error(
    `Invalid --range "${t}". Use A1 notation with an exclamation mark, e.g. 'My Tab'!A:ZZ or Sheet1!A1:F200 (not Sheet1ZZ).`,
  );
}

async function fetchSheetTitles(spreadsheetId, apiKey) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets metadata ${res.status}: ${body.slice(0, 400)}`);
  }
  const data = await res.json();
  const sheets = data.sheets ?? [];
  return sheets.map((s) => s?.properties?.title).filter(Boolean);
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
    let hint = body.slice(0, 500);
    try {
      const j = JSON.parse(body);
      if (j?.error?.message) hint = j.error.message;
    } catch {
      /* ignore */
    }
    let tabHint = "";
    if (/parse range|Unable to parse range/i.test(String(hint))) {
      try {
        const titles = await fetchSheetTitles(spreadsheetId, apiKey);
        if (titles.length) {
          tabHint = `\nTab titles in this spreadsheet: ${titles.map((t) => JSON.stringify(t)).join(", ")}\n` +
            "Use --range \"'EXACT_TAB_NAME'!A:ZZ\" (single quotes around the tab name in your shell), or omit --range to use the first tab.";
        }
      } catch {
        /* ignore */
      }
    }
    const keyHint =
      /not valid|invalid.*api key/i.test(String(hint)) ?
        "\nIf the key does not start with AIza, you may be using an OAuth client secret — create an **API key** instead."
      : "";
    throw new Error(
      `Sheets API ${res.status}: ${hint}\n` +
        "Check: range uses SheetName!A1:B2; API key has Sheets API enabled; spreadsheet is shared (e.g. link viewer) or key is allowed to read it." +
        keyHint +
        tabHint,
    );
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
  if (text.includes("<html") || text.includes("Sign in") || text.includes("accounts.google")) {
    throw new Error(
      "CSV export returned a login/HTML page (sheet is not publicly exportable).\n" +
        "Set GOOGLE_SHEETS_API_KEY and use the Sheets API, or File → Share → Anyone with the link (Viewer), then retry.",
    );
  }
  return parseCsv(text);
}

async function main() {
  const spreadsheetId = arg("id") || arg("spreadsheet-id") || process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) {
    console.error(
      "Missing spreadsheet id. Use --id SHEET_ID or GOOGLE_SPREADSHEET_ID.\n" +
        "Example: node scripts/tools/download-google-sheet-to-json.mjs --id 1abc... --range \"'My Tab'!A:ZZ\"",
    );
    process.exit(1);
  }

  const apiKey = arg("api-key") || process.env.GOOGLE_SHEETS_API_KEY || "";

  if (hasFlag("list-sheets")) {
    if (!apiKey) {
      console.error("GOOGLE_SHEETS_API_KEY or --api-key is required for --list-sheets.");
      process.exit(1);
    }
    assertNotOAuthClientSecret(apiKey);
    const titles = await fetchSheetTitles(spreadsheetId, apiKey);
    process.stdout.write(JSON.stringify(titles, null, 2) + "\n");
    return;
  }

  let range;
  try {
    const fromArg = arg("range") || process.env.GOOGLE_SHEETS_RANGE;
    if (!fromArg?.trim()) {
      if (!apiKey || hasFlag("csv")) {
        range = "";
      } else {
        assertNotOAuthClientSecret(apiKey);
        const titles = await fetchSheetTitles(spreadsheetId, apiKey);
        if (!titles.length) throw new Error("Spreadsheet has no tabs.");
        range = `${quoteSheetTitle(titles[0])}!A:ZZ`;
        console.error(`Note: using first tab as range: ${range}`);
      }
    } else {
      range = normalizeRange(fromArg, {
        logFix(from, to) {
          console.error(`Note: normalized range "${from}" → "${to}" (add ! and column letters in A1 notation).`);
        },
      });
    }
    if (range && !hasFlag("csv")) range = quoteSheetInA1Range(range);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  const gid = arg("gid") || process.env.GOOGLE_SHEETS_GID || "0";
  const forceCsv = hasFlag("csv");
  const headerRow = !hasFlag("no-header-row");
  const outPath = arg("out") || null;
  const pretty = hasFlag("pretty");

  let rows;
  if (forceCsv) {
    rows = await fetchViaPublicCsv(spreadsheetId, gid);
  } else if (apiKey) {
    assertNotOAuthClientSecret(apiKey);
    if (!range) {
      console.error("Provide --range, or omit it (uses first tab) when using an API key.");
      process.exit(1);
    }
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
