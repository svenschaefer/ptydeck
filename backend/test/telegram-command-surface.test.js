import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTelegramCommandCatalog,
  resolveTelegramCommandCatalogEntry
} from "../src/telegram-command-surface.js";

test("telegram command catalog publishes deterministic custom command mappings only", () => {
  const catalog = buildTelegramCommandCatalog({
    customCommands: [
      { name: "doc-u", content: "echo DOCU\n", scope: "project", kind: "plain" },
      { name: "doc_u", content: "echo DOCU_U\n", scope: "project", kind: "plain" },
      { name: "status", content: "echo CUSTOM_STATUS\n", scope: "project", kind: "plain" },
      { name: "7zip", content: "echo ZIP\n", scope: "global", kind: "plain" },
      { name: "deploy", content: "echo {{param:env}}\n", scope: "project", kind: "template", templateVariables: [] },
      { name: "deploy", content: "echo {{param:env}}\n", scope: "session", sessionId: "s-1", kind: "template", templateVariables: [] }
    ]
  });

  assert.deepEqual(
    catalog.publishedCommands.map((entry) => entry.command),
    ["c_7zip", "deploy", "doc__u", "doc_du", "status"]
  );
  assert.equal(resolveTelegramCommandCatalogEntry(catalog, "status")?.customCommandName, "status");
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

  assert.equal(catalog.entries.length, 0);
  assert.equal(catalog.entries.some((entry) => entry.action === "custom"), false);
  assert.deepEqual(catalog.skippedCommands, [{ name: "a-------------------------------", reason: "telegram_name_invalid" }]);
});
