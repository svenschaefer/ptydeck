import test from "node:test";
import assert from "node:assert/strict";
import { createInitialRuntimeState, createStore, reduceRuntimeState } from "../src/public/store.js";

test("store tracks sessions and active session", () => {
  const store = createStore();
  store.setSessions([
    { id: "a" },
    { id: "b" }
  ]);

  assert.equal(store.getState().activeSessionId, "a");

  store.setActiveSession("b");
  assert.equal(store.getState().activeSessionId, "b");
});

test("store normalizes and snapshots session app identity state defensively", () => {
  const store = createStore();
  store.setSessions([
    {
      id: "a",
      deckId: "default",
      appIdentity: {
        family: "coding-agent",
        label: " Codex ",
        source: "foreground-process",
        confidence: 0.914,
        details: {
          processName: "codex"
        },
        updatedAt: 10
      }
    }
  ]);

  const firstState = store.getState();
  assert.deepEqual(firstState.sessions[0].appIdentity, {
    family: "coding-agent",
    label: "codex",
    source: "foreground-process",
    confidence: 0.91,
    details: {
      processName: "codex"
    },
    updatedAt: 10
  });

  firstState.sessions[0].appIdentity.label = "mutated";
  firstState.sessions[0].appIdentity.details.processName = "mutated";

  const secondState = store.getState();
  assert.equal(secondState.sessions[0].appIdentity.label, "codex");
  assert.equal(secondState.sessions[0].appIdentity.details.processName, "codex");
});

test("store tracks connection state", () => {
  const store = createStore();
  store.setConnectionState("connected");
  assert.equal(store.getState().connectionState, "connected");
});

test("store manages deck state, active deck switching, and fallback removal", () => {
  const store = createStore();

  store.hydrateRuntimePreferences({
    activeDeckId: "ops",
    sessionFilterText: "  tag:ops  "
  });
  store.setDecks([
    { id: "default", name: "Default" },
    { id: "ops", name: "Ops" }
  ]);
  store.setSessions([
    { id: "a", deckId: "default" },
    { id: "b", deckId: "ops" }
  ]);

  let state = store.getState();
  assert.equal(state.activeDeckId, "ops");
  assert.equal(state.sessionFilterText, "tag:ops");

  store.setActiveDeck("ops");
  state = store.getState();
  assert.equal(state.activeDeckId, "ops");
  assert.equal(state.activeSessionId, "b");

  store.removeDeck("ops", { fallbackDeckId: "default" });
  state = store.getState();
  assert.equal(state.activeDeckId, "default");
  assert.deepEqual(
    state.decks.map((deck) => deck.id),
    ["default"]
  );
});

test("store normalizes reload-style runtime preference hydration and ignores duplicate resets", () => {
  const store = createStore();
  let publishes = 0;
  store.subscribe(() => {
    publishes += 1;
  });

  store.hydrateRuntimePreferences({
    activeDeckId: " ops ",
    sessionFilterText: "  tag:ops  "
  });

  let state = store.getState();
  assert.equal(state.activeDeckId, "ops");
  assert.equal(state.sessionFilterText, "tag:ops");

  publishes = 0;
  store.hydrateRuntimePreferences({
    activeDeckId: "ops",
    sessionFilterText: "tag:ops"
  });
  assert.equal(publishes, 0);

  store.hydrateRuntimePreferences({
    activeDeckId: "   ",
    sessionFilterText: "   "
  });
  state = store.getState();
  assert.equal(state.activeDeckId, "");
  assert.equal(state.sessionFilterText, "");
});

test("store falls back cleanly when reload hydrates a stale active deck id", () => {
  const store = createStore();

  store.hydrateRuntimePreferences({
    activeDeckId: "retired",
    sessionFilterText: "ops"
  });
  store.setDecks([
    { id: "default", name: "Default" },
    { id: "ops", name: "Ops" }
  ]);
  store.setSessions([
    { id: "a", deckId: "default" },
    { id: "b", deckId: "ops" }
  ]);

  const state = store.getState();
  assert.equal(state.activeDeckId, "default");
  assert.equal(state.activeSessionId, "a");
  assert.equal(state.sessionFilterText, "ops");
});

