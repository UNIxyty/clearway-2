#!/usr/bin/env node

import process from "process";

function getWebhookUrl() {
  const url = process.env.N8N_WEBHOOK_URL || process.env.WEBHOOK_URL;
  if (!url) {
    throw new Error("Missing webhook URL. Set N8N_WEBHOOK_URL or WEBHOOK_URL.");
  }
  return url;
}

function makePayload() {
  return {
    event: "webhook_test",
    timestamp: new Date().toISOString(),
    message: "Testing n8n webhook for E2E portal testing",
    source: "scripts/test-webhook.mjs",
    summary: {
      total: 10,
      passed: 8,
      failed: 2,
    },
    reportUrl: "https://example.com/test-results/sample-report.md",
  };
}

async function main() {
  const webhookUrl = getWebhookUrl();
  const payload = makePayload();

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const bodyText = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(`Webhook test failed (${response.status}): ${bodyText || response.statusText}`);
  }

  console.log("Webhook test sent successfully.");
  console.log(`URL: ${webhookUrl}`);
  if (bodyText) {
    console.log(`Response: ${bodyText}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
