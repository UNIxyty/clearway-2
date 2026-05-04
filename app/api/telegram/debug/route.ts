import { NextRequest, NextResponse } from "next/server";
import { startDebugRun } from "@/lib/debug-runner";

type DebugStep = "aip" | "notam" | "weather" | "pdf" | "gen";
type SourceMode = "auto" | "ead-only";
type DebugScope = "single" | "all" | "country";
type AwaitingInput = "icao" | "country" | null;

type TelegramChat = {
  id?: number;
};

type TelegramMessage = {
  message_id?: number;
  text?: string;
  chat?: TelegramChat;
};

type TelegramCallbackQuery = {
  id?: string;
  data?: string;
  message?: TelegramMessage;
};

type TelegramUpdate = {
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

const DEFAULT_STEPS: DebugStep[] = ["aip", "pdf", "gen"];
const ALLOWED_STEPS = new Set<DebugStep>(["aip", "notam", "weather", "pdf", "gen"]);
const BOT_CALLBACK_PREFIX = "dbg:";

type DebugUiState = {
  sourceMode: SourceMode;
  concurrency: number;
  steps: DebugStep[];
  scope: DebugScope;
  quantity: number;
  icao: string;
  country: string;
  awaitingInput: AwaitingInput;
  lastRunId?: string;
};

const CHAT_STATES = new Map<string, DebugUiState>();

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

function getBotToken(): string {
  return String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
}

function defaultUiState(): DebugUiState {
  return {
    sourceMode: "ead-only",
    concurrency: 1,
    steps: [...DEFAULT_STEPS],
    scope: "single",
    quantity: 50,
    icao: "",
    country: "",
    awaitingInput: null,
  };
}

function getOrCreateState(chatId: string): DebugUiState {
  const existing = CHAT_STATES.get(chatId);
  if (existing) return existing;
  const created = defaultUiState();
  CHAT_STATES.set(chatId, created);
  return created;
}

function isChatAllowed(chatId: string): boolean {
  const allowed = parseAllowedChatIds();
  return allowed.size === 0 || allowed.has(chatId);
}

function stateSummary(state: DebugUiState): string {
  const scopeLine = state.scope === "single"
    ? `single ICAO: ${state.icao || "(not set)"}`
    : state.scope === "country"
      ? `one country: ${state.country || "(not set)"} (all airports)`
      : `all airports, qty=${state.quantity}`;
  const lastRun = state.lastRunId ? `last run: ${state.lastRunId}` : "last run: none";
  const awaiting =
    state.awaitingInput === "icao"
      ? "awaiting input: send ICAO code (e.g. EFJO)"
      : state.awaitingInput === "country"
        ? "awaiting input: send country name (e.g. Finland)"
        : "awaiting input: none";
  return [
    "Debug runner menu",
    `source: ${state.sourceMode}`,
    `concurrency: ${state.concurrency}`,
    `steps: ${state.steps.join(",")}`,
    `scope: ${scopeLine}`,
    awaiting,
    lastRun,
    "",
    "Tip: You can still run text commands like /debug EFJO",
  ].join("\n");
}

function menuKeyboard(state: DebugUiState) {
  const selected = (on: boolean) => (on ? "✅ " : "");
  return {
    inline_keyboard: [
      [
        {
          text: `${selected(state.sourceMode === "ead-only")}Source: ead-only`,
          callback_data: `${BOT_CALLBACK_PREFIX}src:ead-only`,
        },
        {
          text: `${selected(state.sourceMode === "auto")}Source: auto`,
          callback_data: `${BOT_CALLBACK_PREFIX}src:auto`,
        },
      ],
      [
        {
          text: `${selected(state.concurrency === 1)}Concurrency 1`,
          callback_data: `${BOT_CALLBACK_PREFIX}cc:1`,
        },
        {
          text: `${selected(state.concurrency === 3)}Concurrency 3`,
          callback_data: `${BOT_CALLBACK_PREFIX}cc:3`,
        },
      ],
      [
        {
          text: `${selected(state.steps.length === 3 && state.steps.join(",") === DEFAULT_STEPS.join(","))}Steps core`,
          callback_data: `${BOT_CALLBACK_PREFIX}steps:core`,
        },
        {
          text: `${selected(state.steps.length === 5)}Steps all`,
          callback_data: `${BOT_CALLBACK_PREFIX}steps:all`,
        },
      ],
      [
        {
          text: `${selected(state.scope === "single")}Single ICAO`,
          callback_data: `${BOT_CALLBACK_PREFIX}scope:single`,
        },
        {
          text: `${selected(state.scope === "country")}One country`,
          callback_data: `${BOT_CALLBACK_PREFIX}scope:country`,
        },
        {
          text: `${selected(state.scope === "all")}All airports`,
          callback_data: `${BOT_CALLBACK_PREFIX}scope:all`,
        },
      ],
      [
        {
          text: "Set ICAO",
          callback_data: `${BOT_CALLBACK_PREFIX}input:icao`,
        },
      ],
      [
        {
          text: "Set country",
          callback_data: `${BOT_CALLBACK_PREFIX}input:country`,
        },
        {
          text: "Clear input mode",
          callback_data: `${BOT_CALLBACK_PREFIX}input:clear`,
        },
      ],
      [
        {
          text: "Start run",
          callback_data: `${BOT_CALLBACK_PREFIX}run`,
        },
        {
          text: "Help",
          callback_data: `${BOT_CALLBACK_PREFIX}help`,
        },
      ],
    ],
  };
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
    "/debug (opens button menu)",
    "/debug EFJO",
    "/debug icaos=EFJO,EHAM steps=aip,pdf,gen source=ead-only concurrency=1",
    "/debug all=true source=ead-only steps=aip,pdf,gen concurrency=1",
    "/debug qty=100 random=true countries=Finland,Sweden source=ead-only",
    "",
    "Options: icaos, all, qty, random, countries, steps, source(auto|ead-only), concurrency",
  ].join("\n");
}

