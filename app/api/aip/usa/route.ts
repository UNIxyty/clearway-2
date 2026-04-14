import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getUsaStateByIcao, isUsaAipIcao } from "@/lib/usa-aip";

const BUCKET = process.env.AWS_NOTAMS_BUCKET || process.env.AWS_S3_BUCKET;
const PDF_PREFIX = "aip/usa-pdf";
const JSON_PREFIX = "aip/usa";

type ExtractedAirportRow = {
  "Airport Code": string;
  "Airport Name": string;
  "AD2.2 Types of Traffic Permitted": string;
  "AD2.2 Remarks": string;
  "AD2.2 AD Operator": string;
  "AD2.2 Address": string;
  "AD2.2 Telephone": string;
  "AD2.2 Telefax": string;
  "AD2.2 E-mail": string;
  "AD2.2 AFS": string;
  "AD2.2 Website": string;
  "AD2.3 AD Operator": string;
  "AD 2.3 Customs and Immigration": string;
  "AD2.3 ATS": string;
  "AD2.3 Remarks": string;
  "AD2.6 AD category for fire fighting": string;
  "AD2.12 Runway Number": string;
  "AD2.12 Runway Dimensions": string;
};

function s3() {
  return new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
}

function clip(text: string, maxChars = 18000): string {
  const trimmed = String(text || "").trim();
  if (!trimmed) return "";
  const ad2Start = trimmed.search(/\b(AD\s*2\.1|AERODROME\s+LOCATION)\b/i);
  const runway = trimmed.search(/\b(AD\s*2\.12|RUNWAY\s+PHYSICAL\s+CHARACTERISTICS)\b/i);
  const start = ad2Start >= 0 ? ad2Start : 0;
  const end = runway > start ? runway + 1200 : start + maxChars;
  return trimmed.slice(start, Math.min(trimmed.length, end)).slice(0, maxChars);
}

function normalizeExtracted(parsed: Partial<ExtractedAirportRow>, icao: string): ExtractedAirportRow {
  const get = (k: keyof ExtractedAirportRow) => String(parsed[k] || "").trim() || "NIL";
  return {
    "Airport Code": String(parsed["Airport Code"] || icao).trim().toUpperCase() || icao,
    "Airport Name": get("Airport Name"),
    "AD2.2 Types of Traffic Permitted": get("AD2.2 Types of Traffic Permitted"),
    "AD2.2 Remarks": get("AD2.2 Remarks"),
    "AD2.2 AD Operator": get("AD2.2 AD Operator"),
    "AD2.2 Address": get("AD2.2 Address"),
    "AD2.2 Telephone": get("AD2.2 Telephone"),
    "AD2.2 Telefax": get("AD2.2 Telefax"),
    "AD2.2 E-mail": get("AD2.2 E-mail"),
    "AD2.2 AFS": get("AD2.2 AFS"),
    "AD2.2 Website": get("AD2.2 Website"),
    "AD2.3 AD Operator": get("AD2.3 AD Operator"),
    "AD 2.3 Customs and Immigration": get("AD 2.3 Customs and Immigration"),
    "AD2.3 ATS": get("AD2.3 ATS"),
    "AD2.3 Remarks": get("AD2.3 Remarks"),
    "AD2.6 AD category for fire fighting": get("AD2.6 AD category for fire fighting"),
    "AD2.12 Runway Number": get("AD2.12 Runway Number"),
    "AD2.12 Runway Dimensions": get("AD2.12 Runway Dimensions"),
  };
}

async function getPdfBytes(icao: string): Promise<Uint8Array | null> {
  if (!BUCKET) return null;
  try {
    const res = await s3().send(
      new GetObjectCommand({ Bucket: BUCKET, Key: `${PDF_PREFIX}/${icao}.pdf` }),
    );
    const bytes = await res.Body?.transformToByteArray();
    return bytes ? new Uint8Array(bytes) : null;
  } catch {
    return null;
  }
}

async function hasPdf(icao: string): Promise<boolean> {
  if (!BUCKET) return false;
  try {
    await s3().send(
      new HeadObjectCommand({ Bucket: BUCKET, Key: `${PDF_PREFIX}/${icao}.pdf` }),
    );
    return true;
  } catch {
    return false;
  }
}

async function getCachedJson(icao: string): Promise<{ airports: unknown[]; updatedAt: string | null } | null> {
  if (!BUCKET) return null;
  try {
    const res = await s3().send(
      new GetObjectCommand({ Bucket: BUCKET, Key: `${JSON_PREFIX}/${icao}.json` }),
    );
    const body = await res.Body?.transformToString();
    if (!body) return null;
    const data = JSON.parse(body) as { airports?: unknown[]; updatedAt?: string | null };
    return {
      airports: Array.isArray(data.airports) ? data.airports : [],
      updatedAt: data.updatedAt ?? null,
    };
  } catch {
    return null;
  }
}

async function putCachedJson(icao: string, payload: { airports: unknown[]; updatedAt: string }) {
  if (!BUCKET) return;
  await s3().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: `${JSON_PREFIX}/${icao}.json`,
      Body: JSON.stringify(payload),
      ContentType: "application/json",
    }),
  );
}

