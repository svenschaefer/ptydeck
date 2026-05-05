import test from "node:test";
import assert from "node:assert/strict";

import { createCommandExecutorCustomAdminHandlers } from "../src/public/command-executor-custom-admin-handlers.js";

function createHandlers(overrides = {}) {
  return createCommandExecutorCustomAdminHandlers({
    api:
      overrides.api || {
        async deleteCustomCommand() {},
        async upsertCustomCommand(name, payload) {
          return { id: "custom-1", name, ...payload };
        }
      },
    formatUsage: overrides.formatUsage || ((command, subcommand = "") => `Usage: /${command}${subcommand ? ` ${subcommand}` : ""}`),
    listCustomCommandState: overrides.listCustomCommandState || (() => []),
    removeCustomCommandState: overrides.removeCustomCommandState || (() => false),
    parseCustomDefinition: overrides.parseCustomDefinition || (() => ({ ok: false, error: "unsupported" })),
    upsertCustomCommandState: overrides.upsertCustomCommandState || (() => null),
    resolveSingleSessionForCommand:
      overrides.resolveSingleSessionForCommand ||
      ((selectorText, sessions, activeSessionId, missingMessage) => {
        const selector = String(selectorText || "").trim();
        if (!selector) {
          const activeSession = sessions.find((session) => session.id === activeSessionId) || null;
          return activeSession ? { error: "", session: activeSession } : { error: missingMessage, session: null };
        }
        const matchedSession = sessions.find((session) => session.id === selector || session.quickId === selector) || null;
        return matchedSession ? { error: "", session: matchedSession } : { error: `Unknown session identifier: ${selector}`, session: null };
      }),
    resolveCustomCommandTargets:
      overrides.resolveCustomCommandTargets ||
      ((selectorText, sessions, activeSessionId, missingMessage) => {
        const selector = String(selectorText || "").trim();
        if (!selector) {
          const activeSession = sessions.find((session) => session.id === activeSessionId) || null;
          return activeSession ? { error: "", sessions: [activeSession] } : { error: missingMessage, sessions: [] };
        }
        const matchedSession = sessions.find((session) => session.id === selector || session.quickId === selector) || null;
        return matchedSession ? { error: "", sessions: [matchedSession] } : { error: `Unknown session identifier: ${selector}`, sessions: [] };
      }),
    resolveSessionDeckId: overrides.resolveSessionDeckId || ((session) => String(session?.deckId || "default")),
    formatSessionToken: overrides.formatSessionToken || ((id) => String(id || "")),
    formatSessionDisplayName: overrides.formatSessionDisplayName || ((session) => String(session?.name || ""))
  });
}

test("custom admin handlers return null for unrelated command names", async () => {
  const handlers = createHandlers();

  assert.equal(
    await handlers.executeStructuredCommand({
      command: "help",
      args: [],
      interpreted: { raw: "/help" },
      sessions: [],
      decks: [],
      activeSessionId: ""
    }),
    null
  );
});

test("custom admin handlers format list, show, and preview output through the extracted seam", async () => {
  const sessions = [{ id: "s1", quickId: "1", name: "one", deckId: "default", cwd: "/srv/one" }];
  const handlers = createHandlers({
    listCustomCommandState: () => [
      {
        name: "deploy",
        content: "echo {{param:env}} from {{var:session.cwd}}",
        kind: "template",
        scope: "project",
        templateVariables: ["session.cwd"]
      }
    ],
    formatSessionToken: (id) => (id === "s1" ? "1" : String(id || ""))
  });

  assert.equal(
    await handlers.executeStructuredCommand({
      command: "custom",
      args: ["list"],
      interpreted: { raw: "/custom list" },
      sessions,
      decks: [{ id: "default", name: "Default" }],
      activeSessionId: "s1"
    }),
    "/deploy (template · project)"
  );

  assert.equal(
    await handlers.executeStructuredCommand({
      command: "custom",
      args: ["show", "deploy"],
      interpreted: { raw: "/custom show deploy" },
      sessions,
      decks: [{ id: "default", name: "Default" }],
      activeSessionId: "s1"
    }),
    [
      "/deploy",
      "kind: template",
      "scope: project",
      "precedence: 200",
      "parameters: env",
      "templateVariables: session.cwd",
      "---",
      "echo {{param:env}} from {{var:session.cwd}}",
      "---"
    ].join("\n")
  );

  assert.equal(
    await handlers.executeStructuredCommand({
      command: "custom",
      args: ["preview", "deploy", "env=prod"],
      interpreted: { raw: "/custom preview deploy env=prod" },
      sessions,
      decks: [{ id: "default", name: "Default" }],
      activeSessionId: "s1"
    }),
    ["/deploy · project -> [1] one", "---", "echo prod from /srv/one", "---"].join("\n")
  );
});