async function telegramApi(method: string, payload: Record<string, unknown>): Promise<void> {
  const botToken = getBotToken();
  if (!botToken) return;
  const url = `https://api.telegram.org/bot${botToken}/${method}`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}

async function sendTelegramMessage(
  chatId: string,
  text: string,
  replyMarkup?: Record<string, unknown>
): Promise<void> {
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function editTelegramMessage(
  chatId: string,
  messageId: number,
  text: string,
  replyMarkup?: Record<string, unknown>
): Promise<void> {
  await telegramApi("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function answerCallbackQuery(id: string, text?: string): Promise<void> {
  await telegramApi("answerCallbackQuery", {
    callback_query_id: id,
    ...(text ? { text } : {}),
  });
}

async function openMenu(chatId: string): Promise<void> {
  const state = getOrCreateState(chatId);
  await sendTelegramMessage(chatId, stateSummary(state), menuKeyboard(state));
}

async function runWithState(chatId: string, state: DebugUiState): Promise<string> {
  if (state.scope === "single" && !/^[A-Z0-9]{4}$/.test(state.icao)) {
    throw new Error("Single ICAO scope requires a valid ICAO. Tap 'Set ICAO' and send one.");
  }
  if (state.scope === "country" && !state.country.trim()) {
    throw new Error("Country scope requires a country name. Tap 'Set country' and send one.");
  }
  const icaos = state.scope === "single" ? [state.icao] : [];
  const countries = state.scope === "country" ? [state.country] : [];
  const run = await startDebugRun(
    {
      quantity: state.quantity,
      allAirports: state.scope === "all" || state.scope === "country",
      randomSample: false,
      countries,
      excludeCaptchaCountries: false,
      concurrency: state.concurrency,
      steps: state.steps,
      icaos,
      sourceMode: state.sourceMode,
    },
    process.env.DEBUG_RUNNER_BASE_URL || "http://127.0.0.1:3000"
  );
  state.awaitingInput = null;
  state.lastRunId = run.id;
  return run.id;
}

function applyCallbackAction(state: DebugUiState, action: string): "run" | "help" | "updated" | "unknown" {
  if (action === "run") return "run";
  if (action === "help") return "help";
  if (action.startsWith("src:")) {
    state.sourceMode = action.slice(4) === "auto" ? "auto" : "ead-only";
    return "updated";
  }
  if (action.startsWith("cc:")) {
    const c = Number(action.slice(3));
    state.concurrency = c === 3 ? 3 : 1;
    return "updated";
  }
  if (action.startsWith("steps:")) {
    const mode = action.slice(6);
    state.steps = mode === "all" ? ["aip", "notam", "weather", "pdf", "gen"] : [...DEFAULT_STEPS];
    return "updated";
  }
  if (action.startsWith("scope:")) {
    const scope = action.slice(6);
    state.scope = scope === "all" ? "all" : scope === "country" ? "country" : "single";
    state.awaitingInput = null;
    return "updated";
  }
  if (action === "input:icao") {
    state.awaitingInput = "icao";
    state.scope = "single";
    return "updated";
  }
  if (action === "input:country") {
    state.awaitingInput = "country";
    state.scope = "country";
    return "updated";
  }
  if (action === "input:clear") {
    state.awaitingInput = null;
    return "updated";
  }
  return "unknown";
}

async function applyAwaitingInput(
  chatId: string,
  text: string
): Promise<{ consumed: boolean; response?: NextResponse }> {
  const state = getOrCreateState(chatId);
  if (!state.awaitingInput) return { consumed: false };
  if (text.startsWith("/")) return { consumed: false };

  if (state.awaitingInput === "icao") {
    const icao = text.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(icao)) {
      await sendTelegramMessage(chatId, "Invalid ICAO. Send exactly 4 letters/numbers, e.g. EFJO.");
      return { consumed: true, response: NextResponse.json({ ok: true, ignored: "invalid icao" }) };
    }
    state.icao = icao;
    state.scope = "single";
    state.awaitingInput = null;
    await sendTelegramMessage(chatId, `ICAO set to ${icao}.`);
    await openMenu(chatId);
    return { consumed: true, response: NextResponse.json({ ok: true, updated: "icao" }) };
  }

  const country = text.trim();
  if (!country) {
    await sendTelegramMessage(chatId, "Country cannot be empty. Example: Finland");
    return { consumed: true, response: NextResponse.json({ ok: true, ignored: "empty country" }) };
  }
  state.country = country;
  state.scope = "country";
  state.awaitingInput = null;
  await sendTelegramMessage(chatId, `Country set to ${country}.`);
  await openMenu(chatId);
  return { consumed: true, response: NextResponse.json({ ok: true, updated: "country" }) };
}

async function handleDebugMessage(chatId: string, text: string): Promise<NextResponse> {
  if (!isChatAllowed(chatId)) {
    await sendTelegramMessage(chatId, "This chat is not allowed to start debug runs.");
    return NextResponse.json({ ok: true, ignored: "chat not allowed" });
  }

  const cmd = parseDebugCommand(text);
  if (!cmd) {
    return NextResponse.json({ ok: true, ignored: "not a /debug command" });
  }

  if (cmd.helpOnly) {
    await openMenu(chatId);
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

async function handleCallbackQuery(update: TelegramUpdate): Promise<NextResponse> {
  const cb = update.callback_query;
  const callbackId = String(cb?.id || "").trim();
  const action = String(cb?.data || "").trim();
  const chatId = String(cb?.message?.chat?.id || "").trim();
  const messageId = Number(cb?.message?.message_id || 0);

  if (!callbackId || !chatId || !action.startsWith(BOT_CALLBACK_PREFIX)) {
    return NextResponse.json({ ok: true, ignored: "not a supported callback" });
  }

  if (!isChatAllowed(chatId)) {
    await answerCallbackQuery(callbackId, "Chat not allowed");
    return NextResponse.json({ ok: true, ignored: "chat not allowed" });
  }

  const state = getOrCreateState(chatId);
  const result = applyCallbackAction(state, action.slice(BOT_CALLBACK_PREFIX.length));

  if (result === "help") {
    await answerCallbackQuery(callbackId);
    await sendTelegramMessage(chatId, helpText());
    if (messageId > 0) {
      await editTelegramMessage(chatId, messageId, stateSummary(state), menuKeyboard(state));
    }
    return NextResponse.json({ ok: true, help: true });
  }

  if (result === "updated" && action.includes("input:")) {
    if (action.endsWith("icao")) {
      await answerCallbackQuery(callbackId, "Send ICAO in next message");
      await sendTelegramMessage(chatId, "Send ICAO now (example: EFJO).");
    } else if (action.endsWith("country")) {
      await answerCallbackQuery(callbackId, "Send country in next message");
      await sendTelegramMessage(chatId, "Send country name now (example: Finland).");
    } else {
      await answerCallbackQuery(callbackId, "Input mode cleared");
    }
  }

  if (result === "run") {
    try {
      const runId = await runWithState(chatId, state);
      await answerCallbackQuery(callbackId, `Started ${runId}`);
      if (messageId > 0) {
        await editTelegramMessage(chatId, messageId, stateSummary(state), menuKeyboard(state));
      }
      await sendTelegramMessage(chatId, `Started debug run: ${runId}`);
      return NextResponse.json({ ok: true, runId });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      await answerCallbackQuery(callbackId, "Run failed");
      await sendTelegramMessage(chatId, `Failed to start debug run: ${msg}`);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  if (!(result === "updated" && action.includes("input:"))) {
    await answerCallbackQuery(callbackId, result === "updated" ? "Updated" : "Unknown action");
  }
  if (messageId > 0) {
    await editTelegramMessage(chatId, messageId, stateSummary(state), menuKeyboard(state));
  }
  return NextResponse.json({ ok: true, action: result });
}

export async function POST(request: NextRequest) {
  if (!isWebhookSecretValid(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const update = (await request.json().catch(() => ({}))) as TelegramUpdate;
  if (update.callback_query) {
    return handleCallbackQuery(update);
  }

  const chatId = String(update?.message?.chat?.id || "").trim();
  const text = String(update?.message?.text || "").trim();
  if (!chatId || !text) return NextResponse.json({ ok: true, ignored: "missing chat/text" });
  const pending = await applyAwaitingInput(chatId, text);
  if (pending.consumed) return pending.response ?? NextResponse.json({ ok: true, consumed: true });
  return handleDebugMessage(chatId, text);
}

