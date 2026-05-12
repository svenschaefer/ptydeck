import test from "node:test";
import assert from "node:assert/strict";

import { ApiError } from "../src/errors.js";
import {
  createRuntimeOperatorComposerAuthority,
  normalizePersistedOperatorComposerPlacementEntry
} from "../src/runtime-operator-composer-authority.js";

function createHarness(overrides = {}) {
  const operatorComposerPlacements = overrides.operatorComposerPlacements || new Map();
  const knownSessionIds = overrides.knownSessionIds || new Set(["session-1", "session-2", "session-3"]);
  const attachmentCalls = [];
  const authority = createRuntimeOperatorComposerAuthority({
    operatorComposerPlacements,
    sessionControlAttachmentRegistry: {
      getAttachmentKey({ clientId, auth }) {
        attachmentCalls.push({ clientId, auth });
        const subject = auth?.subject || auth?.principal?.subject || "local-operator";
        const tenantId = auth?.tenantId || auth?.principal?.tenantId || "local";
        const accessMode = auth?.accessMode || auth?.principal?.accessMode || "operator";
        const permissionMode = auth?.permissionMode || auth?.principal?.permissionMode || "";
        return `${clientId}\u001f${subject}\u001f${tenantId}\u001f${accessMode}\u001f${permissionMode}`;
      }
    },
    sessionControlClientIdHeader: "x-ptydeck-client-id",
    hasKnownSession: (sessionId) => knownSessionIds.has(sessionId)
  });
  return {
    authority,
    attachmentCalls,
    knownSessionIds,
    operatorComposerPlacements
  };
}

test("runtime operator composer authority normalizes persisted entries against known pinned sessions", () => {
  const normalized = normalizePersistedOperatorComposerPlacementEntry(
    {
      clientId: "client-1",
      subject: "alice",
      tenantId: "ops",
      accessMode: "operator",
      permissionMode: "",
      mode: "active-overlay",
      pinnedSessionIds: ["session-1", "missing", "session-1"],
      sharedDraft: "echo shared",
      pinnedDrafts: {
        "session-1": "pwd",
        "session-2": "ls",
        missing: "skip me"
      }
    },
    {
      strict: false,
      hasKnownSession: (sessionId) => sessionId === "session-1",
      getAttachmentKey: ({ clientId, principal }) =>
        `${clientId}\u001f${principal.subject}\u001f${principal.tenantId}\u001f${principal.accessMode}\u001f${principal.permissionMode}`
    }
  );

  assert.deepEqual(normalized, {
    attachmentKey: "client-1\u001falice\u001fops\u001foperator\u001f",
    clientId: "client-1",
    subject: "alice",
    tenantId: "ops",
    accessMode: "operator",
    permissionMode: "",
    mode: "active-overlay",
    pinnedSessionIds: ["session-1"],
    sharedDraft: "echo shared",
    pinnedDrafts: {
      "session-1": "pwd"
    }
  });
});

test("runtime operator composer authority exposes default state and updates persisted placement deterministically", () => {
  const { authority, operatorComposerPlacements } = createHarness();
  const auth = {
    subject: "alice",
    tenantId: "ops",
    accessMode: "operator",
    permissionMode: ""
  };
  const req = {
    headers: {
      "x-ptydeck-client-id": "client-1"
    }
  };

  assert.deepEqual(authority.getStateOrThrow(auth, req), {
    clientId: "client-1",
    mode: "shared-footer",
    pinnedSessionIds: [],
    sharedDraft: "",
    pinnedDrafts: {}
  });

  const updated = authority.updateStateOrThrow(
    {
      mode: "active-overlay",
      pinnedSessionIds: ["session-2", "session-1"],
      sharedDraft: "shared draft",
      pinnedDrafts: {
        "session-1": "pwd",
        "session-2": "ls -la",
        "session-3": "hidden"
      }
    },
    auth,
    req
  );

  assert.deepEqual(updated, {
    clientId: "client-1",
    mode: "active-overlay",
    pinnedSessionIds: ["session-2", "session-1"],
    sharedDraft: "shared draft",
    pinnedDrafts: {
      "session-1": "pwd",
      "session-2": "ls -la"
    }
  });
  assert.deepEqual(
    operatorComposerPlacements.get("client-1\u001falice\u001fops\u001foperator\u001f"),
    {
      attachmentKey: "client-1\u001falice\u001fops\u001foperator\u001f",
      clientId: "client-1",
      subject: "alice",
      tenantId: "ops",
      accessMode: "operator",
      permissionMode: "",
      mode: "active-overlay",
      pinnedSessionIds: ["session-2", "session-1"],
      sharedDraft: "shared draft",
      pinnedDrafts: {
        "session-1": "pwd",
        "session-2": "ls -la"
      }
    }
  );
});

