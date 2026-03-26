import test from "node:test";
import assert from "node:assert/strict";

import {
  createCommandHelpText,
  createSlashCommandRegistry,
  createSlashCommandSchema,
  getSlashCommandUsage
} from "../src/public/command-schema.js";

test("command schema exposes declarative command metadata and distinct help/usage surfaces", () => {
  const schema = createSlashCommandSchema(["deck", "swap", "settings", "help"]);
  const deck = schema.find((entry) => entry.insertText === "deck");
  const swap = schema.find((entry) => entry.insertText === "swap");
  const settings = schema.find((entry) => entry.insertText === "settings");

  assert.ok(deck);
  assert.ok(swap);
  assert.ok(settings);
  assert.equal(deck.summary, "/deck list|new|rename|switch|delete");
  assert.deepEqual(
    swap.args,
    [{ provider: "session-selector", optional: false }, { provider: "session-selector", optional: false }]
  );
  assert.deepEqual(deck.subcommands.switch.args, [{ provider: "deck-selector", optional: false }]);
  assert.equal(settings.subcommands.show.args[0].provider, "session-selector");
  assert.equal(getSlashCommandUsage("deck"), "/deck list | /deck new <name> | /deck rename <name> | /deck rename <deckSelector> <name> | /deck switch <deckSelector> | /deck delete [deckSelector] [force]");
  assert.equal(getSlashCommandUsage("swap"), "/swap <selectorA> <selectorB>");
});

test("command schema formats command help text from declarative command summaries", () => {
  const helpText = createCommandHelpText(["new", "deck", "swap", "custom", "help"]);
  assert.match(helpText, /^Commands: /);
  assert.match(helpText, /\/new \[shell\]/);
  assert.match(helpText, /\/deck list\|new\|rename\|switch\|delete/);
  assert.match(helpText, /\/swap <selectorA> <selectorB>/);
  assert.match(helpText, /\/custom <name> <text>, \/custom <name> \+ block/);
  assert.match(helpText, />selector/);
});

test("command schema registry resolves declarative command definitions by name", () => {
  const registry = createSlashCommandRegistry(["deck", "settings", "help"]);
  assert.equal(registry.get("deck")?.insertText, "deck");
  assert.equal(registry.get("settings")?.subcommands?.apply?.args?.[0]?.provider, "session-selector");
  assert.equal(registry.get("unknown"), null);
});
