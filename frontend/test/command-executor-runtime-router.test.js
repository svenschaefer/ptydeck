import test from "node:test";
import assert from "node:assert/strict";

import { createSlashCommandRegistry } from "../src/public/command-schema.js";
import {
  buildCommandExecutionResult,
  createCommandExecutorRuntimeRouter,
  formatConnectionDraftReport,
  formatShareLinkStatus,
  formatShareLinkSummary,
  formatShareTargetLabel,
  isCommandExecutionFailure,
  normalizeKeyword,
  parseJsonObjectToken,
  resolveSlashCommandWithRegistry
} from "../src/public/command-executor-runtime-router.js";

test("command executor runtime router helpers normalize execution results and failure classification deterministically", () => {
  assert.deepEqual(buildCommandExecutionResult(true, "ok"), { ok: true, feedback: "ok" });
  assert.deepEqual(buildCommandExecutionResult(false, 42), { ok: false, feedback: "42" });

  assert.equal(isCommandExecutionFailure(""), false);
  assert.equal(isCommandExecutionFailure("  "), false);
  assert.equal(isCommandExecutionFailure("Usage: /deck switch <deckSelector>"), true);
  assert.equal(isCommandExecutionFailure("Unknown command: /wat"), true);
  assert.equal(isCommandExecutionFailure("Field 'launch.themeProfile' must contain only supported hex color entries."), true);
  assert.equal(isCommandExecutionFailure("Started session [7] ops."), false);
});

test("command executor runtime router helpers normalize keywords and parse object payloads fail-closed", () => {
  assert.equal(normalizeKeyword("  Deck.Switch  "), "deck.switch");
  assert.deepEqual(parseJsonObjectToken('{"host":"carpo"}', "Connection draft launch"), { host: "carpo" });
  assert.throws(
    () => parseJsonObjectToken("{wat", "Connection draft launch"),
    /Connection draft launch JSON is invalid:/
  );
  assert.throws(
    () => parseJsonObjectToken("[]", "Connection draft launch"),
    /Connection draft launch JSON must be an object\./
  );
});

test("command executor runtime router helpers format connection drafts and share summaries deterministically", () => {
  assert.equal(formatConnectionDraftReport(null, () => ({})), "No connection profile draft available.");
  assert.equal(
    formatConnectionDraftReport(
      {
        mode: "session",
        profileId: "ops-ssh",
        name: "Ops SSH",
        launch: { remoteConnection: { host: "carpo.uberspace.de" } }
      },
      (launch) => ({ ...launch, normalized: true })
    ),
    [
      "Connection profile draft",
      'mode="session"',
      'profileId="ops-ssh"',
      'name="Ops SSH"',
      'launch={\n  "remoteConnection": {\n    "host": "carpo.uberspace.de"\n  },\n  "normalized": true\n}'
    ].join("\n")
  );

  const sessions = [{ id: "s1", name: "ops-shell" }];
  const decks = [{ id: "ops", name: "Ops" }];
  const formatOptions = {
    formatSessionToken: () => "7",
    formatSessionDisplayName: (session) => session.name
  };

  assert.equal(formatShareTargetLabel(null, sessions, decks, formatOptions), "unknown");
  assert.equal(
    formatShareTargetLabel({ targetType: "session", targetId: "s1" }, sessions, decks, formatOptions),
    "session [7] ops-shell"
  );
  assert.equal(
    formatShareTargetLabel({ targetType: "session", targetId: "missing" }, sessions, decks, formatOptions),
    "session missing"
  );
  assert.equal(
    formatShareTargetLabel({ targetType: "deck", targetId: "ops" }, sessions, decks, formatOptions),
    "deck [ops] Ops"
  );
  assert.equal(
    formatShareTargetLabel({ targetType: "deck", targetId: "missing" }, sessions, decks, formatOptions),
    "deck missing"
  );
  assert.equal(formatShareTargetLabel({ targetType: "workspace", targetId: "w1" }, sessions, decks, formatOptions), "unknown");

  assert.equal(formatShareLinkStatus(null), "unknown");
  assert.equal(formatShareLinkStatus({ revokedAt: Date.now() }), "revoked");
  assert.equal(formatShareLinkStatus({ active: true }), "active");
  assert.equal(formatShareLinkStatus({ active: false }), "expired");

  assert.equal(
    formatShareLinkSummary(
      {
        id: "share-1",
        targetType: "session",
        targetId: "s1",
        permissionMode: "controller",
        active: true,
        expiresAt: Date.UTC(2026, 4, 5, 12, 0, 0)
      },
      sessions,
      decks,
      formatOptions
    ),
    "[share-1] session [7] ops-shell · controller · active · expires=2026-05-05T12:00:00.000Z"
  );
  assert.equal(
    formatShareLinkSummary({ id: "share-2", targetType: "workspace", targetId: "w1" }, sessions, decks, formatOptions),
    "[share-2] unknown · read_only · expired · expires=-"
  );
});

