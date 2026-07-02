#!/usr/bin/env node
// Import IMPORTANT.docx into the Digital Wall's Important store.
//
// Two-step by design so a human can review before trusting the parse:
//
//   1. Propose (default): parse the docx, split into candidate entries,
//      infer match criteria (countries / ICAOs / operators / registrations /
//      date windows) and write the candidates to stdout + a review file:
//        node scripts/import-important-docx.mjs /path/to/IMPORTANT.docx
//      -> writes data/important-candidates.json
//
//   2. Apply: merge the (optionally hand-edited) candidates into the live
//      store. Auto-parsed entries keep reviewed:false so the Console flags
//      them until a human confirms.
//        node scripts/import-important-docx.mjs --apply [candidates.json]
//
// No entry is silently dropped: paragraphs whose criteria cannot be inferred
// are imported active with empty match criteria (they flag no flights) and
// needsReview annotations, so they stay visible on the Important page.
//
// Text extraction tries, in order: pandoc, python3-docx, `unzip -p` on
// word/document.xml (docx is a zip). Plain .txt input is used verbatim.

import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { JsonFileStore } from "../lib/json-store.mjs";
import { sanitizeImportantEntry } from "../lib/important-store.mjs";

const CANDIDATES_FILE = path.resolve(process.cwd(), "data", "important-candidates.json");

// Operators seen in the IMPORTANT bulletin (extend freely — matching is
// case-insensitive substring, so partial names are fine).
const KNOWN_OPERATORS = [
  "Panaviatic", "BySky", "Jetology", "Klasjet", "Sunway", "ART Line Wings",
  "Skybridge", "Maser", "OKOZZ", "Clearway",
];

// Country names likely to appear; matched as whole words, case-insensitive.
const KNOWN_COUNTRIES = [
  "France", "Spain", "Bulgaria", "Norway", "Moldova", "Latvia", "Lithuania",
  "Serbia", "Switzerland", "United Kingdom", "UK", "Netherlands", "Turkey",
  "Kazakhstan", "Russia", "Finland", "Germany", "Italy", "Greece", "Poland",
  "Estonia", "Sweden", "Denmark", "Belgium", "Austria", "Portugal", "Ireland",
  "Czech Republic", "Slovakia", "Hungary", "Romania", "Croatia", "Israel",
  "United Arab Emirates", "Georgia", "Ukraine", "Belarus", "Iceland",
];
const COUNTRY_ALIASES = { UK: "United Kingdom" };

function extractDocxText(docxPath) {
  const attempts = [
    { cmd: "pandoc", args: [docxPath, "-t", "plain"], transform: (out) => out },
    {
      cmd: "python3",
      args: ["-c", `
import sys, zipfile, re
with zipfile.ZipFile(sys.argv[1]) as z:
    xml = z.read('word/document.xml').decode('utf-8')
xml = re.sub(r'</w:p>', '\\n', xml)
xml = re.sub(r'<[^>]+>', '', xml)
import html
print(html.unescape(xml))
`, docxPath],
      transform: (out) => out,
    },
    {
      cmd: "unzip",
      args: ["-p", docxPath, "word/document.xml"],
      transform: (out) =>
        out
          .replaceAll("</w:p>", "\n")
          .replace(/<[^>]+>/g, "")
          .replaceAll("&amp;", "&")
          .replaceAll("&lt;", "<")
          .replaceAll("&gt;", ">")
          .replaceAll("&quot;", '"')
          .replaceAll("&apos;", "'"),
    },
  ];

  for (const attempt of attempts) {
    const result = spawnSync(attempt.cmd, attempt.args, { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
    if (result.status === 0 && result.stdout && result.stdout.trim()) {
      return attempt.transform(result.stdout);
    }
  }
  throw new Error(
    "Could not extract text from the docx. Install pandoc, python3, or unzip — or convert to .txt and pass that."
  );
}

function splitIntoCandidateBlocks(text) {
  // Entries in the bulletin are free-text paragraphs; split on blank lines
  // and on common bullet/numbering starts, then drop trivial fragments.
  const rough = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n+/)
    .flatMap((block) => block.split(/\n(?=\s*(?:[-•*•]|\d+[.)])\s+)/));
  return rough
    .map((block) => block.replace(/^\s*(?:[-•*•]|\d+[.)])\s+/, "").trim())
    .filter((block) => block.length >= 25); // skip headings/fragments
}

