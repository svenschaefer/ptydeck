import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/public/store.js";

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
