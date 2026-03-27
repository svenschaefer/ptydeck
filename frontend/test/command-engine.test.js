import test from "node:test";
import assert from "node:assert/strict";

import { createCommandEngine, createCustomCommandRegistry } from "../src/public/command-engine.js";

function createEngineFixture() {
  const registry = createCustomCommandRegistry();
  registry.upsert({ name: "Docu", content: "sync docs" });
  const sessions = [
    {
      id: "sess-1-abcdef",
      name: "alpha",
      deckId: "default",
      tags: ["ops"],
      cwd: "~/alpha",
      startCwd: "~/alpha",
      env: { APP_ENV: "dev" }
    },
    {
      id: "sess-2-fedcba",
      name: "beta",
      deckId: "ops",
      tags: ["ops", "db"],
      cwd: "~/ops",
      startCwd: "~/ops",
      env: { APP_ENV: "prod", DB_HOST: "db" }
    }
  ];
  const decks = [
    { id: "default", name: "Default" },
    { id: "ops", name: "Ops" }
  ];
  const themes = [
    { id: "ptydeck-default", name: "Ptydeck Default", category: "dark" },
    { id: "solarized-light", name: "Solarized Light", category: "light" }
  ];
  return createCommandEngine({
    systemSlashCommands: ["switch", "custom", "deck", "move", "settings", "filter", "close", "restart"],
    listCustomCommands: () => registry.list(),
    getSessions: () => sessions,
    getDecks: () => decks,
    getThemes: () => themes,
    getActiveDeckId: () => "default",
    getActiveSessionId: () => "sess-1-abcdef",
    getSessionToken: (id) => (id === "sess-1-abcdef" ? "1" : "2"),
    getSessionDisplayName: (session) => session.name,
    getSessionDeckId: (session) => session.deckId
  });
}

test("command engine resolves quick-switch targets across sessions and decks", () => {
  const engine = createEngineFixture();
  assert.equal(engine.resolveQuickSwitchTarget("1").target?.id, "sess-1-abcdef");
  assert.equal(engine.resolveQuickSwitchTarget("deck:ops").target?.id, "ops");
  assert.match(engine.formatQuickSwitchPreview("deck:ops"), /Target deck|Already active/);
});

test("command engine parses custom block definitions", () => {
  const engine = createEngineFixture();
  const parsed = engine.parseCustomDefinition("/custom go\n---\necho hi\n---");
  assert.deepEqual(parsed, {
    ok: true,
    name: "go",
    content: "echo hi",
    mode: "block",
    kind: "plain",
    templateVariables: [],
    parameters: []
  });
});

test("command engine parses explicit template custom definitions and invocations", () => {
  const engine = createEngineFixture();

  const parsed = engine.parseCustomDefinition("/custom template deploy echo {{param:env}} {{var:session.cwd}}");
  assert.deepEqual(parsed, {
    ok: true,
    name: "deploy",
    content: "echo {{param:env}} {{var:session.cwd}}",
    mode: "inline",
    kind: "template",
    templateVariables: ["session.cwd"],
    parameters: ["env"]
  });

  assert.deepEqual(
    engine.parseCustomInvocation("/deploy env=prod -- ops::beta", {
      name: "deploy",
      kind: "template",
      content: "echo {{param:env}} {{var:session.cwd}}",
      templateVariables: ["session.cwd"]
    }),
    {
      ok: true,
      parameterAssignments: { env: "prod" },
      targetSelector: "ops::beta"
    }
  );
});

test("command engine derives schema-backed size and custom usage errors", () => {
  const engine = createEngineFixture();

  assert.deepEqual(engine.parseSizeCommandArgs([], 80, 20), {
    ok: false,
    error: "Usage: /size <cols> <rows> | /size c<cols> | /size r<rows>"
  });

  assert.deepEqual(engine.parseCustomDefinition("/custom"), {
    ok: false,
    error: "Usage: /custom <name> <text> | /custom template <name> <text> | /custom <name> + block | /custom template <name> + block"
  });
});

test("command engine exposes declarative autocomplete context for slash commands", () => {
  const engine = createEngineFixture();
  const context = engine.parseAutocompleteContext("/custom sh");
  assert.equal(context.replacePrefix, "/custom ");
  assert.deepEqual(
    context.matches.map((candidate) => candidate.insertText),
    ["show"]
  );
  assert.equal(context.matches[0].kind, "subcommand");
  assert.match(context.matches[0].description, /show custom command/i);
});

test("command engine resolves declarative provider autocomplete for command arguments", () => {
  const engine = createEngineFixture();

  const moveContext = engine.parseAutocompleteContext("/move 1 o");
  assert.equal(moveContext.replacePrefix, "/move 1 ");
  assert.equal(moveContext.matches[0].insertText, "ops");
  assert.equal(moveContext.matches[0].kind, "deck");

  const settingsContext = engine.parseAutocompleteContext("/settings show ");
  assert.equal(settingsContext.replacePrefix, "/settings show ");
  assert.deepEqual(
    settingsContext.matches.map((candidate) => candidate.insertText),
    ["1", "alpha", "sess-1-abcdef", "2", "beta", "sess-2-fedcba"]
  );
});

test("command engine returns structured quick-switch autocomplete candidates", () => {
  const engine = createEngineFixture();

  const quickSwitchContext = engine.parseAutocompleteContext(">");
  assert.equal(quickSwitchContext.replacePrefix, ">");
  assert.ok(quickSwitchContext.matches.some((candidate) => candidate.kind === "session"));
  assert.ok(quickSwitchContext.matches.some((candidate) => candidate.kind === "deck"));

  const crossDeckContext = engine.parseAutocompleteContext(">ops::");
  assert.equal(crossDeckContext.replacePrefix, ">ops::");
  assert.deepEqual(
    crossDeckContext.matches.map((candidate) => candidate.insertText),
    ["2", "beta", "sess-2-fedcba"]
  );
});
