import test from "node:test";
import assert from "node:assert/strict";

import { createSplitLayoutRuntimeController } from "../src/public/split-layout-runtime-controller.js";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.dataset = {};
    this.hidden = false;
    this.value = "";
    this.textContent = "";
    this.className = "";
    this.listeners = new Map();
    this.appendCalls = [];
    this.classList = {
      add: (...tokens) => {
        const next = new Set(this.className ? this.className.split(/\s+/).filter(Boolean) : []);
        for (const token of tokens) {
          next.add(token);
        }
        this.className = Array.from(next).join(" ");
      }
    };
  }

  appendChild(child) {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    child.parentNode = this;
    this.children.push(child);
    this.appendCalls.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
      child.parentNode = null;
    }
    return child;
  }

  get firstChild() {
    return this.children[0] || null;
  }

  addEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  dispatch(type, event = {}) {
    for (const handler of this.listeners.get(type) || []) {
      handler({ type, preventDefault() {}, ...event });
    }
  }

  click() {
    this.dispatch("click");
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 1000, height: 800 };
  }
}

function createDocumentRef() {
  return {
    createElement(tagName) {
      return new FakeElement(tagName);
    }
  };
}

function createWindowRef() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      const next = listeners.get(type) || [];
      next.push(handler);
      listeners.set(type, next);
    },
    removeEventListener(type, handler) {
      const next = listeners.get(type) || [];
      listeners.set(
        type,
        next.filter((entry) => entry !== handler)
      );
    },
    dispatch(type, event = {}) {
      for (const handler of listeners.get(type) || []) {
        handler({
          type,
          preventDefault() {},
          ...event
        });
      }
    }
  };
}

test("split-layout runtime normalizes weights and supports split/assign/remove mutations", () => {
  const controller = createSplitLayoutRuntimeController();

  controller.replaceDeckSplitLayouts({
    ops: {
      root: {
        type: "row",
        weights: [2, 1],
        children: [
          { type: "pane", paneId: "left" },
          { type: "pane", paneId: "right" }
        ]
      },
      paneSessions: {
        left: ["s1"],
        right: ["s2"]
      }
    }
  });

  assert.deepEqual(controller.getDeckSplitLayout("ops").root.weights, [0.666667, 0.333333]);

  controller.replaceDeckSplitLayouts({
    ops: {
      root: { type: "pane", paneId: "main" },
      paneSessions: { main: ["s1", "s2"] }
    }
  });

  controller.splitPane("ops", "main", "row");
  let entry = controller.getDeckSplitLayout("ops");
  assert.equal(entry.root.type, "row");
  assert.deepEqual(entry.root.weights, [0.5, 0.5]);
  assert.deepEqual(entry.root.children[0], { type: "pane", paneId: "main" });
  assert.equal(entry.root.children[1].paneId, "main-right");

  controller.assignSessionToPane("ops", "main-right", "s2");
  entry = controller.getDeckSplitLayout("ops");
  assert.deepEqual(entry.paneSessions.main, ["s1"]);
  assert.deepEqual(entry.paneSessions["main-right"], ["s2"]);

  controller.setContainerWeightRatio("ops", [], 0, 0.75);
  entry = controller.getDeckSplitLayout("ops");
  assert.deepEqual(entry.root.weights, [0.75, 0.25]);

  controller.removePane("ops", "main-right");
  entry = controller.getDeckSplitLayout("ops");
  assert.deepEqual(entry.root, { type: "pane", paneId: "main" });
  assert.deepEqual(entry.paneSessions.main, ["s1", "s2"]);
});

