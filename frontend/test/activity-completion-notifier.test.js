import test from "node:test";
import assert from "node:assert/strict";

import { createActivityCompletionNotifier } from "../src/public/activity-completion-notifier.js";

function createWindow(permission = "granted") {
  const notifications = [];
  class MockNotification {
    static permission = permission;

    constructor(title, options = {}) {
      notifications.push({ title, options });
    }
  }

  return {
    Notification: MockNotification,
    notifications
  };
}

test("activity completion notifier is disabled by default and emits no notification", async () => {
  const windowRef = createWindow();
  const notifier = createActivityCompletionNotifier({
    windowRef,
    aggregationWindowMs: 5,
    formatSessionToken: () => "A",
    formatSessionDisplayName: (session) => session.name,
    resolveDeckName: () => "Default"
  });

  assert.equal(notifier.queueCompletion({ id: "s-1", name: "Build", deckId: "default" }, 100), false);
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(windowRef.notifications.length, 0);
});

test("activity completion notifier emits one notification for a single completion when explicitly enabled", async () => {
  const windowRef = createWindow();
  const notifier = createActivityCompletionNotifier({
    windowRef,
    enabled: true,
    aggregationWindowMs: 5,
    formatSessionToken: () => "A",
    formatSessionDisplayName: (session) => session.name,
    resolveDeckName: () => "Default"
  });

  notifier.queueCompletion({ id: "s-1", name: "Build", deckId: "default" }, 100);
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(windowRef.notifications.length, 1);
  assert.equal(windowRef.notifications[0].title, "Session activity completed");
  assert.match(windowRef.notifications[0].options.body, /\[A\] Build finished activity in deck Default\./);
});

test("activity completion notifier aggregates multiple completions in one window", async () => {
  const windowRef = createWindow();
  const notifier = createActivityCompletionNotifier({
    windowRef,
    enabled: true,
    aggregationWindowMs: 5,
    formatSessionToken: (sessionId) => (sessionId === "s-1" ? "A" : "B"),
    formatSessionDisplayName: (session) => session.name,
    resolveDeckName: () => "Default"
  });

  notifier.queueCompletion({ id: "s-1", name: "Build", deckId: "default" }, 100);
  notifier.queueCompletion({ id: "s-2", name: "Deploy", deckId: "default" }, 101);
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(windowRef.notifications.length, 1);
  assert.equal(windowRef.notifications[0].title, "2 sessions completed activity");
  assert.match(windowRef.notifications[0].options.body, /\[A\] Build/);
  assert.match(windowRef.notifications[0].options.body, /\[B\] Deploy/);
});

test("activity completion notifier deduplicates repeated completion keys and no-ops when permission is denied", async () => {
  const grantedWindow = createWindow();
  const notifier = createActivityCompletionNotifier({
    windowRef: grantedWindow,
    enabled: true,
    aggregationWindowMs: 5,
    formatSessionToken: () => "A",
    formatSessionDisplayName: (session) => session.name,
    resolveDeckName: () => "Default"
  });

  assert.equal(notifier.queueCompletion({ id: "s-1", name: "Build", deckId: "default" }, 100), true);
  assert.equal(notifier.queueCompletion({ id: "s-1", name: "Build", deckId: "default" }, 100), false);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(grantedWindow.notifications.length, 1);

  const deniedWindow = createWindow("denied");
  const deniedNotifier = createActivityCompletionNotifier({
    windowRef: deniedWindow,
    aggregationWindowMs: 5
  });
  assert.equal(deniedNotifier.queueCompletion({ id: "s-2", name: "Deploy", deckId: "default" }, 101), false);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(deniedWindow.notifications.length, 0);
});
