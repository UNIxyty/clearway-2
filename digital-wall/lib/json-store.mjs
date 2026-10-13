// Tiny local-JSON persistence, following the same pattern as
// data/aircraft-visibility.json in operators-store.mjs: one JSON file per
// concern under digital-wall/data/. Used for display config (clocks),
// Important entries, alert rules and alert findings.

import fs from "node:fs/promises";
import path from "node:path";

// data/portal/ is the one part of the wall's data the portal can read: docker-compose mounts only this folder into the
// portal (read-only), for the dashboard changelog. Only files the changelog needs go in it — never device sign-ins,
// tokens or webhook registrations, which stay in data/ where the portal cannot see them.
export const PORTAL_SHARED = "portal";

export class JsonFileStore {
  /**
   * @param fileName  path under data/, e.g. "caa.json" or `${PORTAL_SHARED}/important.json`
   * @param options.movedFrom  where the file used to be under data/; it is moved to fileName once, on first use
   */
  constructor(fileName, defaultValue, { movedFrom = null } = {}) {
    this.filePath = path.resolve(process.cwd(), "data", fileName);
    this.oldPath = movedFrom ? path.resolve(process.cwd(), "data", movedFrom) : null;
    this.defaultValue = defaultValue;
    this.cache = undefined;
    this.writeQueue = Promise.resolve();
    this.moved = null;
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

  async read() {
    if (this.cache !== undefined) return this.cache;
    await this.moveOnce();
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
