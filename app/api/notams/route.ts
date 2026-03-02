import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { join } from "path";
import { existsSync } from "fs";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const SCRIPT_PATH = join(process.cwd(), "scripts", "notam-scraper.mjs");
const RUN_TIMEOUT_MS = 90_000;
const SYNC_TIMEOUT_MS = 120_000;
const NOTAMS_BUCKET = process.env.AWS_NOTAMS_BUCKET || process.env.AWS_S3_BUCKET;
const NOTAMS_PREFIX = process.env.AWS_NOTAMS_PREFIX || "notams";
const NOTAM_SYNC_URL = process.env.NOTAM_SYNC_URL?.replace(/\/$/, ""); // base URL of EC2 sync server
const NOTAM_SYNC_SECRET = process.env.NOTAM_SYNC_SECRET ?? "";

export type NotamItem = {
  location: string;
  number: string;
  class: string;
  startDateUtc: string;
  endDateUtc: string;
  condition: string;
};

async function getFromS3(icao: string): Promise<{ icao: string; notams: NotamItem[]; updatedAt: string | null } | null> {
  if (!NOTAMS_BUCKET) return null;
  try {
    const client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
    const key = `${NOTAMS_PREFIX}/${icao}.json`;
    const res = await client.send(
      new GetObjectCommand({ Bucket: NOTAMS_BUCKET, Key: key })
    );
    const body = await res.Body?.transformToString();
    if (!body) return null;
    const data = JSON.parse(body) as { icao?: string; notams?: NotamItem[]; updatedAt?: string };
    return {
      icao: data.icao ?? icao,
      notams: data.notams ?? [],
      updatedAt: data.updatedAt ?? null,
    };
  } catch (e: unknown) {
    const err = e as { name?: string; Code?: string };
    if (err?.name !== "NoSuchKey" && err?.Code !== "NoSuchKey") {
      console.error("S3 NOTAM read failed:", e);
    }
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const icao = searchParams.get("icao")?.trim().toUpperCase() ?? "";
  const sync = searchParams.get("sync") === "1" || searchParams.get("sync") === "true";

  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return NextResponse.json(
      { error: "Valid 4-letter ICAO code required" },
      { status: 400 }
    );
  }

  // When sync=1 we must run the scraper on EC2; do not return stale S3 cache
  if (sync) {
    if (!NOTAM_SYNC_URL) {
      return NextResponse.json(
        {
          error: "Sync not configured",
          detail: "Set NOTAM_SYNC_URL in Vercel to your EC2 sync server (e.g. http://EC2-IP:3001). See scripts/NOTAM-AWS-SETUP.md Step 5b.",
        },
        { status: 503 }
      );
    }
    const syncUrl = `${NOTAM_SYNC_URL}/sync?icao=${encodeURIComponent(icao)}`;
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (NOTAM_SYNC_SECRET) headers["X-Sync-Secret"] = NOTAM_SYNC_SECRET;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
      const res = await fetch(syncUrl, { method: "GET", headers, signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = (await res.json()) as { icao?: string; notams?: NotamItem[]; updatedAt?: string };
        return NextResponse.json({
          icao: data.icao ?? icao,
          notams: data.notams ?? [],
          updatedAt: data.updatedAt ?? null,
        });
      }
      const errBody = await res.text();
      console.error("NOTAM sync failed:", res.status, errBody);
      return NextResponse.json(
        {
          error: "Sync failed",
          detail: `EC2 sync server returned ${res.status}. Ensure the sync server is running on EC2 and the scraper completes. ${errBody.slice(0, 200)}`,
        },
        { status: 502 }
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("NOTAM sync request failed:", e);
      return NextResponse.json(
        {
          error: "Sync server unreachable",
          detail: `Cannot reach EC2 sync server at NOTAM_SYNC_URL. Check: (1) Sync server is running on EC2 (node scripts/notam-sync-server.mjs). (2) EC2 security group allows inbound port 3001. (3) NOTAM_SYNC_URL is correct (http://EC2-PUBLIC-IP:3001). ${msg}`,
        },
        { status: 502 }
      );
    }
  }

  const fromS3 = await getFromS3(icao);
  if (fromS3) {
    return NextResponse.json({
      icao: fromS3.icao,
      notams: fromS3.notams,
      updatedAt: fromS3.updatedAt,
    });
  }

  if (!existsSync(SCRIPT_PATH)) {
    return NextResponse.json(
      { error: "NOTAM scraper script not found.", detail: "Run NOTAMs locally: npm run notam " + icao },
      { status: 503 }
    );
  }

  return new Promise<NextResponse>((resolve) => {
    const child = spawn(
      process.execPath,
      [SCRIPT_PATH, "--json", icao],
      {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(
        NextResponse.json(
          { error: "NOTAM search timed out. Try again or run the scraper locally." },
          { status: 504 }
        )
      );
    }, RUN_TIMEOUT_MS);

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      resolve(
        NextResponse.json(
          { error: "Failed to run NOTAM scraper.", detail: String(err.message) },
          { status: 500 }
        )
      );
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0 && !stdout) {
        resolve(
          NextResponse.json(
            {
              error: "NOTAM scraper failed.",
              detail: stderr.slice(-500) || `Exit code ${code}`,
            },
            { status: 502 }
          )
        );
        return;
      }
      try {
        const lastLine = stdout.trim().split("\n").filter(Boolean).pop() ?? "";
        const notams: NotamItem[] = JSON.parse(lastLine);
        resolve(NextResponse.json({ icao, notams, updatedAt: null }));
      } catch {
        resolve(
          NextResponse.json(
            { error: "Invalid NOTAM response.", detail: stdout.slice(-300) },
            { status: 502 }
          )
        );
      }
    });
  });
}
