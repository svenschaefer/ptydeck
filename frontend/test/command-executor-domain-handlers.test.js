import test from "node:test";
import assert from "node:assert/strict";

import { createCommandExecutorDomainHandlers } from "../src/public/command-executor-domain-handlers.js";

test("command executor domain handlers route connection draft commands through extracted hooks", async () => {
  const draftCalls = [];
  let currentDraft = null;
  const handlers = createCommandExecutorDomainHandlers({
    defaultDeckId: "default",
    getSessionById: (sessionId, sessions) => sessions.find((session) => session.id === sessionId) || null,
    formatUsage: (command, subcommand = "") => `usage:${command}:${subcommand}`,
    normalizeKeyword: (value) => String(value || "").trim().toLowerCase(),
    parseJsonObjectToken: (text) => JSON.parse(text),
    normalizeConnectionProfileLaunch: (launch) => launch,
    resolveActiveOrDirectTargetSession: () => ({ error: "", session: { id: "s-1", deckId: "ops", name: "Ops" } }),
    createConnectionProfileFromSession: async (session, name) => `saved:${session.id}:${name}`,
    setConnectionProfileDraft: (draft) => {
      currentDraft = draft;
      draftCalls.push(draft);
    },
    getConnectionProfileDraft: () => currentDraft,
    saveConnectionProfileDraft: async () => "draft-saved",
    loadConnectionProfileDraftFromActive: () => {
      draftCalls.push("loaded-active");
    }
  });

  assert.equal(
    await handlers.executeConnectionCommand({
      args: ["new", "Ops", "Draft"],
      sessions: [{ id: "s-1", deckId: "ops", name: "Ops" }],
      activeSessionId: "s-1"
    }),
    "draft-saved"
  );
  assert.equal(draftCalls[0].deckId, "ops");
  assert.equal(draftCalls[0].name, "Ops Draft");

  assert.equal(
    await handlers.executeConnectionCommand({
      args: ["draft", "set", "{\"deckId\":\"dev\",\"shell\":\"bash\",\"startCwd\":\"/tmp\",\"activeThemeProfile\":{},\"inactiveThemeProfile\":{}}"],
      sessions: [],
      activeSessionId: ""
    }),
    "Updated the connection profile draft."
  );
  assert.equal(currentDraft.deckId, "dev");
  assert.equal(currentDraft.launch.shell, "bash");

  assert.equal(
    await handlers.executeConnectionCommand({
      args: ["draft", "active"],
      interpreted: {},
      sessions: [{ id: "s-1", deckId: "ops", name: "Ops" }],
      activeSessionId: "s-1"
    }),
    "Loaded the active session into a new connection profile draft."
  );
});

