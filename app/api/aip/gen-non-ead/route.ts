import { NextRequest, NextResponse } from "next/server";
import { readJsonFromStorage, readPdfFromStorage, writeJsonToStorage } from "@/lib/aip-storage";

const PDF_PREFIX = "aip/non-ead-gen-pdf";
const JSON_PREFIX = "aip/non-ead-gen";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type GenPart = { raw: string; rewritten: string };
type GenPayload = {
  general: GenPart;
  nonScheduled: GenPart;
  privateFlights: GenPart;
  updatedAt: string;
};

function emptyPart(): GenPart {
  return { raw: "", rewritten: "" };
}

function normPart(p: unknown): GenPart {
  if (p && typeof p === "object" && "raw" in p) {
    const o = p as { raw?: string; rewritten?: string };
    return {
      raw: typeof o.raw === "string" ? o.raw : "",
      rewritten: typeof o.rewritten === "string" ? o.rewritten : o.raw ?? "",
    };
  }
  return emptyPart();
}

const NON_SCHEDULED_RE =
  /Part\s+[0-9]+\s*(?:Non[- ]scheduled|non[- ]scheduled)|^(?:Non[- ]scheduled\s+flights?|Non[- ]scheduled\s+commercial)\b|^\s*[0-9]+\s*\.?\s*Non[- ]scheduled/im;
const PRIVATE_FLIGHTS_RE =
  /Part\s+4\b|4\.\s*Private|^(?:Private\s+flights?|Private\s+aviation)\b|^\s*[0-9]+\s*\.?\s*Private\s+flights/im;

function splitGenIntoThreeParts(fullText: string) {
  if (!fullText?.trim()) return { general: "", nonScheduled: "", privateFlights: "" };
  const trimmed = fullText.trim();
  const lines = trimmed.split(/\r?\n/);
  let idxNonSched = -1;
  let idxPrivate = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (idxNonSched < 0 && NON_SCHEDULED_RE.test(line)) idxNonSched = i;
    if (idxPrivate < 0 && PRIVATE_FLIGHTS_RE.test(line)) idxPrivate = i;
  }
  const indices = [idxNonSched, idxPrivate].filter((i) => i >= 0).sort((a, b) => a - b);
  const firstIdx = indices[0];
  const secondIdx = indices[1];
  if (firstIdx === undefined) return { general: trimmed, nonScheduled: "", privateFlights: "" };
  const general = lines.slice(0, firstIdx).join("\n").trim();
  const firstBlock =
    secondIdx !== undefined
      ? lines.slice(firstIdx, secondIdx).join("\n").trim()
      : lines.slice(firstIdx).join("\n").trim();
  const secondBlock = secondIdx !== undefined ? lines.slice(secondIdx).join("\n").trim() : "";
  return {
    general,
    nonScheduled: idxNonSched === firstIdx ? firstBlock : idxNonSched === secondIdx ? secondBlock : "",
    privateFlights: idxPrivate === firstIdx ? firstBlock : idxPrivate === secondIdx ? secondBlock : "",
  };
}