test("runtime operator composer authority prunes deleted session pins and sorts persisted listings", () => {
  const { authority, operatorComposerPlacements } = createHarness({
    operatorComposerPlacements: new Map([
      [
        "client-2\u001fbob\u001fops\u001foperator\u001f",
        {
          attachmentKey: "client-2\u001fbob\u001fops\u001foperator\u001f",
          clientId: "client-2",
          subject: "bob",
          tenantId: "ops",
          accessMode: "operator",
          permissionMode: "",
          mode: "active-overlay",
          pinnedSessionIds: ["session-2", "session-3"],
          sharedDraft: "",
          pinnedDrafts: {
            "session-2": "ls",
            "session-3": "pwd"
          }
        }
      ],
      [
        "client-1\u001falice\u001fops\u001foperator\u001f",
        {
          attachmentKey: "client-1\u001falice\u001fops\u001foperator\u001f",
          clientId: "client-1",
          subject: "alice",
          tenantId: "ops",
          accessMode: "operator",
          permissionMode: "",
          mode: "shared-footer",
          pinnedSessionIds: ["session-2"],
          sharedDraft: "shared",
          pinnedDrafts: {
            "session-2": "tail -f"
          }
        }
      ]
    ])
  });

  assert.equal(authority.cleanupSessionState("session-2"), true);
  assert.equal(authority.cleanupSessionState("session-missing"), false);
  assert.deepEqual(operatorComposerPlacements.get("client-1\u001falice\u001fops\u001foperator\u001f"), {
    attachmentKey: "client-1\u001falice\u001fops\u001foperator\u001f",
    clientId: "client-1",
    subject: "alice",
    tenantId: "ops",
    accessMode: "operator",
    permissionMode: "",
    mode: "shared-footer",
    pinnedSessionIds: [],
    sharedDraft: "shared",
    pinnedDrafts: {}
  });
  assert.deepEqual(operatorComposerPlacements.get("client-2\u001fbob\u001fops\u001foperator\u001f"), {
    attachmentKey: "client-2\u001fbob\u001fops\u001foperator\u001f",
    clientId: "client-2",
    subject: "bob",
    tenantId: "ops",
    accessMode: "operator",
    permissionMode: "",
    mode: "active-overlay",
    pinnedSessionIds: ["session-3"],
    sharedDraft: "",
    pinnedDrafts: {
      "session-3": "pwd"
    }
  });

  assert.deepEqual(authority.listPersistedOperatorComposerPlacements(), [
    {
      attachmentKey: "client-1\u001falice\u001fops\u001foperator\u001f",
      clientId: "client-1",
      subject: "alice",
      tenantId: "ops",
      accessMode: "operator",
      permissionMode: "",
      mode: "shared-footer",
      pinnedSessionIds: [],
      sharedDraft: "shared",
      pinnedDrafts: {}
    },
    {
      attachmentKey: "client-2\u001fbob\u001fops\u001foperator\u001f",
      clientId: "client-2",
      subject: "bob",
      tenantId: "ops",
      accessMode: "operator",
      permissionMode: "",
      mode: "active-overlay",
      pinnedSessionIds: ["session-3"],
      sharedDraft: "",
      pinnedDrafts: {
        "session-3": "pwd"
      }
    }
  ]);
});

test("runtime operator composer authority fails closed for missing client context and unknown sessions", () => {
  const { authority } = createHarness();
  assert.throws(
    () => authority.getStateOrThrow({ subject: "alice" }, { headers: {} }),
    (error) => error instanceof ApiError && error.statusCode === 409 && error.error === "OperatorClientRequired"
  );
  assert.throws(
    () =>
      authority.updateStateOrThrow(
        {
          pinnedSessionIds: ["missing"]
        },
        { subject: "alice" },
        {
          headers: {
            "x-ptydeck-client-id": "client-1"
          }
        }
      ),
    (error) => error instanceof ApiError && error.statusCode === 404 && error.error === "SessionNotFound"
  );
});