test("command executor domain handlers manage workspace and broadcast paths through extracted seams", async () => {
  const calls = [];
  const handlers = createCommandExecutorDomainHandlers({
    defaultDeckId: "default",
    formatUsage: (command, subcommand = "") => `usage:${command}:${subcommand}`,
    normalizeKeyword: (value) => String(value || "").trim().toLowerCase(),
    getActiveDeck: () => ({ id: "ops", name: "Ops" }),
    listWorkspacePresets: () => [
      {
        id: "ops",
        name: "Ops Workspace",
        workspace: { activeDeckId: "ops", layoutProfileId: "focus", deckGroups: { ops: { groups: [{}] } } }
      }
    ],
    resolveWorkspacePreset: (selector) => (selector === "ops" ? { preset: { id: "ops", name: "Ops Workspace" }, error: "" } : { preset: null, error: `Unknown workspace preset: ${selector}` }),
    formatWorkspacePresetDetail: (preset) => `detail:${preset.id}`,
    createWorkspacePresetFromCurrent: async (name) => `saved:${name}`,
    applyWorkspacePreset: async (presetId) => `applied:${presetId}`,
    renameWorkspacePreset: async (presetId, name) => `renamed:${presetId}:${name}`,
    deleteWorkspacePreset: async (presetId) => `deleted:${presetId}`,
    listWorkspaceGroupsForDeck: (deckId) => (deckId === "ops" ? [{ id: "build", name: "Build", sessionIds: ["s-1"] }] : []),
    resolveWorkspaceGroup: (selector, deckId) =>
      selector === "build" && deckId === "ops" ? { group: { id: "build", name: "Build" }, error: "" } : { group: null, error: `Unknown workspace group: ${selector}` },
    saveWorkspaceGroup: async (name, deckId) => `group-saved:${deckId}:${name}`,
    applyWorkspaceGroup: async (groupId, deckId) => `group-applied:${deckId}:${groupId}`,
    renameWorkspaceGroup: async (groupId, name, deckId) => `group-renamed:${deckId}:${groupId}:${name}`,
    deleteWorkspaceGroup: async (groupId, deckId) => `group-deleted:${deckId}:${groupId}`,
    clearWorkspaceGroup: async (deckId) => `group-cleared:${deckId}`,
    getBroadcastStatus: () => "Broadcast: off.",
    enableGroupBroadcast: async (selector) => {
      calls.push(["broadcast-group", selector]);
      return `broadcast:${selector}`;
    },
    disableBroadcast: async () => "Broadcast disabled."
  });

  assert.equal(
    await handlers.executeWorkspaceCommand({ args: ["list"] }),
    "[ops] Ops Workspace -> deck=ops layout=focus decks=1"
  );
  assert.equal(await handlers.executeWorkspaceCommand({ args: ["show", "ops"] }), "detail:ops");
  assert.equal(await handlers.executeWorkspaceCommand({ args: ["group", "apply", "build"] }), "group-applied:ops:build");
  assert.equal(await handlers.executeBroadcastCommand({ args: ["group", "build"] }), "broadcast:build");
  assert.deepEqual(calls, [["broadcast-group", "build"]]);
});

test("command executor domain handlers manage share commands and return null for unrelated commands", async () => {
  const clipboardWrites = [];
  const handlers = createCommandExecutorDomainHandlers({
    formatUsage: (command, subcommand = "") => `usage:${command}:${subcommand}`,
    resolveActiveOrDirectTargetSession: () => ({ error: "", session: { id: "s-1", name: "Ops", deckId: "ops" } }),
    getActiveDeck: () => ({ id: "ops", name: "Ops" }),
    resolveDeckToken: (selector, decks) => ({ deck: decks.find((deck) => deck.id === selector) || null, error: `Unknown deck: ${selector}` }),
    listShares: async () => [],
    createShareLink: async ({ targetType, targetId }) => ({
      id: `${targetType}-${targetId}`,
      targetType,
      targetId,
      permissionMode: "read_only",
      active: true,
      expiresAt: 1700000000000,
      joinUrl: `https://example.invalid/${targetType}/${targetId}`
    }),
    revokeShareLink: async (shareId) => ({
      id: shareId,
      targetType: "deck",
      targetId: "ops",
      permissionMode: "read_only",
      revokedAt: 1700000001000,
      expiresAt: 1700000000000
    }),
    writeClipboardText: async (value) => {
      clipboardWrites.push(value);
      return true;
    },
    formatShareLinkSummary: (shareLink) => `[${shareLink.id}] ${shareLink.targetType}:${shareLink.targetId}`
  });

  const sessions = [{ id: "s-1", name: "Ops", deckId: "ops" }];
  const decks = [{ id: "ops", name: "Ops" }];

  assert.equal(await handlers.executeStructuredCommand({ command: "noop" }), null);
  assert.equal(
    await handlers.executeShareCommand({ args: ["session"], interpreted: {}, sessions, decks, activeSessionId: "s-1" }),
    "[session-s-1] session:s-1\nCopied join URL to clipboard.\nhttps://example.invalid/session/s-1"
  );
  assert.equal(
    await handlers.executeShareCommand({ args: ["deck"], interpreted: {}, sessions, decks, activeSessionId: "s-1" }),
    "[deck-ops] deck:ops\nCopied join URL to clipboard.\nhttps://example.invalid/deck/ops"
  );
  assert.equal(
    await handlers.executeShareCommand({ args: ["revoke", "deck-ops"], sessions, decks }),
    "Revoked [deck-ops] deck:ops."
  );
  assert.deepEqual(clipboardWrites, [
    "https://example.invalid/session/s-1",
    "https://example.invalid/deck/ops"
  ]);
});