test("split-layout runtime renders pane bodies and keeps idempotent card placement", () => {
  const gridEl = new FakeElement("main");
  const controller = createSplitLayoutRuntimeController({
    documentRef: createDocumentRef(),
    gridEl,
    defaultDeckId: "default",
    sortSessionsByQuickId: (sessions) => sessions.slice()
  });

  controller.replaceDeckSplitLayouts({
    ops: {
      root: {
        type: "row",
        weights: [1, 1],
        children: [
          { type: "pane", paneId: "left" },
          { type: "pane", paneId: "right" }
        ]
      },
      paneSessions: {
        left: ["s1"],
        right: ["s2"]
      }
    }
  });

  const node1 = new FakeElement("article");
  const node2 = new FakeElement("article");
  const node3 = new FakeElement("article");
  const terminals = new Map([
    ["s1", { element: node1 }],
    ["s2", { element: node2 }],
    ["s3", { element: node3 }]
  ]);
  const orderedSessions = [{ id: "s1" }, { id: "s2" }, { id: "s3" }];
  const deckSessions = [{ id: "s1", name: "one" }, { id: "s2", name: "two" }];

  controller.renderDeckLayout({
    deckId: "ops",
    orderedSessions,
    deckSessions,
    activeSessionId: "s1",
    terminals
  });

  const firstBody = node1.parentNode;
  const secondBody = node2.parentNode;
  assert.ok(firstBody);
  assert.ok(secondBody);
  assert.notEqual(firstBody, secondBody);
  assert.equal(node3.parentNode.className.includes("terminal-grid-stash"), true);
  const firstAppendCount = firstBody.appendCalls.length;
  const secondAppendCount = secondBody.appendCalls.length;

  controller.renderDeckLayout({
    deckId: "ops",
    orderedSessions,
    deckSessions,
    activeSessionId: "s1",
    terminals
  });

  assert.equal(node1.parentNode, firstBody);
  assert.equal(node2.parentNode, secondBody);
  assert.equal(firstBody.appendCalls.length, firstAppendCount);
  assert.equal(secondBody.appendCalls.length, secondAppendCount);
});

test("split-layout runtime captures cloned layout snapshots without leaking internal mutation", () => {
  const controller = createSplitLayoutRuntimeController();

  controller.replaceDeckSplitLayouts({
    ops: {
      root: { type: "pane", paneId: "main" },
      paneSessions: { main: ["s1"] }
    }
  });

  const captured = controller.captureDeckSplitLayouts();
  captured.ops.root.paneId = "mutated";
  captured.ops.paneSessions.main.push("s2");

  const current = controller.getDeckSplitLayout("ops");
  assert.deepEqual(current.root, { type: "pane", paneId: "main" });
  assert.deepEqual(current.paneSessions.main, ["s1"]);
});

test("split-layout runtime normalizes malformed roots, skips invalid deck ids, and dedupes pane sessions", () => {
  const controller = createSplitLayoutRuntimeController();

  controller.replaceDeckSplitLayouts({
    " ": {
      root: { type: "pane", paneId: "ignored" },
      paneSessions: { ignored: ["sx"] }
    },
    ops: {
      root: {
        type: "row",
        weights: [0, "bad", 2],
        children: [
          { type: "pane", paneId: "left" },
          { type: "pane", paneId: " " },
          { type: "pane", paneId: "right" }
        ]
      },
      paneSessions: {
        left: ["s1", "s1", " ", "s2"],
        right: "invalid",
        ghost: ["sx"]
      }
    },
    docs: {
      root: {
        type: "column",
        children: [{ type: "pane", paneId: "solo" }]
      },
      paneSessions: { solo: ["s9"] }
    }
  });

  const ops = controller.getDeckSplitLayout("ops");
  assert.deepEqual(ops.root, {
    type: "row",
    children: [
      { type: "pane", paneId: "left" },
      { type: "pane", paneId: "right" }
    ],
    weights: [0.5, 0.5]
  });
  assert.deepEqual(ops.paneSessions, {
    left: ["s1", "s2"],
    right: []
  });

  const docs = controller.getDeckSplitLayout("docs");
  assert.deepEqual(docs.root, { type: "pane", paneId: "solo" });
  assert.deepEqual(docs.paneSessions, { solo: ["s9"] });
  assert.deepEqual(controller.getDeckSplitLayout(""), {
    root: { type: "pane", paneId: "main" },
    paneSessions: { main: [] }
  });
});