test("store manages normalized custom commands and protects internal snapshots", () => {
  const store = createStore();

  store.setSessions([{ id: "a", deckId: "default" }]);
  store.replaceCustomCommands([
    { name: " Go ", content: "echo go", createdAt: 1, updatedAt: 2 },
    { name: "deploy", content: "echo {{param:env}} {{var:session.cwd}}", kind: "template", templateVariables: ["session.cwd"], createdAt: 3, updatedAt: 4 }
  ]);
  store.upsertCustomCommand({ name: "go", content: "echo replaced", createdAt: 5, updatedAt: 6 });

  let state = store.getState();
  assert.deepEqual(
    state.customCommands.map((command) => command.name),
    ["deploy", "go"]
  );
  assert.equal(store.getCustomCommand("GO")?.content, "echo replaced");
  assert.equal(store.getCustomCommand("deploy")?.kind, "template");
  assert.deepEqual(store.getCustomCommand("deploy")?.templateVariables, ["session.cwd"]);

  state.sessions.push({ id: "mutated" });
  state.customCommands[0].content = "broken";
  state.customCommands[0].templateVariables.push("deck.name");
  state.decks.push({ id: "bad", name: "Bad" });

  state = store.getState();
  assert.deepEqual(
    state.sessions.map((session) => session.id),
    ["a"]
  );
  assert.equal(store.getCustomCommand("go")?.content, "echo replaced");
  assert.deepEqual(store.getCustomCommand("deploy")?.templateVariables, ["session.cwd"]);
  assert.equal(state.decks.length, 0);
});

test("store keeps duplicate custom-command names across scopes and resolves effective precedence by session", () => {
  const store = createStore();

  store.replaceCustomCommands([
    { name: "deploy", content: "echo global", scope: "global", createdAt: 1, updatedAt: 1 },
    { name: "deploy", content: "echo project", scope: "project", createdAt: 2, updatedAt: 2 },
    { name: "deploy", content: "echo session", scope: "session", sessionId: "s1", createdAt: 3, updatedAt: 3 }
  ]);

  const state = store.getState();
  assert.deepEqual(
    state.customCommands.map((command) => [command.scope, command.sessionId || "", command.content]),
    [
      ["session", "s1", "echo session"],
      ["project", "", "echo project"],
      ["global", "", "echo global"]
    ]
  );
  assert.equal(store.getCustomCommand("deploy")?.content, "echo session");
  assert.equal(store.getCustomCommand("deploy", { sessionId: "s1" })?.content, "echo session");
  assert.equal(store.getCustomCommand("deploy", { sessionId: "s2" })?.content, "echo project");
  assert.equal(store.getCustomCommand("deploy", { scope: "global" })?.content, "echo global");
});

test("store tracks live and unread session activity and clears unread on activation", () => {
  const store = createStore();

  store.setDecks([{ id: "default", name: "Default" }]);
  store.setSessions([
    { id: "a", deckId: "default" },
    { id: "b", deckId: "default" }
  ]);

  store.markSessionActivity("b", { timestamp: 100 });
  let state = store.getState();
  let target = state.sessions.find((session) => session.id === "b");
  assert.equal(target.hasLiveActivity, true);
  assert.equal(target.hasUnreadActivity, true);
  assert.equal(target.lastOutputAt, 100);

  store.setActiveSession("b");
  state = store.getState();
  target = state.sessions.find((session) => session.id === "b");
  assert.equal(target.hasLiveActivity, true);
  assert.equal(target.hasUnreadActivity, false);

  store.clearSessionActivity("b", { timestamp: 100 });
  state = store.getState();
  target = state.sessions.find((session) => session.id === "b");
  assert.equal(target.hasLiveActivity, false);
  assert.equal(target.hasUnreadActivity, false);
  assert.equal(target.lifecycleState, "idle");
});

test("store derives formal lifecycle transitions from runtime state and activity", () => {
  const store = createStore();

  store.setSessions([
    { id: "a", state: "starting" },
    { id: "b", state: "running" }
  ]);

  let state = store.getState();
  assert.equal(state.sessions.find((session) => session.id === "a")?.lifecycleState, "starting");
  assert.equal(state.sessions.find((session) => session.id === "b")?.lifecycleState, "running");

  store.upsertSession({ id: "a", state: "running" });
  store.markSessionActivity("a", { timestamp: 50 });
  state = store.getState();
  assert.equal(state.sessions.find((session) => session.id === "a")?.lifecycleState, "busy");

  store.clearSessionActivity("a", { timestamp: 50 });
  state = store.getState();
  assert.equal(state.sessions.find((session) => session.id === "a")?.lifecycleState, "idle");

  store.setSessions([{ id: "a", state: "running" }]);
  state = store.getState();
  assert.equal(state.sessions.find((session) => session.id === "a")?.lifecycleState, "idle");

  store.markSessionExited("a", { exitCode: 7, signal: "SIGTERM", exitedAt: 100 });
  state = store.getState();
  assert.equal(state.sessions.find((session) => session.id === "a")?.lifecycleState, "exited");
  assert.equal(state.sessions.find((session) => session.id === "a")?.exitCode, 7);

  store.markSessionClosed("a");
  state = store.getState();
  assert.equal(state.sessions.find((session) => session.id === "a"), undefined);
});

