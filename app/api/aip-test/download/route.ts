import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { join } from "path";

const SCRIPT = join(process.cwd(), "scripts", "ead-download-aip-pdf.mjs");
const CROP_SCRIPT = join(process.cwd(), "scripts", "extract-pdf-pages.py");
const TIMEOUT_MS = 90_000;
const CROP_PAGE_LIMIT = 5;

function decodePasswordEnc(enc: string): string {
  try {
    return Buffer.from(enc, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function runProcess(
  command: string,
  args: string[],
  timeoutMs = TIMEOUT_MS
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Process timed out: ${command}`));
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || stdout || `${command} exited ${code}`));
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function getPdfPageCount(pdfPath: string): Promise<number> {
  const py = [
    "-c",
    "from pypdf import PdfReader; import sys; print(len(PdfReader(sys.argv[1]).pages))",
    pdfPath,
  ];
  const { stdout } = await runProcess("python3", py, 30_000);
  const n = Number(stdout.trim());
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Unable to read page count for ${pdfPath}`);
  }
  return n;
}

async function cropPdfToMaxPages(
  pdfPath: string,
  maxPages = CROP_PAGE_LIMIT
): Promise<{ originalPages: number; usedPages: number; cropped: boolean }> {
  const pageCount = await getPdfPageCount(pdfPath);
  if (pageCount <= maxPages) {
    return { originalPages: pageCount, usedPages: pageCount, cropped: false };
  }

  await runProcess(
    "python3",
    [CROP_SCRIPT, pdfPath, "--pages", `1-${maxPages}`, "--overwrite"],
    90_000
  );
  const croppedCount = await getPdfPageCount(pdfPath);
  return {
    originalPages: pageCount,
    usedPages: croppedCount,
    cropped: true,
  };
}

export async function POST(request: NextRequest) {
  let icao: string;
  let eadUser: string | undefined;
  let eadPassword: string | undefined;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      icao?: string;
      eadUser?: string;
      eadPassword?: string;
      eadPasswordEnc?: string;
    };
    icao = (body.icao ?? request.nextUrl.searchParams.get("icao") ?? "").toString().trim().toUpperCase();
    eadUser = body.eadUser?.trim();
    if (body.eadPassword?.trim()) eadPassword = body.eadPassword.trim();
    else if (body.eadPasswordEnc?.trim()) eadPassword = decodePasswordEnc(body.eadPasswordEnc.trim());
  } catch {
    icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  }
  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return NextResponse.json({ ok: false, error: "Valid 4-letter ICAO code required" }, { status: 400 });
  }

  const env = { ...process.env };
  if (eadUser && eadPassword) {
    env.EAD_USER = eadUser;
    env.EAD_PASSWORD = eadPassword;
    delete env.EAD_PASSWORD_ENC;
  }

  return new Promise<NextResponse>((resolve) => {
    const child = spawn("node", [SCRIPT, icao], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => { stdout += d; });
    child.stderr?.on("data", (d) => { stderr += d; });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(
        NextResponse.json({
          ok: false,
          error: "Download timed out (Playwright may need a display; run locally or on EC2 with xvfb).",
          stderr: stderr.slice(-500),
        }, { status: 504 })
      );
    }, TIMEOUT_MS);
    child.on("close", async (code) => {
      clearTimeout(timer);
      if (code === 0) {
        const lastLine = stdout.trim().split("\n").pop()?.trim() ?? "";
        const pdfPath = lastLine || stdout.trim();
        if (!pdfPath) {
          resolve(
            NextResponse.json(
              { ok: false, error: "Download succeeded but output path was not returned." },
              { status: 502 }
            )
          );
          return;
        }
        try {
          const crop = await cropPdfToMaxPages(pdfPath, CROP_PAGE_LIMIT);
          resolve(
            NextResponse.json({
              ok: true,
              icao,
              message: crop.cropped
                ? `PDF downloaded and cropped to first ${crop.usedPages} pages (from ${crop.originalPages}).`
                : "PDF downloaded",
              path: pdfPath,
              cropped: crop.cropped,
              originalPages: crop.originalPages,
              extractedPages: crop.usedPages,
            })
          );
        } catch (cropErr) {
          resolve(
            NextResponse.json({
              ok: true,
              icao,
              message:
                "PDF downloaded, but automatic 5-page crop failed. Extraction can still proceed.",
              path: pdfPath,
              cropError:
                cropErr instanceof Error ? cropErr.message : "Unknown crop error",
            })
          );
        }
      } else {
        resolve(
          NextResponse.json({
            ok: false,
            error: `Script exited ${code}. Ensure EAD_USER and EAD_PASSWORD_ENC are set (e.g. in .env).`,
            stderr: stderr.slice(-800),
          }, { status: 502 })
        );
      }
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve(NextResponse.json({ ok: false, error: err.message }, { status: 500 }));
    });
  });
}