test("split-layout runtime orders pane contents by current quick-id session order", () => {
  const gridEl = new FakeElement("main");
  const controller = createSplitLayoutRuntimeController({
    documentRef: createDocumentRef(),
    gridEl,
    defaultDeckId: "default",
    sortSessionsByQuickId: (sessions) => sessions.slice()
  });

  controller.replaceDeckSplitLayouts({
    ops: {
      root: { type: "pane", paneId: "main" },
      paneSessions: { main: ["s1", "s2"] }
    }
  });

  const node1 = new FakeElement("article");
  const node2 = new FakeElement("article");
  const terminals = new Map([
    ["s1", { element: node1 }],
    ["s2", { element: node2 }]
  ]);

  controller.renderDeckLayout({
    deckId: "ops",
    orderedSessions: [{ id: "s2" }, { id: "s1" }],
    deckSessions: [{ id: "s2", name: "two" }, { id: "s1", name: "one" }],
    activeSessionId: "s2",
    terminals
  });

  const body = node1.parentNode;
  assert.ok(body);
  assert.deepEqual(body.children, [node2, node1]);
  assert.deepEqual(controller.getDeckSplitLayout("ops").paneSessions.main, ["s2", "s1"]);
});

test("split-layout runtime hides pane chrome for single-pane layouts", () => {
  const gridEl = new FakeElement("main");
  const controller = createSplitLayoutRuntimeController({
    documentRef: createDocumentRef(),
    gridEl,
    defaultDeckId: "default",
    sortSessionsByQuickId: (sessions) => sessions.slice()
  });

  controller.replaceDeckSplitLayouts({
    ops: {
      root: { type: "pane", paneId: "main" },
      paneSessions: { main: ["s1"] }
    }
  });

  const node1 = new FakeElement("article");
  const terminals = new Map([["s1", { element: node1 }]]);

  controller.renderDeckLayout({
    deckId: "ops",
    orderedSessions: [{ id: "s1" }],
    deckSessions: [{ id: "s1", name: "one" }],
    activeSessionId: "s1",
    terminals
  });

  const paneEl = node1.parentNode?.parentNode || null;
  const headEl = paneEl?.children?.[0] || null;

  assert.ok(paneEl);
  assert.ok(headEl);
  assert.equal(headEl.hidden, true);
});

test("split-layout runtime normalizes invalid entries and ignores impossible mutations", () => {
  const controller = createSplitLayoutRuntimeController();

  controller.replaceDeckSplitLayouts({
    ops: {
      root: {
        type: "row",
        weights: [0, -1],
        children: [{ type: "pane", paneId: "main" }, { type: "pane", paneId: "side" }]
      },
      paneSessions: {
        main: ["s1", "s1", "s2"],
        unknown: ["s3"]
      }
    }
  });

  assert.deepEqual(controller.getDeckSplitLayout("ops").root.weights, [0.5, 0.5]);
  assert.deepEqual(controller.getDeckSplitLayout("ops").paneSessions.main, ["s1", "s2"]);
  assert.equal(controller.setContainerWeightRatio("ops", [], 99, 0.8).root.type, "row");
  assert.equal(controller.assignSessionToPane("ops", "missing", "s9").paneSessions.side.length, 0);
  assert.equal(controller.removePane("ops", "missing").root.type, "row");
});

test("split-layout runtime clamps resize ratios and collapses nested removals back into stable pane assignments", () => {
  const controller = createSplitLayoutRuntimeController();

  controller.replaceDeckSplitLayouts({
    ops: {
      root: {
        type: "row",
        weights: [1, 3],
        children: [
          { type: "pane", paneId: "main" },
          {
            type: "column",
            weights: [1, 1],
            children: [
              { type: "pane", paneId: "side-top" },
              { type: "pane", paneId: "side-bottom" }
            ]
          }
        ]
      },
      paneSessions: {
        main: ["s1"],
        "side-top": ["s2"],
        "side-bottom": ["s3"]
      }
    }
  });

  controller.setContainerWeightRatio("ops", [], 0, 5);
  let entry = controller.getDeckSplitLayout("ops");
  assert.deepEqual(entry.root.weights, [0.9, 0.1]);

  controller.removePane("ops", "side-bottom");
  entry = controller.getDeckSplitLayout("ops");
  assert.equal(entry.root.type, "row");
  assert.deepEqual(entry.root.children, [
    { type: "pane", paneId: "main" },
    { type: "pane", paneId: "side-top" }
  ]);
  assert.deepEqual(entry.paneSessions.main, ["s1", "s3"]);
  assert.deepEqual(entry.paneSessions["side-top"], ["s2"]);
});

