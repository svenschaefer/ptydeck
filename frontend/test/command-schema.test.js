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
  const schema = createSlashCommandSchema(["new", "deck", "swap", "note", "connection", "ssh", "layout", "workspace", "broadcast", "share", "replay", "transfer", "settings", "help", "run"]);
  const newCommand = schema.find((entry) => entry.insertText === "new");
  const deck = schema.find((entry) => entry.insertText === "deck");
  const swap = schema.find((entry) => entry.insertText === "swap");
  const note = schema.find((entry) => entry.insertText === "note");
  const connection = schema.find((entry) => entry.insertText === "connection");
  const ssh = schema.find((entry) => entry.insertText === "ssh");
  const layout = schema.find((entry) => entry.insertText === "layout");
  const workspace = schema.find((entry) => entry.insertText === "workspace");
  const broadcast = schema.find((entry) => entry.insertText === "broadcast");
  const share = schema.find((entry) => entry.insertText === "share");
  const replay = schema.find((entry) => entry.insertText === "replay");
  const transfer = schema.find((entry) => entry.insertText === "transfer");
  const settings = schema.find((entry) => entry.insertText === "settings");
  const deckSwitchAlias = schema.find((entry) => entry.insertText === "deck.switch");
  const sessionSwapAlias = schema.find((entry) => entry.insertText === "session.swap");
  const ccpAlias = schema.find((entry) => entry.insertText === "ccp");
  const run = schema.find((entry) => entry.insertText === "run");

  assert.ok(deck);
  assert.ok(newCommand);
  assert.ok(swap);
  assert.ok(note);
  assert.ok(connection);
  assert.ok(ssh);
  assert.ok(layout);
  assert.ok(workspace);
  assert.ok(broadcast);
  assert.ok(share);
  assert.ok(replay);
  assert.ok(transfer);
  assert.ok(settings);
  assert.ok(deckSwitchAlias);
  assert.ok(sessionSwapAlias);
  assert.ok(ccpAlias);
  assert.ok(run);
  assert.equal(deck.summary, "/deck | /deck new <name> | /deck rename ... | /deck switch <deckSelector> | /deck delete [deckSelector] [force]");
  assert.deepEqual(newCommand.notes, [
    "The optional shell token is passed through to the backend as the local session launcher.",
    "Use `/new powershell` to open Windows PowerShell directly from WSL-backed installs. `/new ps` is shorthand for the same launcher. Use `/new pwsh` when PowerShell 7 is installed in a standard Windows location or already available on PATH."
  ]);
  assert.equal(
    connection.summary,
    "/connection | /connection new <name> | /connection save <name> | /connection show <profile> | /connection apply <profile> | /connection duplicate <profile> <name> | /connection rename <profile> <name> | /connection delete <profile> | /connection draft ..."
  );
  assert.equal(
    ssh.summary,
    "/ssh <target> | /ssh <target> --key <path> | /ssh <target> --password | /ssh <target> --keyboard-interactive | /ssh <target> [-l|--user <username>] [-p|--port <port>] [--deck <deckSelector>] [--cwd <path>] [--command <command>] | /ssh hostkey list [target] | /ssh hostkey probe <target> | /ssh hostkey trust <target> [keyType|fingerprint] | /ssh hostkey delete <target> [keyType|fingerprint]"
  );
  assert.equal(layout.summary, "/layout | /layout save <name> | /layout apply <profile> | /layout rename <profile> <name> | /layout delete <profile>");
  assert.equal(
    workspace.summary,
    "/workspace | /workspace save <name> | /workspace show <preset> | /workspace apply <preset> | /workspace duplicate <preset> <name> | /workspace rename <preset> <name> | /workspace delete <preset> | /workspace group ..."
  );
  assert.equal(broadcast.summary, "/broadcast | /broadcast off | /broadcast group [group]");
  assert.equal(share.summary, "/share | /share session | /share deck [deckSelector] | /share revoke <shareId>");
  assert.equal(transfer.summary, "/transfer upload [path] | /transfer download <path>");
  assert.deepEqual(
    swap.args,
    [{ provider: "session-selector", optional: false }, { provider: "session-selector", optional: false }]
  );
  assert.equal(note.args, undefined);
  assert.deepEqual(deck.subcommands.switch.args, [{ provider: "deck-selector", optional: false }]);
  assert.deepEqual(layout.subcommands.apply.usage, ["/layout apply <profile>"]);
  assert.deepEqual(layout.subcommands.save.usage, ["/layout save <name>"]);
  assert.deepEqual(connection.subcommands.apply.usage, ["/connection apply <profile>"]);
  assert.deepEqual(connection.subcommands.new.usage, ["/connection new <name>"]);
  assert.deepEqual(connection.subcommands.duplicate.usage, ["/connection duplicate <profile> <name>"]);
  assert.deepEqual(connection.subcommands.save.usage, ["/connection save <name>"]);
  assert.deepEqual(connection.subcommands.save.notes, [
    "Targets the active session by default.",
    "To target another session without switching, use `/help @` and the direct-route form `@<sessionSelector> /<command> ...`."
  ]);
  assert.deepEqual(connection.subcommands.draft.usage, [
    "/connection draft show",
    "/connection draft new [name]",
    "/connection draft active",
    "/connection draft set <json>",
    "/connection draft save [name]",
    "/connection draft reset"
  ]);
  assert.deepEqual(connection.subcommands.draft.subcommands.active.notes, [
    "Targets the active session by default.",
    "To target another session without switching, use `/help @` and the direct-route form `@<sessionSelector> /<command> ...`."
  ]);
  assert.deepEqual(ssh.usage, [
    "/ssh <target>",
    "/ssh <target> --key <path>",
    "/ssh <target> --password",
    "/ssh <target> --keyboard-interactive",
    "/ssh <target> [-l|--user <username>] [-p|--port <port>] [--deck <deckSelector>] [--cwd <path>] [--command <command>]",
    "/ssh hostkey list [target]",
    "/ssh hostkey probe <target>",
    "/ssh hostkey trust <target> [keyType|fingerprint]",
    "/ssh hostkey delete <target> [keyType|fingerprint]"
  ]);
  assert.deepEqual(ssh.subcommands.hostkey.usage, [
    "/ssh hostkey list [target]",
    "/ssh hostkey probe <target>",
    "/ssh hostkey trust <target> [keyType|fingerprint]",
    "/ssh hostkey delete <target> [keyType|fingerprint]"
  ]);
  assert.equal(deckSwitchAlias.aliasOf, "/deck switch");
  assert.deepEqual(deckSwitchAlias.argsPrefix, ["switch"]);
  assert.equal(sessionSwapAlias.aliasOf, "/swap");
  assert.deepEqual(run.usage, ["/run + newline-separated slash commands", "/cmd1 + newline + /cmd2"]);
  assert.equal(replay.subcommands.view.args, undefined);
  assert.equal(replay.subcommands.export.args, undefined);
  assert.deepEqual(replay.subcommands.copy.args, [
    { provider: "session-selector", optional: false },
    { provider: "replay-slice-selector", optional: false }
  ]);
  assert.deepEqual(replay.subcommands.preview.args, [
    { provider: "session-selector", optional: false },
    { provider: "replay-slice-selector", optional: false }
  ]);
  assert.deepEqual(replay.subcommands.paste.args, [
    { provider: "session-selector", optional: false },
    { provider: "session-selector", optional: false },
    { provider: "replay-slice-selector", optional: false }
  ]);
  assert.equal(ccpAlias.aliasOf, "/replay paste");
  assert.deepEqual(ccpAlias.argsPrefix, ["paste"]);
  assert.equal(settings.subcommands.show.args, undefined);
  assert.deepEqual(settings.subcommands.apply.usage, ["/settings apply <json>"]);
  assert.deepEqual(settings.subcommands.startup.subcommands.cwd.usage, [
    "/settings startup cwd <path>",
    "/settings startup cwd clear"
  ]);
  assert.deepEqual(settings.subcommands["mouse-forwarding"].subcommands.set.usage, [
    "/settings mouse-forwarding set <off|application>"
  ]);
  assert.equal(getSlashCommandUsage("deck"), "/deck | /deck new <name> | /deck rename <name> | /deck rename <deckSelector> <name> | /deck switch <deckSelector> | /deck delete [deckSelector] [force]");
  assert.equal(getSlashCommandUsage("swap"), "/swap <selectorA> <selectorB>");
  assert.equal(getSlashCommandUsage("note"), "/note [text...]");
  assert.equal(
    getSlashCommandUsage("connection"),
    "/connection | /connection new <name> | /connection save <name> | /connection show <profile> | /connection apply <profile> | /connection duplicate <profile> <name> | /connection rename <profile> <name> | /connection delete <profile> | /connection draft show | /connection draft new [name] | /connection draft active | /connection draft set <json> | /connection draft save [name] | /connection draft reset"
  );
  assert.equal(
    getSlashCommandUsage("ssh"),
    "/ssh <target> | /ssh <target> --key <path> | /ssh <target> --password | /ssh <target> --keyboard-interactive | /ssh <target> [-l|--user <username>] [-p|--port <port>] [--deck <deckSelector>] [--cwd <path>] [--command <command>] | /ssh hostkey list [target] | /ssh hostkey probe <target> | /ssh hostkey trust <target> [keyType|fingerprint] | /ssh hostkey delete <target> [keyType|fingerprint]"
  );
  assert.equal(
    getSlashCommandUsage("ssh", "hostkey"),
    "/ssh hostkey list [target] | /ssh hostkey probe <target> | /ssh hostkey trust <target> [keyType|fingerprint] | /ssh hostkey delete <target> [keyType|fingerprint]"
  );
  assert.equal(getSlashCommandUsage("layout"), "/layout | /layout save <name> | /layout apply <profile> | /layout rename <profile> <name> | /layout delete <profile>");
  assert.equal(
    getSlashCommandUsage("workspace"),
    "/workspace | /workspace save <name> | /workspace show <preset> | /workspace apply <preset> | /workspace duplicate <preset> <name> | /workspace rename <preset> <name> | /workspace delete <preset> | /workspace group list | /workspace group save <name> | /workspace group apply <group> | /workspace group rename <group> <name> | /workspace group delete <group> | /workspace group clear"
  );
  assert.equal(getSlashCommandUsage("workspace", "group"), "/workspace group list | /workspace group save <name> | /workspace group apply <group> | /workspace group rename <group> <name> | /workspace group delete <group> | /workspace group clear");
  assert.equal(getSlashCommandUsage("broadcast"), "/broadcast | /broadcast off | /broadcast group [group]");
  assert.equal(getSlashCommandUsage("share"), "/share | /share session | /share deck [deckSelector] | /share revoke <shareId>");
  assert.equal(
    getSlashCommandUsage("replay"),
    "/replay view | /replay export | /replay copy | /replay copy <sourceSelector> <sliceSelector> | /replay preview <sourceSelector> <sliceSelector> | /replay paste <sourceSelector> <targetSelector> <sliceSelector>"
  );
  assert.equal(getSlashCommandUsage("transfer"), "/transfer upload [path] | /transfer download <path>");
  assert.equal(
    getSlashCommandUsage("settings"),
    "/settings show | /settings apply <json> | /settings startup show | /settings startup cwd <path> | /settings startup command <text...> | /settings startup env <json> | /settings startup tags <tag[,tag...]> | /settings startup terminator <auto|crlf|lf|cr|cr2|cr_delay> | /settings note show | /settings note set <text...> | /settings note clear | /settings theme show [active|inactive] | /settings theme preset <active|inactive> <theme> | /settings theme set <active|inactive> <key> <#rrggbb> | /settings theme reset <active|inactive> | /settings theme import <active|inactive> <auto|iterm2|windows-terminal|xresources|ptydeck> <payload...> | /settings theme export <active|inactive> <ptydeck|iterm2|windows-terminal|xresources> | /settings input-safety show | /settings input-safety set <field> <value> | /settings mouse-forwarding show | /settings mouse-forwarding set <off|application>"
  );
  assert.equal(
    getSlashCommandUsage("custom"),
    "/custom list | /custom show [scope:global|scope:project|scope:session:<selector>] <name> | /custom preview [scope:global|scope:project|scope:session:<selector>] <name> [key=value ...] [-- <targetSelector>] | /custom remove [scope:global|scope:project|scope:session:<selector>] <name> | /custom [plain|template] [scope:global|scope:project|scope:session:<selector>] <name> <text> | /custom [plain|template] [scope:global|scope:project|scope:session:<selector>] <name> + block"
  );
  assert.equal(getSlashCommandUsage("deck.switch"), "/deck.switch <deckSelector>");
  assert.equal(getSlashCommandUsage("ccp", "", ["replay"]), "/ccp <sourceSelector> <targetSelector> <sliceSelector>");
});

