import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { join } from "path";

const SCRIPT = join(process.cwd(), "scripts", "ead-download-aip-pdf.mjs");
const TIMEOUT_MS = 90_000;

export async function POST(request: NextRequest) {
  let icao: string;
  try {
    const body = await request.json().catch(() => ({}));
    icao = (body.icao ?? request.nextUrl.searchParams.get("icao") ?? "").toString().trim().toUpperCase();
  } catch {
    icao = request.nextUrl.searchParams.get("icao")?.trim().toUpperCase() ?? "";
  }
  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return NextResponse.json({ ok: false, error: "Valid 4-letter ICAO code required" }, { status: 400 });
  }

  return new Promise<NextResponse>((resolve) => {
    const env = { ...process.env };
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
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        const lastLine = stdout.trim().split("\n").pop() ?? "";
        resolve(NextResponse.json({ ok: true, icao, message: "PDF downloaded", path: lastLine || stdout.trim() }));
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