async function rewriteWithAI(rawText: string, model: string, signal?: AbortSignal): Promise<string> {
  if (!rawText?.trim()) return "";
  const isOpenRouter = model.includes("/");
  const apiUrl = isOpenRouter
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
  const apiKey = isOpenRouter ? process.env.OPENROUTER_API_KEY : process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error(isOpenRouter ? "OPENROUTER_API_KEY not set" : "OPENAI_API_KEY not set");

  const res = await fetch(apiUrl, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are an aviation AIP editor. Rewrite the given AIP GEN 1.2 section into continuous prose. Preserve all regulatory information, requirements, and references. Output format: flowing paragraphs only — no section numbers (e.g. 1.1.1, 1.1.2), no headings, no bullet or numbered lists; convert lists and subsections into clear sentences and paragraphs. Keep contact details (addresses, phone, email, URLs) where they are part of procedures. Output must be in English only (translate source text when needed). Output only the rewritten text, no preamble or commentary.",
        },
        { role: "user", content: rawText.slice(0, 120000) },
      ],
      temperature: 0.2,
      max_tokens: 4096,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AI API ${res.status}: ${err.slice(0, 500)}`);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content ?? "").trim();
}

async function getCachedJson(prefix: string): Promise<GenPayload | null> {
  try {
    const data = await readJsonFromStorage<{
      general?: unknown;
      nonScheduled?: unknown;
      privateFlights?: unknown;
      updatedAt?: string;
    }>(`${JSON_PREFIX}/${prefix}.json`);
    if (!data) return null;
    if (data.general && typeof data.general === "object") {
      return {
        general: normPart(data.general),
        nonScheduled: normPart(data.nonScheduled),
        privateFlights: normPart(data.privateFlights),
        updatedAt: data.updatedAt ?? new Date().toISOString(),
      };
    }
    return null;
  } catch (e: unknown) {
    console.error("non-EAD GEN cache read failed:", e);
    return null;
  }
}

async function getPdfText(prefix: string): Promise<string | null> {
  try {
    const bytes = await readPdfFromStorage(`${PDF_PREFIX}/${prefix}-GEN-1.2.pdf`);
    if (!bytes) return null;
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: Buffer.from(bytes) });
    const result = await parser.getText();
    await parser.destroy?.();
    return typeof result?.text === "string"
      ? result.text
      : (result?.pages && result.pages.map((p) => p.text).join("\n")) || null;
  } catch (e: unknown) {
    console.error("non-EAD GEN PDF read failed:", e);
    return null;
  }
}

async function saveJsonToStorage(prefix: string, payload: GenPayload) {
  await writeJsonToStorage(`${JSON_PREFIX}/${prefix}.json`, payload);
}

export async function GET(request: NextRequest) {
  const prefix = (
    request.nextUrl.searchParams.get("prefix")?.trim().toUpperCase() ||
    (request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "").slice(0, 2)
  );

  if (!/^[A-Z]{2}$/.test(prefix)) {
    return NextResponse.json(
      { error: "Valid 2-letter prefix or icao required" },
      { status: 400 }
    );
  }

  const cached = await getCachedJson(prefix);
  if (cached) {
    return NextResponse.json(cached);
  }

  const pdfText = await getPdfText(prefix);
  if (!pdfText) {
    return NextResponse.json({
      general: emptyPart(),
      nonScheduled: emptyPart(),
      privateFlights: emptyPart(),
      updatedAt: null,
    });
  }

  const { general: generalRaw, nonScheduled: nonSchedRaw, privateFlights: privateRaw } =
    splitGenIntoThreeParts(pdfText);

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  try {
    const hasKey = model.includes("/")
      ? !!process.env.OPENROUTER_API_KEY
      : !!process.env.OPENAI_API_KEY;

    const generalRewritten = generalRaw && hasKey ? await rewriteWithAI(generalRaw, model, request.signal) : generalRaw;
    const nonSchedRewritten = nonSchedRaw && hasKey ? await rewriteWithAI(nonSchedRaw, model, request.signal) : nonSchedRaw;
    const privateRewritten = privateRaw && hasKey ? await rewriteWithAI(privateRaw, model, request.signal) : privateRaw;

    const payload: GenPayload = {
      general: { raw: generalRaw, rewritten: generalRewritten || generalRaw },
      nonScheduled: { raw: nonSchedRaw, rewritten: nonSchedRewritten || nonSchedRaw },
      privateFlights: { raw: privateRaw, rewritten: privateRewritten || privateRaw },
      updatedAt: new Date().toISOString(),
    };

    await saveJsonToStorage(prefix, payload);

    return NextResponse.json(payload);
  } catch (e) {
    if (request.signal.aborted) {
      return NextResponse.json({ error: "Request cancelled by client" }, { status: 499 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Non-EAD GEN AI rewrite failed:", msg);
    return NextResponse.json(
      { error: "GEN AI rewrite failed", detail: msg },
      { status: 502 }
    );
  }
}
