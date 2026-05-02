import test from "node:test";
import assert from "node:assert/strict";

import {
  cloneQuickSendUsageEntry,
  cloneQuickSendUsageState,
  compareQuickSendUsageEntries,
  mergeQuickSendUsageEntries,
  normalizeQuickSendUsageEntry,
  parseSessionQuickSendUsagePayload,
  pruneSessionQuickSendUsageState,
  readSessionQuickSendUsagePayload,
  serializeSessionQuickSendUsageState
} from "../src/public/session-quick-send-usage.js";

test("session quick-send usage helpers normalize entries and clone state defensively", () => {
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

  const originalState = { s1: [originalEntry] };
  const clonedState = cloneQuickSendUsageState(originalState);
  clonedState.s1[0].count = 9;
  assert.equal(originalState.s1[0].count, 3);
});

test("session quick-send usage helpers merge, rank, parse, and prune deterministic state", () => {
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

  assert.deepEqual(parseSessionQuickSendUsagePayload(""), {});
  assert.deepEqual(parseSessionQuickSendUsagePayload("{broken"), {});
  assert.deepEqual(
    parseSessionQuickSendUsagePayload(
      JSON.stringify({
        sessions: {
          " ": [{ lookupKey: "project::ignored", count: 2, lastUsedAt: 1 }],
          s1: [
            { lookupKey: "project::deploy", count: 1, lastUsedAt: 10 },
            { lookupKey: "project::deploy", count: 2, lastUsedAt: 20 }
          ],
          s2: "invalid"
        }
      })
    ),
    {
      s1: [{ lookupKey: "project::deploy", count: 3, lastUsedAt: 20 }]
    }
  );

  const pruned = pruneSessionQuickSendUsageState(
    {
      " s2 ": [
        { lookupKey: "project::logs", count: 1, lastUsedAt: 50 },
        { lookupKey: "project::build", count: 2, lastUsedAt: 40 }
      ],
      s1: [
        { lookupKey: "project::deploy", count: 2, lastUsedAt: 30 },
        { lookupKey: "project::ship", count: 1, lastUsedAt: 5 }
      ],
      s3: [{ lookupKey: "project::cleanup", count: 1, lastUsedAt: 10 }]
    },
    { maxEntriesPerSession: 1, maxSessions: 2 }
  );
  assert.deepEqual(pruned, {
    s2: [{ lookupKey: "project::build", count: 2, lastUsedAt: 40 }],
    s1: [{ lookupKey: "project::deploy", count: 2, lastUsedAt: 30 }]
  });
  assert.deepEqual(JSON.parse(serializeSessionQuickSendUsageState(pruned)), { sessions: pruned });
});

test("session quick-send usage helpers fail closed when storage reads throw", () => {
  assert.equal(
    readSessionQuickSendUsagePayload(
      {
        getItem() {
          throw new Error("storage failed");
        }
      },
      "key"
    ),
    ""
  );
  assert.equal(readSessionQuickSendUsagePayload(null, "key"), "");
});
