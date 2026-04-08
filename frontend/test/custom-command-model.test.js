import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeCustomCommandTemplate,
  buildCustomCommandLookupKey,
  compareCustomCommandRecords,
  formatCustomCommandDetail,
  formatCustomCommandScopeLabel,
  getCustomCommandPrecedence,
  isCustomCommandVisibleForSession,
  listScopedCustomCommandsByName,
  normalizeCustomCommandKind,
  normalizeCustomCommandName,
  normalizeCustomCommandRecord,
  normalizeCustomCommandScope,
  normalizeCustomCommandTemplateVariables,
  parseCustomCommandDefinition,
  parseCustomCommandInvocation,
  parseCustomCommandReferenceArgs,
  parseCustomCommandScopeToken,
  renderCustomCommandForSession,
  resolveCustomCommandForSession,
  resolveExactCustomCommand
} from "../src/public/custom-command-model.js";

test("custom command model normalizes default project scope and precedence metadata", () => {
  const command = normalizeCustomCommandRecord({
    name: " Deploy ",
    content: "echo project",
    createdAt: 1,
    updatedAt: 2
  });

  assert.deepEqual(command, {
    name: "deploy",
    content: "echo project",
    kind: "plain",
    scope: "project",
    sessionId: null,
    precedence: 200,
    templateVariables: [],
    createdAt: 1,
    updatedAt: 2,
    lookupKey: "project::deploy"
  });
});

test("custom command model parses scoped custom-command references", () => {
  assert.deepEqual(parseCustomCommandReferenceArgs(["scope:global", "deploy"]), {
    ok: true,
    name: "deploy",
    scope: "global",
    sessionSelector: "",
    rest: []
  });
  assert.deepEqual(parseCustomCommandReferenceArgs(["scope:session:7", "deploy", "env=prod"]), {
    ok: true,
    name: "deploy",
    scope: "session",
    sessionSelector: "7",
    rest: ["env=prod"]
  });
});

test("custom command model resolves effective precedence as session over project over global", () => {
  const commands = [
    { name: "deploy", content: "echo global", scope: "global" },
    { name: "deploy", content: "echo project", scope: "project" },
    { name: "deploy", content: "echo session", scope: "session", sessionId: "s1" }
  ];

  assert.equal(resolveCustomCommandForSession(commands, "deploy", "s1")?.content, "echo session");
  assert.equal(resolveCustomCommandForSession(commands, "deploy", "s2")?.content, "echo project");
  assert.equal(resolveExactCustomCommand(commands, "deploy", "global", "")?.content, "echo global");
  assert.equal(resolveExactCustomCommand(commands, "deploy", "session", "s1")?.content, "echo session");
});

test("custom command model normalizes helper values and sorts scoped command records", () => {
  assert.equal(normalizeCustomCommandName(" Deploy "), "deploy");
  assert.equal(normalizeCustomCommandKind(" TEMPLATE "), "template");
  assert.equal(normalizeCustomCommandScope(" GLOBAL "), "global");
  assert.equal(getCustomCommandPrecedence("session"), 300);
  assert.equal(buildCustomCommandLookupKey("Deploy", "session", "S1"), "session:S1:deploy");
  assert.deepEqual(
    normalizeCustomCommandTemplateVariables(["session.id", "SESSION.ID", "deck.name", "unknown"]),
    ["deck.name", "session.id"]
  );
  assert.ok(compareCustomCommandRecords(
    { name: "deploy", scope: "session", sessionId: "s1" },
    { name: "deploy", scope: "project" }
  ) < 0);
  assert.equal(compareCustomCommandRecords(null, null), 0);
});

test("custom command model parses scope tokens and template placeholders defensively", () => {
  assert.deepEqual(parseCustomCommandScopeToken("scope:global"), {
    ok: true,
    scope: "global",
    sessionSelector: ""
  });
  assert.deepEqual(parseCustomCommandScopeToken("scope:project"), {
    ok: true,
    scope: "project",
    sessionSelector: ""
  });
  assert.equal(parseCustomCommandScopeToken("deploy"), null);
  assert.match(parseCustomCommandScopeToken("scope:session: ").error, /requires a non-empty selector/i);
  assert.match(parseCustomCommandScopeToken("scope:nope").error, /Invalid scope token/i);

  const template = analyzeCustomCommandTemplate("echo {{param:name}} {{var:session.id}}");
  assert.equal(template.ok, true);
  assert.deepEqual(template.parameters, ["name"]);
  assert.deepEqual(template.templateVariables, ["session.id"]);
  assert.match(analyzeCustomCommandTemplate("echo {{param:1bad}}").error, /invalid placeholder/i);
  assert.match(analyzeCustomCommandTemplate("echo {{var:unknown}}").error, /invalid placeholder/i);
});