test("custom admin handlers remove scoped commands and map backend 404 failures cleanly", async () => {
  const removeCalls = [];
  const removedCommands = [];
  const handlers = createHandlers({
    api: {
      async deleteCustomCommand(name, payload) {
        removeCalls.push([name, payload]);
        if (payload.scope === "session") {
          const error = new Error("missing");
          error.status = 404;
          throw error;
        }
      }
    },
    listCustomCommandState: () => [
      { name: "deploy", content: "echo project", scope: "project", kind: "plain" },
      { name: "deploy", content: "echo session", scope: "session", sessionId: "s2", kind: "plain" }
    ],
    removeCustomCommandState: (command) => removedCommands.push(command),
    formatSessionToken: (id) => (id === "s2" ? "2" : String(id || "")),
    formatSessionDisplayName: (session) => String(session?.name || "")
  });
  const sessions = [{ id: "s2", quickId: "2", name: "two", deckId: "default" }];

  assert.equal(
    await handlers.executeStructuredCommand({
      command: "custom",
      args: ["remove", "scope:project", "deploy"],
      interpreted: { raw: "/custom remove scope:project deploy" },
      sessions,
      decks: [{ id: "default", name: "Default" }],
      activeSessionId: "s2"
    }),
    "Removed custom command /deploy (project)."
  );

  assert.equal(
    await handlers.executeStructuredCommand({
      command: "custom",
      args: ["remove", "scope:session:2", "deploy"],
      interpreted: { raw: "/custom remove scope:session:2 deploy" },
      sessions,
      decks: [{ id: "default", name: "Default" }],
      activeSessionId: "s2"
    }),
    "Custom command not found: /deploy"
  );

  assert.deepEqual(removeCalls, [
    ["deploy", { scope: "project", sessionId: undefined }],
    ["deploy", { scope: "session", sessionId: "s2" }]
  ]);
  assert.deepEqual(removedCommands, [
    {
      name: "deploy",
      content: "echo project",
      kind: "plain",
      scope: "project",
      precedence: 200,
      templateVariables: [],
      createdAt: 0,
      updatedAt: 0,
      lookupKey: "project::deploy",
      sessionId: null
    }
  ]);
});

test("custom admin handlers persist session-scoped definitions through the extracted seam", async () => {
  const savedCommands = [];
  const handlers = createHandlers({
    api: {
      async upsertCustomCommand(name, payload) {
        return { id: "custom-1", name, ...payload };
      }
    },
    parseCustomDefinition: () => ({
      ok: true,
      name: "deploy",
      content: "echo hi",
      kind: "plain",
      scope: "session",
      sessionSelector: "2",
      templateVariables: [],
      mode: "created"
    }),
    upsertCustomCommandState: (command) => savedCommands.push(command),
    formatSessionToken: (id) => (id === "s2" ? "2" : String(id || "")),
    formatSessionDisplayName: (session) => String(session?.name || "")
  });
  const sessions = [{ id: "s2", quickId: "2", name: "two", deckId: "default" }];

  assert.equal(
    await handlers.executeStructuredCommand({
      command: "custom",
      args: ["deploy", "=", "echo hi"],
      interpreted: { raw: "/custom deploy = echo hi" },
      sessions,
      decks: [{ id: "default", name: "Default" }],
      activeSessionId: "s2"
    }),
    "Saved custom command /deploy (created · session [2] two)."
  );

  assert.deepEqual(savedCommands, [
    {
      id: "custom-1",
      name: "deploy",
      content: "echo hi",
      kind: "plain",
      templateVariables: [],
      scope: "session",
      sessionId: "s2"
    }
  ]);
});
