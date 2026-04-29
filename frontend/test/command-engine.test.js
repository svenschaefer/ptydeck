import test from "node:test";
import assert from "node:assert/strict";

import { createCommandEngine, createCustomCommandRegistry } from "../src/public/command-engine.js";

function createEngineFixture(options = {}) {
  const registry = createCustomCommandRegistry();
  registry.upsert({ name: "Docu", content: "sync docs" });
  const sessions = Array.isArray(options.sessions)
    ? options.sessions
    : [
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
  const decks = Array.isArray(options.decks)
    ? options.decks
    : [
        { id: "default", name: "Default" },
        { id: "ops", name: "Ops" }
      ];
  const systemSlashCommands = Array.isArray(options.systemSlashCommands)
    ? options.systemSlashCommands
    : ["switch", "custom", "deck", "move", "settings", "filter", "close", "restart"];
  const themes = Array.isArray(options.themes)
    ? options.themes
    : [
        { id: "ptydeck-default", name: "Ptydeck Default", category: "dark" },
        { id: "solarized-light", name: "Solarized Light", category: "light" }
      ];
  return createCommandEngine({
    systemSlashCommands,
    listCustomCommands: () => registry.list(),
    getSessions: () => sessions,
    getDecks: () => decks,
    getThemes: () => themes,
    getActiveDeckId: () => options.activeDeckId || "default",
    getActiveSessionId: () =>
      Object.hasOwn(options, "activeSessionId") ? options.activeSessionId : "sess-1-abcdef",
    getSessionToken:
      typeof options.getSessionToken === "function"
        ? options.getSessionToken
        : (id) => (id === "sess-1-abcdef" ? "1" : "2"),
    getSessionDisplayName:
      typeof options.getSessionDisplayName === "function" ? options.getSessionDisplayName : (session) => session.name,
    getSessionDeckId:
      typeof options.getSessionDeckId === "function" ? options.getSessionDeckId : (session) => session.deckId,
    getDiscoveryUsageScore: (key) =>
      typeof options.getDiscoveryUsageScore === "function" ? options.getDiscoveryUsageScore(key) : 0
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
    scope: "project",
    sessionSelector: "",
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
    scope: "project",
    sessionSelector: "",
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
    error:
      "Usage: /custom [plain|template] [scope:global|scope:project|scope:session:<selector>] <name> <text> | /custom [plain|template] [scope:global|scope:project|scope:session:<selector>] <name> + block"
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

test("command engine exposes namespaced alias autocomplete through the shared slash registry", () => {
  const engine = createEngineFixture({
    systemSlashCommands: ["new", "deck", "switch", "replay", "help", "run"]
  });

  const context = engine.parseAutocompleteContext("/deck.");
  assert.equal(context.replacePrefix, "/");
  assert.deepEqual(
    context.matches.map((candidate) => candidate.insertText).slice(0, 3),
    ["deck.list", "deck.new", "deck.rename"]
  );

  const runContext = engine.parseAutocompleteContext("/ru");
  assert.equal(runContext.matches[0].insertText, "run");
});

test("command engine keeps exact-prefix results ahead of fuzzy slash matches and can personalize ties", () => {
  const engine = createEngineFixture({
    systemSlashCommands: ["stack", "haystack"]
  });

  const fuzzyContext = engine.parseAutocompleteContext("/st");
  assert.equal(fuzzyContext.replacePrefix, "/");
  assert.deepEqual(
    fuzzyContext.matches.map((candidate) => candidate.insertText),
    ["stack", "haystack"]
  );

  const personalizedEngine = createEngineFixture({
    systemSlashCommands: ["close", "clone"],
    getDiscoveryUsageScore: (key) => (key === "slash:clone" ? 10 : 0)
  });

  const exactPrefixContext = personalizedEngine.parseAutocompleteContext("/cl");
  assert.equal(exactPrefixContext.matches[0].insertText, "clone");
  assert.equal(exactPrefixContext.matches[1].insertText, "close");
});

test("command engine prefers the shortest slash completion for Tab autocomplete prefixes", () => {
  const engine = createCommandEngine({
    systemSlashCommands: [],
    listCustomCommands: () => [
      { name: "doc-en", content: "sync english docs", scope: "project" },
      { name: "doc", content: "sync docs", scope: "project" }
    ],
    getDiscoveryUsageScore: (key) => (key === "slash-custom:doc-en" ? 10 : 0)
  });

  const context = engine.parseAutocompleteContext("/do");
  assert.equal(context.replacePrefix, "/");
  assert.deepEqual(
    context.matches.map((candidate) => candidate.insertText),
    ["doc", "doc-en"]
  );
});

test("command engine resolves declarative provider autocomplete for command arguments", () => {
  const engine = createEngineFixture();

  const moveContext = engine.parseAutocompleteContext("/move 1 o");
  assert.equal(moveContext.replacePrefix, "/move 1 ");
  assert.equal(moveContext.matches[0].insertText, "ops");
  assert.equal(moveContext.matches[0].kind, "deck");

  const switchContext = engine.parseAutocompleteContext("/switch ");
  assert.equal(switchContext.replacePrefix, "/switch ");
  assert.deepEqual(
    switchContext.matches.map((candidate) => candidate.insertText),
    ["1", "alpha", "sess-1-abcdef", "2", "beta", "sess-2-fedcba"]
  );
});

test("command engine autocompletes help topics and subcommands through declarative providers", () => {
  const engine = createEngineFixture({
    systemSlashCommands: ["deck", "help", "switch", "run"]
  });

  const topicContext = engine.parseAutocompleteContext("/help d");
  assert.equal(topicContext.replacePrefix, "/help ");
  assert.equal(topicContext.matches[0].insertText, "deck");
  assert.ok(topicContext.matches.some((candidate) => candidate.insertText === "deck.switch"));

  const subcommandContext = engine.parseAutocompleteContext("/help deck s");
  assert.equal(subcommandContext.replacePrefix, "/help deck ");
  assert.equal(subcommandContext.matches[0].insertText, "switch");
  assert.ok(subcommandContext.matches.some((candidate) => candidate.insertText === "switch"));
});

test("command engine autocompletes replay slice selectors and ccp alias entries", () => {
  const engine = createEngineFixture({
    systemSlashCommands: ["replay", "help", "run"]
  });

  const sliceContext = engine.parseAutocompleteContext("/replay preview 1 s");
  assert.equal(sliceContext.replacePrefix, "/replay preview 1 ");
  assert.equal(sliceContext.matches[0].insertText, "sp:1");
  assert.ok(sliceContext.matches.some((candidate) => candidate.insertText === "sp:2"));

  const aliasContext = engine.parseAutocompleteContext("/cc");
  assert.equal(aliasContext.matches[0].insertText, "ccp");
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

test("command engine parses settings payloads, size arguments, and direct-route targets defensively", () => {
  const engine = createEngineFixture();

  assert.deepEqual(engine.parseSettingsPayload("{"), {
    ok: false,
    error: "Invalid JSON payload for /settings apply."
  });
  assert.deepEqual(engine.parseSettingsPayload("[]"), {
    ok: false,
    error: "Settings payload must be a JSON object."
  });
  assert.deepEqual(engine.parseSettingsPayload("{\"theme\":\"dark\"}"), {
    ok: true,
    payload: { theme: "dark" }
  });

  assert.deepEqual(engine.parseSizeCommandArgs(["c120", "r40"], 80, 20), {
    ok: true,
    cols: 120,
    rows: 40
  });
  assert.deepEqual(engine.parseSizeCommandArgs(["c999"], 80, 20), {
    ok: false,
    error: "Columns must be between 20 and 400."
  });

  assert.deepEqual(engine.parseDirectTargetRoutingInput("@ops::beta /note needs review"), {
    matched: true,
    targetToken: "ops::beta",
    payload: "/note needs review"
  });
  assert.deepEqual(engine.parseDirectTargetRoutingInput("@ops"), {
    matched: false,
    targetToken: "",
    payload: ""
  });
});

test("command engine reports ambiguous quick-switch and malformed filter deck selectors explicitly", () => {
  const engine = createEngineFixture({
    sessions: [
      {
        id: "sess-1-abcdef",
        name: "ops",
        deckId: "default",
        tags: ["ops"],
        cwd: "~/alpha",
        startCwd: "~/alpha",
        env: { APP_ENV: "dev" }
      }
    ],
    decks: [
      { id: "default", name: "Default" },
      { id: "ops", name: "Ops" }
    ]
  });

  assert.equal(
    engine.resolveQuickSwitchTarget("ops").error,
    "Ambiguous quick-switch target: 'ops' matches both a session and a deck. Use 'deck:ops' for the deck target."
  );
  assert.deepEqual(engine.resolveFilterSelectors("deck:", engine.resolveTargetSelectors("*", [
    {
      id: "sess-1-abcdef",
      name: "ops",
      deckId: "default",
      tags: ["ops"],
      cwd: "~/alpha",
      startCwd: "~/alpha",
      env: { APP_ENV: "dev" }
    }
  ]).sessions), {
    sessions: [],
    error: "Deck selector must be 'deck:<deckSelector>'."
  });
});

test("command engine suppresses autocomplete for multiline slash and quick-switch inputs", () => {
  const engine = createEngineFixture();

  assert.equal(engine.parseAutocompleteContext("/help\ndeck"), null);
  assert.equal(engine.parseAutocompleteContext(">1\n2"), null);
});

test("custom command registry normalizes names, replaces state, and ignores invalid records", () => {
  const registry = createCustomCommandRegistry();

  assert.equal(registry.get(""), null);
  assert.equal(registry.remove(""), false);
  assert.equal(registry.upsert({ name: "   ", content: "ignored" }), null);

  registry.upsert({ name: "Go", content: "echo first" });
  registry.upsert({ name: "go", content: "echo second" });
  assert.equal(registry.get("GO")?.content, "echo second");

  registry.replace([
    { name: "Beta", content: "echo beta" },
    { name: "alpha", content: "echo alpha" },
    { name: "", content: "ignored" }
  ]);

  assert.deepEqual(
    registry.list().map((entry) => [entry.name, entry.content]),
    [
      ["alpha", "echo alpha"],
      ["beta", "echo beta"]
    ]
  );
  assert.equal(registry.remove("beta"), true);
  assert.equal(registry.get("beta"), null);
});

test("command engine resolves cross-deck targets and active-session settings paths defensively", () => {
  const engine = createEngineFixture();
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

  assert.deepEqual(engine.resolveTargetSelectors("ops::beta", sessions), {
    sessions: [sessions[1]],
    error: ""
  });
  assert.deepEqual(engine.resolveTargetSelectors("ops::", sessions), {
    sessions: [],
    error: "Cross-deck selector must be '<deckSelector>::<sessionSelector>'."
  });
  assert.deepEqual(engine.resolveTargetSelectors("beta", sessions, { scopeMode: "active-deck", activeDeckId: "default" }), {
    sessions: [],
    error: "Unknown session identifier: beta"
  });
  assert.deepEqual(engine.resolveSettingsTargets("", sessions, ""), {
    sessions: [],
    error: "No active session for settings command."
  });
  assert.deepEqual(engine.resolveSettingsTargets("", sessions, "sess-1-abcdef"), {
    sessions: [sessions[0]],
    error: ""
  });
});

test("command engine reports ambiguous and missing session and deck identifiers deterministically", () => {
  const sessions = [
    {
      id: "alpha-1",
      name: "shared",
      deckId: "ops-a",
      tags: ["ops"]
    },
    {
      id: "alpha-2",
      name: "shared",
      deckId: "ops-b",
      tags: ["ops"]
    },
    {
      id: "beta-1",
      name: "beta",
      deckId: "ops-a",
      tags: ["db"]
    }
  ];
  const decks = [
    { id: "ops-a", name: "Ops" },
    { id: "ops-b", name: "Ops" },
    { id: "logs", name: "Logs" }
  ];
  const engine = createEngineFixture({
    sessions,
    decks,
    getSessionToken: (id) => (id.startsWith("alpha") ? "Q" : "B")
  });

  assert.deepEqual(engine.resolveSessionToken("", sessions), {
    session: null,
    error: "Missing session identifier."
  });
  assert.equal(engine.resolveSessionToken("Q", sessions).error, "Ambiguous session identifier: Q");
  assert.equal(engine.resolveSessionToken("shared", sessions).error, "Ambiguous session identifier: shared");
  assert.equal(engine.resolveSessionToken("alpha-", sessions).error, "Ambiguous session identifier: alpha-");
  assert.equal(engine.resolveSessionToken("missing", sessions).error, "Unknown session identifier: missing");

  assert.deepEqual(engine.resolveDeckToken("", decks), {
    deck: null,
    error: "Missing deck identifier."
  });
  assert.equal(engine.resolveDeckToken("Ops", decks).error, "Ambiguous deck identifier: Ops");
  assert.equal(engine.resolveDeckToken("op", decks).error, "Ambiguous deck identifier: op");
  assert.equal(engine.resolveDeckToken("missing", decks).error, "Unknown deck identifier: missing");
});

test("command engine resolves selector, filter, settings, and quick-switch edge cases directly", () => {
  const sessions = [
    {
      id: "alpha-1",
      name: "alpha",
      deckId: "default",
      tags: ["ops"]
    },
    {
      id: "alpha-2",
      name: "alpha-two",
      deckId: "ops",
      tags: ["ops", "db"]
    },
    {
      id: "gamma-1",
      name: "gamma",
      deckId: "ops",
      tags: ["qa"]
    }
  ];
  const decks = [
    { id: "default", name: "Default" },
    { id: "ops", name: "Ops" },
    { id: "empty", name: "Empty" }
  ];
  const engine = createEngineFixture({
    sessions,
    decks,
    activeDeckId: "ops",
    activeSessionId: "missing-active",
    getSessionToken: (id) => (id === "alpha-1" ? "1" : id === "alpha-2" ? "2" : "3")
  });

  assert.deepEqual(engine.resolveTargetSelectors("1, ops::2", sessions, { source: "direct-route" }), {
    sessions: [sessions[0], sessions[1]],
    error: ""
  });
  assert.deepEqual(engine.resolveTargetSelectors("", sessions), {
    sessions: [],
    error: "Missing session identifier."
  });
  assert.deepEqual(engine.resolveTargetSelectors("*", sessions, { scopeMode: "active-deck", activeDeckId: "ops" }), {
    sessions: [sessions[1], sessions[2]],
    error: ""
  });
  assert.deepEqual(engine.resolveTargetSelectors("deck:empty", sessions), {
    sessions: [],
    error: "No sessions found for deck 'empty'."
  });

  assert.deepEqual(engine.resolveFilterSelectors("", sessions), {
    sessions: [],
    error: ""
  });
  assert.deepEqual(engine.resolveFilterSelectors("*", sessions, { scopeMode: "active-deck", activeDeckId: "ops" }), {
    sessions: [sessions[1], sessions[2]],
    error: ""
  });
  assert.deepEqual(engine.resolveFilterSelectors("alpha", sessions), {
    sessions: [],
    error: "Ambiguous session id prefix: alpha"
  });
  assert.deepEqual(engine.resolveFilterSelectors("missing", sessions), {
    sessions: [],
    error: "Unknown session id/tag: missing"
  });
  assert.deepEqual(engine.resolveFilterSelectors("deck:empty", sessions), {
    sessions: [],
    error: "No sessions found for deck 'empty'."
  });

  assert.deepEqual(engine.resolveSettingsTargets("active", sessions, "missing-active"), {
    sessions: [],
    error: "No active session for settings command."
  });

  assert.deepEqual(engine.resolveQuickSwitchTarget("", sessions), {
    kind: "",
    target: null,
    error: "Usage: >selector"
  });
  assert.equal(
    engine.resolveQuickSwitchTarget("*", sessions).error,
    "Quick-switch selector must resolve to exactly one session."
  );
  assert.deepEqual(engine.resolveQuickSwitchTarget("deck:", sessions), {
    kind: "",
    target: null,
    error: "Missing deck identifier."
  });
  assert.equal(engine.resolveQuickSwitchTarget("missing", sessions).error, "Unknown session identifier: missing");
});

test("command engine exposes custom and quick-switch autocomplete edge cases directly", () => {
  const engine = createEngineFixture({
    systemSlashCommands: ["help", "switch", "filter", "replay", "run"]
  });

  const emptyRootContext = engine.parseAutocompleteContext("/");
  assert.equal(emptyRootContext.replacePrefix, "/");
  assert.ok(emptyRootContext.matches.some((candidate) => candidate.insertText === "docu"));

  const customContext = engine.parseAutocompleteContext("/docu ");
  assert.equal(customContext.replacePrefix, "/docu ");
  assert.ok(customContext.matches.some((candidate) => candidate.insertText === "1"));

  const filterContext = engine.parseAutocompleteContext("/filter ");
  assert.equal(filterContext.replacePrefix, "/filter ");
  assert.ok(filterContext.matches.some((candidate) => candidate.insertText === "*"));
  assert.ok(filterContext.matches.some((candidate) => candidate.insertText === "1"));
  assert.ok(filterContext.matches.some((candidate) => candidate.insertText === "deck:ops"));

  assert.equal(engine.parseAutocompleteContext("/missing arg"), null);

  const emptyCrossDeckContext = engine.parseAutocompleteContext(">::");
  assert.equal(emptyCrossDeckContext.replacePrefix, ">");
  assert.ok(emptyCrossDeckContext.matches.some((candidate) => candidate.insertText === "default"));

  const unresolvedCrossDeckContext = engine.parseAutocompleteContext(">unknown::");
  assert.equal(unresolvedCrossDeckContext.replacePrefix, ">");
  assert.equal(unresolvedCrossDeckContext.matches.length, 0);

  const deckPrefixContext = engine.parseAutocompleteContext(">deck:o");
  assert.equal(deckPrefixContext.replacePrefix, ">deck:");
  assert.ok(deckPrefixContext.matches.some((candidate) => candidate.insertText === "ops"));
});

test("command engine covers quick-switch preview and size/settings guardrail edges", () => {
  const engine = createEngineFixture({
    activeDeckId: "ops",
    activeSessionId: "sess-1-abcdef",
    systemSlashCommands: ["size", "custom", "switch", "deck", "settings"]
  });
  const sessions = [
    {
      id: "sess-1-abcdef",
      name: "alpha",
      deckId: "default",
      tags: ["ops"]
    },
    {
      id: "sess-2-fedcba",
      name: "beta",
      deckId: "ops",
      tags: ["db"]
    }
  ];

  assert.match(engine.formatQuickSwitchPreview("1", sessions), /^Already active:/);
  assert.equal(engine.formatQuickSwitchPreview("deck:ops", sessions), "Already active: [ops] Ops");
  assert.equal(engine.formatQuickSwitchPreview("missing", sessions), "Unknown session identifier: missing");

  assert.deepEqual(engine.parseSettingsPayload("   "), {
    ok: false,
    error: "Missing JSON payload for /settings apply."
  });
  assert.deepEqual(engine.parseSizeCommandArgs(["120", "40"], 80, 20), {
    ok: true,
    cols: 120,
    rows: 40
  });
  assert.deepEqual(engine.parseSizeCommandArgs(["120", "400"], 80, 20), {
    ok: false,
    error: "Rows must be between 5 and 120."
  });
  assert.deepEqual(engine.parseSizeCommandArgs(["r25"], 80, 20), {
    ok: true,
    cols: 80,
    rows: 25
  });
});

test("command engine covers single-match selector branches and null autocomplete fallbacks", () => {
  const sessions = [
    {
      id: "alpha-1",
      name: "alpha",
      deckId: "default",
      tags: ["ops"]
    },
    {
      id: "beta-1",
      name: "beta",
      deckId: "ops",
      tags: ["ops", "db"]
    }
  ];
  const decks = [
    { id: "default", name: "Default" },
    { id: "ops", name: "Ops" },
    { id: "logs", name: "Logs" }
  ];
  const engine = createEngineFixture({
    sessions,
    decks,
    systemSlashCommands: ["restart", "switch", "help", "size", "filter"],
    getSessionToken: (id) => (id === "alpha-1" ? "1" : "2")
  });

  assert.equal(engine.resolveSessionToken("beta-", sessions).session?.id, "beta-1");
  assert.equal(engine.resolveDeckToken("lo", decks).deck?.id, "logs");
  assert.deepEqual(engine.resolveTargetSelectors("logs::beta", sessions), {
    sessions: [],
    error: "Unknown session identifier: beta"
  });
  assert.deepEqual(engine.resolveTargetSelectors("deck:logs", sessions), {
    sessions: [],
    error: "No sessions found for deck 'logs'."
  });
  assert.deepEqual(engine.resolveTargetSelectors("ops::2", sessions), {
    sessions: [sessions[1]],
    error: ""
  });
  assert.deepEqual(engine.resolveFilterSelectors("deck:ops", sessions), {
    sessions: [sessions[1]],
    error: ""
  });
  assert.deepEqual(engine.resolveSettingsTargets("1", sessions, "missing"), {
    sessions: [sessions[0]],
    error: ""
  });
  assert.deepEqual(engine.resolveQuickSwitchTarget("ops::2", sessions), {
    kind: "session",
    target: sessions[1],
    error: ""
  });
  assert.deepEqual(engine.resolveQuickSwitchTarget("logs", sessions), {
    kind: "deck",
    target: decks[2],
    error: ""
  });

  assert.deepEqual(engine.parseAutocompleteContext("/restart now"), {
    replacePrefix: "/restart ",
    matches: []
  });
  const quickSwitchContext = engine.parseAutocompleteContext(">op");
  assert.equal(quickSwitchContext.replacePrefix, ">");
  assert.ok(quickSwitchContext.matches.some((candidate) => candidate.insertText === "ops"));

  assert.deepEqual(engine.parseSizeCommandArgs(["10", "40"], 80, 20), {
    ok: false,
    error: "Columns must be between 20 and 400."
  });
  assert.deepEqual(engine.parseSizeCommandArgs(["r400"], 80, 20), {
    ok: false,
    error: "Rows must be between 5 and 120."
  });
  assert.deepEqual(engine.parseSizeCommandArgs(["foo"], 80, 20), {
    ok: false,
    error: "Usage: /size <cols> <rows> | /size c<cols> | /size r<rows>"
  });
});

test("command engine covers malformed cross-deck, quick-switch ambiguity, and empty help/detail branches", () => {
  const sessions = [
    {
      id: "ops-session-1",
      name: "ops",
      deckId: "default",
      tags: ["ops"]
    },
    {
      id: "ops-session-2",
      name: "beta",
      deckId: "ops",
      tags: ["db"]
    }
  ];
  const decks = [
    { id: "default", name: "Default" },
    { id: "ops", name: "Ops" },
    { id: "logs", name: "Logs" }
  ];
  const engine = createEngineFixture({
    sessions,
    decks,
    systemSlashCommands: ["deck", "help", "switch", "restart", "filter"],
    getSessionToken: (id) => (id === "ops-session-1" ? "1" : "2")
  });

  assert.deepEqual(engine.resolveTargetSelectors("ops::", sessions), {
    sessions: [],
    error: "Cross-deck selector must be '<deckSelector>::<sessionSelector>'."
  });
  assert.deepEqual(engine.resolveTargetSelectors("unknown::1", sessions), {
    sessions: [],
    error: "Unknown deck identifier: unknown"
  });
  assert.deepEqual(engine.resolveFilterSelectors("ops::", sessions), {
    sessions: [],
    error: "Cross-deck selector must be '<deckSelector>::<sessionSelector>'."
  });
  assert.deepEqual(engine.resolveFilterSelectors("logs::missing", sessions), {
    sessions: [],
    error: "Unknown session id/tag: missing"
  });
  assert.deepEqual(engine.resolveQuickSwitchTarget("ops", sessions), {
    kind: "",
    target: null,
    error: "Ambiguous quick-switch target: 'ops' matches both a session and a deck. Use 'deck:ops' for the deck target."
  });
  assert.deepEqual(engine.resolveQuickSwitchTarget("unknown::1", sessions), {
    kind: "",
    target: null,
    error: "Unknown deck identifier: unknown"
  });

  assert.deepEqual(engine.parseAutocompleteContext("/help @ "), {
    replacePrefix: "/help @ ",
    matches: []
  });
  assert.deepEqual(engine.parseAutocompleteContext("/help restart "), {
    replacePrefix: "/help restart ",
    matches: []
  });

  const filterDeckContext = engine.parseAutocompleteContext("/filter deck:l");
  assert.equal(filterDeckContext.replacePrefix, "/filter ");
  assert.deepEqual(
    filterDeckContext.matches.map((candidate) => candidate.insertText).slice(0, 2),
    ["deck:logs", "deck:Logs"]
  );

  const explicitDeckQuickSwitchContext = engine.parseAutocompleteContext(">deck:");
  assert.equal(explicitDeckQuickSwitchContext.replacePrefix, ">deck:");
  assert.ok(explicitDeckQuickSwitchContext.matches.some((candidate) => candidate.insertText === "logs"));
});
