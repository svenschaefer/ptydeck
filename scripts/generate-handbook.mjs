import { logScriptStart } from "./lib/script-log.mjs";
import { generateHandbook, getRepositoryRoot } from "./lib/handbook.mjs";

logScriptStart("scripts/generate-handbook.mjs");

const rootDir = getRepositoryRoot();
const check = process.argv.includes("--check");
const result = await generateHandbook(rootDir, { check });

if (check) {
  if (!result.isClean) {
    console.error("Handbook artifacts are out of date:");
    for (const filePath of result.changedPaths) {
      console.error(`- ${filePath}`);
    }
    process.exitCode = 1;
  } else {
    console.log("Handbook artifacts are current.");
  }
} else if (result.wrotePaths.length === 0) {
  console.log("Handbook artifacts already current.");
} else {
  console.log(`Updated ${result.wrotePaths.length} handbook artifact(s).`);
  for (const filePath of result.wrotePaths) {
    console.log(`- ${filePath}`);
  }
}