test("split-layout runtime creates a stable default layout when rendering a previously unseen deck", () => {
  const gridEl = new FakeElement("main");
  const controller = createSplitLayoutRuntimeController({
    documentRef: createDocumentRef(),
    gridEl,
    defaultDeckId: "default",
    sortSessionsByQuickId: (sessions) => sessions.slice()
  });

  const node1 = new FakeElement("article");
  const node2 = new FakeElement("article");
  const terminals = new Map([
    ["s1", { element: node1 }],
    ["s2", { element: node2 }]
  ]);

  controller.renderDeckLayout({
    deckId: "ops",
    orderedSessions: [{ id: "s1" }, { id: "s2" }],
    deckSessions: [{ id: "s1", name: "one" }, { id: "s2", name: "two" }],
    activeSessionId: "s1",
    terminals
  });

  const entry = controller.getDeckSplitLayout("ops");
  assert.deepEqual(entry.root, { type: "pane", paneId: "main" });
  assert.deepEqual(entry.paneSessions.main, ["s1", "s2"]);
  assert.deepEqual(node1.parentNode?.children || [], [node1, node2]);
});

test("split-layout runtime wires pane action buttons and resize handles through render-time controls", () => {
  const requestRenderCalls = [];
  const resizeCalls = [];
  const deferredResizeCalls = [];
  const activeSessions = [];
  const gridEl = new FakeElement("main");
  const windowRef = createWindowRef();
  const controller = createSplitLayoutRuntimeController({
    documentRef: createDocumentRef(),
    windowRef,
    gridEl,
    defaultDeckId: "default",
    requestRender: () => requestRenderCalls.push("render"),
    scheduleGlobalResize: (payload) => resizeCalls.push(payload),
    scheduleDeferredResizePasses: (payload) => deferredResizeCalls.push(payload),
    setActiveSession: (sessionId) => activeSessions.push(sessionId),
    sortSessionsByQuickId: (sessions) => sessions.slice(),
    formatSessionToken: (sessionId) => String(sessionId || "").replace(/^s/, ""),
    formatSessionDisplayName: (session) => session?.name || session?.id || ""
  });

  const terminals = new Map([
    ["s1", { element: new FakeElement("article") }],
    ["s2", { element: new FakeElement("article") }]
  ]);
  const deckSessions = [
    { id: "s1", name: "one" },
    { id: "s2", name: "two" }
  ];

  controller.renderDeckLayout({
    deckId: "ops",
    orderedSessions: deckSessions,
    deckSessions,
    activeSessionId: "s2",
    terminals
  });

  const canvasEl = gridEl.children[0];
  const paneEl = canvasEl.children[0];
  const actionsEl = paneEl.children[0].children[1];
  const sessionSelectEl = actionsEl.children[0];
  const assignBtn = actionsEl.children[1];
  const useActiveBtn = actionsEl.children[2];
  const splitRowBtn = actionsEl.children[3];

  sessionSelectEl.value = "s1";
  assignBtn.click();
  useActiveBtn.click();
  splitRowBtn.click();

  let entry = controller.getDeckSplitLayout("ops");
  assert.equal(entry.root.type, "row");
  assert.deepEqual(activeSessions, ["s1"]);
  assert.equal(requestRenderCalls.length, 3);
  assert.deepEqual(resizeCalls, [
    { deckId: "ops", force: true },
    { deckId: "ops", force: true },
    { deckId: "ops", force: true }
  ]);
  assert.deepEqual(deferredResizeCalls, [
    { deckId: "ops", force: true },
    { deckId: "ops", force: true },
    { deckId: "ops", force: true }
  ]);

  controller.renderDeckLayout({
    deckId: "ops",
    orderedSessions: deckSessions,
    deckSessions,
    activeSessionId: "s2",
    terminals
  });

  const splitContainerEl = canvasEl.children[0];
  const resizeHandleEl = splitContainerEl.children[1];
  resizeHandleEl.dispatch("pointerdown", {
    button: 0,
    clientX: 500,
    clientY: 200
  });
  windowRef.dispatch("pointermove", {
    clientX: 900,
    clientY: 200
  });
  windowRef.dispatch("pointerup");

  entry = controller.getDeckSplitLayout("ops");
  assert.deepEqual(entry.root.weights, [0.9, 0.1]);

  const secondPaneEl = splitContainerEl.children[2].children[0];
  const secondActionsEl = secondPaneEl.children[0].children[1];
  const removeBtn = secondActionsEl.children[5];
  removeBtn.click();

  entry = controller.getDeckSplitLayout("ops");
  assert.deepEqual(entry.root, { type: "pane", paneId: "main" });
  assert.equal(requestRenderCalls.length, 4);
  assert.deepEqual(resizeCalls, [
    { deckId: "ops", force: true },
    { deckId: "ops", force: true },
    { deckId: "ops", force: true },
    { deckId: "ops", force: true },
    { deckId: "ops", force: true }
  ]);
  assert.deepEqual(deferredResizeCalls, [
    { deckId: "ops", force: true },
    { deckId: "ops", force: true },
    { deckId: "ops", force: true },
    { deckId: "ops", force: true },
    { deckId: "ops", force: true }
  ]);
});

