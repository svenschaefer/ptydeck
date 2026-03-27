import test from "node:test";
import assert from "node:assert/strict";

import { createCommandTargetRuntimeController } from "../src/public/command-target-runtime-controller.js";

test("command-target runtime controller delegates resolver and parser calls to command engine", () => {
  const calls = [];
  const commandEngine = {
    resolveSessionToken(token, sessions) {
      calls.push(["resolveSessionToken", token, sessions.length]);
      return { session: sessions[0], error: "" };
    },
    resolveDeckToken(token, decks) {
      calls.push(["resolveDeckToken", token, decks.length]);
      return { deck: decks[0], error: "" };
    },
    resolveQuickSwitchTarget(selectorText, sessions) {
      calls.push(["resolveQuickSwitchTarget", selectorText, sessions.length]);
      return { kind: "session", target: sessions[0] };
    },
    formatQuickSwitchPreview(selectorText, sessions) {
      calls.push(["formatQuickSwitchPreview", selectorText, sessions.length]);
      return `preview:${selectorText}`;
    },
    resolveTargetSelectors(selectorText, sessions, options) {
      calls.push(["resolveTargetSelectors", selectorText, sessions.length, options.source]);
      return { sessions, error: "" };
    },
    resolveFilterSelectors(selectorText, sessions, options) {
      calls.push(["resolveFilterSelectors", selectorText, sessions.length, options.scopeMode]);
      return { sessions: sessions.slice(0, 1), error: "" };
    },
    resolveSettingsTargets(selectorText, sessions, activeSessionId) {
      calls.push(["resolveSettingsTargets", selectorText, sessions.length, activeSessionId]);
      return { sessions: sessions.slice(0, 1), error: "" };
    },
    parseSettingsPayload(raw) {
      calls.push(["parseSettingsPayload", raw]);
      return { ok: true, payload: { raw } };
    },
    parseSizeCommandArgs(args, currentCols, currentRows) {
      calls.push(["parseSizeCommandArgs", args.join(","), currentCols, currentRows]);
      return { ok: true, cols: currentCols, rows: currentRows };
    },
    parseDirectTargetRoutingInput(rawInput) {
      calls.push(["parseDirectTargetRoutingInput", rawInput]);
      return { matched: true, targetToken: "1", payload: "pwd" };
    },
    parseCustomDefinition(rawInput) {
      calls.push(["parseCustomDefinition", rawInput]);
      return { ok: true, name: "go", content: rawInput };
    }
  };
  const sessions = [{ id: "s1" }, { id: "s2" }];
  const decks = [{ id: "d1" }];
  const controller = createCommandTargetRuntimeController({ commandEngine });

  assert.deepEqual(controller.resolveSessionToken("1", sessions), { session: sessions[0], error: "" });
  assert.deepEqual(controller.resolveDeckToken("deck", decks), { deck: decks[0], error: "" });
  assert.deepEqual(controller.resolveQuickSwitchTarget(">1", sessions), { kind: "session", target: sessions[0] });
  assert.equal(controller.formatQuickSwitchPreview(">1", sessions), "preview:>1");
  assert.deepEqual(controller.resolveTargetSelectors("1", sessions, { source: "slash" }), { sessions, error: "" });
  assert.deepEqual(controller.resolveFilterSelectors("tag", sessions, { scopeMode: "all" }), {
    sessions: sessions.slice(0, 1),
    error: ""
  });
  assert.deepEqual(controller.resolveSettingsTargets("active", sessions, "s1"), {
    sessions: sessions.slice(0, 1),
    error: ""
  });
  assert.deepEqual(controller.parseSettingsPayload("{\"a\":1}"), { ok: true, payload: { raw: "{\"a\":1}" } });
  assert.deepEqual(controller.parseSizeCommandArgs(["80", "40"], 80, 40), { ok: true, cols: 80, rows: 40 });
  assert.deepEqual(controller.parseDirectTargetRoutingInput("@1 pwd"), {
    matched: true,
    targetToken: "1",
    payload: "pwd"
  });
  assert.deepEqual(controller.parseCustomDefinition("/custom go pwd"), {
    ok: true,
    name: "go",
    content: "/custom go pwd"
  });

  assert.deepEqual(calls, [
    ["resolveSessionToken", "1", 2],
    ["resolveDeckToken", "deck", 1],
    ["resolveQuickSwitchTarget", ">1", 2],
    ["formatQuickSwitchPreview", ">1", 2],
    ["resolveTargetSelectors", "1", 2, "slash"],
    ["resolveFilterSelectors", "tag", 2, "all"],
    ["resolveSettingsTargets", "active", 2, "s1"],
    ["parseSettingsPayload", "{\"a\":1}"],
    ["parseSizeCommandArgs", "80,40", 80, 40],
    ["parseDirectTargetRoutingInput", "@1 pwd"],
    ["parseCustomDefinition", "/custom go pwd"]
  ]);
});

