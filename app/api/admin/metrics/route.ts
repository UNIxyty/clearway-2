import { NextResponse } from "next/server";
import os from "os";
import { readFile, readdir } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { requireAdmin } from "@/lib/admin-auth";

// Server metrics collector (platform audit §6.5). Admin-only.
//
// Reads docker stats/ps, /proc/loadavg, /sys/class/hwmon (k10temp), free -b
// and df on the Linux host; every section degrades gracefully (available:false
// plus an error string) on macOS dev or inside a container without a docker
// socket. The two live audit findings — a disk at >=80% and any container not
// running / unhealthy — MUST surface in `warnings`.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const execFileAsync = promisify(execFile);
const EXEC_OPTS = { timeout: 20_000, maxBuffer: 4 * 1024 * 1024 } as const;
const DISK_WARN_PCT = 80;

type SectionMeta = { available: boolean; error?: string; source?: string };

type DiskInfo = { mount: string; sizeB: number; usedB: number; availB: number; pct: number };
type ContainerInfo = {
  name: string;
  state: string;
  status: string;
  cpuPct: number | null;
  memB: number | null;
};

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function authDisabledForTesting(): boolean {
  return String(process.env.DISABLE_AUTH_FOR_TESTING || "").toLowerCase() === "true";
}

// ── CPU load ────────────────────────────────────────────────────────────────

async function collectCpu(): Promise<{ cpu: { load1: number; load5: number; cores: number } | null; meta: SectionMeta }> {
  const cores = os.cpus().length;
  try {
    // Linux: /proc/loadavg → "0.31 0.28 0.24 1/850 12345"
    const raw = await readFile("/proc/loadavg", "utf8");
    const parts = raw.trim().split(/\s+/);
    const load1 = Number(parts[0]);
    const load5 = Number(parts[1]);
    if (Number.isFinite(load1) && Number.isFinite(load5)) {
      return { cpu: { load1, load5, cores }, meta: { available: true, source: "/proc/loadavg" } };
    }
    throw new Error(`unparseable /proc/loadavg: ${raw.slice(0, 40)}`);
  } catch {
    // macOS dev (or exotic container): os.loadavg() still works everywhere.
    const [load1, load5] = os.loadavg();
    if (Number.isFinite(load1) && Number.isFinite(load5) && (load1 > 0 || load5 > 0)) {
      return { cpu: { load1, load5, cores }, meta: { available: true, source: "os.loadavg" } };
    }
    return { cpu: null, meta: { available: false, error: "no load average source available" } };
  }
}

// ── CPU temperature (k10temp via hwmon) ─────────────────────────────────────

async function collectTemp(): Promise<{ tempC: number | null; meta: SectionMeta }> {
  const hwmonRoot = "/sys/class/hwmon";
  try {
    const entries = await readdir(hwmonRoot);
    for (const entry of entries) {
      const base = `${hwmonRoot}/${entry}`;
      let name = "";
      try {
        name = (await readFile(`${base}/name`, "utf8")).trim();
      } catch {
        continue;
      }
      if (name !== "k10temp") continue;

      const files = await readdir(base);
      const inputs = files.filter((f) => /^temp\d+_input$/.test(f)).sort();
      let chosen: string | null = null;
      for (const input of inputs) {
        let label = "";
        try {
          label = (await readFile(`${base}/${input.replace("_input", "_label")}`, "utf8")).trim();
        } catch {
          /* unlabeled sensor */
        }
        if (/^tctl$/i.test(label)) {
          chosen = input; // Tctl is the canonical k10temp CPU reading
          break;
        }
        if (!chosen) chosen = input;
      }
      if (!chosen) continue;
      const milli = parseInt(await readFile(`${base}/${chosen}`, "utf8"), 10);
      if (Number.isFinite(milli)) {
        return { tempC: Math.round(milli / 100) / 10, meta: { available: true, source: `k10temp ${chosen}` } };
      }
    }
    return { tempC: null, meta: { available: false, error: "no k10temp sensor found under /sys/class/hwmon" } };
  } catch (e) {
    return { tempC: null, meta: { available: false, error: `hwmon unavailable: ${errorMessage(e)}` } };
  }
}

