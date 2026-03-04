import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { join } from "path";

const SCRIPT = join(process.cwd(), "scripts", "ead-download-aip-pdf.mjs");
const TIMEOUT_MS = 90_000;

function decodePasswordEnc(enc: string): string {
  try {
    return Buffer.from(enc, "base64").toString("utf8");
  } catch {
    return "";
  }
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
