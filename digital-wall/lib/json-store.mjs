// Tiny local-JSON persistence, following the same pattern as
// data/aircraft-visibility.json in operators-store.mjs: one JSON file per
// concern under digital-wall/data/. Used for display config (clocks),
// Important entries, alert rules and alert findings.

import fs from "node:fs/promises";
import path from "node:path";

export class JsonFileStore {
  constructor(fileName, defaultValue) {
    this.filePath = path.resolve(process.cwd(), "data", fileName);
    this.defaultValue = defaultValue;
    this.cache = undefined;
    this.writeQueue = Promise.resolve();
  }

  async read() {
    if (this.cache !== undefined) return this.cache;
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      this.cache = JSON.parse(raw);
    } catch {
      this.cache = structuredClone(this.defaultValue);
    }
    return this.cache;
  }

  async write(value) {
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