test("command executor runtime router resolves slash aliases and routes handlers in order", async () => {
  const slashCommandRegistry = createSlashCommandRegistry(["deck", "help", "run"]);
  const resolvedAlias = resolveSlashCommandWithRegistry({ command: "deck.switch", args: ["ops"] }, slashCommandRegistry);
  assert.equal(resolvedAlias.commandRaw, "deck.switch");
  assert.equal(resolvedAlias.command, "deck");
  assert.deepEqual(resolvedAlias.args, ["switch", "ops"]);
  assert.equal(resolvedAlias.matchedAlias?.isAlias, true);
  assert.equal(resolvedAlias.matchedAlias?.canonicalCommand, "deck");
  assert.deepEqual(resolvedAlias.matchedAlias?.argsPrefix, ["switch"]);
  assert.deepEqual(
    resolveSlashCommandWithRegistry({ command: "wat", args: ["x"] }, slashCommandRegistry),
    { commandRaw: "wat", command: "wat", args: ["x"], matchedAlias: null }
  );

  const calls = [];
  const router = createCommandExecutorRuntimeRouter({
    getState: () => ({
      sessions: [{ id: "b" }, { id: "a" }],
      decks: [{ id: "ops" }],
      activeSessionId: "a"
    }),
    sortSessionsByQuickId: (sessions) => sessions.slice().sort((left, right) => left.id.localeCompare(right.id)),
    resolveSlashCommand: (interpreted) => resolveSlashCommandWithRegistry(interpreted, slashCommandRegistry),
    handlers: [
      async (context) => {
        calls.push(["first", context.command, context.args.slice(), context.sessions.map((session) => session.id), context.activeSessionId]);
        return null;
      },
      async (context) => {
        calls.push(["second", context.commandRaw, context.decks.map((deck) => deck.id)]);
        return `handled:${context.command}`;
      },
      async () => {
        calls.push(["third"]);
        return "should-not-run";
      }
    ]
  });

  assert.equal(await router.execute({ command: "deck.switch", args: ["ops"] }), "handled:deck");
  assert.deepEqual(calls, [
    ["first", "deck", ["switch", "ops"], ["a", "b"], "a"],
    ["second", "deck.switch", ["ops"]]
  ]);
});

test("command executor runtime router falls back to unknown commands and executeDetailed preserves failure status", async () => {
  const router = createCommandExecutorRuntimeRouter({
    getState: () => ({ sessions: [], decks: [], activeSessionId: "" }),
    handlers: [async () => null]
  });
  assert.equal(await router.execute({ command: "wat", args: [] }), "Unknown command: /wat");
  assert.deepEqual(await router.executeDetailed({ command: "wat", args: [] }), { ok: false, feedback: "Unknown command: /wat" });

  const successRouter = createCommandExecutorRuntimeRouter({
    getState: () => ({ sessions: [], decks: [], activeSessionId: "" }),
    handlers: [async () => "Started session [7] ops."]
  });
  assert.deepEqual(await successRouter.executeDetailed({ command: "new", args: [] }), { ok: true, feedback: "Started session [7] ops." });
});
