#!/usr/bin/env node
// Amazon Bedrock access check for the dispatcher agent (Part 0 / P5).
//
//   node scripts/bedrock-smoke-test.mjs --list          # what this account can see in the region
//   node scripts/bedrock-smoke-test.mjs                 # one Converse call (Claude by default)
//   node scripts/bedrock-smoke-test.mjs --model <id>    # e.g. an eu.amazon.nova-* profile
//   node scripts/bedrock-smoke-test.mjs --embed         # one Cohere Embed call
//   node scripts/bedrock-smoke-test.mjs --rerank        # one Cohere Rerank call
//
// Credentials come from the normal AWS chain (env AWS_ACCESS_KEY_ID /
// AWS_SECRET_ACCESS_KEY, ~/.aws/credentials, or an instance/task role).
// Region: BEDROCK_REGION, else AWS_REGION, else eu-north-1 (Stockholm).
// Nothing here is the agent — it only proves the account, the IAM policy and
// the model-access grants are in place. See docs/aws-bedrock-setup.md.

import { readFileSync, existsSync } from "node:fs";
import { BedrockClient, ListFoundationModelsCommand, ListInferenceProfilesCommand } from "@aws-sdk/client-bedrock";
import { BedrockRuntimeClient, ConverseCommand, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

// .env is read only for AWS_/BEDROCK_ names and never overrides the shell.
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = /^((?:AWS|BEDROCK)_[A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined && m[2].trim()) process.env[m[1]] = m[2].trim();
  }
}

const region = process.env.BEDROCK_REGION || process.env.AWS_REGION || "eu-north-1";
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const value = (f, d = null) => (args.indexOf(f) === -1 ? d : args[args.indexOf(f) + 1] ?? d);

const control = new BedrockClient({ region });
const runtime = new BedrockRuntimeClient({ region });

async function listProfiles() {
  const out = [];
  let nextToken;
  do {
    const page = await control.send(new ListInferenceProfilesCommand({ nextToken, maxResults: 100 }));
    out.push(...(page.inferenceProfileSummaries ?? []));
    nextToken = page.nextToken;
  } while (nextToken);
  return out;
}

async function list() {
  const models = await control.send(new ListFoundationModelsCommand({}));
  const wanted = ["anthropic", "amazon", "cohere"];
  console.log(`Region ${region} — foundation models visible to this account (Anthropic / Amazon / Cohere):`);
  for (const m of (models.modelSummaries ?? []).filter((m) => wanted.includes(String(m.providerName).toLowerCase()))) {
    console.log(`  ${m.modelId.padEnd(52)} ${String(m.modelLifecycle?.status ?? "").padEnd(8)} ${(m.inferenceTypesSupported ?? []).join(",")}`);
  }
  console.log("\nInference profiles (cross-region routing ids you actually invoke):");
  for (const p of await listProfiles()) {
    if (!/anthropic|amazon|cohere/i.test(p.inferenceProfileId)) continue;
    console.log(`  ${p.inferenceProfileId.padEnd(60)} ${p.status}`);
  }
  console.log("\nModel *visibility* is not model *access*: a Converse call is the real test.");
}

async function pickClaudeProfile() {
  const [profiles, models] = await Promise.all([
    listProfiles(),
    control.send(new ListFoundationModelsCommand({})),
  ]);
  // Skip LEGACY models: Bedrock refuses them for accounts that have not used
  // them in 30 days, which looks like a broken setup but is not one.
  const legacy = (models.modelSummaries ?? [])
    .filter((m) => String(m.modelLifecycle?.status).toUpperCase() === "LEGACY")
    .map((m) => m.modelId);
  const candidates = profiles.filter((p) =>
    p.status === "ACTIVE" &&
    // eu.* only — global.* profiles route outside the EU (see the setup doc).
    p.inferenceProfileId.startsWith("eu.") &&
    /anthropic\.claude/i.test(p.inferenceProfileId) &&
    !legacy.some((id) => p.inferenceProfileId.includes(id))
  );
  // Cheapest capable model first: this is a reachability check, not a benchmark.
  for (const rx of [/haiku/i, /sonnet/i, /opus/i]) {
    const hit = candidates.find((p) => rx.test(p.inferenceProfileId));
    if (hit) return hit.inferenceProfileId;
  }
  return candidates[0]?.inferenceProfileId ?? null;
}

let attemptedModelId = null;

