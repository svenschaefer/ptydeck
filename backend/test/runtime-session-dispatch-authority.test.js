import test from "node:test";
import assert from "node:assert/strict";

import { createRuntimeSessionDispatchAuthority } from "../src/runtime-session-dispatch-authority.js";

test("runtime session dispatch authority wires shared collaborators into the extracted dispatch seams", () => {
  const captures = {
    resource: null,
    control: null,
    session: null,
    events: null
  };
  const sentinels = {
    resourceDispatch: { dispatchResourceRequest: () => "resource" },
    sessionControlDispatch: { dispatchSessionControlRequest: () => "control" },
    sessionDispatch: { dispatchSessionRequest: () => "session" },
    runtimeSessionEventAuthority: { registerManagerEventHandlers: () => "events" }
  };
  const shared = {
    validateResponse: Symbol("validateResponse"),
    parseBooleanQueryParam: Symbol("parseBooleanQueryParam"),
    normalizeCustomCommandScope: Symbol("normalizeCustomCommandScope"),
    normalizeCustomCommandSessionId: Symbol("normalizeCustomCommandSessionId"),
    listShareLinks: Symbol("listShareLinks"),
    createShareLink: Symbol("createShareLink"),
    getApiShareLinkOrThrow: Symbol("getApiShareLinkOrThrow"),
    revokeShareLink: Symbol("revokeShareLink"),
    persistNow: Symbol("persistNow"),
    getApiSessionOrThrow: Symbol("getApiSessionOrThrow"),
    listApiSessions: Symbol("listApiSessions"),
    listCustomCommands: Symbol("listCustomCommands"),
    getCustomCommandOrThrow: Symbol("getCustomCommandOrThrow"),
    hasCustomCommand: Symbol("hasCustomCommand"),
    upsertCustomCommand: Symbol("upsertCustomCommand"),
    deleteCustomCommand: Symbol("deleteCustomCommand"),
    broadcast: Symbol("broadcast"),
    listDecks: Symbol("listDecks"),
    createDeck: Symbol("createDeck"),
    getDeckOrThrow: Symbol("getDeckOrThrow"),
    toApiDeck: Symbol("toApiDeck"),
    updateDeck: Symbol("updateDeck"),
    deleteDeck: Symbol("deleteDeck"),
    broadcastSessionUpdated: Symbol("broadcastSessionUpdated"),
    broadcastDeckUpsert: Symbol("broadcastDeckUpsert"),
    broadcastDeckDeleted: Symbol("broadcastDeckDeleted"),
    moveSessionToDeck: Symbol("moveSessionToDeck"),
    listLayoutProfiles: Symbol("listLayoutProfiles"),
    createLayoutProfile: Symbol("createLayoutProfile"),
    getLayoutProfileOrThrow: Symbol("getLayoutProfileOrThrow"),
    toApiLayoutProfile: Symbol("toApiLayoutProfile"),
    updateLayoutProfile: Symbol("updateLayoutProfile"),
    deleteLayoutProfile: Symbol("deleteLayoutProfile"),
    listConnectionProfiles: Symbol("listConnectionProfiles"),
    createConnectionProfile: Symbol("createConnectionProfile"),
    getConnectionProfileOrThrow: Symbol("getConnectionProfileOrThrow"),
    toApiConnectionProfile: Symbol("toApiConnectionProfile"),
    updateConnectionProfile: Symbol("updateConnectionProfile"),
    deleteConnectionProfile: Symbol("deleteConnectionProfile"),
    listWorkspacePresets: Symbol("listWorkspacePresets"),
    createWorkspacePreset: Symbol("createWorkspacePreset"),
    getWorkspacePresetOrThrow: Symbol("getWorkspacePresetOrThrow"),
    toApiWorkspacePreset: Symbol("toApiWorkspacePreset"),
    updateWorkspacePreset: Symbol("updateWorkspacePreset"),
    deleteWorkspacePreset: Symbol("deleteWorkspacePreset"),
    listSshTrustEntries: Symbol("listSshTrustEntries"),
    upsertSshTrustEntry: Symbol("upsertSshTrustEntry"),
    syncSshKnownHostsFile: Symbol("syncSshKnownHostsFile"),
    probeSshHostKeysOrThrow: Symbol("probeSshHostKeysOrThrow"),
    deleteSshTrustEntry: Symbol("deleteSshTrustEntry"),
    messagingRuntime: Symbol("messagingRuntime"),
    takeSessionControlOrThrow: Symbol("takeSessionControlOrThrow"),
    takeSessionControlScopeOrThrow: Symbol("takeSessionControlScopeOrThrow"),
    releaseSessionControlOrThrow: Symbol("releaseSessionControlOrThrow"),
    transferSessionControlOrThrow: Symbol("transferSessionControlOrThrow"),
    renameSessionControlClientOrThrow: Symbol("renameSessionControlClientOrThrow"),
    forgetSessionControlClientOrThrow: Symbol("forgetSessionControlClientOrThrow"),
    createSessionRateLimiter: Symbol("createSessionRateLimiter"),
    rateLimitRestCreateMax: 7,
    normalizeConnectionProfileIdInput: Symbol("normalizeConnectionProfileIdInput"),
    normalizeSessionKind: Symbol("normalizeSessionKind"),
    normalizeSessionStartupConfig: Symbol("normalizeSessionStartupConfig"),
    normalizeSessionRemoteConnection: Symbol("normalizeSessionRemoteConnection"),
    normalizeSessionRemoteAuth: Symbol("normalizeSessionRemoteAuth"),
    normalizeSessionRemoteSecret: Symbol("normalizeSessionRemoteSecret"),
    normalizeSessionThemeSlots: Symbol("normalizeSessionThemeSlots"),
    normalizeSessionNote: Symbol("normalizeSessionNote"),
    normalizeSessionMouseForwardingMode: Symbol("normalizeSessionMouseForwardingMode"),
    normalizeSessionInputSafetyProfile: Symbol("normalizeSessionInputSafetyProfile"),
    normalizeSessionTags: Symbol("normalizeSessionTags"),
    hasKnownDeck: Symbol("hasKnownDeck"),
    normalizeConnectionProfileDeckId: Symbol("normalizeConnectionProfileDeckId"),
    normalizeQuickSendUsageMutation: Symbol("normalizeQuickSendUsageMutation"),
    buildSessionReplayExportOrThrow: Symbol("buildSessionReplayExportOrThrow"),
    buildSessionReplayExcerptOrThrow: Symbol("buildSessionReplayExcerptOrThrow"),
    buildSessionFileDownloadOrThrow: Symbol("buildSessionFileDownloadOrThrow"),
    uploadSessionFileOrThrow: Symbol("uploadSessionFileOrThrow"),
    ensureSessionControllerAccess: Symbol("ensureSessionControllerAccess"),
    manager: Symbol("manager"),
    assignSessionQuickIdToken: Symbol("assignSessionQuickIdToken"),
    deleteSessionQuickIdToken: Symbol("deleteSessionQuickIdToken"),
    createDefaultSessionOwner: Symbol("createDefaultSessionOwner"),
    setSessionControlState: Symbol("setSessionControlState"),
    deleteSessionControlState: Symbol("deleteSessionControlState"),
    reconcileSessionControllerForSession: Symbol("reconcileSessionControllerForSession"),
    toApiSession: Symbol("toApiSession"),
    persistSoon: Symbol("persistSoon"),
    removeCustomCommandsForSession: Symbol("removeCustomCommandsForSession"),
    cleanupLayoutProfiles: Symbol("cleanupLayoutProfiles"),
    cleanupWorkspacePresets: Symbol("cleanupWorkspacePresets"),
    deleteUnrestoredSession: Symbol("deleteUnrestoredSession"),
    deleteSessionDeckAssignment: Symbol("deleteSessionDeckAssignment"),
    setPendingSessionDeckAssignment: Symbol("setPendingSessionDeckAssignment"),
    swapSessionQuickIds: Symbol("swapSessionQuickIds"),
    recordSessionLastInput: Symbol("recordSessionLastInput"),
    defaultSshClient: "ssh",
    sessionKindSsh: "ssh",
    startupWarmup: Symbol("startupWarmup"),
    metrics: Symbol("metrics"),
    logDebug: Symbol("logDebug"),
    normalizeTraceSeed: Symbol("normalizeTraceSeed")
  };

  const authority = createRuntimeSessionDispatchAuthority({
    ...shared,
    createResourceDispatchImpl(options) {
      captures.resource = options;
      return sentinels.resourceDispatch;
    },
    createSessionControlDispatchImpl(options) {
      captures.control = options;
      return sentinels.sessionControlDispatch;
    },
    createSessionDispatchImpl(options) {
      captures.session = options;
      return sentinels.sessionDispatch;
    },
    createSessionEventAuthorityImpl(options) {
      captures.events = options;
      return sentinels.runtimeSessionEventAuthority;
    }
  });

  assert.equal(authority.resourceDispatch, sentinels.resourceDispatch);
  assert.equal(authority.sessionControlDispatch, sentinels.sessionControlDispatch);
  assert.equal(authority.sessionDispatch, sentinels.sessionDispatch);
  assert.equal(authority.runtimeSessionEventAuthority, sentinels.runtimeSessionEventAuthority);

  assert.equal(captures.resource.broadcast, shared.broadcast);
  assert.equal(captures.resource.broadcastSessionUpdated, shared.broadcastSessionUpdated);
  assert.equal(captures.resource.broadcastDeckUpsert, shared.broadcastDeckUpsert);
  assert.equal(captures.resource.broadcastDeckDeleted, shared.broadcastDeckDeleted);
  assert.equal(captures.resource.toApiDeck, shared.toApiDeck);
  assert.equal(captures.resource.getApiSessionOrThrow, shared.getApiSessionOrThrow);

  assert.equal(captures.control.takeSessionControlOrThrow, shared.takeSessionControlOrThrow);
  assert.equal(captures.control.renameSessionControlClientOrThrow, shared.renameSessionControlClientOrThrow);
  assert.equal(captures.control.getApiSessionOrThrow, shared.getApiSessionOrThrow);
  assert.equal(captures.control.persistNow, shared.persistNow);

  assert.equal(captures.session.broadcast, shared.broadcast);
  assert.equal(captures.session.broadcastSessionUpdated, shared.broadcastSessionUpdated);
  assert.equal(captures.session.toApiSession, shared.toApiSession);
  assert.equal(captures.session.persistSoon, shared.persistSoon);
  assert.equal(captures.session.sessionKindSsh, shared.sessionKindSsh);

  assert.equal(captures.events.manager, shared.manager);
  assert.equal(captures.events.messagingRuntime, shared.messagingRuntime);
  assert.equal(captures.events.startupWarmup, shared.startupWarmup);
  assert.equal(captures.events.broadcast, shared.broadcast);
  assert.equal(captures.events.logDebug, shared.logDebug);
  assert.equal(captures.events.normalizeTraceSeed, shared.normalizeTraceSeed);
});

test("runtime session dispatch authority falls back to console.error for event authority logging", () => {
  const originalConsoleError = console.error;
  const seen = [];
  console.error = (...args) => {
    seen.push(args);
  };

  try {
    const authority = createRuntimeSessionDispatchAuthority({
      createResourceDispatchImpl: () => ({}),
      createSessionControlDispatchImpl: () => ({}),
      createSessionDispatchImpl: () => ({}),
      createSessionEventAuthorityImpl(options) {
        options.logError("boom", 7);
        return { registered: true };
      }
    });

    assert.deepEqual(seen, [["boom", 7]]);
    assert.deepEqual(authority.runtimeSessionEventAuthority, { registered: true });
  } finally {
    console.error = originalConsoleError;
  }
});
