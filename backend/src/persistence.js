import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class JsonPersistence {
  constructor(
    filePath,
    { mkdirFn = mkdir, readFileFn = readFile, writeFileFn = writeFile, renameFn = rename, unlinkFn = unlink } = {}
  ) {
    this.filePath = filePath;
    this.mkdirFn = mkdirFn;
    this.readFileFn = readFileFn;
    this.writeFileFn = writeFileFn;
    this.renameFn = renameFn;
    this.unlinkFn = unlinkFn;
  }

  async load() {
    try {
      const raw = await this.readFileFn(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed;
    } catch (err) {
      if (err && typeof err === "object" && err.code === "ENOENT") {
        return [];
      }
      throw err;
    }
  }

  async save(sessions) {
    await this.mkdirFn(dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const payload = JSON.stringify(sessions, null, 2);
    try {
      await this.writeFileFn(tmpPath, payload, "utf8");
      await this.renameFn(tmpPath, this.filePath);
    } catch (err) {
      try {
        await this.unlinkFn(tmpPath);
      } catch {
        // Ignore temp-file cleanup errors.
      }
      throw err;
    }
  }
}