// ── RAM ─────────────────────────────────────────────────────────────────────

async function collectRam(): Promise<{ ram: { totalB: number; availB: number } | null; meta: SectionMeta }> {
  try {
    const { stdout } = await execFileAsync("free", ["-b"], EXEC_OPTS);
    // "Mem:  total  used  free  shared  buff/cache  available"
    const memLine = stdout.split("\n").find((line) => line.startsWith("Mem:"));
    if (!memLine) throw new Error("no Mem: line in free -b output");
    const cols = memLine.trim().split(/\s+/);
    const totalB = Number(cols[1]);
    const availB = Number(cols[cols.length - 1]);
    if (!Number.isFinite(totalB) || !Number.isFinite(availB)) throw new Error("unparseable free -b output");
    return { ram: { totalB, availB }, meta: { available: true, source: "free -b" } };
  } catch {
    // macOS has no `free`; os.freemem underestimates "available" but beats nothing.
    return {
      ram: { totalB: os.totalmem(), availB: os.freemem() },
      meta: { available: true, source: "os.totalmem/os.freemem (free -b unavailable)" },
    };
  }
}

// ── Disks ───────────────────────────────────────────────────────────────────

const SKIP_DF_SOURCES = new Set(["tmpfs", "devtmpfs", "devfs", "shm", "none", "udev", "map", "auto_home"]);

async function collectDisks(): Promise<{ disks: DiskInfo[]; meta: SectionMeta }> {
  // GNU df (Linux host / containers).
  try {
    const { stdout } = await execFileAsync(
      "df",
      ["-B1", "--output=source,target,size,used,avail", "-x", "tmpfs", "-x", "devtmpfs"],
      EXEC_OPTS,
    );
    const disks = parseDfOutput(stdout, 1, "gnu");
    return { disks, meta: { available: true, source: "df -B1" } };
  } catch {
    /* fall through to POSIX df (macOS) */
  }
  try {
    const { stdout } = await execFileAsync("df", ["-kP"], EXEC_OPTS);
    const disks = parseDfOutput(stdout, 1024, "posix");
    return { disks, meta: { available: true, source: "df -kP" } };
  } catch (e) {
    return { disks: [], meta: { available: false, error: `df unavailable: ${errorMessage(e)}` } };
  }
}

function parseDfOutput(stdout: string, blockBytes: number, flavor: "gnu" | "posix"): DiskInfo[] {
  const lines = stdout.trim().split("\n").slice(1); // drop header
  const byMount = new Map<string, DiskInfo>();
  for (const line of lines) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 5) continue;
    let source: string, mount: string, sizeB: number, usedB: number, availB: number;
    if (flavor === "gnu") {
      // source target size used avail
      source = cols[0];
      mount = cols.slice(1, cols.length - 3).join(" ");
      sizeB = Number(cols[cols.length - 3]) * blockBytes;
      usedB = Number(cols[cols.length - 2]) * blockBytes;
      availB = Number(cols[cols.length - 1]) * blockBytes;
    } else {
      // Filesystem 1024-blocks Used Available Capacity Mounted-on
      if (cols.length < 6) continue;
      source = cols[0];
      sizeB = Number(cols[1]) * blockBytes;
      usedB = Number(cols[2]) * blockBytes;
      availB = Number(cols[3]) * blockBytes;
      mount = cols.slice(5).join(" ");
    }
    if (!mount || !Number.isFinite(sizeB) || !Number.isFinite(usedB) || sizeB <= 0) continue;
    if (SKIP_DF_SOURCES.has(source)) continue;
    if (flavor === "posix" && !source.startsWith("/dev")) continue; // macOS: skip devfs/map/autofs noise
    const pct = Math.round((usedB / sizeB) * 100);
    byMount.set(mount, { mount, sizeB, usedB, availB: Number.isFinite(availB) ? availB : 0, pct });
  }
  return [...byMount.values()].sort((a, b) => a.mount.localeCompare(b.mount));
}

// ── Containers (docker ps + docker stats) ───────────────────────────────────