test("command-target runtime controller activates session targets across decks", () => {
  const state = {
    activeSessionId: "s0",
    activeDeckId: "deck-a"
  };
  const calls = [];
  const controller = createCommandTargetRuntimeController({
    commandEngine: {},
    store: {
      getState: () => state,
      setActiveSession(sessionId) {
        state.activeSessionId = sessionId;
        calls.push(["setActiveSession", sessionId]);
      }
    },
    setActiveDeck(deckId) {
      state.activeDeckId = deckId;
      calls.push(["setActiveDeck", deckId]);
      return true;
    },
    resolveSessionDeckId: (session) => session.deckId,
    formatSessionToken: (sessionId) => `Q-${sessionId}`,
    formatSessionDisplayName: (session) => session.name
  });

  const result = controller.activateSessionTarget({ id: "s2", name: "Codex", deckId: "deck-b" });

  assert.deepEqual(result, {
    ok: true,
    message: "Active session: [Q-s2] Codex.",
    noop: false
  });
  assert.deepEqual(calls, [
    ["setActiveDeck", "deck-b"],
    ["setActiveSession", "s2"]
  ]);
  assert.equal(state.activeDeckId, "deck-b");
  assert.equal(state.activeSessionId, "s2");
});

test("command-target runtime controller reports noop and failures for already-active or unknown targets", () => {
  const state = {
    activeSessionId: "s1",
    activeDeckId: "deck-a"
  };
  const controller = createCommandTargetRuntimeController({
    store: {
      getState: () => state,
      setActiveSession() {
        throw new Error("should not be called");
      }
    },
    setActiveDeck: () => false,
    resolveSessionDeckId: (session) => session.deckId,
    formatSessionToken: (sessionId) => sessionId,
    formatSessionDisplayName: (session) => session.name
  });

  assert.deepEqual(controller.activateSessionTarget({ id: "s1", name: "Shell", deckId: "deck-a" }), {
    ok: true,
    message: "Session already active: [s1] Shell.",
    noop: true
  });
  assert.deepEqual(controller.activateDeckTarget({ id: "deck-a", name: "Main" }), {
    ok: true,
    message: "Deck already active: [deck-a] Main.",
    noop: true
  });
  assert.deepEqual(controller.activateDeckTarget({ id: "deck-b", name: "Other" }), {
    ok: false,
    message: "Failed to switch deck: deck-b"
  });
  assert.deepEqual(controller.activateSessionTarget(null), {
    ok: false,
    message: "Unknown session target."
  });
  assert.deepEqual(controller.activateDeckTarget(null), {
    ok: false,
    message: "Unknown deck target."
  });
});

test("command-target runtime controller tracks active target summaries and recent switches", () => {
  const listeners = [];
  const state = {
    sessions: [
      {
        id: "s1",
        name: "Ops",
        inputSafetyProfile: {
          requireValidShellSyntax: true,
          confirmOnIncompleteShellConstruct: true
        }
      },
      {
        id: "s2",
        name: "Agent",
        inputSafetyProfile: {
          confirmOnRecentTargetSwitch: true
        }
      }
    ],
    activeSessionId: "s1",
    activeDeckId: "deck-a"
  };
  let nowValue = 1000;
  const controller = createCommandTargetRuntimeController({
    store: {
      getState: () => state,
      subscribe(handler) {
        listeners.push(handler);
      }
    },
    nowMs: () => nowValue,
    formatSessionToken: (sessionId) => (sessionId === "s1" ? "7" : "8"),
    formatSessionDisplayName: (session) => session.name
  });

  assert.equal(controller.formatActiveTargetSummary(), "Target: [7] Ops");
  assert.equal(controller.getLastActiveSessionSwitchAt(), 0);

  nowValue = 4321;
  state.activeSessionId = "s2";
  listeners[0](state);

  assert.equal(controller.getLastActiveSessionSwitchAt(), 4321);
  assert.equal(controller.formatActiveTargetSummary(), "Target: [8] Agent");
});
