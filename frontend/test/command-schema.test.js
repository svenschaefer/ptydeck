import test from "node:test";
import assert from "node:assert/strict";

import {
  createCommandHelpText,
  createCommandTopicHelpText,
  createSlashCommandRegistry,
  createSlashCommandSchema,
  getSlashCommandUsage
} from "../src/public/command-schema.js";

test("command schema exposes declarative command metadata and distinct help/usage surfaces", () => {
  const schema = createSlashCommandSchema(["deck", "swap", "note", "layout", "workspace", "broadcast", "replay", "settings", "help"]);
  const deck = schema.find((entry) => entry.insertText === "deck");
  const swap = schema.find((entry) => entry.insertText === "swap");
  const note = schema.find((entry) => entry.insertText === "note");
  const layout = schema.find((entry) => entry.insertText === "layout");
  const workspace = schema.find((entry) => entry.insertText === "workspace");
  const broadcast = schema.find((entry) => entry.insertText === "broadcast");
  const replay = schema.find((entry) => entry.insertText === "replay");
  const settings = schema.find((entry) => entry.insertText === "settings");

  assert.ok(deck);
  assert.ok(swap);
  assert.ok(note);
  assert.ok(layout);
  assert.ok(workspace);
  assert.ok(broadcast);
  assert.ok(replay);
  assert.ok(settings);
  assert.equal(deck.summary, "/deck list|new|rename|switch|delete");
  assert.equal(layout.summary, "/layout list | /layout save <name> | /layout apply <profile> | /layout rename <profile> <name> | /layout delete <profile>");
  assert.equal(workspace.summary, "/workspace list | /workspace save <name> | /workspace apply <preset> | /workspace rename <preset> <name> | /workspace delete <preset>");
  assert.equal(broadcast.summary, "/broadcast status | /broadcast off | /broadcast group [group]");
  assert.deepEqual(
    swap.args,
    [{ provider: "session-selector", optional: false }, { provider: "session-selector", optional: false }]
  );
  assert.equal(note.args[0].provider, "session-selector");
  assert.deepEqual(deck.subcommands.switch.args, [{ provider: "deck-selector", optional: false }]);
  assert.deepEqual(layout.subcommands.apply.usage, ["/layout apply <profile>"]);
  assert.deepEqual(layout.subcommands.save.usage, ["/layout save <name>"]);
  assert.equal(replay.subcommands.view.args[0].provider, "session-selector");
  assert.equal(replay.subcommands.export.args[0].provider, "session-selector");
  assert.equal(settings.subcommands.show.args[0].provider, "session-selector");
  assert.equal(getSlashCommandUsage("deck"), "/deck list | /deck new <name> | /deck rename <name> | /deck rename <deckSelector> <name> | /deck switch <deckSelector> | /deck delete [deckSelector] [force]");
  assert.equal(getSlashCommandUsage("swap"), "/swap <selectorA> <selectorB>");
  assert.equal(getSlashCommandUsage("note"), "/note <selector|active> [text...]");
  assert.equal(getSlashCommandUsage("layout"), "/layout list | /layout save <name> | /layout apply <profile> | /layout rename <profile> <name> | /layout delete <profile>");
  assert.equal(getSlashCommandUsage("workspace"), "/workspace list | /workspace save <name> | /workspace apply <preset> | /workspace rename <preset> <name> | /workspace delete <preset>");
  assert.equal(getSlashCommandUsage("broadcast"), "/broadcast status | /broadcast off | /broadcast group [group]");
  assert.equal(getSlashCommandUsage("replay"), "/replay view [selector|active] | /replay export [selector|active] | /replay copy [selector|active]");
});

test("command schema formats command help text from declarative command summaries", () => {
  const helpText = createCommandHelpText(["new", "deck", "swap", "note", "layout", "workspace", "broadcast", "replay", "custom", "help"]);
  assert.match(helpText, /^Commands: /);
  assert.equal(
    helpText,
    "Commands: @ > / new deck swap note layout workspace broadcast replay custom help"
  );
});

test("command schema formats topic help text for commands and subcommands", () => {
  const topicHelp = createCommandTopicHelpText("deck", "", ["deck", "help"]);
  assert.match(topicHelp, /^\/deck$/m);
  assert.match(topicHelp, /Usage: \/deck list \| \/deck new <name>/);
  assert.match(topicHelp, /Subcommands: list new rename switch delete/);

  const subcommandHelp = createCommandTopicHelpText("deck", "switch", ["deck", "help"]);
  assert.equal(subcommandHelp, ["/deck switch", "Usage: /deck switch <deckSelector>", "switch active deck"].join("\n"));
});

test("command schema registry resolves declarative command definitions by name", () => {
  const registry = createSlashCommandRegistry(["deck", "layout", "workspace", "broadcast", "settings", "help"]);
  assert.equal(registry.get("deck")?.insertText, "deck");
  assert.deepEqual(registry.get("layout")?.subcommands?.save?.usage, ["/layout save <name>"]);
  assert.deepEqual(registry.get("workspace")?.subcommands?.apply?.usage, ["/workspace apply <preset>"]);
  assert.deepEqual(registry.get("broadcast")?.subcommands?.group?.usage, ["/broadcast group [group]"]);
  assert.equal(registry.get("settings")?.subcommands?.apply?.args?.[0]?.provider, "session-selector");
  assert.equal(registry.get("unknown"), null);
});