test("split-layout runtime degrades safely without a render root and rejects malformed mutations", () => {
  const controller = createSplitLayoutRuntimeController();

  assert.equal(controller.getCardParkingContainer(), null);
  assert.equal(controller.assignSessionToPane("ops", "", "s1"), null);
  assert.equal(controller.splitPane("ops", "main", "diagonal"), null);
  assert.equal(controller.removePane("ops", ""), null);
  assert.equal(controller.setContainerWeightRatio("ops", [], "bad", 0.5), null);
});

test("split-layout runtime handles stale pane refs, loose grid children, and no-op pane actions", () => {
  const gridEl = new FakeElement("main");
  const looseNode = new FakeElement("article");
  gridEl.appendChild(looseNode);
  const documentRef = {
    createElement(tagName) {
      const element = new FakeElement(tagName);
      element.classList = null;
      return element;
    }
  };
  const requestRenderCalls = [];
  const resizeCalls = [];
  const deferredResizeCalls = [];
  const controller = createSplitLayoutRuntimeController({
    documentRef,
    gridEl,
    defaultDeckId: "default",
    requestRender: () => requestRenderCalls.push("render"),
    scheduleGlobalResize: (payload) => resizeCalls.push(payload),
    scheduleDeferredResizePasses: (payload) => deferredResizeCalls.push(payload),
    sortSessionsByQuickId: (sessions) => sessions.slice()
  });

  const terminals = new Map([["s1", { element: new FakeElement("article") }]]);

  controller.renderDeckLayout({
    deckId: "ops",
    orderedSessions: [{ id: "s1" }],
    deckSessions: [],
    activeSessionId: "",
    terminals
  });

  const canvasEl = gridEl.children[0];
  const stashEl = gridEl.children[1];
  assert.equal(gridEl.className.includes("split-layout-active"), true);
  assert.equal(stashEl.children.includes(looseNode), true);

  const paneEl = canvasEl.children[0];
  const actionsEl = paneEl.children[0].children[1];
  const assignBtn = actionsEl.children[1];
  const useActiveBtn = actionsEl.children[2];
  const splitColumnBtn = actionsEl.children[4];

  assignBtn.click();
  useActiveBtn.click();
  splitColumnBtn.click();

  assert.equal(controller.getDeckSplitLayout("ops").root.type, "column");
  assert.deepEqual(requestRenderCalls, ["render"]);
  assert.deepEqual(resizeCalls, [{ deckId: "ops", force: true }]);
  assert.deepEqual(deferredResizeCalls, [{ deckId: "ops", force: true }]);

  controller.renderDeckLayout({
    deckId: "ops",
    orderedSessions: [{ id: "s1" }],
    deckSessions: [{ id: "s1", name: "one" }],
    activeSessionId: "",
    terminals: new Map()
  });

  const parked = controller.getCardParkingContainer();
  assert.equal(parked.children.length, 2);
  assert.equal(parked.children.includes(looseNode), true);
});
