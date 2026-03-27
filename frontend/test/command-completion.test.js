import test from "node:test";
import assert from "node:assert/strict";

import {
  areCompletionCandidateListsEqual,
  createSlashCommandSpecs,
  createSuggestionProviderRegistry,
  formatCompletionSuggestionLine,
  normalizeCompletionCandidate
} from "../src/public/command-completion.js";

test("completion candidates normalize and format with metadata", () => {
  const candidate = normalizeCompletionCandidate({
    insertText: "switch",
    label: "/switch",
    kind: "command",
    description: "switch active session",
    example: "/switch 1"
  });
  assert.equal(candidate.insertText, "switch");
  assert.equal(candidate.label, "/switch");
  assert.equal(candidate.kind, "command");
  assert.match(formatCompletionSuggestionLine(candidate, "/", true), /> \/switch  \[command\]/);
});

test("completion candidate equality is structural", () => {
  const left = [{ insertText: "show", label: "/custom show", kind: "subcommand" }];
  const right = [{ insertText: "show", label: "/custom show", kind: "subcommand" }];
  assert.equal(areCompletionCandidateListsEqual(left, right), true);
  assert.equal(areCompletionCandidateListsEqual(left, [{ insertText: "remove", label: "/custom remove" }]), false);
});

test("slash command specs expose declarative metadata for command and subcommand arguments", () => {
  const specs = createSlashCommandSpecs(["deck", "settings", "switch", "run"]);
  const deckSpec = specs.find((entry) => entry.insertText === "deck");
  const settingsSpec = specs.find((entry) => entry.insertText === "settings");
  const deckSwitchAlias = specs.find((entry) => entry.insertText === "deck.switch");
  const runSpec = specs.find((entry) => entry.insertText === "run");
  assert.ok(deckSpec);
  assert.ok(settingsSpec);
  assert.ok(deckSwitchAlias);
  assert.ok(runSpec);
  assert.equal(deckSpec.subcommands.switch.args[0].provider, "deck-selector");
  assert.equal(settingsSpec.subcommands.show.args[0].provider, "session-selector");
  assert.deepEqual(deckSwitchAlias.args, [{ provider: "deck-selector", optional: false }]);
  assert.deepEqual(runSpec.usage, ["/run + newline-separated slash commands", "/cmd1 + newline + /cmd2"]);
});

test("suggestion provider registry yields bounded contextual candidates and isolates provider errors", () => {
  const sessions = Array.from({ length: 60 }, (_, index) => ({
    id: `sess-${index}`,
    name: `name${index}`,
    deckId: index % 2 === 0 ? "default" : "ops",
    tags: index % 3 === 0 ? ["ops"] : [],
    cwd: `~/path-${index}`,
    startCwd: `~/path-${index}`,
    env: { [`KEY_${index}`]: "value" }
  }));
  const decks = [
    { id: "default", name: "Default" },
    { id: "ops", name: "Ops" }
  ];
  const themes = [
    { id: "ptydeck-default", name: "Ptydeck Default", category: "dark" },
    { id: "solarized-light", name: "Solarized Light", category: "light" }
  ];
  const registry = createSuggestionProviderRegistry({
    getSessions: () => sessions,
    getDecks: () => decks,
    getThemes: () => themes,
    getSessionToken: (id) => id.replace("sess-", ""),
    getSessionDisplayName: (session) => session.name,
    providers: {
      failing: () => {
        throw new Error("boom");
      }
    }
  });

  assert.ok(registry.provide("path-selector", "~/path-1").length > 0);
  assert.ok(registry.provide("env-key", "KEY_1").length > 0);
  assert.ok(registry.provide("theme-selector", "solar").length > 0);
  assert.ok(registry.provide("session-selector", "").length <= 48);
  assert.deepEqual(registry.provide("failing", ""), []);
});

test("suggestion provider registry exposes scoped custom-command references deterministically", () => {
  const sessions = [
    { id: "s1", name: "alpha", deckId: "default" },
    { id: "s2", name: "beta", deckId: "ops" }
  ];
  const registry = createSuggestionProviderRegistry({
    getSessions: () => sessions,
    listCustomCommands: () => [
      { name: "deploy", content: "echo global", scope: "global" },
      { name: "deploy", content: "echo project", scope: "project" },
      { name: "deploy", content: "echo beta", scope: "session", sessionId: "s2" },
      { name: "sync", content: "echo sync", scope: "project" }
    ],
    getSessionToken: (id) => (id === "s1" ? "1" : "2"),
    getSessionDisplayName: (session) => session.name
  });

  const refs = registry.provide("custom-command-reference", "d");
  assert.deepEqual(
    refs.map((candidate) => candidate.insertText),
    ["@global deploy", "@project deploy", "@session:2 deploy"]
  );

  const unique = registry.provide("custom-command-reference", "sy");
  assert.equal(unique[0]?.insertText, "sync");
});