test("custom command model parses inline and block definitions and rejects malformed payloads", () => {
  assert.deepEqual(
    parseCustomCommandDefinition("/custom template scope:session:s1 deploy echo {{param:name}}"),
    {
      ok: true,
      name: "deploy",
      kind: "template",
      scope: "session",
      sessionSelector: "s1",
      content: "echo {{param:name}}",
      mode: "inline",
      templateVariables: [],
      parameters: ["name"]
    }
  );

  const block = parseCustomCommandDefinition("/custom scope:project deploy\n---\necho hi\n---");
  assert.equal(block.ok, true);
  assert.equal(block.mode, "block");
  assert.equal(block.scope, "project");

  assert.match(parseCustomCommandDefinition("/custom").error, /Usage:/);
  assert.match(parseCustomCommandDefinition("/custom deploy\nnot-a-block").error, /must start with '---'/i);
  assert.match(parseCustomCommandDefinition("/custom deploy\n---\nvalue").error, /must end with a closing '---'/i);
  assert.match(
    parseCustomCommandDefinition("/custom deploy\n---\nvalue\n---\nextra").error,
    /contains content after closing/i
  );
  assert.match(parseCustomCommandDefinition("/custom template deploy echo hi").error, /must contain at least one/i);
});

test("custom command model parses invocations, visibility, and exact lookup edge cases", () => {
  const templateCommand = {
    name: "deploy",
    kind: "template",
    scope: "session",
    sessionId: "s1",
    content: "echo {{param:env}} {{var:session.id}} {{var:deck.name}}"
  };
  const plainCommand = {
    name: "status",
    kind: "plain",
    scope: "global",
    content: "echo ok"
  };

  assert.deepEqual(parseCustomCommandInvocation("/status target-a", plainCommand), {
    ok: true,
    parameterAssignments: {},
    targetSelector: "target-a"
  });
  assert.deepEqual(parseCustomCommandInvocation("/deploy env=prod -- target-a", templateCommand), {
    ok: true,
    parameterAssignments: { env: "prod" },
    targetSelector: "target-a"
  });
  assert.match(parseCustomCommandInvocation("/deploy env=prod env=dev", templateCommand).error, /Duplicate template parameter/i);
  assert.match(parseCustomCommandInvocation("/deploy", templateCommand).error, /Missing template parameter/i);
  assert.match(parseCustomCommandInvocation("/deploy env=prod extra", templateCommand).error, /uses 'key=value' parameters/i);
  assert.match(parseCustomCommandInvocation("/wrong", templateCommand).error, /Invalid custom command invocation/i);

  assert.equal(isCustomCommandVisibleForSession(templateCommand, "s1"), true);
  assert.equal(isCustomCommandVisibleForSession(templateCommand, "s2"), false);
  assert.equal(isCustomCommandVisibleForSession(null, "s1"), false);

  const commands = [
    { name: "deploy", scope: "project", content: "echo project" },
    templateCommand,
    { name: "destroy", scope: "global", content: "echo destroy" }
  ];
  assert.equal(resolveExactCustomCommand(commands, "deploy", "session", "s1")?.content, templateCommand.content);
  assert.equal(resolveExactCustomCommand(commands, "deploy", "session", "s2"), null);
  assert.equal(resolveCustomCommandForSession(commands, "destroy", "s9")?.content, "echo destroy");
  assert.equal(listScopedCustomCommandsByName(commands, "deploy").length, 2);
});

test("custom command model renders template commands and formats scope labels and detail text", () => {
  const templateCommand = {
    name: "deploy",
    kind: "template",
    scope: "session",
    sessionId: "s1",
    content: "echo {{param:env}} {{var:session.id}} {{var:deck.name}}"
  };

  assert.deepEqual(
    renderCustomCommandForSession(
      templateCommand,
      { id: "s1", name: "ops", deckId: "deck-1" },
      { id: "deck-1", name: "Ops Deck" },
      { env: "prod" }
    ),
    { ok: true, text: "echo prod s1 Ops Deck" }
  );
  assert.match(renderCustomCommandForSession(templateCommand, { id: "s1" }, null, {}).error, /Missing template parameter/i);
  assert.match(
    renderCustomCommandForSession({ ...templateCommand, content: "{{var:bad}}" }, { id: "s1" }, null, { env: "prod" }).error,
    /invalid/i
  );
  assert.deepEqual(renderCustomCommandForSession({ name: "status", content: "echo ok", scope: "global" }, {}, null, {}), {
    ok: true,
    text: "echo ok"
  });

  assert.equal(
    formatCustomCommandScopeLabel(templateCommand, {
      getSessionById: () => ({ id: "s1", name: "Build" }),
      formatSessionToken: () => "A1",
      formatSessionDisplayName: () => "Build"
    }),
    "session [A1] Build"
  );
  assert.equal(formatCustomCommandScopeLabel({ name: "deploy", scope: "global" }), "global");
  assert.match(formatCustomCommandDetail(templateCommand), /params=env/);
  assert.equal(formatCustomCommandDetail({ name: "status", kind: "plain", scope: "global", content: "echo ok" }), "echo ok");
});

test("custom command model handles reference parsing edge cases", () => {
  assert.deepEqual(parseCustomCommandReferenceArgs([], { requireName: false }), {
    ok: true,
    name: "",
    scope: null,
    sessionSelector: ""
  });
  assert.match(parseCustomCommandReferenceArgs(["@bad"]).error, /Invalid scope token/i);
  assert.match(parseCustomCommandReferenceArgs(["scope:session:"]).error, /requires a non-empty selector/i);
  assert.match(parseCustomCommandReferenceArgs([]).error, /name is required/i);
});
