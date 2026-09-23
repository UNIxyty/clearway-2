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
  const profiles = await listProfiles();
  const claude = profiles.filter((p) => p.status === "ACTIVE" && /anthropic\.claude/i.test(p.inferenceProfileId));
  // Prefer a Sonnet-class profile for a cheap check; anything Claude otherwise.
  return (claude.find((p) => /sonnet/i.test(p.inferenceProfileId)) ?? claude[0])?.inferenceProfileId ?? null;
}

async function converse() {
  const modelId = value("--model") || process.env.BEDROCK_MODEL_ID || (await pickClaudeProfile());
  if (!modelId) throw new Error("No Claude inference profile is ACTIVE in this region; pass --model <id>.");
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
  const res = await runtime.send(new InvokeModelCommand({
    modelId, contentType: "application/json", accept: "application/json",
    // Embed v4 takes `texts` + `input_type`; v3 ids differ per region — see --list.
    body: JSON.stringify({ texts: ["Runway 18/36 closed for maintenance."], input_type: "search_document" }),
  }));
  const body = JSON.parse(Buffer.from(res.body).toString("utf8"));
  console.log(JSON.stringify({ ok: true, region, modelId, dimensions: body.embeddings?.[0]?.length ?? null }, null, 2));
}

async function rerank() {
  const modelId = value("--model") || process.env.BEDROCK_RERANK_MODEL_ID || "cohere.rerank-v3-5:0";
  const res = await runtime.send(new InvokeModelCommand({
    modelId, contentType: "application/json", accept: "application/json",
    body: JSON.stringify({
      query: "Is the runway closed?",
      documents: ["RWY 18/36 CLSD due WIP.", "Taxiway B lighting U/S.", "Fuel available H24."],
      top_n: 2, api_version: 2,
    }),
  }));
  const body = JSON.parse(Buffer.from(res.body).toString("utf8"));
  console.log(JSON.stringify({ ok: true, region, modelId, results: body.results }, null, 2));
}

try {
  if (flag("--list")) await list();
  else if (flag("--embed")) await embed();
  else if (flag("--rerank")) await rerank();
  else await converse();
} catch (error) {
  const name = error?.name || "Error";
  console.error(JSON.stringify({ ok: false, region, error: name, message: error?.message }, null, 2));
  if (/UnrecognizedClient|InvalidSignature|InvalidClientTokenId|CredentialsProviderError|ExpiredToken/i.test(name + error?.message)) {
    console.error("→ AWS credentials are missing or invalid. Configure a key for the agent's IAM user/role first (docs/aws-bedrock-setup.md).");
  } else if (/AccessDenied/i.test(name + error?.message)) {
    console.error("→ Credentials work but the IAM policy or Bedrock model-access grant is missing (docs/aws-bedrock-setup.md §3–§4).");
  } else if (/ResourceNotFound|ValidationException/i.test(name + error?.message)) {
    console.error("→ Model id not available in this region — run --list and pick an ACTIVE inference profile.");
  }
  process.exit(1);
}