function inferCriteria(text) {
  const notes = [];

  // Airport ICAOs: 4 uppercase letters, first letter in known region prefixes,
  // excluding common all-caps words.
  const STOPWORDS = new Set(["NOTE", "ONLY", "WITH", "FROM", "THIS", "THAT", "MUST", "OPEN", "UNTIL", "PERM", "NOTAM", "AVBL", "HOURS", "CREW", "FUEL"]);
  const icaos = [
    ...new Set(
      [...text.matchAll(/\b([A-Z]{4})\b/g)]
        .map((m) => m[1])
        .filter((code) => !STOPWORDS.has(code))
        .filter((code) => /^[ABCDEFGHKLMNOPRSTUVWYZ]/.test(code))
    ),
  ];

  // Registrations: e.g. T7-LASER, ES-PVN, OK-OZZ, YU-APR, 9H-ABC
  const registrations = [
    ...new Set([...text.matchAll(/\b([A-Z0-9]{1,2}-[A-Z0-9]{3,6})\b/g)].map((m) => m[1])),
  ].filter((reg) => !/^\d+-\d+$/.test(reg));

  const lower = text.toLowerCase();
  const operators = KNOWN_OPERATORS.filter((name) => lower.includes(name.toLowerCase()));

  const countries = [
    ...new Set(
      KNOWN_COUNTRIES.filter((name) => new RegExp(`\\b${name}\\b`, "i").test(text)).map(
        (name) => COUNTRY_ALIASES[name] || name
      )
    ),
  ];

  // Date windows like "Jul 1 - Oct 15", "1 July until 15 October".
  let validFrom = null;
  let validTo = null;
  const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";
  const range = new RegExp(
    `(\\d{1,2}\\s+(?:${MONTHS})[a-z]*|(?:${MONTHS})[a-z]*\\s+\\d{1,2})\\s*(?:-|–|to|until|till)\\s*(\\d{1,2}\\s+(?:${MONTHS})[a-z]*|(?:${MONTHS})[a-z]*\\s+\\d{1,2})`,
    "i"
  ).exec(text);
  if (range) {
    const year = new Date().getUTCFullYear();
    const parse = (s) => {
      const dt = new Date(`${s} ${year} UTC`);
      return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
    };
    validFrom = parse(range[1]);
    validTo = parse(range[2]);
    if (!validFrom || !validTo) notes.push(`date window "${range[0]}" could not be fully parsed`);
  }

  if (icaos.length === 0 && countries.length === 0 && operators.length === 0 && registrations.length === 0) {
    notes.push("no match criteria inferred — entry will not flag any flight until edited");
  }

  return {
    match: {
      countries,
      airportIcaos: icaos,
      operators,
      registrations,
      direction: "any",
      validFrom,
      validTo,
    },
    notes,
  };
}

function titleFromBody(body) {
  const firstLine = body.split("\n")[0].trim();
  return firstLine.length <= 90 ? firstLine : `${firstLine.slice(0, 87)}…`;
}

async function propose(inputPath) {
  const raw = inputPath.toLowerCase().endsWith(".txt")
    ? await fs.readFile(inputPath, "utf-8")
    : extractDocxText(inputPath);

  const blocks = splitIntoCandidateBlocks(raw);
  const candidates = blocks.map((body, index) => {
    const { match, notes } = inferCriteria(body);
    return {
      id: `IMP-DOCX-${String(index + 1).padStart(3, "0")}`,
      title: titleFromBody(body),
      body, // full original text, verbatim — never summarized
      class: "IMP",
      match,
      isActive: true,
      reviewed: false,
      source: "important.docx",
      importNotes: notes,
    };
  });

  await fs.mkdir(path.dirname(CANDIDATES_FILE), { recursive: true });
  await fs.writeFile(CANDIDATES_FILE, JSON.stringify({ candidates }, null, 2), "utf-8");

  console.log(`Parsed ${blocks.length} candidate entries from ${inputPath}`);
  const flagged = candidates.filter((c) => c.importNotes.length > 0);
  console.log(`  needing review before they can match flights: ${flagged.length}`);
  for (const c of candidates) {
    const m = c.match;
    console.log(
      `- ${c.id}: "${c.title}"\n    icaos=[${m.airportIcaos}] countries=[${m.countries}] operators=[${m.operators}] regs=[${m.registrations}] window=${m.validFrom ?? "-"}..${m.validTo ?? "-"}${c.importNotes.length ? `\n    ⚠ ${c.importNotes.join("; ")}` : ""}`
    );
  }
  console.log(`\nReview/edit ${CANDIDATES_FILE}, then run:\n  node scripts/import-important-docx.mjs --apply`);
}

async function apply(candidatesPath) {
  const raw = await fs.readFile(candidatesPath, "utf-8");
  const { candidates } = JSON.parse(raw);
  if (!Array.isArray(candidates)) throw new Error("Candidates file has no candidates[] array.");

  const store = new JsonFileStore("important.json", { entries: [] });
  const payload = await store.read();
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  const byId = new Map(entries.map((e) => [e.id, e]));

  let added = 0;
  let updated = 0;
  for (const candidate of candidates) {
    const sanitized = sanitizeImportantEntry(candidate, byId.get(candidate.id) ?? null);
    sanitized.reviewed = candidate.reviewed === true;
    if (byId.has(sanitized.id)) updated += 1;
    else added += 1;
    byId.set(sanitized.id, sanitized);
  }
  await store.write({ entries: [...byId.values()], updatedAt: new Date().toISOString() });
  console.log(`Applied: ${added} added, ${updated} updated -> data/important.json`);
  console.log("Restart the digital-wall backend (or wait for its next boot) to pick the entries up.");
}

const args = process.argv.slice(2);
if (args[0] === "--apply") {
  await apply(args[1] ? path.resolve(args[1]) : CANDIDATES_FILE);
} else if (args[0]) {
  await propose(path.resolve(args[0]));
} else {
  console.log("Usage:\n  node scripts/import-important-docx.mjs /path/to/IMPORTANT.docx   # propose\n  node scripts/import-important-docx.mjs --apply [candidates.json]  # apply");
  process.exit(1);
}
