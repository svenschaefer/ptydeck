import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTelegramCommandCatalog,
  resolveTelegramCommandCatalogEntry
} from "../src/telegram-command-surface.js";

test("telegram command catalog publishes built-ins plus deterministic custom command mappings", () => {
  const catalog = buildTelegramCommandCatalog({
    customCommands: [
      { name: "doc-u", content: "echo DOCU\n", scope: "project", kind: "plain" },
      { name: "doc_u", content: "echo DOCU_U\n", scope: "project", kind: "plain" },
      { name: "7zip", content: "echo ZIP\n", scope: "global", kind: "plain" },
      { name: "deploy", content: "echo {{param:env}}\n", scope: "project", kind: "template", templateVariables: [] },
      { name: "deploy", content: "echo {{param:env}}\n", scope: "session", sessionId: "s-1", kind: "template", templateVariables: [] }
    ]
  });

  assert.deepEqual(
    catalog.publishedCommands.slice(0, 4).map((entry) => entry.command),
    ["status", "stop", "retry", "replay"]
  );
  assert.equal(resolveTelegramCommandCatalogEntry(catalog, "doc_du")?.customCommandName, "doc-u");
  assert.equal(resolveTelegramCommandCatalogEntry(catalog, "doc__u")?.customCommandName, "doc_u");
  assert.equal(resolveTelegramCommandCatalogEntry(catalog, "c_7zip")?.customCommandName, "7zip");
  assert.equal(resolveTelegramCommandCatalogEntry(catalog, "deploy")?.customCommandName, "deploy");
  assert.equal(catalog.entries.filter((entry) => entry.action === "custom" && entry.customCommandName === "deploy").length, 1);
});

test("telegram command catalog skips unmappable custom commands deterministically", () => {
  const catalog = buildTelegramCommandCatalog({
    customCommands: [
      { name: "a-------------------------------", content: "echo LONG\n", scope: "project", kind: "plain" }
    ]
  });

  assert.equal(resolveTelegramCommandCatalogEntry(catalog, "status")?.action, "status");
  assert.equal(catalog.entries.some((entry) => entry.action === "custom"), false);
  assert.deepEqual(catalog.skippedCommands, [{ name: "a-------------------------------", reason: "telegram_name_invalid" }]);
});
