import test from "node:test";
import assert from "node:assert/strict";

import { createCommandExecutorCustomHandlers } from "../src/public/command-executor-custom-handlers.js";

function createHandlers(overrides = {}) {
  return createCommandExecutorCustomHandlers({
    resolveCustomCommandTargets:
      overrides.resolveCustomCommandTargets ||
      ((selector, sessions, activeSessionId, missingMessage) => {
        if (!selector) {
          const activeSession = sessions.find((session) => session.id === activeSessionId) || null;
          return activeSession ? { error: "", sessions: [activeSession] } : { error: missingMessage, sessions: [] };
        }
        return { error: `Unknown session identifier: ${selector}`, sessions: [] };
      }),
    renderCustomCommandForTargets:
      overrides.renderCustomCommandForTargets ||
      ((_commandName, exactCustom, targetSessions) => ({
        error: "",
        entries: targetSessions.map((session) => ({
          session,
          text: `echo ${session.name}`,
          custom: exactCustom || { name: "deploy", scope: "project", kind: "plain" }
        }))
      })),
    isSessionActionBlocked: overrides.isSessionActionBlocked || (() => false),
    isSessionStopped: overrides.isSessionStopped || (() => false),
    getBlockedSessionActionMessage:
      overrides.getBlockedSessionActionMessage ||
      ((sessions, actionLabel) => `${actionLabel} blocked: ${sessions.map((session) => session.id).join(",")}`),
    sendInputWithConfiguredTerminator:
      overrides.sendInputWithConfiguredTerminator ||
      (async (_sendInput, _sessionId, _payload, _terminator, _runtimeOptions) => {}),
    getSessionSendTerminator: overrides.getSessionSendTerminator || (() => "CRLF"),
    normalizeSendTerminatorMode: overrides.normalizeSendTerminatorMode || ((value) => String(value || "").toLowerCase()),
    delayedSubmitMs: overrides.delayedSubmitMs,
    buildCustomCommandUsageApiOptions: overrides.buildCustomCommandUsageApiOptions || (() => undefined),
    recordCommandSubmission: overrides.recordCommandSubmission || (() => null),
    normalizeCustomCommandPayloadForShell: overrides.normalizeCustomCommandPayloadForShell || ((value) => `${value}\n`),
    formatSessionToken: overrides.formatSessionToken || ((id) => String(id || "")),
    api: overrides.api || { sendInput() {} }
  });
}

test("custom command handlers return null for unrelated command names", async () => {
  const handlers = createHandlers();

  assert.equal(
    await handlers.executeCustomCommand({
      commandRaw: "missing",
      interpreted: { raw: "/missing" },
      sessions: [{ id: "s1", name: "one" }],
      decks: [],
      activeSessionId: "s1",
      allCustomCommands: [{ name: "deploy", content: "echo hi", kind: "plain", scope: "project" }]
    }),
    null
  );
});

test("custom command handlers dispatch rendered payloads, honor selector routing, and record per-target usage", async () => {
  const calls = [];
  const sessions = [
    { id: "s1", name: "one" },
    { id: "s2", name: "two" }
  ];
  const handlers = createHandlers({
    resolveCustomCommandTargets: (selector, availableSessions) => {
      if (selector === "fleet") {
        return { error: "", sessions: availableSessions.slice() };
      }
      return { error: `Unknown session identifier: ${selector}`, sessions: [] };
    },
    renderCustomCommandForTargets: (commandName, exactCustom, targetSessions, parameterAssignments, decks, commands, allSessions) => {
      calls.push([
        "render",
        commandName,
        exactCustom,
        targetSessions.map((session) => session.id),
        parameterAssignments,
        decks.length,
        commands.length,
        allSessions.length
      ]);
      return {
        error: "",
        entries: targetSessions.map((session) => ({
          session,
          text: `echo ${session.name}`,
          custom: { name: "deploy", scope: "project", kind: "plain" }
        }))
      };
    },
    sendInputWithConfiguredTerminator: async (_sendInput, sessionId, payload, terminator, runtimeOptions) => {
      calls.push([
        "send",
        sessionId,
        payload,
        terminator,
        runtimeOptions.normalizeMode("CRLF"),
        runtimeOptions.delayedSubmitMs,
        runtimeOptions.apiRequestOptions
      ]);
    },
    buildCustomCommandUsageApiOptions: (command) => {
      calls.push(["usage-options", command.name, command.scope]);
      return { customCommandUsage: { lookupKey: `${command.scope}::${command.name}` } };
    },
    recordCommandSubmission: (sessionId, submission) => {
      calls.push(["record", sessionId, submission.source, submission.commandName, submission.label, submission.text, Number.isFinite(submission.submittedAt)]);
    },
    delayedSubmitMs: 25
  });

  const feedback = await handlers.executeCustomCommand({
    commandRaw: "deploy",
    interpreted: { raw: "/deploy fleet" },
    sessions,
    decks: [{ id: "default", name: "Default" }],
    activeSessionId: "s1",
    allCustomCommands: [{ name: "deploy", content: "echo hi", kind: "plain", scope: "project" }]
  });

  assert.equal(feedback, "Executed /deploy on 2 sessions.");
  assert.deepEqual(calls, [
    ["render", "deploy", null, ["s1", "s2"], {}, 1, 1, 2],
    ["usage-options", "deploy", "project"],
    ["send", "s1", "echo one\n", "CRLF", "crlf", 25, { customCommandUsage: { lookupKey: "project::deploy" } }],
    ["usage-options", "deploy", "project"],
    ["send", "s2", "echo two\n", "CRLF", "crlf", 25, { customCommandUsage: { lookupKey: "project::deploy" } }],
    ["record", "s1", "custom-command", "deploy", "/deploy", "echo one\n", true],
    ["record", "s2", "custom-command", "deploy", "/deploy", "echo two\n", true]
  ]);
});

