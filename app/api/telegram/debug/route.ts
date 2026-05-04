import { NextRequest, NextResponse } from "next/server";
import { startDebugRun } from "@/lib/debug-runner";

type DebugStep = "aip" | "notam" | "weather" | "pdf" | "gen";
type SourceMode = "auto" | "ead-only";

type TelegramChat = {
  id?: number;
};

type TelegramMessage = {
  message_id?: number;
  text?: string;
  chat?: TelegramChat;
};

type TelegramUpdate = {
  message?: TelegramMessage;
};

const DEFAULT_STEPS: DebugStep[] = ["aip", "pdf", "gen"];
const ALLOWED_STEPS = new Set<DebugStep>(["aip", "notam", "weather", "pdf", "gen"]);

function parseAllowedChatIds(): Set<string> {
  return new Set(
    String(process.env.TELEGRAM_DEBUG_ALLOWED_CHAT_IDS || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
  );
}

function isWebhookSecretValid(request: NextRequest): boolean {
  const expected = String(process.env.TELEGRAM_BOT_WEBHOOK_SECRET || "").trim();
  if (!expected) return false;
  const actual = request.headers.get("x-telegram-bot-api-secret-token")?.trim() || "";
  return actual.length > 0 && actual === expected;
}

function parseSteps(raw: string | undefined): DebugStep[] {
  if (!raw) return DEFAULT_STEPS;
  const parsed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is DebugStep => ALLOWED_STEPS.has(s as DebugStep));
  return parsed.length > 0 ? parsed : DEFAULT_STEPS;
}

function parseIcaos(raw: string | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const up = part.trim().toUpperCase();
    if (/^[A-Z0-9]{4}$/.test(up)) seen.add(up);
  }
  return [...seen];
}

function parseCountries(raw: string | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const country = part.trim();
    if (country) seen.add(country);
  }
  return [...seen];
}

function parseNumber(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function parseDebugCommand(text: string) {
  const trimmed = text.trim();
  const match = trimmed.match(/^\/debug(?:@\w+)?(?:\s+(.*))?$/i);
  if (!match) return null;
  const tail = String(match[1] || "").trim();
  if (!tail) {
    return {
      helpOnly: true,
    };
  }

  const tokens = tail.split(/\s+/).filter(Boolean);
  const kv = new Map<string, string>();
  const positional: string[] = [];

  for (const token of tokens) {
    const idx = token.indexOf("=");
    if (idx > 0) {
      const key = token.slice(0, idx).trim().toLowerCase();
      const value = token.slice(idx + 1).trim();
      if (key) kv.set(key, value);
      continue;
    }
    positional.push(token);
  }

  const maybeIcaos = positional.filter((p) => /^[A-Za-z0-9]{4}$/.test(p)).map((p) => p.toUpperCase());
  const icaos = parseIcaos(kv.get("icaos"));
  const mergedIcaos = [...new Set([...maybeIcaos, ...icaos])];
  const allAirports = String(kv.get("all") || "").toLowerCase() === "true";

  return {
    helpOnly: false,
    quantity: parseNumber(kv.get("qty"), 50),
    allAirports,
    randomSample: String(kv.get("random") || "false").toLowerCase() === "true",
    countries: parseCountries(kv.get("countries")),
    concurrency: parseNumber(kv.get("concurrency"), 1),
    steps: parseSteps(kv.get("steps")),
    icaos: mergedIcaos,
    sourceMode: String(kv.get("source") || "ead-only").toLowerCase() === "auto" ? ("auto" as SourceMode) : ("ead-only" as SourceMode),
  };
}

function helpText(): string {
  return [
    "Debug bot command:",
    "/debug EFJO",
    "/debug icaos=EFJO,EHAM steps=aip,pdf,gen source=ead-only concurrency=1",
    "/debug all=true source=ead-only steps=aip,pdf,gen concurrency=1",
    "/debug qty=100 random=true countries=Finland,Sweden source=ead-only",
    "",
    "Options: icaos, all, qty, random, countries, steps, source(auto|ead-only), concurrency",
  ].join("\n");
}

async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!botToken) return;
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  }).catch(() => undefined);
}

export async function POST(request: NextRequest) {
  if (!isWebhookSecretValid(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const update = (await request.json().catch(() => ({}))) as TelegramUpdate;
  const message = update?.message;
  const chatId = String(message?.chat?.id || "").trim();
  const text = String(message?.text || "").trim();

  if (!chatId || !text) {
    return NextResponse.json({ ok: true, ignored: "missing chat/text" });
  }

  const allowed = parseAllowedChatIds();
  if (allowed.size > 0 && !allowed.has(chatId)) {
    await sendTelegramMessage(chatId, "This chat is not allowed to start debug runs.");
    return NextResponse.json({ ok: true, ignored: "chat not allowed" });
  }

  const cmd = parseDebugCommand(text);
  if (!cmd) {
    return NextResponse.json({ ok: true, ignored: "not a /debug command" });
  }

  if (cmd.helpOnly) {
    await sendTelegramMessage(chatId, helpText());
    return NextResponse.json({ ok: true, help: true });
  }

  const steps = cmd.steps ?? DEFAULT_STEPS;
  const icaos = cmd.icaos ?? [];

  try {
    const run = await startDebugRun(
      {
        quantity: cmd.quantity,
        allAirports: cmd.allAirports,
        randomSample: cmd.randomSample,
        countries: cmd.countries,
        excludeCaptchaCountries: false,
        concurrency: cmd.concurrency,
        steps,
        icaos,
        sourceMode: cmd.sourceMode,
      },
      process.env.DEBUG_RUNNER_BASE_URL || "http://127.0.0.1:3000"
    );

    await sendTelegramMessage(
      chatId,
      [
        `Started debug run: ${run.id}`,
        `source=${cmd.sourceMode}`,
        `steps=${steps.join(",")}`,
        `concurrency=${cmd.concurrency}`,
        icaos.length > 0 ? `icaos=${icaos.join(",")}` : `all=${cmd.allAirports ? "true" : "false"}, qty=${cmd.quantity}`,
      ].join("\n")
    );

    return NextResponse.json({ ok: true, runId: run.id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await sendTelegramMessage(chatId, `Failed to start debug run: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

