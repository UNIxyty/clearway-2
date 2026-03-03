import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { join } from "path";

const SCRIPT_REGEX = join(process.cwd(), "scripts", "ead-extract-aip-from-pdf.mjs");
const SCRIPT_AI = join(process.cwd(), "scripts", "ead-extract-aip-from-pdf-ai.mjs");
const TIMEOUT_MS = 120_000;

export async function POST(request: NextRequest) {
  const useAi = request.nextUrl.searchParams.get("useAi") === "1" || request.nextUrl.searchParams.get("useAi") === "true";
  const script = useAi ? SCRIPT_AI : SCRIPT_REGEX;

  return new Promise<NextResponse>((resolve) => {
    const env = { ...process.env };
    const child = spawn("node", [script], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => { stdout += d; });
    child.stderr?.on("data", (d) => { stderr += d; });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(
        NextResponse.json({
          ok: false,
          error: "Extract timed out.",
          stderr: stderr.slice(-500),
        }, { status: 504 })
      );
    }, TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        try {
          const data = JSON.parse(stdout.trim()) as { airports?: unknown[]; source?: string };
          resolve(NextResponse.json({ ok: true, airports: data.airports ?? [], source: data.source }));
        } catch {
          resolve(NextResponse.json({ ok: true, raw: stdout.slice(-2000) }));
        }
      } else {
        resolve(
          NextResponse.json({
            ok: false,
            error: useAi ? "AI extract failed. Check OPENAI_API_KEY in .env." : "Extract failed.",
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