test("custom command handlers fail closed on blocked targets and invalid template invocations", async () => {
  const calls = [];
  const sessions = [{ id: "s1", name: "one", blocked: true }];
  const handlers = createHandlers({
    isSessionActionBlocked: (session) => session?.blocked === true,
    getBlockedSessionActionMessage: (blockedSessions, actionLabel) => {
      calls.push(["blocked", blockedSessions.map((session) => session.id)]);
      return `${actionLabel} blocked`;
    },
    sendInputWithConfiguredTerminator: async () => {
      calls.push(["send"]);
    },
    buildCustomCommandUsageApiOptions: () => {
      calls.push(["usage-options"]);
      return undefined;
    },
    recordCommandSubmission: () => {
      calls.push(["record"]);
    }
  });

  assert.equal(
    await handlers.executeCustomCommand({
      commandRaw: "deploy",
      interpreted: { raw: "/deploy env=prod" },
      sessions,
      decks: [],
      activeSessionId: "s1",
      allCustomCommands: [{ name: "deploy", content: "echo {{param:env}}", kind: "template", scope: "project" }]
    }),
    "Custom command execution blocked"
  );
  assert.deepEqual(calls, [["blocked", ["s1"]]]);

  assert.equal(
    await handlers.executeCustomCommand({
      commandRaw: "deploy",
      interpreted: { raw: "/deploy" },
      sessions,
      decks: [],
      activeSessionId: "s1",
      allCustomCommands: [{ name: "deploy", content: "echo {{param:env}}", kind: "template", scope: "project" }]
    }),
    "Missing template parameter(s) for /deploy: env."
  );
  assert.deepEqual(calls, [["blocked", ["s1"]]]);
});

test("custom command handlers route multiline shell payloads through configured internal separators", async () => {
  const calls = [];
  const handlers = createHandlers({
    renderCustomCommandForTargets: (_commandName, exactCustom, targetSessions) => ({
      error: "",
      entries: targetSessions.map((session) => ({
        session,
        text: "echo first\necho second",
        custom: exactCustom || { name: "deploy", scope: "project", kind: "plain" }
      }))
    }),
    sendInputWithConfiguredTerminator: async (_sendInput, sessionId, payload, terminator, runtimeOptions) => {
      calls.push(["send", sessionId, payload, terminator, runtimeOptions.multilineMode]);
    },
    normalizeCustomCommandPayloadForShell: (value) => value
  });

  await handlers.executeCustomCommand({
    commandRaw: "deploy",
    interpreted: { raw: "/deploy" },
    sessions: [
      {
        id: "s1",
        name: "one",
        appIdentity: { family: "shell", label: "bash", source: "foreground-process", confidence: 1 }
      }
    ],
    decks: [],
    activeSessionId: "s1",
    allCustomCommands: [{ name: "deploy", content: "echo hi", kind: "plain", scope: "project" }]
  });

  assert.deepEqual(calls, [["send", "s1", "echo first\necho second", "CRLF", "configured"]]);
});

test("custom command handlers block stopped targets explicitly", async () => {
  const handlers = createHandlers({
    isSessionStopped: (session) => session?.state === "stopped",
    getBlockedSessionActionMessage: (blockedSessions, actionLabel) => `${actionLabel} blocked: ${blockedSessions[0].state}`
  });

  assert.equal(
    await handlers.executeCustomCommand({
      commandRaw: "deploy",
      interpreted: { raw: "/deploy" },
      sessions: [{ id: "s1", name: "one", state: "stopped" }],
      decks: [],
      activeSessionId: "s1",
      allCustomCommands: [{ name: "deploy", content: "echo hi", kind: "plain", scope: "project" }]
    }),
    "Custom command execution blocked: stopped"
  );
});
