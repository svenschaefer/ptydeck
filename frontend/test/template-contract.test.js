import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexHtmlPath = path.resolve(__dirname, "../src/public/index.html");

test("workspace library and session settings expose progressive-disclosure structure", () => {
  const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");
  assert.match(indexHtml, /<div class="workspace-manager-body">/);
  assert.match(indexHtml, /id="connection-profile-remote-private-key-field"/);
  assert.match(indexHtml, /id="connection-profile-runtime-secret-field"/);
  assert.match(indexHtml, /id="connection-profile-ssh-trust-probe"/);
  assert.match(indexHtml, /id="connection-profile-ssh-probe-select"/);
  assert.match(indexHtml, /id="connection-profile-ssh-trust-fingerprint"/);
  assert.match(indexHtml, /<details class="workspace-manager-advanced"/);
  assert.match(indexHtml, /<details class="session-settings-advanced">/);
});

test("session quick-send overlay keeps a minimal heading and session target context", () => {
  const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");
  assert.match(indexHtml, /<div class="session-quick-send-panel" hidden>/);
  assert.match(indexHtml, /<p class="session-quick-send-title">Send to Session<\/p>/);
  assert.match(indexHtml, /<p class="session-quick-send-target"><\/p>/);
  assert.match(indexHtml, /<div class="session-quick-send-actions"><\/div>/);
});
