import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReplayExcerptEmptyFeedback,
  buildReplayExcerptSummary,
  createCommandExecutorReportingHandlers
} from "../src/public/command-executor-reporting-handlers.js";

test("reporting handlers format replay excerpt summaries and empty feedback deterministically", () => {
  assert.equal(
    buildReplayExcerptSummary({ selector: "sp:2", resolvedCount: 2, availableCount: 3, chars: 44, lines: 6, selectorSatisfied: false }),
    "sp:2 -> 2/3 units, 44 chars, 6 lines, partial"
  );
  assert.equal(
    buildReplayExcerptEmptyFeedback({ id: "s1", name: "one" }, "empty", {
      formatSessionToken: () => "7",
      formatSessionDisplayName: (session) => session.name
    }),
    "No replay excerpt matched empty on [7] one."
  );
});

test("reporting handlers route replay export/view/copy and transfer upload/download through the extracted seam", async () => {
  const calls = [];
  const session = { id: "s1", name: "one" };
  const handlers = createCommandExecutorReportingHandlers({
    formatUsage: (command, subcommand = "") => `usage:${command}:${subcommand}`,
    resolveActiveOrDirectTargetSession: () => ({ error: "", session }),
    openSessionReplayViewer: async (currentSession) => {
      calls.push(["view", currentSession.id]);
      return { feedback: "Opened replay viewer for [7] one." };
    },
    exportSessionReplayDownload: async (currentSession) => {
      calls.push(["export", currentSession.id]);
      return { feedback: "Downloaded replay tail for [7] one (12 chars retained)." };
    },
    exportSessionReplayCopy: async (currentSession) => {
      calls.push(["copy-tail", currentSession.id]);
      return { feedback: "Copied replay tail for [7] one (12 chars retained)." };
    },
    uploadSessionFile: async (currentSession, options) => {
      calls.push(["upload", currentSession.id, options]);
      return { feedback: "Uploaded logs/output.txt to [7] one (7 bytes)." };
    },
    downloadSessionFile: async (currentSession, options) => {
      calls.push(["download", currentSession.id, options]);
      return { feedback: "Downloaded logs/output.txt from [7] one (7 bytes)." };
    }
  });

  assert.equal(
    await handlers.executeStructuredCommand({ command: "replay", args: ["view"], interpreted: {}, sessions: [session], activeSessionId: "s1" }),
    "Opened replay viewer for [7] one."
  );
  assert.equal(
    await handlers.executeStructuredCommand({ command: "replay", args: ["export"], interpreted: {}, sessions: [session], activeSessionId: "s1" }),
    "Downloaded replay tail for [7] one (12 chars retained)."
  );
  assert.equal(
    await handlers.executeStructuredCommand({ command: "replay", args: ["copy"], interpreted: {}, sessions: [session], activeSessionId: "s1" }),
    "Copied replay tail for [7] one (12 chars retained)."
  );
  assert.equal(
    await handlers.executeStructuredCommand({ command: "transfer", args: ["upload", "logs/output.txt"], interpreted: {}, sessions: [session], activeSessionId: "s1" }),
    "Uploaded logs/output.txt to [7] one (7 bytes)."
  );
  assert.equal(
    await handlers.executeStructuredCommand({ command: "transfer", args: ["download", "logs/output.txt"], interpreted: {}, sessions: [session], activeSessionId: "s1" }),
    "Downloaded logs/output.txt from [7] one (7 bytes)."
  );
  assert.equal(await handlers.executeStructuredCommand({ command: "deck", args: [] }), null);
  assert.deepEqual(calls, [
    ["view", "s1"],
    ["export", "s1"],
    ["copy-tail", "s1"],
    ["upload", "s1", { remotePath: "logs/output.txt" }],
    ["download", "s1", { remotePath: "logs/output.txt" }]
  ]);
});

