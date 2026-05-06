import test from "node:test";
import assert from "node:assert/strict";

import {
  compareQuickSendUsageEntries,
  normalizeQuickSendUsageEntries,
  normalizeQuickSendUsageEntry,
  normalizeQuickSendUsageMutation,
  recordQuickSendUsageEntry,
  SESSION_QUICK_SEND_USAGE_MAX_ENTRIES
} from "../src/session-quick-send-usage.js";

test("session quick-send usage normalizes malformed entries and deterministic tie ordering", () => {
  assert.equal(normalizeQuickSendUsageEntry(null), null);
  assert.equal(normalizeQuickSendUsageEntry([]), null);
  assert.equal(normalizeQuickSendUsageEntry({ lookupKey: "   " }), null);

  assert.deepEqual(
    normalizeQuickSendUsageEntry({
      lookupKey: " project::deploy ",
      count: "3",
      lastUsedAt: "42"
    }),
    {
      lookupKey: "project::deploy",
      count: 3,
      lastUsedAt: 42
    }
  );

  assert.deepEqual(
    normalizeQuickSendUsageEntry({
      lookupKey: "project::logs",
      count: "invalid",
      lastUsedAt: -1
    }),
    {
      lookupKey: "project::logs",
      count: 1,
      lastUsedAt: 0
    }
  );

  assert.equal(
    compareQuickSendUsageEntries(
      { lookupKey: "project::beta", count: 3, lastUsedAt: 10 },
      { lookupKey: "project::alpha", count: 3, lastUsedAt: 10 }
    ) > 0,
    true
  );
});

test("session quick-send usage merges duplicates, prunes deterministically, and rejects invalid mutations", () => {
  const normalized = normalizeQuickSendUsageEntries(
    [
      { lookupKey: " project::build ", count: 2, lastUsedAt: 50 },
      { lookupKey: "project::build", count: "4", lastUsedAt: 90 },
      { lookupKey: "project::deploy", count: 3, lastUsedAt: 80 },
      { lookupKey: "project::logs", count: 1, lastUsedAt: 70 },
      { lookupKey: "", count: 99, lastUsedAt: 100 },
      null
    ],
    { maxEntries: 2 }
  );

  assert.deepEqual(normalized, [
    { lookupKey: "project::build", count: 6, lastUsedAt: 90 },
    { lookupKey: "project::deploy", count: 3, lastUsedAt: 80 }
  ]);

  assert.equal(normalizeQuickSendUsageMutation(null), null);
  assert.equal(normalizeQuickSendUsageMutation([]), null);
  assert.equal(normalizeQuickSendUsageMutation({ lookupKey: "   " }), null);
  assert.deepEqual(normalizeQuickSendUsageMutation({ lookupKey: " project::ship " }), {
    lookupKey: "project::ship"
  });
});

test("session quick-send usage records existing and new entries with bounded fallback timestamps", () => {
  const originalDateNow = Date.now;
  Date.now = () => 777;
  try {
    const existing = recordQuickSendUsageEntry(
      [
        { lookupKey: "project::build", count: 2, lastUsedAt: 100 },
        { lookupKey: "project::logs", count: 1, lastUsedAt: 90 }
      ],
      { lookupKey: "project::build" },
      { usedAt: 120, maxEntries: SESSION_QUICK_SEND_USAGE_MAX_ENTRIES }
    );

    assert.deepEqual(existing[0], {
      lookupKey: "project::build",
      count: 3,
      lastUsedAt: 120
    });

    const inserted = recordQuickSendUsageEntry([], { lookupKey: "project::deploy" }, { usedAt: 0, maxEntries: 1 });
    assert.deepEqual(inserted, [
      {
        lookupKey: "project::deploy",
        count: 1,
        lastUsedAt: 777
      }
    ]);

    const normalizedOnly = recordQuickSendUsageEntry(
      [
        { lookupKey: "project::deploy", count: 1, lastUsedAt: 10 },
        { lookupKey: "project::deploy", count: 2, lastUsedAt: 15 }
      ],
      { lookupKey: "   " },
      { maxEntries: 1 }
    );
    assert.deepEqual(normalizedOnly, [
      {
        lookupKey: "project::deploy",
        count: 3,
        lastUsedAt: 15
      }
    ]);
  } finally {
    Date.now = originalDateNow;
  }
});
