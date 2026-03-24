import test from "node:test";
import assert from "node:assert/strict";

import { createCommandEngine, createCustomCommandRegistry } from "../src/public/command-engine.js";

function createEngineFixture() {
  const registry = createCustomCommandRegistry();
  registry.upsert({ name: "Docu", content: "sync docs" });
  const sessions = [
    { id: "sess-1-abcdef", name: "alpha", deckId: "default", tags: ["ops"] },
    { id: "sess-2-fedcba", name: "beta", deckId: "ops", tags: ["ops", "db"] }
  ];
  const decks = [
    { id: "default", name: "Default" },
    { id: "ops", name: "Ops" }
  ];
  return createCommandEngine({
    systemSlashCommands: ["switch", "custom", "deck", "move"],
    listCustomCommands: () => registry.list(),
    getSessions: () => sessions,
    getDecks: () => decks,
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
    mode: "block"
  });
});

test("command engine exposes autocomplete context for slash commands", () => {
  const engine = createEngineFixture();
  const context = engine.parseAutocompleteContext("/custom sh");
  assert.equal(context.replacePrefix, "/custom ");
  assert.deepEqual(context.matches, ["show"]);
});