test("reporting handlers preview, copy, and paste replay excerpts through the extracted seam", async () => {
  const excerptCalls = [];
  const copyCalls = [];
  const pasteCalls = [];
  const sessionsBySelector = new Map([
    ["8", { id: "s2", name: "two" }],
    ["7", { id: "s1", name: "one" }]
  ]);
  const handlers = createCommandExecutorReportingHandlers({
    formatUsage: (command, subcommand = "") => `usage:${command}:${subcommand}`,
    resolveSingleSessionForCommand: (selector) => {
      const session = sessionsBySelector.get(String(selector));
      return session ? { error: "", session } : { error: `Unknown session identifier: ${selector}` };
    },
    loadSessionReplayExcerpt: async (session, selector) => {
      excerptCalls.push([session.id, selector]);
      return {
        selector,
        resolvedCount: 2,
        availableCount: 2,
        selectorSatisfied: true,
        chars: 44,
        lines: 6,
        data: "prompt\noutput\n"
      };
    },
    copySessionReplayExcerpt: async (session, selector, options) => {
      copyCalls.push([session.id, selector, options.payload.data]);
      return { feedback: "Copied replay excerpt from [8] two (sp:2 -> 2/2 units, 44 chars, 6 lines)." };
    },
    submitTerminalPaste: async (sessionId, data, options) => {
      pasteCalls.push([sessionId, data, options]);
      return { status: "sent" };
    },
    formatSessionToken: (id) => (id === "s2" ? "8" : "7"),
    formatSessionDisplayName: (session) => session.name
  });

  assert.equal(
    await handlers.executeStructuredCommand({ command: "replay", args: ["preview", "8", "sp:2"], sessions: [], activeSessionId: "" }),
    "Preview from [8] two (sp:2 -> 2/2 units, 44 chars, 6 lines).\n\nprompt\noutput\n"
  );
  assert.equal(
    await handlers.executeStructuredCommand({ command: "replay", args: ["copy", "8", "sp:2"], sessions: [], activeSessionId: "" }),
    "Copied replay excerpt from [8] two (sp:2 -> 2/2 units, 44 chars, 6 lines)."
  );
  assert.equal(
    await handlers.executeStructuredCommand({ command: "replay", args: ["paste", "8", "7", "sp:2"], sessions: [], activeSessionId: "" }),
    "Pasted replay excerpt sp:2 -> 2/2 units, 44 chars, 6 lines from [8] two to [7] one."
  );
  assert.deepEqual(excerptCalls, [["s2", "sp:2"], ["s2", "sp:2"], ["s2", "sp:2"]]);
  assert.deepEqual(copyCalls, [["s2", "sp:2", "prompt\noutput\n"]]);
  assert.deepEqual(pasteCalls, [["s1", "prompt\noutput\n", { source: "replay-paste", activateTargetBeforeSend: true }]]);
});

test("reporting handlers fail closed for replay and transfer usage and error branches", async () => {
  const sessionsBySelector = new Map([
    ["8", { id: "s2", name: "two" }],
    ["7", { id: "s1", name: "one" }]
  ]);
  const handlers = createCommandExecutorReportingHandlers({
    formatUsage: (command, subcommand = "") => `usage:${command}:${subcommand}`,
    resolveActiveOrDirectTargetSession: (_interpreted, _sessions, _activeSessionId, missingMessage) => ({ error: missingMessage, session: null }),
    resolveSingleSessionForCommand: (selector, _sessions, _activeSessionId, missingMessage) => {
      if (!selector) {
        return { error: missingMessage, session: null };
      }
      const session = sessionsBySelector.get(String(selector));
      return session ? { error: "", session } : { error: `Unknown session identifier: ${selector}` };
    },
    loadSessionReplayExcerpt: async (_session, selector) => {
      if (selector === "missing") {
        return null;
      }
      if (selector === "empty") {
        return { selector, data: "" };
      }
      return { selector, resolvedCount: 1, availableCount: 1, selectorSatisfied: true, chars: 5, lines: 1, data: "hello" };
    },
    submitTerminalPaste: async () => ({ status: "blocked", feedback: "Replay paste path is unavailable." }),
    formatSessionToken: (id) => (id === "s2" ? "8" : "7"),
    formatSessionDisplayName: (session) => session.name
  });

  assert.equal(await handlers.executeStructuredCommand({ command: "replay", args: [], interpreted: {}, sessions: [], activeSessionId: "" }), "usage:replay:");
  assert.equal(await handlers.executeStructuredCommand({ command: "replay", args: ["preview", "8"], interpreted: {}, sessions: [], activeSessionId: "" }), "usage:replay:preview");
  assert.equal(await handlers.executeStructuredCommand({ command: "replay", args: ["copy", "8"], interpreted: {}, sessions: [], activeSessionId: "" }), "usage:replay:copy");
  assert.equal(await handlers.executeStructuredCommand({ command: "replay", args: ["paste", "8", "7"], interpreted: {}, sessions: [], activeSessionId: "" }), "usage:replay:paste");
  assert.equal(await handlers.executeStructuredCommand({ command: "transfer", args: [], interpreted: {}, sessions: [], activeSessionId: "" }), "usage:transfer:");
  assert.equal(await handlers.executeStructuredCommand({ command: "transfer", args: ["upload"], interpreted: {}, sessions: [], activeSessionId: "" }), "No active session for /transfer.");
  assert.equal(await handlers.executeStructuredCommand({ command: "replay", args: ["view"], interpreted: {}, sessions: [], activeSessionId: "" }), "No active session for /replay.");
  assert.equal(await handlers.executeStructuredCommand({ command: "replay", args: ["preview", "8", "missing"], interpreted: {}, sessions: [], activeSessionId: "" }), "Failed to load replay excerpt.");
  assert.equal(await handlers.executeStructuredCommand({ command: "replay", args: ["preview", "8", "empty"], interpreted: {}, sessions: [], activeSessionId: "" }), "No replay excerpt matched empty on [8] two.");
  assert.equal(await handlers.executeStructuredCommand({ command: "replay", args: ["paste", "8", "7", "sp:2"], interpreted: {}, sessions: [], activeSessionId: "" }), "Replay paste path is unavailable.");
});
