#!/usr/bin/env bash
set -euo pipefail

PROFILE_FILE="${RUNTIME_PROFILE_FILE:-security/runtime-profile.json}"

node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";
import path from "node:path";

function fail(message) {
  console.error(`[runtime-profile] ${message}`);
  process.exit(1);
}

function isWithinRoot(candidatePath, rootPath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

const cwd = process.cwd();
const profileFile = process.env.RUNTIME_PROFILE_FILE || "security/runtime-profile.json";
let profile;
try {
  profile = JSON.parse(readFileSync(profileFile, "utf8"));
} catch (error) {
  fail(`failed to read profile '${profileFile}': ${error.message}`);
}

if (!profile || typeof profile !== "object") {
  fail("profile must be a JSON object.");
}
if (!profile.identity || profile.identity.requireNonRoot !== true) {
  fail("profile.identity.requireNonRoot must be true.");
}
if (!profile.filesystem || !Array.isArray(profile.filesystem.allowedWriteRoots)) {
  fail("profile.filesystem.allowedWriteRoots must be defined.");
}
if (!profile.network || !profile.network.ingress) {
  fail("profile.network.ingress must be defined.");
}

const backendPort = Number(process.env.PORT || profile.network.ingress.backendPort || 18080);
const frontendPort = Number(process.env.FRONTEND_PORT || profile.network.ingress.frontendPort || 18081);
if (!Number.isInteger(backendPort) || backendPort < 1024 || backendPort > 65535) {
  fail(`backend port must be in non-privileged range 1024-65535, got '${backendPort}'.`);
}
if (!Number.isInteger(frontendPort) || frontendPort < 1024 || frontendPort > 65535) {
  fail(`frontend port must be in non-privileged range 1024-65535, got '${frontendPort}'.`);
}

if (typeof process.getuid === "function" && process.getuid() === 0) {
  fail("runtime is running as root; least-privilege profile requires non-root execution.");
}

const defaultDataPath = profile.filesystem.defaultDataPath || "./backend/data/sessions.json";
const dataPath = path.resolve(cwd, process.env.DATA_PATH || defaultDataPath);
const allowedWriteRoots = profile.filesystem.allowedWriteRoots.map((root) => path.resolve(cwd, root));

const dataPathAllowed = allowedWriteRoots.some((root) => isWithinRoot(dataPath, root));
if (!dataPathAllowed) {
  fail(`DATA_PATH '${dataPath}' is outside allowedWriteRoots.`);
}

if (profile.network.egress?.mode !== "deny-by-default") {
  fail("profile.network.egress.mode must be 'deny-by-default'.");
}

console.log(`[runtime-profile] profile: ${profileFile}`);
console.log(`[runtime-profile] backendPort=${backendPort} frontendPort=${frontendPort}`);
console.log(`[runtime-profile] dataPath=${dataPath}`);
console.log("[runtime-profile] least-privilege baseline check passed.");
NODE