test("command schema formats command help text from declarative command summaries", () => {
  const helpText = createCommandHelpText(["new", "deck", "swap", "note", "connection", "ssh", "layout", "workspace", "broadcast", "share", "replay", "transfer", "custom", "help", "run"]);
  assert.match(helpText, /^Commands: /);
  assert.equal(
    helpText,
    "Commands: @ > / broadcast connection custom deck help layout new note replay run share ssh swap transfer workspace"
  );
});

test("command schema formats topic help text for commands and subcommands", () => {
  const newHelp = createCommandTopicHelpText("new", "", ["new", "help"]);
  assert.match(newHelp, /^\/new$/m);
  assert.match(newHelp, /Usage: \/new \[shell]/);
  assert.match(newHelp, /\/new powershell/);
  assert.match(newHelp, /\/new ps/);
  assert.match(newHelp, /\/new pwsh/);

  const topicHelp = createCommandTopicHelpText("deck", "", ["deck", "help"]);
  assert.match(topicHelp, /^\/deck$/m);
  assert.match(topicHelp, /Usage: \/deck \| \/deck new <name>/);
  assert.match(topicHelp, /Subcommands: list new rename switch delete/);

  const subcommandHelp = createCommandTopicHelpText("deck", "switch", ["deck", "help"]);
  assert.equal(
    subcommandHelp,
    ["/deck switch", "Usage: /deck switch <deckSelector>", "switch active deck", "Aliases: /deck.switch"].join("\n")
  );

  const aliasHelp = createCommandTopicHelpText("deck.switch", "", ["deck", "help"]);
  assert.equal(aliasHelp, ["/deck.switch", "Usage: /deck.switch <deckSelector>", "switch active deck", "Alias for: /deck switch"].join("\n"));

  const directTargetHelp = createCommandTopicHelpText("@", "", ["help"]);
  assert.equal(
    directTargetHelp,
    ["@", "Usage: @<sessionSelector> /<command> ...", "Route a single-session slash command to another session without changing the active session.", "Examples: @3 /note test · @ops /rename api-shell"].join("\n")
  );

  const quickSwitchHelp = createCommandTopicHelpText(">", "", ["help"]);
  assert.equal(
    quickSwitchHelp,
    [">", "Usage: >sessionSelector", "Quick-switch the active session. Session selectors win by default; use 'deck:<deckSelector>' for a deck or '<deckSelector>::<sessionSelector>' for an explicit cross-deck session."].join("\n")
  );

  const shareHelp = createCommandTopicHelpText("share", "", ["share", "help"]);
  assert.match(shareHelp, /^\/share$/m);
  assert.match(shareHelp, /Bare `\/share` is shorthand for `\/share list`\./);
  assert.match(shareHelp, /Subcommands: list session deck revoke/);

  const renameHelp = createCommandTopicHelpText("rename", "", ["rename", "help"]);
  assert.match(renameHelp, /does not accept a positional session selector/i);
  assert.match(renameHelp, /@<sessionSelector> \/rename <name>/);

  const settingsHelp = createCommandTopicHelpText("settings", "", ["settings", "help"]);
  assert.match(settingsHelp, /Usage: \/settings show \| \/settings apply <json>/);
  assert.match(settingsHelp, /@<sessionSelector> \/settings \.\.\./);

  const shareSessionHelp = createCommandTopicHelpText("share", "session", ["share", "help"]);
  assert.match(shareSessionHelp, /Targets the active session by default\./);

  const sshHelp = createCommandTopicHelpText("ssh", "", ["ssh", "help"]);
  assert.match(sshHelp, /^\/ssh$/m);
  assert.match(sshHelp, /Usage: \/ssh <target> \| \/ssh <target> --key <path>/);
  assert.match(sshHelp, /--deck <deckSelector>/);
  assert.match(sshHelp, /Subcommands: hostkey/);
  assert.match(sshHelp, /Target syntax is `\[user@\]host\[:port\]`/);

  const sshHostKeyHelp = createCommandTopicHelpText("ssh", "hostkey", ["ssh", "help"]);
  assert.match(sshHostKeyHelp, /^\/ssh hostkey$/m);
  assert.match(sshHostKeyHelp, /Usage: \/ssh hostkey list \[target] \| \/ssh hostkey probe <target>/);
  assert.match(sshHostKeyHelp, /specify one by key type or fingerprint/i);

  const customHelp = createCommandTopicHelpText("custom", "", ["custom", "help"]);
  assert.match(customHelp, /Usage: \/custom list \| \/custom show/);

  const workspaceGroupHelp = createCommandTopicHelpText("workspace", "group", ["workspace", "help"]);
  assert.equal(
    workspaceGroupHelp,
    [
      "/workspace group",
      "Usage: /workspace group list | /workspace group save <name> | /workspace group apply <group> | /workspace group rename <group> <name> | /workspace group delete <group> | /workspace group clear",
      "manage deck-local workspace groups on the active deck"
    ].join("\n")
  );
});

