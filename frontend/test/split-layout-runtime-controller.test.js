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