test("store pure helpers normalize initial state and remove active sessions with deterministic fallback", () => {
  const initial = createInitialRuntimeState({
    connectionState: " connected ",
    activeDeckId: " ops ",
    sessionFilterText: "  tag:ops  "
  });

  assert.deepEqual(initial, {
    sessions: [],
    activeSessionId: null,
    connectionState: "connected",
    decks: [],
    activeDeckId: "ops",
    customCommands: [],
    sessionFilterText: "tag:ops"
  });

  const next = reduceRuntimeState(
    {
      ...initial,
      sessions: [
        { id: "a", deckId: "default" },
        { id: "b", deckId: "ops" }
      ],
      activeSessionId: "b"
    },
    { type: "session.remove", sessionId: "b" }
  );

  assert.deepEqual(
    next.sessions.map((session) => session.id),
    ["a"]
  );
  assert.equal(next.activeSessionId, "a");
});

test("store avoids repeated publishes for already-live session activity", () => {
  const store = createStore();
  let publishes = 0;
  store.subscribe(() => {
    publishes += 1;
  });

  store.setSessions([{ id: "a", state: "running" }]);
  publishes = 0;

  store.markSessionActivity("a", { timestamp: 10 });
  store.markSessionActivity("a", { timestamp: 11 });
  store.markSessionActivity("a", { timestamp: 12 });

  assert.equal(publishes, 1);
  assert.equal(store.getState().sessions[0].lifecycleState, "busy");
});

test("store honors authoritative activityState updates from runtime payloads", () => {
  const store = createStore();

  store.setSessions([{ id: "a", state: "running", activityState: "inactive", activityUpdatedAt: 1 }]);
  store.markSessionActivity("a", { timestamp: 10 });
  let session = store.getState().sessions[0];
  assert.equal(session.hasLiveActivity, true);
  assert.equal(session.lifecycleState, "busy");

  store.upsertSession({
    id: "a",
    state: "running",
    activityState: "inactive",
    activityUpdatedAt: 20,
    activityCompletedAt: 20,
    updatedAt: 20
  });
  session = store.getState().sessions[0];
  assert.equal(session.hasLiveActivity, false);
  assert.equal(session.activityState, "inactive");
  assert.equal(session.activityCompletedAt, 20);
  assert.equal(session.lifecycleState, "idle");
});

test("store applies interpretation actions into session-scoped status, meta, tags, artifacts, and notifications", () => {
  const store = createStore();
  store.setSessions([{ id: "s1", state: "running", tags: ["ops"] }]);

  store.applySessionInterpretationActions("s1", [
    { type: "setSessionState", value: "working" },
    { type: "setSessionStatus", value: "Working on plan" },
    {
      type: "setSessionBadges",
      badges: [
        { id: "working", text: "Working", tone: "active" },
        { id: "working", text: "Duplicate", tone: "warn" }
      ]
    },
    { type: "markSessionAttention", active: true },
    { type: "mergeSessionMeta", patch: { tool: "codex", runId: "abc" } },
    { type: "setSessionTags", tags: ["ops", "codex", "OPS"] },
    {
      type: "upsertSessionArtifact",
      artifact: { id: "summary", kind: "summary", title: "Summary", text: "done" }
    },
    {
      type: "pushSessionNotification",
      notification: { id: "n1", level: "info", message: "Interpreter updated session." }
    }
  ]);

  let session = store.getState().sessions.find((entry) => entry.id === "s1");
  assert.equal(session.interpretationState, "working");
  assert.equal(session.statusText, "Working on plan");
  assert.equal(session.attentionActive, true);
  assert.deepEqual(session.tags, ["codex", "ops"]);
  assert.deepEqual(session.meta, { tool: "codex", runId: "abc" });
  assert.deepEqual(session.pluginBadges, [
    { id: "working", text: "Working", tone: "active", pluginId: "" }
  ]);
  assert.equal(session.artifacts.length, 1);
  assert.equal(session.artifacts[0].id, "summary");
  assert.equal(session.notifications.length, 1);
  assert.equal(session.notifications[0].id, "n1");

  store.applySessionInterpretationActions("s1", [
    { type: "mergeSessionMeta", patch: { runId: null } },
    { type: "removeSessionArtifact", artifactId: "summary" },
    { type: "setSessionBadges", badges: [] },
    { type: "markSessionAttention", active: false }
  ]);

  session = store.getState().sessions.find((entry) => entry.id === "s1");
  assert.deepEqual(session.meta, { tool: "codex" });
  assert.deepEqual(session.pluginBadges, []);
  assert.equal(session.attentionActive, false);
  assert.deepEqual(session.artifacts, []);
});

