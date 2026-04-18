import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTelegramCommandCatalog,
  normalizeTelegramCommandCatalog,
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

test("telegram command catalog normalization filters invalid entries and falls back cleanly", () => {
  const catalog = normalizeTelegramCommandCatalog({
    entries: [
      { telegramCommand: "deploy", action: "custom", customCommandName: "deploy", description: "Deploy now" },
      { telegramCommand: "bad-command", action: "custom", customCommandName: "bad", description: "Bad" },
      { telegramCommand: "status", action: "custom", description: "Missing custom name" }
    ],
    skippedCommands: [{ name: " deploy ", reason: " telegram_name_invalid " }, null]
  });

  assert.deepEqual(catalog.entries, [
    {
      telegramCommand: "deploy",
      action: "custom",
      customCommandName: "deploy",
      description: "Deploy now"
    }
  ]);
  assert.deepEqual(catalog.publishedCommands, [{ command: "deploy", description: "Deploy now" }]);
  assert.deepEqual(catalog.skippedCommands, [{ name: "deploy", reason: "telegram_name_invalid" }]);
  assert.deepEqual(normalizeTelegramCommandCatalog(null).entries, []);
  assert.equal(resolveTelegramCommandCatalogEntry(catalog, "missing"), null);
});

test("telegram command catalog enforces publish limits and records overflow deterministically", () => {
  const catalog = buildTelegramCommandCatalog({
    commandLimit: 1,
    customCommands: [
      { name: "alpha", content: "echo ALPHA\n", scope: "project", kind: "plain" },
      { name: "beta", content: "echo BETA\n", scope: "project", kind: "plain" }
    ]
  });

  assert.deepEqual(catalog.publishedCommands, [{ command: "alpha", description: "project custom command; plain; /alpha" }]);
  assert.deepEqual(catalog.skippedCommands, [{ name: "beta", reason: "telegram_command_limit" }]);
});