async function converse() {
  const modelId = value("--model") || process.env.BEDROCK_MODEL_ID || (await pickClaudeProfile());
  if (!modelId) throw new Error("No Claude inference profile is ACTIVE in this region; pass --model <id>.");
  attemptedModelId = modelId;
  if (!value("--model") && !process.env.BEDROCK_MODEL_ID) console.error(`(auto-picked ${modelId})`);
  const t0 = Date.now();
  const res = await runtime.send(new ConverseCommand({
    modelId,
    messages: [{ role: "user", content: [{ text: "Reply with the single word OK." }] }],
    inferenceConfig: { maxTokens: 16, temperature: 0 },
  }));
  const text = res.output?.message?.content?.map((c) => c.text ?? "").join("") ?? "";
  console.log(JSON.stringify({ ok: true, region, modelId, text, stopReason: res.stopReason, usage: res.usage, ms: Date.now() - t0 }, null, 2));
}

async function embed() {
  const modelId = value("--model") || process.env.BEDROCK_EMBED_MODEL_ID || "eu.cohere.embed-v4:0";
  attemptedModelId = modelId;
  const res = await runtime.send(new InvokeModelCommand({
    modelId, contentType: "application/json", accept: "application/json",
    // Embed v4 takes `texts` + `input_type`; v3 ids differ per region — see --list.
    body: JSON.stringify({ texts: ["Runway 18/36 closed for maintenance."], input_type: "search_document" }),
  }));
  const body = JSON.parse(Buffer.from(res.body).toString("utf8"));
  // v3 returns embeddings[], v4 returns embeddings.float[]. A 200 with neither
  // is a failure — do not report ok on a response with no vector in it.
  const vector = Array.isArray(body.embeddings) ? body.embeddings[0] : body.embeddings?.float?.[0];
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error(`No embedding vector in the response: ${JSON.stringify(body).slice(0, 300)}`);
  }
  console.log(JSON.stringify({ ok: true, region, modelId, dimensions: vector.length }, null, 2));
}

async function rerank() {
  const modelId = value("--model") || process.env.BEDROCK_RERANK_MODEL_ID || "cohere.rerank-v3-5:0";
  attemptedModelId = modelId;
  const res = await runtime.send(new InvokeModelCommand({
    modelId, contentType: "application/json", accept: "application/json",
    body: JSON.stringify({
      query: "Is the runway closed?",
      documents: ["RWY 18/36 CLSD due WIP.", "Taxiway B lighting U/S.", "Fuel available H24."],
      top_n: 2, api_version: 2,
    }),
  }));
  const body = JSON.parse(Buffer.from(res.body).toString("utf8"));
  if (!Array.isArray(body.results) || body.results.length === 0) {
    throw new Error(`No rerank results in the response: ${JSON.stringify(body).slice(0, 300)}`);
  }
  console.log(JSON.stringify({ ok: true, region, modelId, results: body.results }, null, 2));
}

try {
  if (flag("--list")) await list();
  else if (flag("--embed")) await embed();
  else if (flag("--rerank")) await rerank();
  else await converse();
} catch (error) {
  const name = error?.name || "Error";
  console.error(JSON.stringify({ ok: false, region, modelId: attemptedModelId, error: name, message: error?.message }, null, 2));
  if (/UnrecognizedClient|InvalidSignature|InvalidClientTokenId|CredentialsProviderError|ExpiredToken/i.test(name + error?.message)) {
    console.error("→ AWS credentials are missing or invalid. Configure a key for the agent's IAM user/role first (docs/aws-bedrock-setup.md).");
  } else if (/aws-marketplace/i.test(error?.message || "")) {
    console.error("→ Third-party model (Cohere/Mistral/AI21). The ACCOUNT must complete the AWS Marketplace subscription via Bedrock → Model access, signed in as an admin. Granting the runtime user aws-marketplace:Subscribe is the wrong fix — it lets the agent's key buy subscriptions.");
  } else if (/not available for this account/i.test(error?.message || "")) {
    console.error("→ Model exists in the region but is not granted to this account. Bedrock → Model access → request it; some frontier models additionally require contacting AWS.");
  } else if (/Legacy/i.test(error?.message || "")) {
    console.error("→ Model is LEGACY and unused for 30+ days. Pick a current model from --list.");
  } else if (/AccessDenied/i.test(name + error?.message)) {
    console.error("→ Credentials work but the IAM policy or Bedrock model-access grant is missing (docs/aws-bedrock-setup.md §3–§4).");
  } else if (/ResourceNotFound|ValidationException/i.test(name + error?.message)) {
    console.error("→ Model id not available in this region — run --list and pick an ACTIVE inference profile.");
  }
  process.exit(1);
}
