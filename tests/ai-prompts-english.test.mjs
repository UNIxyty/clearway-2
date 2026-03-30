import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const FILES = [
  "scripts/ead-extract-aip-from-pdf-ai.mjs",
  "docs/AIP-EXTRACT-PROMPT.md",
  "docs/GEN-REWRITE-PROMPT.md",
  "app/api/textract-benchmark/run/route.ts",
  "app/api/aip/gen-non-ead/route.ts",
  "scripts/gen-rewrite-claude-openrouter.mjs",
];

test("AI prompt sources enforce English output", () => {
  for (const file of FILES) {
    const text = readFileSync(file, "utf8");
    assert.match(
      text,
      /English only|in English only/i,
      `Missing English-only instruction in ${file}`,
    );
  }
});