test("store correlates submitted commands with output, interpretation, artifacts, notifications, and completion", () => {
  const store = createStore();
  store.setSessions([{ id: "s1", state: "running" }]);

  const submission = store.recordSessionCommandSubmission("s1", {
    source: "custom-command",
    commandName: "go",
    label: "/go",
    text: "echo hi\npwd\n"
  });
  assert.equal(submission?.label, "/go");
  const activityAt = (submission?.submittedAt || Date.now()) + 100;
  const completedAt = activityAt + 20;

  store.applySessionInterpretationActions("s1", [
    { type: "setSessionState", value: "working" },
    { type: "setSessionStatus", value: "Working (0s • esc to interrupt)" },
    {
      type: "mergeSessionMeta",
      patch: {
        progress: {
          filesDone: 1,
          filesTotal: 4,
          bytesDone: "12MiB",
          bytesTotal: "48MiB",
          speed: "2MiB/s"
        }
      }
    },
    {
      type: "upsertSessionArtifact",
      artifact: { id: "summary", kind: "summary", title: "Summary", text: "done" }
    },
    {
      type: "pushSessionNotification",
      notification: { id: "note-1", level: "info", message: "Command advanced." }
    }
  ]);
  store.markSessionActivity("s1", { timestamp: activityAt });
  store.clearSessionActivity("s1", { timestamp: completedAt });

  const session = store.getState().sessions.find((entry) => entry.id === "s1");
  assert.equal(session.commandCorrelations.length, 1);
  assert.deepEqual(session.commandCorrelations[0], {
    id: "cmd-1",
    source: "custom-command",
    label: "/go",
    text: "echo hi\npwd",
    commandName: "go",
    submittedAt: session.commandCorrelations[0].submittedAt,
    matchedAt: session.commandCorrelations[0].matchedAt,
    firstOutputAt: session.commandCorrelations[0].firstOutputAt,
    statusText: "Working (0s • esc to interrupt)",
    interpretationState: "working",
    progress: {
      filesDone: 1,
      filesTotal: 4,
      bytesDone: "12MiB",
      bytesTotal: "48MiB",
      speed: "2MiB/s"
    },
    artifacts: [{ id: "summary", kind: "summary", title: "Summary" }],
    notificationCount: 1,
    lastNotificationMessage: "Command advanced.",
    completedAt
  });
  assert.equal(typeof session.commandCorrelations[0].submittedAt, "number");
  assert.equal(typeof session.commandCorrelations[0].matchedAt, "number");
  assert.equal(typeof session.commandCorrelations[0].firstOutputAt, "number");
  assert.ok(session.commandCorrelations[0].matchedAt >= session.commandCorrelations[0].submittedAt);
  assert.ok(session.commandCorrelations[0].firstOutputAt >= session.commandCorrelations[0].matchedAt);
  assert.ok(session.commandCorrelations[0].completedAt >= session.commandCorrelations[0].firstOutputAt);
});

