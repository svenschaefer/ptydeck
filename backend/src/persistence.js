import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class JsonPersistence {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async load() {
    try {
      const raw = await readFile(this.filePath, "utf8");
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
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(sessions, null, 2), "utf8");
  }
}