function parseDockerBytes(input: string): number | null {
  // e.g. "99.3MiB", "616KiB", "1.207GiB", "0B"
  const m = /^([\d.]+)\s*([A-Za-z]+)?$/.exec(input.trim());
  if (!m) return null;
  const value = parseFloat(m[1]);
  if (!Number.isFinite(value)) return null;
  const unit = (m[2] || "B").toLowerCase();
  const factors: Record<string, number> = {
    b: 1,
    kb: 1e3,
    mb: 1e6,
    gb: 1e9,
    tb: 1e12,
    kib: 1024,
    mib: 1024 ** 2,
    gib: 1024 ** 3,
    tib: 1024 ** 4,
  };
  const factor = factors[unit];
  return factor ? Math.round(value * factor) : null;
}

function parseJsonLines(stdout: string): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") rows.push(parsed as Record<string, unknown>);
    } catch {
      /* skip malformed line */
    }
  }
  return rows;
}

async function collectContainers(): Promise<{ containers: ContainerInfo[]; meta: SectionMeta }> {
  let psRows: Record<string, unknown>[];
  try {
    // -a so exited/created containers surface too (a stopped worker is a finding).
    const { stdout } = await execFileAsync("docker", ["ps", "-a", "--format", "{{json .}}"], EXEC_OPTS);
    psRows = parseJsonLines(stdout);
  } catch (e) {
    return {
      containers: [],
      meta: { available: false, error: `docker unavailable: ${errorMessage(e).slice(0, 200)}` },
    };
  }

  const statsByName = new Map<string, { cpuPct: number | null; memB: number | null }>();
  try {
    const { stdout } = await execFileAsync("docker", ["stats", "--no-stream", "--format", "{{json .}}"], EXEC_OPTS);
    for (const row of parseJsonLines(stdout)) {
      const name = String(row.Name ?? "");
      if (!name) continue;
      const cpuRaw = String(row.CPUPerc ?? "").replace("%", "").trim();
      const cpuPct = cpuRaw ? Number(cpuRaw) : NaN;
      const memUsage = String(row.MemUsage ?? "").split("/")[0] ?? "";
      statsByName.set(name, {
        cpuPct: Number.isFinite(cpuPct) ? cpuPct : null,
        memB: parseDockerBytes(memUsage),
      });
    }
  } catch {
    // stats can fail independently (e.g. permission); keep ps data with null usage.
  }

  const containers: ContainerInfo[] = psRows.map((row) => {
    const name = String(row.Names ?? row.Name ?? "");
    return {
      name,
      state: String(row.State ?? "").toLowerCase(),
      status: String(row.Status ?? ""),
      cpuPct: statsByName.get(name)?.cpuPct ?? null,
      memB: statsByName.get(name)?.memB ?? null,
    };
  });
  containers.sort((a, b) => a.name.localeCompare(b.name));
  return { containers, meta: { available: true, source: "docker ps -a + docker stats" } };
}

// ── Route ───────────────────────────────────────────────────────────────────

export async function GET() {
  if (!authDisabledForTesting()) {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
  }

  const [cpuRes, tempRes, ramRes, disksRes, containersRes] = await Promise.all([
    collectCpu(),
    collectTemp(),
    collectRam(),
    collectDisks(),
    collectContainers(),
  ]);

  const warnings: string[] = [];
  for (const disk of disksRes.disks) {
    if (disk.pct >= DISK_WARN_PCT) {
      const freeGb = (disk.availB / 1024 ** 3).toFixed(1);
      warnings.push(`Disk ${disk.mount} is ${disk.pct}% full (${freeGb} GB free)`);
    }
  }
  for (const c of containersRes.containers) {
    if (c.state !== "running") {
      warnings.push(`Container ${c.name} is not running: ${c.state} (${c.status})`);
    } else if (/unhealthy/i.test(c.status)) {
      warnings.push(`Container ${c.name} is unhealthy (${c.status})`);
    }
  }

  return NextResponse.json({
    time: new Date().toISOString(),
    cpu: cpuRes.cpu,
    tempC: tempRes.tempC,
    ram: ramRes.ram,
    disks: disksRes.disks,
    containers: containersRes.containers,
    sections: {
      cpu: cpuRes.meta,
      temp: tempRes.meta,
      ram: ramRes.meta,
      disks: disksRes.meta,
      containers: containersRes.meta,
    },
    warnings,
  });
}
