#!/usr/bin/env node
// One-time account setup: accept the Bedrock model agreements (AWS Marketplace
// subscriptions) for the models the dispatcher agent needs.
//
// WHY THIS EXISTS: Bedrock retired the "Model access" page. Serverless models
// now enable themselves on first invocation — but only when the caller holds
// AWS Marketplace permissions. The agent's runtime user deliberately does NOT
// (it may invoke models, not buy subscriptions), so the activation has to be
// done once by an admin. Embedding models have no playground either, so the
// console route does not cover them. This script is that one admin step.
//
// RUN AS AN ADMIN IDENTITY, NOT THE AGENT KEY:
//   AWS_ACCESS_KEY_ID=<admin> AWS_SECRET_ACCESS_KEY=<admin> \
//     node scripts/bedrock-enable-models.mjs --check
//   ...same, then --apply to accept the agreements.
//
//   --check           report agreement status for each model (default, no writes)
//   --apply           accept the offer for any model not already available
//   --models a,b,c    override the model list (BASE model ids, not eu.* profiles)
//   --region <r>      default: BEDROCK_REGION / AWS_REGION / eu-north-1
//
// Note the id rule: agreements are made against the BASE model id
// (anthropic.claude-opus-4-6-v1); inference uses the eu.* profile id.

import { readFileSync, existsSync } from "node:fs";
import {
  BedrockClient,
  ListFoundationModelsCommand,
  ListFoundationModelAgreementOffersCommand,
  CreateFoundationModelAgreementCommand,
} from "@aws-sdk/client-bedrock";

// Same .env handling as the smoke test: shell env always wins, so exported
// admin credentials override the agent key in .env when you do have them.
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = /^((?:AWS|BEDROCK)_[A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined && m[2].trim()) process.env[m[1]] = m[2].trim();
  }
}

const DEFAULT_MODELS = [
  "anthropic.claude-opus-4-6-v1",
  "anthropic.claude-sonnet-4-6",
  "anthropic.claude-haiku-4-5-20251001-v1:0",
  "amazon.nova-lite-v1:0",
  "amazon.nova-pro-v1:0",
  "amazon.titan-embed-text-v2:0",
  "cohere.embed-v4:0",
];

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const value = (f, d = null) => (args.indexOf(f) === -1 ? d : args[args.indexOf(f) + 1] ?? d);

const region = value("--region") || process.env.BEDROCK_REGION || process.env.AWS_REGION || "eu-north-1";
const models = (value("--models") || "").trim() ? value("--models").split(",").map((m) => m.trim()) : DEFAULT_MODELS;
const apply = flag("--apply");
const client = new BedrockClient({ region });

// Bedrock reports per-model agreement state on the model summary.
async function availabilityMap() {
  const out = new Map();
  const page = await client.send(new ListFoundationModelsCommand({}));
  for (const m of page.modelSummaries ?? []) out.set(m.modelId, m);
  return out;
}

// Show which identity is in play: running this as the agent key instead of an
// admin is the likeliest mistake, and its failure mode is a confusing denial.
async function whoami() {
  try {
    const { execFileSync } = await import("node:child_process");
    const out = execFileSync("aws", ["sts", "get-caller-identity", "--region", region, "--output", "json"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    });
    const id = JSON.parse(out);
    return `${id.Arn} (account ${id.Account})`;
  } catch {
    return null;
  }
}

async function main() {
  console.log(`Region ${region}${apply ? " — APPLYING agreements" : " — check only (pass --apply to accept)"}`);
  const identity = await whoami();
  if (identity) {
    console.log(`Identity: ${identity}`);
    if (/user\/clearway-agent/.test(identity)) {
      console.log("  ⚠ This is the AGENT key, which has no Marketplace permissions. Re-run with an admin identity.");
    }
  }
  console.log("");
  const available = await availabilityMap();
  let needed = 0, accepted = 0, failed = 0;

  for (const modelId of models) {
    const summary = available.get(modelId);
    if (!summary) {
      console.log(`${modelId.padEnd(46)} NOT OFFERED in ${region} — skip`);
      continue;
    }
    const agreement = summary.modelLifecycle?.status === "LEGACY" ? "LEGACY" : null;
    if (agreement === "LEGACY") {
      console.log(`${modelId.padEnd(46)} LEGACY — skip`);
      continue;
    }

    let offers;
    try {
      offers = await client.send(new ListFoundationModelAgreementOffersCommand({ modelId }));
    } catch (error) {
      // "Agreement not supported" is the SUCCESS case for first-party Amazon
      // models: they are not Marketplace-served and need no subscription.
      if (/Agreement not supported/i.test(error.message || "")) {
        console.log(`${modelId.padEnd(46)} no agreement needed (first-party)`);
        continue;
      }
      console.log(`${modelId.padEnd(46)} offers unavailable: ${error.name} ${String(error.message).slice(0, 80)}`);
      failed += 1;
      continue;
    }
    const token = offers.offers?.[0]?.offerToken;
    if (!token) {
      // No offer to accept usually means the agreement already exists.
      console.log(`${modelId.padEnd(46)} no offer returned — already subscribed, or not Marketplace-served`);
      continue;
    }

    needed += 1;
    if (!apply) {
      console.log(`${modelId.padEnd(46)} offer available — would accept`);
      continue;
    }
    try {
      await client.send(new CreateFoundationModelAgreementCommand({ modelId, offerToken: token }));
      console.log(`${modelId.padEnd(46)} ACCEPTED`);
      accepted += 1;
    } catch (error) {
      console.log(`${modelId.padEnd(46)} FAILED: ${error.name} ${String(error.message).slice(0, 120)}`);
      failed += 1;
    }
  }

  console.log(`\n${apply ? `accepted ${accepted}` : `${needed} model(s) need an agreement`}${failed ? `, ${failed} failed` : ""}`);
  if (apply && accepted) {
    console.log("Allow a few minutes, then: node scripts/bedrock-smoke-test.mjs");
  }
}

main().catch((error) => {
  console.error(`${error.name}: ${error.message}`);
  if (/AccessDenied|marketplace/i.test(`${error.name} ${error.message}`)) {
    console.error("→ Run this with an ADMIN identity. The agent's key intentionally lacks AWS Marketplace permissions.");
  }
  process.exit(1);
});