test("store wrapper APIs fail closed for invalid deck, command, and submission operations", () => {
  const store = createStore();
  store.setDecks([{ id: "default", name: "Default" }]);
  store.setSessions([{ id: "s1", deckId: "default", quickSendUsage: [{ lookupKey: "project::deploy", count: 2, lastUsedAt: 10 }] }]);
  store.replaceCustomCommands([{ name: "deploy", scope: "session", sessionId: "s1", content: "echo session" }]);

  const listed = store.listCustomCommands();
  listed[0].content = "mutated";
  assert.equal(store.listCustomCommands()[0].content, "echo session");
  const sessionSnapshot = store.getState().sessions[0];
  sessionSnapshot.quickSendUsage[0].count = 99;
  assert.equal(store.getState().sessions[0].quickSendUsage[0].count, 2);
  assert.equal(store.getCustomCommand("   "), null);
  assert.equal(store.getCustomCommand("deploy", { scope: "global" }), null);

  assert.equal(store.upsertCustomCommand({ name: "   ", content: "echo ignored" }), null);
  assert.equal(store.removeCustomCommand("missing"), false);
  assert.equal(store.removeCustomCommand("", { scope: "session", sessionId: "s1" }), false);
  assert.equal(store.recordSessionCommandSubmission("", { label: "ignored", text: "pwd" }), null);
  assert.equal(store.recordSessionCommandSubmission("missing", { label: "ignored", text: "pwd" }), null);

  store.removeSession("missing");
  store.markSessionClosed("missing");
  store.upsertDeck({ id: "ops", name: "Ops" }, { preferredActiveDeckId: "ops" });
  assert.equal(store.getState().activeDeckId, "ops");
  assert.equal(store.setActiveDeck("ops"), false);
  store.removeDeck("missing");

  assert.deepEqual(
    store.getState().decks.map((deck) => deck.id),
    ["default", "ops"]
  );
});

test("store wrapper APIs return existing scoped commands for no-op upserts and remove commands by record object", () => {
  const store = createStore();
  store.replaceCustomCommands([
    {
      name: "deploy",
      scope: "session",
      sessionId: "s1",
      content: "echo session",
      createdAt: 1,
      updatedAt: 2
    }
  ]);

  const unchanged = store.upsertCustomCommand({
    name: "deploy",
    scope: "session",
    sessionId: "s1",
    content: "echo session",
    createdAt: 1,
    updatedAt: 2
  });
  assert.equal(unchanged?.content, "echo session");
  assert.equal(unchanged?.scope, "session");
  assert.equal(unchanged?.sessionId, "s1");

  assert.equal(store.removeCustomCommand(unchanged), true);
  assert.equal(store.listCustomCommands().length, 0);
});

test("store reducer clears unread on same-session activation and removes commands by lookup key or scope fallback", () => {
  const initial = {
    sessions: [{ id: "s1", deckId: "default", hasUnreadActivity: true }],
    activeSessionId: "s1",
    connectionState: "connected",
    decks: [{ id: "default", name: "Default" }],
    activeDeckId: "default",
    customCommands: [],
    sessionFilterText: ""
  };

  const clearedUnread = reduceRuntimeState(initial, { type: "session.active.set", sessionId: "s1" });
  assert.equal(clearedUnread.sessions[0].hasUnreadActivity, false);
  assert.equal(reduceRuntimeState(clearedUnread, { type: "session.active.set", sessionId: "s1" }), clearedUnread);

  const withCommands = reduceRuntimeState(clearedUnread, {
    type: "commands.replace",
    commands: [
      { name: "deploy", scope: "global", content: "echo global" },
      { name: "deploy", scope: "session", sessionId: "s1", content: "echo session" },
      { name: "logs", scope: "project", content: "echo logs" }
    ]
  });
  assert.deepEqual(
    withCommands.customCommands.map((command) => [command.scope, command.sessionId || "", command.name]),
    [
      ["session", "s1", "deploy"],
      ["global", "", "deploy"],
      ["project", "", "logs"]
    ]
  );

  const removedByObject = reduceRuntimeState(withCommands, {
    type: "command.remove",
    command: { name: "deploy", scope: "session", sessionId: "s1", content: "echo session" }
  });
  assert.deepEqual(
    removedByObject.customCommands.map((command) => [command.scope, command.sessionId || "", command.name]),
    [
      ["global", "", "deploy"],
      ["project", "", "logs"]
    ]
  );

  const removedByScopeFallback = reduceRuntimeState(removedByObject, {
    type: "command.remove",
    name: "logs",
    scope: "project"
  });
  assert.deepEqual(
    removedByScopeFallback.customCommands.map((command) => [command.scope, command.sessionId || "", command.name]),
    [["global", "", "deploy"]]
  );
  assert.equal(
    reduceRuntimeState(removedByScopeFallback, {
      type: "command.remove",
      name: "missing"
    }),
    removedByScopeFallback
  );
});
