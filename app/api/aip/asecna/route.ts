import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getAsecnaAirportByIcao, getAsecnaData } from "@/lib/asecna-airports";
import {
  asecnaAd2AirportBasename,
  createAsecnaFetch,
  htmlUrlToPdfUrl,
  parseAsecnaCli,
  resolveAsecnaHtmlUrl,
} from "@/scripts/asecna-eaip-http.mjs";

const BUCKET = process.env.AWS_NOTAMS_BUCKET || process.env.AWS_S3_BUCKET;
const REGION = process.env.AWS_REGION || "us-east-1";
const JSON_PREFIX = "aip/asecna";
const PDF_PREFIX = "aip/asecna-pdf";

function s3() {
  return new S3Client({ region: REGION });
}

async function saveJson(icao: string, payload: { updatedAt: string }) {
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

async function readJson(icao: string): Promise<{ updatedAt: string | null } | null> {
  if (!BUCKET) return null;
  try {
    const res = await s3().send(
      new GetObjectCommand({ Bucket: BUCKET, Key: `${JSON_PREFIX}/${icao}.json` }),
    );
    const body = await res.Body?.transformToString();
    if (!body) return null;
    const json = JSON.parse(body) as { updatedAt?: string };
    return { updatedAt: json.updatedAt ?? null };
  } catch {
    return null;
  }
}

async function downloadAsecnaPdfToS3(icao: string, countryCode: string) {
  if (!BUCKET) throw new Error("S3 bucket not configured");
  const data = getAsecnaData();
  const menuBasename = data.menuBasename || "FR-menu-fr-FR.html";
  const menuDirUrl = `${new URL(data.menuUrl).origin}/html/eAIP/`;
  const htmlFile = asecnaAd2AirportBasename(countryCode, icao, menuBasename);
  const htmlUrl = resolveAsecnaHtmlUrl(htmlFile, menuDirUrl);
  const pdfUrl = htmlUrlToPdfUrl(htmlUrl);

  const cli = parseAsecnaCli(process.argv);
  const strictTls = cli.strictTls && !cli.insecureTls;
  if (cli.insecureTls) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  const http = createAsecnaFetch("API");
  const res = await http.fetchAsecna(pdfUrl, {}, { strictTls });
  if (!res.ok) throw new Error(`ASECNA PDF fetch failed: ${res.status} ${res.statusText}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  await s3().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: `${PDF_PREFIX}/${icao}.pdf`,
      Body: bytes,
      ContentType: "application/pdf",
    }),
  );
}

export async function GET(request: NextRequest) {
  const icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  const sync = request.nextUrl.searchParams.get("sync") === "1" || request.nextUrl.searchParams.get("sync") === "true";
  const stream = request.nextUrl.searchParams.get("stream") === "1" || request.nextUrl.searchParams.get("stream") === "true";
  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return NextResponse.json({ error: "Valid 4-letter ICAO required" }, { status: 400 });
  }
  const airport = getAsecnaAirportByIcao(icao);
  if (!airport) return NextResponse.json({ airports: [], updatedAt: null }, { status: 200 });

  if (!sync) {
    const meta = await readJson(icao);
    return NextResponse.json({ airports: [], updatedAt: meta?.updatedAt ?? null });
  }

  if (!stream) {
    await downloadAsecnaPdfToS3(icao, airport.countryCode);
    const updatedAt = new Date().toISOString();
    await saveJson(icao, { updatedAt });
    return NextResponse.json({ done: true, airports: [], updatedAt, pdfReady: true });
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      try {
        send({ step: "Resolving ASECNA AD 2 source…" });
        await downloadAsecnaPdfToS3(icao, airport.countryCode);
        const updatedAt = new Date().toISOString();
        await saveJson(icao, { updatedAt });
        send({ step: "ASECNA AD 2 PDF uploaded to S3." });
        send({ done: true, airports: [], updatedAt, pdfReady: true });
      } catch (err) {
        send({ error: "ASECNA sync failed", detail: err instanceof Error ? err.message : String(err) });
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
