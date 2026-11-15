// Tiny local-JSON persistence, following the same pattern as
// data/aircraft-visibility.json in operators-store.mjs: one JSON file per
// concern under digital-wall/data/. Used for display config (clocks),
// Important entries, alert rules and alert findings.

import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";

// data/portal/ is the one part of the wall's data the portal can read: docker-compose mounts only this folder into the
// portal (read-only), for the dashboard changelog. Only files the changelog needs go in it — never device sign-ins,
// tokens or webhook registrations, which stay in data/ where the portal cannot see them.
export const PORTAL_SHARED = "portal";

export class JsonFileStore {
  /**
   * @param fileName  path under data/, e.g. "caa.json" or `${PORTAL_SHARED}/important.json`
   * @param options.movedFrom  where the file used to be under data/; it is moved to fileName once, on first use
   * @param options.seedFrom   a starting copy, relative to the wall's folder (e.g. "seeds/caa-data.json"): copied to
   *                           fileName once, when there is no file yet. Live data is never in git (2026-11-15: caa.json
   *                           and important.json were, so a deploy could have clashed with ops' edits); the starting
   *                           copy is, so a new checkout (a rig box, a new server) still starts with the entries.
   */
  constructor(fileName, defaultValue, { movedFrom = null, seedFrom = null } = {}) {
    this.filePath = path.resolve(process.cwd(), "data", fileName);
    this.oldPath = movedFrom ? path.resolve(process.cwd(), "data", movedFrom) : null;
    this.seedPath = seedFrom ? path.resolve(process.cwd(), seedFrom) : null;
    this.defaultValue = defaultValue;
    this.cache = undefined;
    this.writeQueue = Promise.resolve();
    this.moved = null;
    this.seeded = null;
  }

  // Move the file from its old place once (same folder tree, so a rename: atomic, nothing lost). If both exist, the
  // new one wins and the old one is left alone.
  moveOnce() {
    if (!this.oldPath) return Promise.resolve();
    if (!this.moved) this.moved = (async () => {
      try { await fs.access(this.filePath); return; } catch { /* not there yet */ }
      try { await fs.access(this.oldPath); } catch { return; }
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.rename(this.oldPath, this.filePath);
      console.log(`[json-store] moved data/${path.relative(path.resolve(process.cwd(), "data"), this.oldPath)} to data/${path.relative(path.resolve(process.cwd(), "data"), this.filePath)}`);
    })().catch((e) => console.warn(`[json-store] could not move ${this.oldPath}: ${e.message}`));
    return this.moved;
  }

  // The starting copy, once: only when neither the file nor its old place exists. COPYFILE_EXCL: never over a file.
  seedOnce() {
    if (!this.seedPath) return Promise.resolve();
    if (!this.seeded) this.seeded = (async () => {
      await this.moveOnce();
      try { await fs.access(this.filePath); return; } catch { /* no live file yet */ }
      try { await fs.access(this.seedPath); } catch { return; }
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.copyFile(this.seedPath, this.filePath, fsConstants.COPYFILE_EXCL);
      console.log(`[json-store] started data/${path.relative(path.resolve(process.cwd(), "data"), this.filePath)} from ${path.relative(process.cwd(), this.seedPath)}`);
    })().catch((e) => console.warn(`[json-store] could not start ${this.filePath} from its seed: ${e.message}`));
    return this.seeded;
  }

  async read() {
    if (this.cache !== undefined) return this.cache;
    await this.moveOnce();
    await this.seedOnce();
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      this.cache = JSON.parse(raw);
    } catch {
      this.cache = structuredClone(this.defaultValue);
    }
    return this.cache;
  }

  async write(value) {
    await this.moveOnce();
    await this.seedOnce();
    this.cache = value;
    // Serialize writes so concurrent updates can't interleave partial files.
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const tmpPath = `${this.filePath}.tmp`;
      await fs.writeFile(tmpPath, JSON.stringify(value, null, 2), "utf-8");
      await fs.rename(tmpPath, this.filePath);
    });
    await this.writeQueue;
    return value;
  }

  async update(mutator) {
    const current = await this.read();
    const next = await mutator(structuredClone(current));
    return this.write(next);
  }
}
