import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { join } from "path";
import { existsSync } from "fs";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const SCRIPT_PATH = join(process.cwd(), "scripts", "notam-scraper.mjs");
const RUN_TIMEOUT_MS = 90_000;
const NOTAMS_BUCKET = process.env.AWS_NOTAMS_BUCKET || process.env.AWS_S3_BUCKET;
const NOTAMS_PREFIX = process.env.AWS_NOTAMS_PREFIX || "notams";

export type NotamItem = {
  location: string;
  number: string;
  class: string;
  startDateUtc: string;
  endDateUtc: string;
  condition: string;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const icao = searchParams.get("icao")?.trim().toUpperCase() ?? "";

  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return NextResponse.json(
      { error: "Valid 4-letter ICAO code required" },
      { status: 400 }
    );
  }

  if (NOTAMS_BUCKET) {
    try {
      const client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
      const key = `${NOTAMS_PREFIX}/${icao}.json`;
      const res = await client.send(
        new GetObjectCommand({ Bucket: NOTAMS_BUCKET, Key: key })
      );
      const body = await res.Body?.transformToString();
      if (body) {
        const data = JSON.parse(body) as { icao?: string; notams?: NotamItem[] };
        return NextResponse.json({
          icao: data.icao ?? icao,
          notams: data.notams ?? [],
        });
      }
    } catch (e: unknown) {
      const err = e as { name?: string; Code?: string };
      if (err?.name !== "NoSuchKey" && err?.Code !== "NoSuchKey") {
        console.error("S3 NOTAM read failed:", e);
      }
    }
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
        resolve(NextResponse.json({ icao, notams }));
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