test("command schema registry resolves declarative command definitions by name", () => {
  const registry = createSlashCommandRegistry(["new", "deck", "connection", "ssh", "layout", "workspace", "broadcast", "share", "settings", "help"]);
  assert.deepEqual(registry.get("new")?.notes, [
    "The optional shell token is passed through to the backend as the local session launcher.",
    "Use `/new powershell` to open Windows PowerShell directly from WSL-backed installs. `/new ps` is shorthand for the same launcher. Use `/new pwsh` when PowerShell 7 is installed in a standard Windows location or already available on PATH."
  ]);
  assert.equal(registry.get("deck")?.insertText, "deck");
  assert.deepEqual(registry.get("connection")?.subcommands?.apply?.usage, ["/connection apply <profile>"]);
  assert.deepEqual(registry.get("ssh")?.usage, [
    "/ssh <target>",
    "/ssh <target> --key <path>",
    "/ssh <target> --password",
    "/ssh <target> --keyboard-interactive",
    "/ssh <target> [-l|--user <username>] [-p|--port <port>] [--deck <deckSelector>] [--cwd <path>] [--command <command>]",
    "/ssh hostkey list [target]",
    "/ssh hostkey probe <target>",
    "/ssh hostkey trust <target> [keyType|fingerprint]",
    "/ssh hostkey delete <target> [keyType|fingerprint]"
  ]);
  assert.deepEqual(registry.get("ssh")?.subcommands?.hostkey?.usage, [
    "/ssh hostkey list [target]",
    "/ssh hostkey probe <target>",
    "/ssh hostkey trust <target> [keyType|fingerprint]",
    "/ssh hostkey delete <target> [keyType|fingerprint]"
  ]);
  assert.deepEqual(registry.get("settings")?.subcommands?.apply?.usage, ["/settings apply <json>"]);
  assert.deepEqual(registry.get("connection")?.subcommands?.draft?.subcommands?.show?.usage, ["/connection draft show"]);
  assert.deepEqual(registry.get("layout")?.subcommands?.save?.usage, ["/layout save <name>"]);
  assert.deepEqual(registry.get("workspace")?.subcommands?.apply?.usage, ["/workspace apply <preset>"]);
  assert.deepEqual(registry.get("workspace")?.subcommands?.duplicate?.usage, ["/workspace duplicate <preset> <name>"]);
  assert.deepEqual(registry.get("workspace")?.subcommands?.group?.usage, [
    "/workspace group list",
    "/workspace group save <name>",
    "/workspace group apply <group>",
    "/workspace group rename <group> <name>",
    "/workspace group delete <group>",
    "/workspace group clear"
  ]);
  assert.deepEqual(registry.get("broadcast")?.subcommands?.group?.usage, ["/broadcast group [group]"]);
  assert.deepEqual(registry.get("share")?.subcommands?.deck?.usage, ["/share deck [deckSelector]"]);
  assert.equal(registry.get("settings")?.subcommands?.startup?.subcommands?.show?.args, undefined);
  assert.equal(registry.get("deck.switch")?.aliasOf, "/deck switch");
  assert.deepEqual(registry.resolve("deck.switch"), {
    entry: registry.get("deck.switch"),
    canonicalCommand: "deck",
    canonicalSubcommand: "switch",
    canonicalEntry: registry.get("deck").subcommands.switch,
    argsPrefix: ["switch"]
  });
  assert.equal(registry.get("unknown"), null);
});
