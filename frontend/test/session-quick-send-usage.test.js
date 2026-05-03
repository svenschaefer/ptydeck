import test from "node:test";
import assert from "node:assert/strict";

import {
  cloneQuickSendUsageEntries,
  cloneQuickSendUsageEntry,
  compareQuickSendUsageEntries,
  mergeQuickSendUsageEntries,
  normalizeQuickSendUsageEntry,
  pruneQuickSendUsageEntries
} from "../src/public/session-quick-send-usage.js";

test("session quick-send usage helpers normalize and clone entries defensively", () => {
  assert.equal(normalizeQuickSendUsageEntry(null), null);
  assert.equal(normalizeQuickSendUsageEntry({ lookupKey: "   " }), null);
  assert.deepEqual(normalizeQuickSendUsageEntry({ lookupKey: " project::deploy ", count: "2", lastUsedAt: "9" }), {
    lookupKey: "project::deploy",
    count: 2,
    lastUsedAt: 9
  });
  assert.deepEqual(normalizeQuickSendUsageEntry({ lookupKey: "project::deploy", count: 0, lastUsedAt: -1 }), {
    lookupKey: "project::deploy",
    count: 1,
    lastUsedAt: 0
  });

  const originalEntry = { lookupKey: "project::deploy", count: 3, lastUsedAt: 10 };
  const clonedEntry = cloneQuickSendUsageEntry(originalEntry);
  clonedEntry.count = 4;
  assert.equal(originalEntry.count, 3);

  const originalEntries = [originalEntry];
  const clonedEntries = cloneQuickSendUsageEntries(originalEntries);
  clonedEntries[0].count = 9;
  assert.equal(originalEntries[0].count, 3);
});

test("session quick-send usage helpers merge, rank, and prune deterministic server-backed entries", () => {
  assert.ok(
    compareQuickSendUsageEntries(
      { lookupKey: "project::a", count: 1, lastUsedAt: 20 },
      { lookupKey: "project::b", count: 2, lastUsedAt: 10 }
    ) > 0
  );

  assert.deepEqual(mergeQuickSendUsageEntries("invalid"), []);
  assert.deepEqual(
    mergeQuickSendUsageEntries([
      { lookupKey: "project::deploy", count: 2, lastUsedAt: 20 },
      { lookupKey: "project::deploy", count: 1, lastUsedAt: 30 },
      { lookupKey: "project::build", count: 2, lastUsedAt: 10 },
      { lookupKey: "project::build", count: "bad", lastUsedAt: 5 }
    ]),
    [
      { lookupKey: "project::deploy", count: 3, lastUsedAt: 30 },
      { lookupKey: "project::build", count: 3, lastUsedAt: 10 }
    ]
  );

  assert.deepEqual(
    pruneQuickSendUsageEntries(
      [
        { lookupKey: "project::logs", count: 1, lastUsedAt: 50 },
        { lookupKey: "project::build", count: 2, lastUsedAt: 40 },
        { lookupKey: "project::logs", count: 1, lastUsedAt: 60 }
      ],
      1
    ),
    [{ lookupKey: "project::logs", count: 2, lastUsedAt: 60 }]
  );
});
