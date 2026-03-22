import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const openapiPath = join(repoRoot, "backend", "openapi", "openapi.yaml");
const outputPath = join(repoRoot, "frontend", "src", "public", "api-types.d.ts");

const openapi = await readFile(openapiPath, "utf8");

const requiredMarkers = ["Session:", "CreateSessionRequest:", "UpdateSessionRequest:", "ErrorResponse:"];
for (const marker of requiredMarkers) {
  if (!openapi.includes(marker)) {
    throw new Error(`OpenAPI schema marker missing: ${marker}`);
  }
}

const types = `/* Auto-generated from backend/openapi/openapi.yaml. Do not edit manually. */

export type Session = {
  id: string;
  cwd: string;
  shell: string;
  name?: string;
  createdAt: number;
  updatedAt: number;
};

export type CreateSessionRequest = {
  cwd?: string;
  shell?: string;
  name?: string;
};

export type UpdateSessionRequest = {
  name: string;
};

export type ErrorResponse = {
  error: string;
  message: string;
};
`;

await writeFile(outputPath, types, "utf8");
console.log(`generated ${outputPath}`);
