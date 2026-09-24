// Model tier resolution. The whole point of this file is that the calling code
// never names a model: it asks for a TIER, and configuration decides what that
// means. Part 10 turns real routing on by changing `activeTier` to null.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = process.env.AGENT_MODELS_CONFIG || path.resolve(HERE, "..", "config", "models.json");
const SYSTEM_PROMPT_PATH = process.env.AGENT_SYSTEM_PROMPT || path.resolve(HERE, "..", "config", "system-prompt.md");

let cachedPrompt = null;

/**
 * The agent's standing instructions. In a FILE, not a string literal, so
 * changing how the agent talks is an edit to prose rather than to code — and so
 * the exact text that shaped a reply can be read by anyone reviewing it.
 */
export function systemPrompt() {
  if (cachedPrompt !== null) return cachedPrompt;
  try {
    cachedPrompt = readFileSync(SYSTEM_PROMPT_PATH, "utf8").trim();
  } catch {
    cachedPrompt = "";
  }
  return cachedPrompt;
}

/**
 * The current UTC instant, rebuilt on every turn — deliberately NOT part of the
 * cached prompt file.
 *
 * Without it the model dates things from its training data, and the failure is
 * silent rather than loud: a limitation written with a past date is accepted by
 * the wall, listed in the console, and filtered out of the wall's own view, so
 * it looks to the dispatcher as though the write simply did not happen.
 * Everything in ops is Z, so this is stated in UTC and says so.
 */
export function currentTimeLine(now = new Date()) {
  const iso = now.toISOString();
  const weekday = now.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
  return [
    `Current date and time: ${weekday} ${iso.slice(0, 10)}, ${iso.slice(11, 16).replace(":", "")}Z.`,
    'Ops runs on UTC — read "today", "tonight", "tomorrow" and "now" as UTC unless the dispatcher says otherwise.',
    "Never infer the date from anything else; dates you invent land on records that quietly do not show.",
  ].join(" ");
}

export const TIERS = ["router", "fast", "standard", "reasoning", "extraction", "embeddings", "rerank"];

let cached = null;

export function loadModelConfig({ reload = false } = {}) {
  if (cached && !reload) return cached;
  const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  const tiers = {};
  for (const tier of TIERS) {
    const entry = raw.tiers?.[tier] ?? {};
    // Per-tier env override wins over the file, so an operator can swap a model
    // without editing a file inside the image.
    const override = process.env[`BEDROCK_MODEL_${tier.toUpperCase()}`];
    tiers[tier] = {
      tier,
      id: (override || entry.id) ?? null,
      fallbackId: entry.fallbackId ?? null,
      maxTokens: entry.maxTokens ?? null,
      purpose: entry.purpose ?? "",
    };
  }
  cached = {
    // activeTier pins every request to one model (Part 1). Setting it to null
    // — or AGENT_ACTIVE_TIER=none — hands control back to the caller's tier.
    activeTier: process.env.AGENT_ACTIVE_TIER === "none" ? null : (process.env.AGENT_ACTIVE_TIER || raw.activeTier || null),
    region: process.env.BEDROCK_REGION || process.env.AWS_REGION || raw.region || "eu-north-1",
    tiers,
  };
  return cached;
}

/**
 * Which tier actually runs for a requested tier. In Part 1 this is always the
 * pinned tier; the requested tier is still recorded in the audit log so the
 * usage data that Part 10 needs starts accumulating now.
 */
export function resolveTier(requestedTier) {
  const config = loadModelConfig();
  const requested = TIERS.includes(requestedTier) ? requestedTier : "standard";
  const effective = config.activeTier && TIERS.includes(config.activeTier) ? config.activeTier : requested;
  return { requested, effective, config: config.tiers[effective] };
}

/** Candidate model ids for a tier, primary first. */
export function modelCandidates(tier) {
  const { config } = resolveTier(tier);
  return [config.id, config.fallbackId].filter((id, i, all) => id && all.indexOf(id) === i);
}
