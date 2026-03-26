import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const MAX_BYTES = 45 * 1024 * 1024;
const TIMEOUT_MS = 300_000;

const SCRIPT_SONNET = join(process.cwd(), "aip-meta-extractor.py");
const SCRIPT_HAIKU = join(process.cwd(), "aip-meta-extractor-haiku.py");

function isMetaCompareAllowed(request: NextRequest): boolean {
  if (process.env.ALLOW_AIP_META_COMPARE === "true") return true;
  if (process.env.NODE_ENV !== "production") return true;
  const host = (
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    ""
  ).toLowerCase();
  return (
    host.startsWith("localhost:") ||
    host === "localhost" ||
    host.startsWith("127.0.0.1")
  );
}

function safePdfName(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160);
  return base.toLowerCase().endsWith(".pdf") ? base : `${base || "upload"}.pdf`;
}

function runPython(
  script: string,
  pdfPath: string,
  outPath: string
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [script, pdfPath, "--out", outPath, "--quiet"], {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: -1, stderr: `${stderr}\n[ killed: timeout after ${TIMEOUT_MS}ms ]` });
    }, TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stderr });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export async function POST(request: NextRequest) {
  if (!isMetaCompareAllowed(request)) {
    return NextResponse.json(
      { ok: false, error: "AIP meta compare API is disabled for this deployment." },
      { status: 403 }
    );
  }

  const engine = request.nextUrl.searchParams.get("engine");
  if (engine !== "sonnet" && engine !== "haiku") {
    return NextResponse.json(
      { ok: false, error: 'Query engine must be "sonnet" or "haiku".' },
      { status: 400 }
    );
  }

  let workDir: string | null = null;
  try {
    const form = await request.formData();
    const file = form.get("pdf");
    if (!file || typeof file === "string") {
      return NextResponse.json({ ok: false, error: "Missing pdf file field." }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: `PDF too large (max ${MAX_BYTES / (1024 * 1024)} MB).` },
        { status: 400 }
      );
    }
    if (buf.slice(0, 4).toString("ascii") !== "%PDF") {
      return NextResponse.json({ ok: false, error: "File does not look like a PDF." }, { status: 400 });
    }

    workDir = await mkdtemp(join(tmpdir(), "aip-meta-compare-"));
    const pdfPath = join(workDir, safePdfName(file.name));
    const outPath = join(workDir, "result.json");
    await writeFile(pdfPath, buf);

    const script = engine === "haiku" ? SCRIPT_HAIKU : SCRIPT_SONNET;
    const { code, stderr } = await runPython(script, pdfPath, outPath);

    if (code !== 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `Python exited ${code}`,
          engine,
          stderr: stderr.slice(-4000),
        },
        { status: 502 }
      );
    }

    const raw = await readFile(outPath, "utf8");
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON from extractor.", engine, stderr: stderr.slice(-2000) },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, engine, stderr: stderr.slice(-2000), data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    if (workDir) {
      try {
        await rm(workDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}
