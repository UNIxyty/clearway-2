import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { join } from "path";

const SCRIPT = join(process.cwd(), "scripts", "rus_aip_download_by_icao.py");
const TIMEOUT_MS = 120_000;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { icao?: string };
  const icao = (body.icao ?? "").toString().trim().toUpperCase();

  if (!/^[A-Z]{4}$/.test(icao)) {
    return NextResponse.json(
      { ok: false, error: "Valid 4-letter ICAO is required" },
      { status: 400 }
    );
  }

  return new Promise<NextResponse>((resolve) => {
    const child = spawn(
      "python3",
      [SCRIPT, "--icao", icao],
      { cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "pipe"] }
    );

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
      resolve(
        NextResponse.json(
          { ok: false, error: "Download timed out", stderr: stderr.slice(-600) },
          { status: 504 }
        )
      );
    }, TIMEOUT_MS);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve(
          NextResponse.json(
            {
              ok: false,
              error: `Script exited ${code}`,
              stderr: stderr.slice(-1200),
              stdout: stdout.slice(-1200),
            },
            { status: 502 }
          )
        );
        return;
      }

      try {
        const summary = JSON.parse(stdout) as {
          run_dir?: string;
          airport?: {
            saved_to?: string;
            download_ok?: boolean;
            error?: string | null;
          };
          gen_1_2?: {
            saved_to?: string;
            download_ok?: boolean;
            error?: string | null;
          };
        };
        resolve(NextResponse.json({ ok: true, icao, summary }));
      } catch {
        resolve(
          NextResponse.json(
            {
              ok: false,
              error: "Could not parse script output",
              stdout: stdout.slice(-1200),
            },
            { status: 500 }
          )
        );
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve(
        NextResponse.json({ ok: false, error: err.message }, { status: 500 })
      );
    });
  });
}