async function aiExtractAirport(icao: string, text: string, signal?: AbortSignal): Promise<ExtractedAirportRow> {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const isOpenRouter = model.includes("/");
  const apiUrl = isOpenRouter
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
  const apiKey = isOpenRouter ? process.env.OPENROUTER_API_KEY : process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error(isOpenRouter ? "OPENROUTER_API_KEY not set" : "OPENAI_API_KEY not set");

  const state = getUsaStateByIcao(icao) || "Unknown state";
  const prompt = `Extract one airport record from this USA AIP AD 2 text.\nICAO: ${icao}\nState: ${state}\n\nReturn ONLY valid JSON with keys:\n` +
    `["Airport Code","Airport Name","AD2.2 Types of Traffic Permitted","AD2.2 Remarks","AD2.2 AD Operator","AD2.2 Address","AD2.2 Telephone","AD2.2 Telefax","AD2.2 E-mail","AD2.2 AFS","AD2.2 Website","AD2.3 AD Operator","AD 2.3 Customs and Immigration","AD2.3 ATS","AD2.3 Remarks","AD2.6 AD category for fire fighting","AD2.12 Runway Number","AD2.12 Runway Dimensions"]\n` +
    `Use "NIL" when missing. Keep concise.`;

  const res = await fetch(apiUrl, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You extract structured airport fields from FAA AIP AD 2 text. Output only a JSON object. No markdown.",
        },
        { role: "user", content: `${prompt}\n\n${clip(text)}` },
      ],
      temperature: 0.1,
      max_tokens: 1400,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AI API ${res.status}: ${err.slice(0, 500)}`);
  }
  const data = await res.json();
  const content = String(data?.choices?.[0]?.message?.content || "").trim();
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI response did not contain JSON");
  const parsed = JSON.parse(jsonMatch[0]) as Partial<ExtractedAirportRow>;
  return normalizeExtracted(parsed, icao);
}

async function extractFromPdfBytes(icao: string, bytes: Uint8Array, signal?: AbortSignal): Promise<ExtractedAirportRow> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: Buffer.from(bytes) });
  const result = await parser.getText();
  await parser.destroy?.();
  const text =
    typeof result?.text === "string"
      ? result.text
      : (result?.pages && result.pages.map((p) => p.text).join("\n")) || "";
  if (!text.trim()) throw new Error("PDF text extraction returned empty text");
  return aiExtractAirport(icao, text, signal);
}

export async function GET(request: NextRequest) {
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  const sync = request.nextUrl.searchParams.get("sync") === "1" || request.nextUrl.searchParams.get("sync") === "true";
  const stream = request.nextUrl.searchParams.get("stream") === "1" || request.nextUrl.searchParams.get("stream") === "true";
  const extract = !(request.nextUrl.searchParams.get("extract") === "0" || request.nextUrl.searchParams.get("extract") === "false");

  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return NextResponse.json({ error: "Valid 4-letter ICAO required" }, { status: 400 });
  }
  if (!isUsaAipIcao(icao)) {
    return NextResponse.json({ airports: [], updatedAt: null }, { status: 200 });
  }

  if (!sync) {
    const fromS3 = await getCachedJson(icao);
    if (fromS3 && fromS3.airports.length > 0) {
      return NextResponse.json({ airports: fromS3.airports, updatedAt: fromS3.updatedAt });
    }
    return NextResponse.json({ airports: [], updatedAt: null });
  }

  if (!BUCKET) {
    return NextResponse.json({ error: "S3 not configured", detail: "Set AWS_S3_BUCKET (or AWS_NOTAMS_BUCKET)." }, { status: 503 });
  }

  if (!extract) {
    const exists = await hasPdf(icao);
    if (!exists) {
      return NextResponse.json(
        { error: "USA AD2 PDF not found in S3", detail: `Upload ${icao}.pdf to s3://${BUCKET}/${PDF_PREFIX}/` },
        { status: 404 },
      );
    }
    const updatedAt = new Date().toISOString();
    await putCachedJson(icao, { airports: [], updatedAt });
    return NextResponse.json({ done: true, airports: [], updatedAt, pdfReady: true });
  }

  if (!stream) {
    const bytes = await getPdfBytes(icao);
    if (!bytes) {
      return NextResponse.json(
        { error: "USA AD2 PDF not found in S3", detail: `Upload ${icao}.pdf to s3://${BUCKET}/${PDF_PREFIX}/` },
        { status: 404 },
      );
    }
    try {
      const row = await extractFromPdfBytes(icao, bytes, request.signal);
      const updatedAt = new Date().toISOString();
      await putCachedJson(icao, { airports: [row], updatedAt });
      return NextResponse.json({ airports: [row], updatedAt, pdfReady: true });
    } catch (err) {
      return NextResponse.json(
        { error: "USA AI extraction failed", detail: err instanceof Error ? err.message : String(err) },
        { status: 502 },
      );
    }
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      try {
        send({ step: "Loading USA AD 2 PDF from S3…" });
        const bytes = await getPdfBytes(icao);
        if (!bytes) {
          send({
            error: "USA AD2 PDF not found in S3",
            detail: `Upload ${icao}.pdf to s3://${BUCKET}/${PDF_PREFIX}/`,
          });
          return;
        }
        send({ step: "Extracting PDF text…" });
        const row = await extractFromPdfBytes(icao, bytes, request.signal);
        const updatedAt = new Date().toISOString();
        await putCachedJson(icao, { airports: [row], updatedAt });
        send({ step: "USA AI extraction complete." });
        send({ done: true, airports: [row], updatedAt, pdfReady: true });
      } catch (err) {
        send({
          error: "USA AI extraction failed",
          detail: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
