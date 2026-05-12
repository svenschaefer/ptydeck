import test from "node:test";
import assert from "node:assert/strict";
import { validateRequest, validateResponse } from "../src/validation.js";

const THEME_PROFILE = {
  background: "#0a0d12",
  foreground: "#d8dee9",
  cursor: "#8ec07c",
  black: "#0a0d12",
  red: "#fb4934",
  green: "#8ec07c",
  yellow: "#fabd2f",
  blue: "#83a598",
  magenta: "#b48ead",
  cyan: "#8fbcbb",
  white: "#d8dee9",
  brightBlack: "#4b5563",
  brightRed: "#ff6b5a",
  brightGreen: "#a5d68a",
  brightYellow: "#ffd36a",
  brightBlue: "#98b6cc",
  brightMagenta: "#c8a7d8",
  brightCyan: "#a9d9d6",
  brightWhite: "#f5f7fa"
};

const INPUT_SAFETY_PROFILE = {
  confirmOnAnyInput: false,
  requireValidShellSyntax: true,
  confirmOnIncompleteShellConstruct: true,
  confirmOnNaturalLanguageInput: true,
  confirmOnDangerousShellCommand: true,
  confirmOnMultilineInput: false,
  autoContinueStalledPaste: false,
  confirmOnRecentTargetSwitch: true,
  targetSwitchGraceMs: 4000,
  pasteLengthConfirmThreshold: 400,
  pasteLineConfirmThreshold: 5
};

const CONTROL_STATE = {
  owner: {
    subject: "owner",
    tenantId: "tenant-a",
    accessMode: "operator",
    permissionMode: ""
  },
  controllerClientId: "client-1",
  controllerChangedAt: 2,
  currentController: {
    clientId: "client-1",
    label: "Desk Browser",
    connectedAt: 2,
    lastSeenAt: 2,
    lastDisconnectedAt: null,
    activeConnectionCount: 1,
    active: true,
    subject: "owner",
    tenantId: "tenant-a",
    accessMode: "operator",
    permissionMode: "",
    role: "controller"
  },
  lastInput: {
    at: 3,
    clientId: "client-1",
    subject: "owner",
    tenantId: "tenant-a",
    accessMode: "operator",
    permissionMode: ""
  },
  attachedClients: [
    {
      clientId: "client-1",
      label: "Desk Browser",
      connectedAt: 2,
      lastSeenAt: 2,
      lastDisconnectedAt: null,
      activeConnectionCount: 1,
      active: true,
      subject: "owner",
      tenantId: "tenant-a",
      accessMode: "operator",
      permissionMode: "",
      role: "controller"
    }
  ]
};

const SHELL_APP_IDENTITY = {
  family: "shell",
  label: "bash",
  source: "explicit-hint",
  confidence: 0.64,
  details: {
    explicitHints: [
      {
        type: "shell",
        value: "bash"
      }
    ]
  },
  updatedAt: 1
};

function createLocalSession(overrides = {}) {
  return {
    id: "a",
    deckId: "default",
    quickIdToken: "1",
    state: "running",
    kind: "local",
    cwd: "/tmp",
    shell: "bash",
    appIdentity: SHELL_APP_IDENTITY,
    mouseForwardingMode: "off",
    inputSafetyProfile: INPUT_SAFETY_PROFILE,
    startCwd: "/tmp",
    startCommand: "",
    env: {},
    tags: [],
    controlState: CONTROL_STATE,
    themeProfile: THEME_PROFILE,
    activeThemeProfile: THEME_PROFILE,
    inactiveThemeProfile: THEME_PROFILE,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  };
}

function createReplayExcerpt(overrides = {}) {
  return {
    sessionId: "a",
    sessionState: "running",
    scope: "visible_replay_excerpt",
    format: "text",
    contentType: "text/plain; charset=utf-8",
    selector: "l:20",
    selectorKind: "lines",
    requestedCount: 20,
    resolvedCount: 12,
    availableCount: 12,
    selectorSatisfied: true,
    shellBlocksSupported: false,
    data: "line one\nline two",
    chars: 17,
    lines: 2,
    sourceRetainedChars: 17,
    sourceRetentionLimitChars: 16384,
    sourceTruncated: false,
    ...overrides
  };
}

function createReplayExport(overrides = {}) {
  return {
    sessionId: "a",
    sessionState: "running",
    scope: "retained_replay_tail",
    format: "text",
    contentType: "text/plain; charset=utf-8",
    fileName: "ptydeck-session-a-replay.txt",
    data: "line one\nline two",
    retainedChars: 17,
    retentionLimitChars: 16384,
    truncated: false,
    ...overrides
  };
}

test("validateRequest accepts valid input body", () => {
  assert.doesNotThrow(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions/abc/input",
      params: { sessionId: "abc" },
      body: { data: "echo hi\n" }
    });
  });
});

test("validateRequest accepts input body with quick-send custom-command usage metadata", () => {
  assert.doesNotThrow(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions/abc/input",
      params: { sessionId: "abc" },
      body: {
        data: "echo hi\n",
        customCommandUsage: {
          lookupKey: "project::deploy"
        }
      }
    });
  });
});

test("validateRequest rejects invalid resize payload", () => {
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions/abc/resize",
      params: { sessionId: "abc" },
      body: { cols: 0, rows: 10 }
    });
  });
});

test("validateRequest accepts valid PTY control requests without a body", () => {
  assert.doesNotThrow(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions/abc/interrupt",
      params: { sessionId: "abc" },
      body: undefined
    });
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions/abc/terminate",
      params: { sessionId: "abc" },
      body: undefined
    });
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions/abc/kill",
      params: { sessionId: "abc" },
      body: undefined
    });
  });
});

test("validateRequest accepts valid replay excerpt queries and rejects invalid slice selectors", () => {
  assert.doesNotThrow(() => {
    validateRequest({
      method: "GET",
      pathname: "/api/v1/sessions/abc/replay-excerpt",
      params: { sessionId: "abc" },
      query: { slice: "sp:2" }
    });
    validateRequest({
      method: "GET",
      pathname: "/api/v1/sessions/abc/replay-excerpt",
      params: { sessionId: "abc" },
      query: { slice: "l:80" }
    });
  });

  assert.throws(() => {
    validateRequest({
      method: "GET",
      pathname: "/api/v1/sessions/abc/replay-excerpt",
      params: { sessionId: "abc" },
      query: { slice: "bad" }
    });
  }, /Query parameter 'slice' must match 'l:N', 'c:N', or 'sp:N'/);

  assert.throws(() => {
    validateRequest({
      method: "GET",
      pathname: "/api/v1/sessions/abc/replay-excerpt",
      params: {},
      query: { slice: "l:20" }
    });
  }, /Missing sessionId path parameter/);
});

test("validateRequest accepts valid session control payloads and rejects invalid transfer payloads", () => {
  assert.doesNotThrow(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions/abc/control/take",
      params: { sessionId: "abc" },
      body: undefined
    });
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions/abc/control/release",
      params: { sessionId: "abc" },
      body: {}
    });
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions/abc/control/transfer",
      params: { sessionId: "abc" },
      body: { clientId: "ws-123" }
    });
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions/abc/control/rename-client",
      params: { sessionId: "abc" },
      body: { label: "Desk Browser" }
    });
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions/abc/control/forget-client",
      params: { sessionId: "abc" },
      body: { clientId: "ws-stale" }
    });
    validateRequest({
      method: "POST",
      pathname: "/api/v1/session-control/take",
      params: {},
      body: { scope: "all" }
    });
    validateRequest({
      method: "POST",
      pathname: "/api/v1/session-control/take",
      params: {},
      body: { scope: "deck", deckId: "ops" }
    });
    validateRequest({
      method: "POST",
      pathname: "/api/v1/session-control/take",
      params: {},
      body: { scope: "session", sessionId: "abc" }
    });
  });
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions/abc/control/transfer",
      params: { sessionId: "abc" },
      body: { clientId: "" }
    });
  });
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions/abc/control/rename-client",
      params: { sessionId: "abc" },
      body: { label: "" }
    });
  });
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions/abc/control/forget-client",
      params: { sessionId: "abc" },
      body: { clientId: "" }
    });
  });
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/session-control/take",
      params: {},
      body: { scope: "deck" }
    });
  });
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/session-control/take",
      params: {},
      body: { scope: "session" }
    });
  });
});

test("validateRequest rejects mixed trusted-local bulk control selector payloads", () => {
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/session-control/take",
      params: {},
      body: { scope: "all", deckId: "ops" }
    });
  }, /Field 'deckId' is only allowed when scope is 'deck'/);

  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/session-control/take",
      params: {},
      body: { scope: "all", sessionId: "abc" }
    });
  }, /Field 'sessionId' is only allowed when scope is 'session'/);

  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/session-control/take",
      params: {},
      body: { scope: "deck", deckId: "ops", sessionId: "abc" }
    });
  }, /Field 'sessionId' is only allowed when scope is 'session'/);

  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/session-control/take",
      params: {},
      body: { scope: "session", sessionId: "abc", deckId: "ops" }
    });
  }, /Field 'deckId' is only allowed when scope is 'deck'/);
});

test("validateResponse checks session list schema", () => {
  assert.doesNotThrow(() => {
    validateResponse({
      statusCode: 200,
      expect: "sessionList",
      body: [
        {
          id: "a",
          deckId: "default",
          quickIdToken: "1",
          state: "running",
          kind: "local",
          cwd: "/tmp",
          shell: "bash",
          appIdentity: SHELL_APP_IDENTITY,
          note: "needs review",
          mouseForwardingMode: "off",
          inputSafetyProfile: INPUT_SAFETY_PROFILE,
          startCwd: "/tmp",
          startCommand: "",
          env: {},
          tags: [],
          controlState: CONTROL_STATE,
          themeProfile: THEME_PROFILE,
          activeThemeProfile: THEME_PROFILE,
          inactiveThemeProfile: THEME_PROFILE,
          createdAt: 1,
          updatedAt: 1
        }
      ]
    });
  });
});

test("validateResponse accepts ssh session remote runtime metadata", () => {
  assert.doesNotThrow(() => {
    validateResponse({
      statusCode: 200,
      expect: "session",
      body: {
        id: "ssh-1",
        deckId: "default",
        quickIdToken: "7",
        state: "running",
        activityState: "inactive",
        kind: "ssh",
        cwd: "~/workspace",
        shell: "ssh",
        appIdentity: {
          family: "unknown",
          label: "",
          source: "unknown",
          confidence: 0,
          details: {},
          updatedAt: 10
        },
        mouseForwardingMode: "application",
        remoteConnection: {
          host: "example.internal",
          port: 22,
          username: "ops"
        },
        remoteAuth: {
          method: "privateKey"
        },
        remoteRuntime: {
          connectivityState: "degraded",
          reconnectPolicy: {
            maxAttempts: 3,
            delayMs: 1500
          },
          reconnectAttempts: 1,
          disconnectedAt: 10,
          nextReconnectAt: 1510,
          lastReconnectAt: null,
          lastDisconnectReason: "ssh-transport-exit",
          lastExitCode: 255,
          lastExitSignal: ""
        },
        inputSafetyProfile: INPUT_SAFETY_PROFILE,
        startCwd: "~/workspace",
        startCommand: "",
        env: {},
        tags: [],
        controlState: CONTROL_STATE,
        themeProfile: THEME_PROFILE,
        activeThemeProfile: THEME_PROFILE,
        inactiveThemeProfile: THEME_PROFILE,
        createdAt: 1,
        updatedAt: 10,
        activityUpdatedAt: 10
      }
    });
  });
});

test("validateResponse rejects malformed terminal app identity details and remote runtime metadata", () => {
  assert.throws(() => {
    validateResponse({
      statusCode: 200,
      expect: "session",
      body: createLocalSession({
        appIdentity: {
          ...SHELL_APP_IDENTITY,
          details: {
            foregroundProcess: {
              pid: Number.POSITIVE_INFINITY
            }
          }
        }
      })
    });
  }, /Response does not match Session schema\./);

  assert.throws(() => {
    validateResponse({
      statusCode: 200,
      expect: "session",
      body: createLocalSession({
        kind: "ssh",
        shell: "ssh",
        cwd: "~/workspace",
        remoteConnection: {
          host: "example.internal",
          port: 22,
          username: "ops"
        },
        remoteAuth: {
          method: "privateKey"
        },
        remoteRuntime: {
          connectivityState: "degraded",
          reconnectPolicy: {
            maxAttempts: 3,
            delayMs: 1500
          },
          reconnectAttempts: 1,
          disconnectedAt: 10,
          nextReconnectAt: "1510",
          lastReconnectAt: null,
          lastDisconnectReason: "ssh-transport-exit",
          lastExitCode: 255,
          lastExitSignal: ""
        }
      })
    });
  }, /Response does not match Session schema\./);
});

test("validateRequest rejects invalid session create body", () => {
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions",
      params: {},
      body: "not-an-object"
    });
  });
});

test("validateRequest rejects malformed session create-only and patch edge fields", () => {
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions",
      params: {},
      body: {
        cwd: 42
      }
    });
  }, /Field 'cwd' must be a string/);

  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions",
      params: {},
      body: {
        shell: 42
      }
    });
  }, /Field 'shell' must be a string/);

  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions",
      params: {},
      body: {
        connectionProfileId: 42
      }
    });
  }, /Field 'connectionProfileId' must be a string/);

  assert.throws(() => {
    validateRequest({
      method: "PATCH",
      pathname: "/api/v1/sessions/abc",
      params: { sessionId: "abc" },
      body: {
        env: { FOO: 1 }
      }
    });
  }, /Field 'env' must be an object with string values/);

  assert.throws(() => {
    validateRequest({
      method: "PATCH",
      pathname: "/api/v1/sessions/abc",
      params: { sessionId: "abc" },
      body: {
        tags: ["ops", 1]
      }
    });
  }, /Field 'tags' must be an array of strings/);

  assert.throws(() => {
    validateRequest({
      method: "PATCH",
      pathname: "/api/v1/sessions/abc",
      params: { sessionId: "abc" },
      body: {
        activeThemeProfile: "bad"
      }
    });
  }, /Field 'activeThemeProfile' must be an object/);

  assert.throws(() => {
    validateRequest({
      method: "PATCH",
      pathname: "/api/v1/sessions/abc",
      params: { sessionId: "abc" },
      body: {
        inactiveThemeProfile: {
          background: "#fff"
        }
      }
    });
  }, /Field 'inactiveThemeProfile' must contain only supported hex color entries/);
});

test("validateRequest rejects missing input payload field", () => {
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions/abc/input",
      params: { sessionId: "abc" },
      body: {}
    });
  });
});

test("validateRequest rejects malformed quick-send custom-command usage metadata", () => {
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions/abc/input",
      params: { sessionId: "abc" },
      body: {
        data: "echo hi\n",
        customCommandUsage: []
      }
    });
  }, /Field 'customCommandUsage' must be an object/);

  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions/abc/input",
      params: { sessionId: "abc" },
      body: {
        data: "echo hi\n",
        customCommandUsage: {
          lookupKey: "   "
        }
      }
    });
  }, /Field 'customCommandUsage.lookupKey' must be a non-empty string/);
});

test("validateRequest accepts quick-id swap payload", () => {
  assert.doesNotThrow(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions/a/swap-quick-id",
      params: { sessionId: "a" },
      body: { otherSessionId: "b" }
    });
  });
});

test("validateRequest accepts session file-transfer payloads", () => {
  assert.doesNotThrow(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions/a/file-transfer/upload",
      params: { sessionId: "a" },
      body: {
        path: "logs/output.txt",
        contentBase64: "aGVsbG8="
      }
    });
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions/a/file-transfer/download",
      params: { sessionId: "a" },
      body: {
        path: "logs/output.txt"
      }
    });
  });
});

test("validateRequest rejects invalid session file-transfer payloads", () => {
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions/a/file-transfer/upload",
      params: { sessionId: "a" },
      body: {
        path: "logs/output.txt",
        contentBase64: "*not-base64*"
      }
    });
  });
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions/a/file-transfer/download",
      params: { sessionId: "a" },
      body: {}
    });
  });
});

test("validateResponse accepts quick-id swap payload", () => {
  assert.doesNotThrow(() => {
    validateResponse({
      statusCode: 200,
      expect: "sessionQuickIdSwap",
      body: {
        leftSession: {
          id: "a",
          deckId: "default",
          quickIdToken: "2",
          state: "running",
          kind: "local",
          cwd: "/tmp",
          shell: "bash",
          appIdentity: SHELL_APP_IDENTITY,
          mouseForwardingMode: "off",
          inputSafetyProfile: INPUT_SAFETY_PROFILE,
          startCwd: "/tmp",
          startCommand: "",
          env: {},
          tags: [],
          controlState: CONTROL_STATE,
          themeProfile: THEME_PROFILE,
          activeThemeProfile: THEME_PROFILE,
          inactiveThemeProfile: THEME_PROFILE,
          createdAt: 1,
          updatedAt: 2
        },
        rightSession: {
          id: "b",
          deckId: "default",
          quickIdToken: "1",
          state: "running",
          kind: "local",
          cwd: "/tmp",
          shell: "bash",
          appIdentity: SHELL_APP_IDENTITY,
          mouseForwardingMode: "off",
          inputSafetyProfile: INPUT_SAFETY_PROFILE,
          startCwd: "/tmp",
          startCommand: "",
          env: {},
          tags: [],
          controlState: CONTROL_STATE,
          themeProfile: THEME_PROFILE,
          activeThemeProfile: THEME_PROFILE,
          inactiveThemeProfile: THEME_PROFILE,
          createdAt: 1,
          updatedAt: 2
        }
      }
    });
  });
});

test("validateResponse accepts session file-transfer payloads", () => {
  assert.doesNotThrow(() => {
    validateResponse({
      statusCode: 200,
      expect: "sessionFileUpload",
      body: {
        sessionId: "a",
        path: "logs/output.txt",
        fileName: "output.txt",
        sizeBytes: 7,
        created: true
      }
    });
    validateResponse({
      statusCode: 200,
      expect: "sessionFileDownload",
      body: {
        sessionId: "a",
        path: "logs/output.txt",
        fileName: "output.txt",
        contentType: "application/octet-stream",
        encoding: "base64",
        contentBase64: "dXBkYXRlZA==",
        sizeBytes: 7
      }
    });
  });
});

test("validateRequest rejects invalid custom-command scope and missing session scope selector", () => {
  assert.throws(() => {
    validateRequest({
      method: "GET",
      pathname: "/api/v1/custom-commands",
      params: {},
      query: {
        scope: "tenant"
      }
    });
  });

  assert.throws(() => {
    validateRequest({
      method: "GET",
      pathname: "/api/v1/custom-commands/docu",
      params: { commandName: "docu" },
      query: {
        scope: "session"
      }
    });
  });

  assert.throws(() => {
    validateRequest({
      method: "DELETE",
      pathname: "/api/v1/custom-commands/docu",
      params: { commandName: "docu" },
      query: {
        scope: "global",
        sessionId: "s-1"
      }
    });
  });
});

test("validateRequest rejects unsupported connection-profile secrets and invalid SSH trust or probe payloads", () => {
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/connection-profiles",
      params: {},
      body: {
        name: "ops",
        launch: {
          kind: "ssh",
          deckId: "default",
          shell: "ssh",
          startCwd: "~",
          startCommand: "",
          env: {},
          tags: [],
          activeThemeProfile: THEME_PROFILE,
          inactiveThemeProfile: THEME_PROFILE,
          remoteSecret: "not-supported"
        }
      }
    });
  });

  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/ssh-trust-entries",
      params: {},
      body: {
        host: "example.internal",
        port: "22",
        keyType: "ssh-ed25519",
        publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAIB9zdXBlcmZha2VrZXlibG9iZm9ydGVzdHM"
      }
    });
  });

  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/ssh-host-key-probe",
      params: {},
      body: {
        host: "example.internal",
        port: "22"
      }
    });
  });
});

test("validateResponse accepts SSH trust entries and SSH host-key probe candidate lists", () => {
  assert.doesNotThrow(() => {
    validateResponse({
      statusCode: 200,
      expect: "sshTrustEntryList",
      body: [
        {
          id: "trust-aaaaaaaaaaaaaaaaaaaaaaaa",
          host: "example.internal",
          port: 22,
          keyType: "ssh-ed25519",
          publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAIB9zdXBlcmZha2VrZXlibG9iZm9ydGVzdHM",
          fingerprintSha256: "SHA256:WBAy81afO2QAzgcFuxzxU+iGMFhHprahbFs9TMP7R9E",
          createdAt: 1,
          updatedAt: 2
        }
      ]
    });
    validateResponse({
      statusCode: 200,
      expect: "sshHostKeyProbeCandidateList",
      body: [
        {
          host: "example.internal",
          port: 22,
          keyType: "ssh-ed25519",
          publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAIB9zdXBlcmZha2VrZXlibG9iZm9ydGVzdHM",
          fingerprintSha256: "SHA256:WBAy81afO2QAzgcFuxzxU+iGMFhHprahbFs9TMP7R9E"
        }
      ]
    });
  });
});

test("validateResponse rejects malformed SSH trust entries and malformed session file downloads", () => {
  assert.throws(() => {
    validateResponse({
      statusCode: 200,
      expect: "sshTrustEntry",
      body: {
        id: "bad",
        host: "example.internal",
        port: 22,
        keyType: "ssh-ed25519",
        publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAIB9zdXBlcmZha2VrZXlibG9iZm9ydGVzdHM",
        fingerprintSha256: "sha256-bad",
        createdAt: 1,
        updatedAt: 2
      }
    });
  });

  assert.throws(() => {
    validateResponse({
      statusCode: 200,
      expect: "sessionFileDownload",
      body: {
        sessionId: "a",
        path: "logs/output.txt",
        fileName: "output.txt",
        contentType: "application/octet-stream",
        encoding: "raw",
        contentBase64: "dXBkYXRlZA==",
        sizeBytes: 7
      }
    });
  });
});

test("validateResponse rejects invalid session shape", () => {
  assert.throws(() => {
    validateResponse({
      statusCode: 200,
      expect: "session",
      body: {
        id: "a",
        cwd: "/tmp"
      }
    });
  });
});

test("validateRequest accepts valid session patch payload", () => {
  assert.doesNotThrow(() => {
    validateRequest({
      method: "PATCH",
      pathname: "/api/v1/sessions/abc",
      params: { sessionId: "abc" },
      body: {
        name: "renamed",
        note: "needs review",
        mouseForwardingMode: "application",
        inputSafetyProfile: INPUT_SAFETY_PROFILE,
        startCwd: "/tmp",
        startCommand: "echo hi",
        env: { FOO: "BAR" },
        tags: ["ops", "prod"],
        themeProfile: THEME_PROFILE
      }
    });
  });
});

test("validateRequest accepts ssh session create payload", () => {
  assert.doesNotThrow(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions",
      params: {},
      body: {
        kind: "ssh",
        remoteConnection: {
          host: "example.internal",
          port: 22,
          username: "ops"
        },
        remoteAuth: {
          method: "password"
        },
        remoteSecret: "super-secret",
        startCwd: "~",
        startCommand: "hostname"
      }
    });
  });
});

test("validateRequest rejects invalid mouse forwarding mode", () => {
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions",
      params: {},
      body: {
        shell: "sh",
        mouseForwardingMode: "always"
      }
    });
  });
});

test("validateRequest rejects invalid ssh session kind", () => {
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions",
      params: {},
      body: {
        kind: "telnet"
      }
    });
  });
});

test("validateRequest rejects invalid remoteSecret type", () => {
  assert.throws(() => {
    validateRequest({
      method: "PATCH",
      pathname: "/api/v1/sessions/abc",
      params: { sessionId: "abc" },
      body: {
        remoteSecret: 123
      }
    });
  });
});

test("validateRequest rejects invalid note types", () => {
  assert.throws(() => {
    validateRequest({
      method: "PATCH",
      pathname: "/api/v1/sessions/abc",
      params: { sessionId: "abc" },
      body: {
        note: 123
      }
    });
  });
});

test("validateRequest rejects invalid input safety profile type", () => {
  assert.throws(() => {
    validateRequest({
      method: "PATCH",
      pathname: "/api/v1/sessions/abc",
      params: { sessionId: "abc" },
      body: {
        inputSafetyProfile: "strict"
      }
    });
  });
});

test("validateRequest rejects malformed nested session startup and settings payloads", () => {
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions",
      params: {},
      body: {
        kind: "ssh",
        remoteConnection: {
          host: "example.internal",
          port: "22"
        }
      }
    });
  }, /Field 'remoteConnection' must be a valid remote connection object/);

  assert.throws(() => {
    validateRequest({
      method: "PATCH",
      pathname: "/api/v1/sessions/abc",
      params: { sessionId: "abc" },
      body: {
        remoteAuth: {
          method: "oauth"
        }
      }
    });
  }, /Field 'remoteAuth' must be a valid remote auth object/);

  assert.throws(() => {
    validateRequest({
      method: "PATCH",
      pathname: "/api/v1/sessions/abc",
      params: { sessionId: "abc" },
      body: {
        inputSafetyProfile: {
          confirmOnAnyInput: "yes"
        }
      }
    });
  }, /Field 'inputSafetyProfile' must contain only supported boolean and integer threshold entries/);

  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions",
      params: {},
      body: {
        themeProfile: {
          background: "blue"
        }
      }
    });
  }, /Field 'themeProfile' must contain only supported hex color entries/);
});

test("validateRequest accepts valid dev token request payload", () => {
  assert.doesNotThrow(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/auth/dev-token",
      params: {},
      body: { subject: "alice", tenantId: "dev", scopes: ["sessions:read"] }
    });
  });
});

test("validateRequest accepts valid ws ticket request payload", () => {
  assert.doesNotThrow(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/auth/ws-ticket",
      params: {},
      body: {
        clientId: "trusted-device-1",
        label: "Desk Browser"
      }
    });
  });
});

test("validateRequest rejects invalid auth and share request branches", () => {
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/auth/dev-token",
      params: {},
      body: { scopes: "operator" }
    });
  });
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/auth/ws-ticket",
      params: {},
      body: { clientId: "   " }
    });
  });
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/auth/ws-ticket",
      params: {},
      body: { label: 42 }
    });
  });
  assert.throws(() => {
    validateRequest({
      method: "GET",
      pathname: "/api/v1/shares",
      params: {},
      body: {}
    });
  });
});

test("validateRequest rejects malformed share, file-transfer, and custom-command edge variants", () => {
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/shares",
      params: {},
      body: {
        targetType: "session",
        targetId: "session-1",
        expiresInSeconds: "3600"
      }
    });
  }, /Field 'expiresInSeconds' must be an integer/);

  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions/a/file-transfer/upload",
      params: {},
      body: {
        path: "logs/output.txt",
        contentBase64: "aGVsbG8="
      }
    });
  }, /Missing sessionId path parameter/);

  assert.throws(() => {
    validateRequest({
      method: "PUT",
      pathname: "/api/v1/custom-commands/docu",
      params: { commandName: "docu" },
      body: {
        content: "echo hi\n",
        templateVariables: ["session.cwd", 2]
      }
    });
  }, /Field 'templateVariables' must be a string array/);
});

test("validateRequest rejects invalid trusted-local control and management patch edge cases", () => {
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions/abc/control/take",
      params: { sessionId: "abc" },
      body: "invalid"
    });
  });
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/session-control/take",
      params: {},
      body: { scope: "invalid" }
    });
  });
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions/a/file-transfer/upload",
      params: { sessionId: "a" },
      body: {
        path: "   ",
        contentBase64: "aGVsbG8="
      }
    });
  });
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions/a/file-transfer/download",
      params: { sessionId: "a" },
      body: {
        path: ""
      }
    });
  });
  assert.throws(() => {
    validateRequest({
      method: "PATCH",
      pathname: "/api/v1/layout-profiles/focus",
      params: { profileId: "focus" },
      body: {}
    });
  });
  assert.throws(() => {
    validateRequest({
      method: "PATCH",
      pathname: "/api/v1/workspace-presets/focus",
      params: { presetId: "focus" },
      body: {}
    });
  });
});

test("validateRequest accepts share lifecycle payloads", () => {
  assert.doesNotThrow(() => {
    validateRequest({
      method: "GET",
      pathname: "/api/v1/shares",
      params: {},
      body: undefined
    });
    validateRequest({
      method: "POST",
      pathname: "/api/v1/shares",
      params: {},
      body: {
        targetType: "session",
        targetId: "session-1",
        expiresInSeconds: 3600
      }
    });
    validateRequest({
      method: "GET",
      pathname: "/api/v1/shares/share-0123456789abcdef01234567",
      params: { shareId: "share-0123456789abcdef01234567" },
      body: undefined
    });
    validateRequest({
      method: "POST",
      pathname: "/api/v1/shares/share-0123456789abcdef01234567/revoke",
      params: { shareId: "share-0123456789abcdef01234567" },
      body: {}
    });
  });
});

test("validateRequest rejects invalid share lifecycle payloads", () => {
  assert.throws(() => {
    validateRequest({
      method: "GET",
      pathname: "/api/v1/shares",
      params: {},
      body: {}
    });
  });
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/shares",
      params: {},
      body: {
        targetType: "workspace",
        targetId: "default"
      }
    });
  });
  assert.throws(() => {
    validateRequest({
      method: "GET",
      pathname: "/api/v1/shares/share-0123456789abcdef01234567",
      params: {},
      body: undefined
    });
  });
});

test("validateResponse accepts auth token response", () => {
  assert.doesNotThrow(() => {
    validateResponse({
      statusCode: 200,
      expect: "authToken",
      body: {
        accessToken: "token",
        tokenType: "Bearer",
        expiresIn: 900,
        scope: "sessions:read"
      }
    });
  });
});

test("validateResponse rejects malformed trusted-local session control and ws ticket payloads", () => {
  assert.throws(() => {
    validateResponse({
      statusCode: 200,
      expect: "session",
      body: createLocalSession({
        controlState: {
          ...CONTROL_STATE,
          attachedClients: [
            {
              ...CONTROL_STATE.attachedClients[0],
              role: "writer"
            }
          ]
        }
      })
    });
  });

  assert.throws(() => {
    validateResponse({
      statusCode: 200,
      expect: "wsTicket",
      body: {
        ticket: "ticket-1",
        tokenType: "bearer",
        expiresIn: "60"
      }
    });
  });
});

test("validateResponse accepts ws ticket response", () => {
  assert.doesNotThrow(() => {
    validateResponse({
      statusCode: 200,
      expect: "wsTicket",
      body: {
        ticket: "ticket-123",
        tokenType: "WsTicket",
        expiresIn: 30
      }
    });
  });
});

test("validateResponse accepts share link payloads", () => {
  assert.doesNotThrow(() => {
    validateResponse({
      statusCode: 200,
      expect: "shareLink",
      body: {
        id: "share-0123456789abcdef01234567",
        targetType: "session",
        targetId: "session-1",
        permissionMode: "read_only",
        createdAt: 1,
        updatedAt: 2,
        expiresAt: 3,
        revokedAt: null,
        creatorSubject: "dev-user",
        creatorTenantId: "dev",
        active: true,
        joinUrl: "http://example.invalid/?share_token=abc"
      }
    });
    validateResponse({
      statusCode: 200,
      expect: "shareLinkList",
      body: [
        {
          id: "share-0123456789abcdef01234567",
          targetType: "deck",
          targetId: "ops",
          permissionMode: "read_only",
          createdAt: 1,
          updatedAt: 2,
          expiresAt: 3,
          revokedAt: 4,
          creatorSubject: "dev-user",
          creatorTenantId: "dev",
          active: false
        }
      ]
    });
  });
});

test("validateResponse accepts replay excerpt payloads and rejects malformed selector metadata", () => {
  assert.doesNotThrow(() => {
    validateResponse({
      statusCode: 200,
      expect: "sessionReplayExcerpt",
      body: createReplayExcerpt()
    });
  });

  assert.throws(() => {
    validateResponse({
      statusCode: 200,
      expect: "sessionReplayExcerpt",
      body: createReplayExcerpt({
        selectorKind: "invalid"
      })
    });
  }, /Response does not match SessionReplayExcerpt schema/);

  assert.throws(() => {
    validateResponse({
      statusCode: 200,
      expect: "sessionReplayExcerpt",
      body: createReplayExcerpt({
        requestedCount: 0
      })
    });
  }, /Response does not match SessionReplayExcerpt schema/);

  assert.throws(() => {
    validateResponse({
      statusCode: 200,
      expect: "sessionReplayExcerpt",
      body: createReplayExcerpt({
        sourceRetentionLimitChars: "16384"
      })
    });
  }, /Response does not match SessionReplayExcerpt schema/);
});

test("validateResponse rejects malformed share lists and file-transfer payload tails", () => {
  assert.throws(() => {
    validateResponse({
      statusCode: 200,
      expect: "shareLinkList",
      body: [
        {
          id: "share-1",
          targetType: "session",
          targetId: "session-1",
          permissionMode: "read_only",
          createdAt: 1,
          updatedAt: 2,
          expiresAt: 3,
          revokedAt: null,
          creatorSubject: "dev-user",
          creatorTenantId: 42,
          active: true
        }
      ]
    });
  }, /Response does not match ShareLink\[] schema/);

  assert.throws(() => {
    validateResponse({
      statusCode: 200,
      expect: "sessionFileUpload",
      body: {
        sessionId: "a",
        path: "logs/output.txt",
        fileName: "output.txt",
        sizeBytes: -1,
        created: true
      }
    });
  }, /Response does not match SessionFileUpload schema/);
});

test("validateRequest rejects malformed replay excerpt selectors and whitespace-only file-transfer paths", () => {
  assert.throws(() => {
    validateRequest({
      method: "GET",
      pathname: "/api/v1/sessions/abc/replay-excerpt",
      params: { sessionId: "abc" },
      query: { slice: "sp:01" }
    });
  }, /Query parameter 'slice' must match 'l:N', 'c:N', or 'sp:N'/);

  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/sessions/a/file-transfer/download",
      params: { sessionId: "a" },
      body: {
        path: "   "
      }
    });
  }, /Field 'path' must be a non-empty string/);
});

test("validateRequest accepts valid custom command upsert payload", () => {
  assert.doesNotThrow(() => {
    validateRequest({
      method: "PUT",
      pathname: "/api/v1/custom-commands/docu",
      params: { commandName: "docu" },
      body: { content: "echo hi\n" }
    });
    validateRequest({
      method: "PUT",
      pathname: "/api/v1/custom-commands/deploy",
      params: { commandName: "deploy" },
      body: {
        content: "echo {{param:env}} {{var:session.cwd}}\n",
        kind: "template",
        templateVariables: ["session.cwd"]
      }
    });
    validateRequest({
      method: "PUT",
      pathname: "/api/v1/custom-commands/deploy",
      params: { commandName: "deploy" },
      body: {
        content: "echo session\n",
        scope: "session",
        sessionId: "session-1"
      }
    });
    validateRequest({
      method: "GET",
      pathname: "/api/v1/custom-commands/deploy",
      params: { commandName: "deploy" },
      query: {
        scope: "session",
        sessionId: "session-1"
      }
    });
  });
});

test("validateRequest rejects invalid custom command upsert payload", () => {
  assert.throws(() => {
    validateRequest({
      method: "PUT",
      pathname: "/api/v1/custom-commands/docu",
      params: { commandName: "docu" },
      body: { content: 123 }
    });
  });
  assert.throws(() => {
    validateRequest({
      method: "PUT",
      pathname: "/api/v1/custom-commands/docu",
      params: { commandName: "docu" },
      body: { content: "echo hi\n", kind: "macro" }
    });
  });
  assert.throws(() => {
    validateRequest({
      method: "PUT",
      pathname: "/api/v1/custom-commands/docu",
      params: { commandName: "docu" },
      body: { content: "echo hi\n", templateVariables: "session.cwd" }
    });
  });
  assert.throws(() => {
    validateRequest({
      method: "PUT",
      pathname: "/api/v1/custom-commands/docu",
      params: { commandName: "docu" },
      body: { content: "echo hi\n", scope: "session" }
    });
  });
  assert.throws(() => {
    validateRequest({
      method: "GET",
      pathname: "/api/v1/custom-commands/docu",
      params: { commandName: "docu" },
      query: { sessionId: "session-1" }
    });
  });
});

test("validateRequest rejects malformed connection profile launch, layout profile, and workspace preset payloads", () => {
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/connection-profiles",
      params: {},
      body: {
        name: "Ops SSH",
        launch: {
          themeProfile: {
            background: "blue"
          }
        }
      }
    });
  }, /Field 'launch.themeProfile' must contain only supported hex color entries/);

  assert.throws(() => {
    validateRequest({
      method: "PATCH",
      pathname: "/api/v1/connection-profiles/ops-ssh",
      params: { profileId: "ops-ssh" },
      body: {
        launch: {
          remoteAuth: {
            method: "oauth"
          }
        }
      }
    });
  }, /Field 'launch.remoteAuth' must be a valid remote auth object/);

  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/layout-profiles",
      params: {},
      body: {
        name: "Focus Layout",
        layout: {
          controlPaneVisible: "yes"
        }
      }
    });
  }, /Field 'layout' must contain only supported layout profile settings/);

  assert.throws(() => {
    validateRequest({
      method: "PATCH",
      pathname: "/api/v1/workspace-presets/focus",
      params: { presetId: "focus" },
      body: {
        workspace: {
          controlPanePosition: "center"
        }
      }
    });
  }, /Field 'workspace' must contain only supported workspace preset settings/);
});

test("validateResponse accepts custom command payloads", () => {
  assert.doesNotThrow(() => {
    validateResponse({
      statusCode: 200,
      expect: "customCommand",
      body: {
        name: "docu",
        content: "echo hi\n",
        kind: "plain",
        scope: "project",
        sessionId: null,
        precedence: 200,
        templateVariables: [],
        createdAt: 1,
        updatedAt: 2
      }
    });
    validateResponse({
      statusCode: 200,
      expect: "customCommandList",
      body: [
        {
          name: "docu",
          content: "echo hi\n",
          kind: "template",
          scope: "session",
          sessionId: "session-1",
          precedence: 300,
          templateVariables: ["session.cwd"],
          createdAt: 1,
          updatedAt: 2
        }
      ]
    });
  });
});

test("validateResponse accepts replay export payloads and rejects malformed catalog response variants", () => {
  assert.doesNotThrow(() => {
    validateResponse({
      statusCode: 200,
      expect: "sessionReplayExport",
      body: createReplayExport()
    });
  });

  assert.throws(() => {
    validateResponse({
      statusCode: 500,
      expect: "error",
      body: {
        error: "ValidationError"
      }
    });
  }, /Error response schema mismatch/);

  assert.throws(() => {
    validateResponse({
      statusCode: 200,
      expect: "sessionReplayExport",
      body: createReplayExport({
        retainedChars: -1
      })
    });
  }, /Response does not match SessionReplayExport schema/);

  assert.throws(() => {
    validateResponse({
      statusCode: 200,
      expect: "customCommandList",
      body: [
        {
          name: "docu",
          content: "echo hi\n",
          kind: "template",
          scope: "session",
          sessionId: "session-1",
          precedence: 300,
          templateVariables: [1],
          createdAt: 1,
          updatedAt: 2
        }
      ]
    });
  }, /Response does not match CustomCommand\[] schema/);

  assert.throws(() => {
    validateResponse({
      statusCode: 200,
      expect: "deckList",
      body: [
        {
          id: "ops",
          name: "Operations",
          settings: null,
          createdAt: 1,
          updatedAt: 2
        }
      ]
    });
  }, /Response does not match Deck\[] schema/);

  assert.throws(() => {
    validateResponse({
      statusCode: 200,
      expect: "workspacePresetList",
      body: [
        {
          id: "focus",
          name: "Focus Workspace",
          createdAt: 1,
          updatedAt: 2,
          workspace: {
            activeDeckId: "default",
            controlPaneVisible: true,
            controlPanePosition: "bottom",
            controlPaneSize: 240,
            deckGroups: {
              default: {
                activeGroupId: 7,
                groups: []
              }
            },
            deckSplitLayouts: {}
          }
        }
      ]
    });
  }, /Response does not match WorkspacePreset\[] schema/);

  assert.throws(() => {
    validateResponse({
      statusCode: 200,
      expect: "sshHostKeyProbeCandidateList",
      body: [
        {
          host: "example.internal",
          port: 22,
          keyType: "ssh-ed25519",
          publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAIB9zdXBlcmZha2VrZXlibG9iZm9ydGVzdHM",
          fingerprintSha256: "bad"
        }
      ]
    });
  }, /Response does not match SshHostKeyProbeCandidate\[] schema/);
});

test("validateRequest accepts valid layout profile create and patch payloads", () => {
  assert.doesNotThrow(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/layout-profiles",
      params: {},
      body: {
        id: "focus",
        name: "Focus Layout",
        layout: {
          activeDeckId: "default",
          sidebarVisible: true,
          sessionFilterText: "ops",
          deckTerminalSettings: {
            default: { cols: 110, rows: 28 }
          },
          deckSplitLayouts: {
            default: {
              root: {
                type: "row",
                weights: [2, 1],
                children: [
                  { type: "pane", paneId: "left" },
                  { type: "pane", paneId: "right" }
                ]
              },
              paneSessions: {
                left: ["s-1"],
                right: ["s-2"]
              }
            }
          }
        }
      }
    });
    validateRequest({
      method: "PATCH",
      pathname: "/api/v1/layout-profiles/focus",
      params: { profileId: "focus" },
      body: {
        name: "Focus Layout Updated",
        layout: {
          activeDeckId: "default",
          sidebarVisible: false,
          sessionFilterText: "",
          controlPaneVisible: true,
          controlPanePosition: "bottom",
          controlPaneSize: 240,
          deckTerminalSettings: {},
          deckSplitLayouts: {
            default: {
              root: { type: "pane", paneId: "main" },
              paneSessions: {
                main: []
              }
            }
          }
        }
      }
    });
  });
});

test("validateRequest rejects invalid layout profile payloads", () => {
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/layout-profiles",
      params: {},
      body: { name: "", layout: {} }
    });
  });
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/layout-profiles",
      params: {},
      body: {}
    });
  });
});

test("validateResponse accepts layout profile payloads", () => {
  const body = {
    id: "focus",
    name: "Focus Layout",
    createdAt: 1,
    updatedAt: 2,
    layout: {
      activeDeckId: "default",
      sidebarVisible: true,
      sessionFilterText: "ops",
      controlPaneVisible: true,
      controlPanePosition: "bottom",
      controlPaneSize: 240,
      deckTerminalSettings: {
        default: { cols: 110, rows: 28 }
      },
      deckSplitLayouts: {
        default: {
          root: {
            type: "row",
            weights: [0.7, 0.3],
            children: [
              { type: "pane", paneId: "left" },
              { type: "pane", paneId: "right" }
            ]
          },
          paneSessions: {
            left: ["s-1"],
            right: ["s-2"]
          }
        }
      }
    }
  };
  assert.doesNotThrow(() => {
    validateResponse({
      statusCode: 200,
      expect: "layoutProfile",
      body
    });
    validateResponse({
      statusCode: 200,
      expect: "layoutProfileList",
      body: [body]
    });
  });
});

test("validateRequest accepts valid connection profile create and patch payloads", () => {
  assert.doesNotThrow(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/connection-profiles",
      params: {},
      body: {
        id: "ops-ssh",
        name: "Ops SSH",
        launch: {
          kind: "ssh",
          deckId: "ops",
          shell: "ssh",
          startCwd: "~",
          startCommand: "cd ~/app && exec $SHELL -l",
          env: {
            LANG: "en_US.UTF-8"
          },
          tags: ["ops", "ssh"],
          remoteConnection: {
            host: "ops.internal",
            port: 2222,
            username: "deploy"
          },
          remoteAuth: {
            method: "privateKey",
            privateKeyPath: "~/.ssh/ops"
          }
        }
      }
    });
    validateRequest({
      method: "PATCH",
      pathname: "/api/v1/connection-profiles/ops-ssh",
      params: { profileId: "ops-ssh" },
      body: {
        name: "Ops SSH Updated",
        launch: {
          kind: "local",
          deckId: "default",
          shell: "bash",
          startCwd: "/workspace",
          startCommand: "",
          env: {},
          tags: ["local"]
        }
      }
    });
  });
});

test("validateRequest rejects invalid connection profile payloads", () => {
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/connection-profiles",
      params: {},
      body: {
        name: "Ops SSH",
        launch: {
          kind: "ssh",
          remoteSecret: "should-not-persist"
        }
      }
    });
  });
  assert.throws(() => {
    validateRequest({
      method: "PATCH",
      pathname: "/api/v1/connection-profiles/ops-ssh",
      params: { profileId: "ops-ssh" },
      body: {}
    });
  });
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/connection-profiles",
      params: {},
      body: {
        name: "Ops SSH",
        launch: {
          kind: "ssh",
          env: {
            LANG: 1
          }
        }
      }
    });
  });
  assert.throws(() => {
    validateRequest({
      method: "PATCH",
      pathname: "/api/v1/connection-profiles/ops-ssh",
      params: { profileId: "ops-ssh" },
      body: {
        launch: {
          activeThemeProfile: "bad"
        }
      }
    });
  });
  assert.throws(() => {
    validateRequest({
      method: "PATCH",
      pathname: "/api/v1/connection-profiles/ops-ssh",
      params: { profileId: "ops-ssh" },
      body: {
        launch: {
          remoteConnection: "bad"
        }
      }
    });
  });
});

test("validateResponse accepts connection profile payloads", () => {
  const body = {
    id: "ops-ssh",
    name: "Ops SSH",
    createdAt: 1,
    updatedAt: 2,
    launch: {
      kind: "ssh",
      deckId: "ops",
      shell: "ssh",
      startCwd: "~",
      startCommand: "cd ~/app && exec $SHELL -l",
      env: {
        LANG: "en_US.UTF-8"
      },
      tags: ["ops", "ssh"],
      themeProfile: {
        background: "#0a0d12",
        foreground: "#d8dee9",
        cursor: "#8ec07c",
        black: "#0a0d12",
        red: "#fb4934",
        green: "#8ec07c",
        yellow: "#fabd2f",
        blue: "#83a598",
        magenta: "#b48ead",
        cyan: "#8fbcbb",
        white: "#d8dee9",
        brightBlack: "#4b5563",
        brightRed: "#ff6b5a",
        brightGreen: "#a5d68a",
        brightYellow: "#ffd36a",
        brightBlue: "#98b6cc",
        brightMagenta: "#c8a7d8",
        brightCyan: "#a9d9d6",
        brightWhite: "#f5f7fa"
      },
      activeThemeProfile: {
        background: "#0a0d12",
        foreground: "#d8dee9",
        cursor: "#8ec07c",
        black: "#0a0d12",
        red: "#fb4934",
        green: "#8ec07c",
        yellow: "#fabd2f",
        blue: "#83a598",
        magenta: "#b48ead",
        cyan: "#8fbcbb",
        white: "#d8dee9",
        brightBlack: "#4b5563",
        brightRed: "#ff6b5a",
        brightGreen: "#a5d68a",
        brightYellow: "#ffd36a",
        brightBlue: "#98b6cc",
        brightMagenta: "#c8a7d8",
        brightCyan: "#a9d9d6",
        brightWhite: "#f5f7fa"
      },
      inactiveThemeProfile: {
        background: "#0a0d12",
        foreground: "#d8dee9",
        cursor: "#8ec07c",
        black: "#0a0d12",
        red: "#fb4934",
        green: "#8ec07c",
        yellow: "#fabd2f",
        blue: "#83a598",
        magenta: "#b48ead",
        cyan: "#8fbcbb",
        white: "#d8dee9",
        brightBlack: "#4b5563",
        brightRed: "#ff6b5a",
        brightGreen: "#a5d68a",
        brightYellow: "#ffd36a",
        brightBlue: "#98b6cc",
        brightMagenta: "#c8a7d8",
        brightCyan: "#a9d9d6",
        brightWhite: "#f5f7fa"
      },
      remoteConnection: {
        host: "ops.internal",
        port: 2222,
        username: "deploy"
      },
      remoteAuth: {
        method: "privateKey",
        privateKeyPath: "~/.ssh/ops"
      }
    }
  };
  assert.doesNotThrow(() => {
    validateResponse({
      statusCode: 200,
      expect: "connectionProfile",
      body
    });
    validateResponse({
      statusCode: 200,
      expect: "connectionProfileList",
      body: [body]
    });
  });
});

test("validateResponse rejects malformed connection profile and workspace preset payloads", () => {
  assert.throws(() => {
    validateResponse({
      statusCode: 200,
      expect: "connectionProfile",
      body: {
        id: "ops-ssh",
        name: "Ops SSH",
        createdAt: 1,
        updatedAt: 2,
        launch: {
          kind: "ssh",
          deckId: "ops",
          shell: "ssh",
          startCwd: "~",
          startCommand: "cd ~/app && exec $SHELL -l",
          env: {
            LANG: "en_US.UTF-8"
          },
          tags: ["ops", "ssh"],
          themeProfile: THEME_PROFILE,
          activeThemeProfile: THEME_PROFILE,
          inactiveThemeProfile: THEME_PROFILE,
          remoteConnection: {
            host: "ops.internal",
            port: 2222,
            username: "deploy"
          },
          remoteAuth: {
            method: "privateKey",
            privateKeyPath: 42
          }
        }
      }
    });
  }, /Response does not match ConnectionProfile schema/);

  assert.throws(() => {
    validateResponse({
      statusCode: 200,
      expect: "workspacePreset",
      body: {
        id: "focus",
        name: "Focus Workspace",
        createdAt: 1,
        updatedAt: 2,
        workspace: {
          activeDeckId: "default",
          layoutProfileId: "ops",
          controlPaneVisible: true,
          controlPanePosition: "bottom",
          controlPaneSize: 240,
          deckGroups: {
            default: {
              activeGroupId: 7,
              groups: [
                {
                  id: "core",
                  name: "Core Sessions",
                  sessionIds: ["s-1", "s-2"]
                }
              ]
            }
          },
          deckSplitLayouts: {}
        }
      }
    });
  }, /Response does not match WorkspacePreset schema/);
});

test("validateRequest accepts valid workspace preset create and patch payloads", () => {
  assert.doesNotThrow(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/workspace-presets",
      params: {},
      body: {
        id: "focus",
        name: "Focus Workspace",
        workspace: {
          activeDeckId: "default",
          layoutProfileId: "ops",
          controlPaneVisible: true,
          controlPanePosition: "bottom",
          controlPaneSize: 240,
          deckGroups: {
            default: {
              activeGroupId: "core",
              groups: [
                {
                  id: "core",
                  name: "Core Sessions",
                  sessionIds: ["s-1", "s-2"]
                }
              ]
            }
          },
          deckSplitLayouts: {
            default: {
              root: {
                type: "column",
                weights: [3, 2],
                children: [
                  { type: "pane", paneId: "upper" },
                  { type: "pane", paneId: "lower" }
                ]
              },
              paneSessions: {
                upper: ["s-1"],
                lower: ["s-2"]
              }
            }
          }
        }
      }
    });
    validateRequest({
      method: "PATCH",
      pathname: "/api/v1/workspace-presets/focus",
      params: { presetId: "focus" },
      body: {
        name: "Focus Workspace Updated",
        workspace: {
          activeDeckId: "default",
          controlPaneVisible: true,
          controlPanePosition: "bottom",
          controlPaneSize: 240,
          deckGroups: {},
          deckSplitLayouts: {
            default: {
              root: { type: "pane", paneId: "main" },
              paneSessions: {
                main: []
              }
            }
          }
        }
      }
    });
  });
});

test("validateRequest rejects invalid workspace preset payloads", () => {
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/workspace-presets",
      params: {},
      body: { name: "", workspace: {} }
    });
  });
  assert.throws(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/workspace-presets",
      params: {},
      body: {}
    });
  });
});

test("validateRequest accepts valid ssh trust entry create and delete payloads", () => {
  assert.doesNotThrow(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/ssh-trust-entries",
      params: {},
      body: {
        host: "example.internal",
        port: 2222,
        keyType: "ssh-ed25519",
        publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAIB9zdXBlcmZha2VrZXlibG9iZm9ydGVzdHM"
      }
    });
    validateRequest({
      method: "DELETE",
      pathname: "/api/v1/ssh-trust-entries/trust-1234567890abcdef12345678",
      params: { entryId: "trust-1234567890abcdef12345678" }
    });
  });
});

test("validateResponse accepts ssh trust entry payloads", () => {
  const body = {
    id: "trust-1234567890abcdef12345678",
    host: "example.internal",
    port: 2222,
    keyType: "ssh-ed25519",
    publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAIB9zdXBlcmZha2VrZXlibG9iZm9ydGVzdHM",
    fingerprintSha256: "SHA256:fakefingerprintfortests",
    createdAt: 1,
    updatedAt: 2
  };
  assert.doesNotThrow(() => {
    validateResponse({
      statusCode: 200,
      expect: "sshTrustEntry",
      body
    });
    validateResponse({
      statusCode: 200,
      expect: "sshTrustEntryList",
      body: [body]
    });
  });
});

test("validateResponse rejects split-layout container weights that do not match child count", () => {
  assert.throws(() => {
    validateResponse({
      statusCode: 200,
      expect: "layoutProfile",
      body: {
        id: "focus",
        name: "Focus Layout",
        createdAt: 1,
        updatedAt: 1,
        layout: {
          activeDeckId: "default",
          sidebarVisible: true,
          sessionFilterText: "",
          controlPaneVisible: true,
          controlPanePosition: "bottom",
          controlPaneSize: 240,
          deckTerminalSettings: {},
          deckSplitLayouts: {
            default: {
              root: {
                type: "row",
                weights: [1],
                children: [
                  { type: "pane", paneId: "left" },
                  { type: "pane", paneId: "right" }
                ]
              },
              paneSessions: {
                left: [],
                right: []
              }
            }
          }
        }
      }
    });
  });
});

test("validateResponse accepts workspace preset payloads", () => {
  const body = {
    id: "focus",
    name: "Focus Workspace",
    createdAt: 1,
    updatedAt: 2,
    workspace: {
      activeDeckId: "default",
      layoutProfileId: "ops",
      controlPaneVisible: true,
      controlPanePosition: "bottom",
      controlPaneSize: 240,
      deckGroups: {
        default: {
          activeGroupId: "core",
          groups: [
            {
              id: "core",
              name: "Core Sessions",
              sessionIds: ["s-1", "s-2"]
            }
          ]
        }
      },
      deckSplitLayouts: {
        default: {
          root: {
            type: "column",
            weights: [0.6, 0.4],
            children: [
              { type: "pane", paneId: "upper" },
              { type: "pane", paneId: "lower" }
            ]
          },
          paneSessions: {
            upper: ["s-1"],
            lower: ["s-2"]
          }
        }
      }
    }
  };
  assert.doesNotThrow(() => {
    validateResponse({
      statusCode: 200,
      expect: "workspacePreset",
      body
    });
    validateResponse({
      statusCode: 200,
      expect: "workspacePresetList",
      body: [body]
    });
  });
});

test("validateRequest accepts valid deck create/patch and move payloads", () => {
  assert.doesNotThrow(() => {
    validateRequest({
      method: "POST",
      pathname: "/api/v1/decks",
      params: {},
      body: { id: "ops", name: "Operations", settings: { terminal: { cols: 80, rows: 24 } } }
    });
    validateRequest({
      method: "PATCH",
      pathname: "/api/v1/decks/ops",
      params: { deckId: "ops" },
      body: { name: "Ops" }
    });
    validateRequest({
      method: "POST",
      pathname: "/api/v1/decks/ops/sessions/abc:move",
      params: { deckId: "ops", sessionId: "abc" },
      body: {}
    });
  });
});

test("validateResponse accepts deck payloads", () => {
  assert.doesNotThrow(() => {
    validateResponse({
      statusCode: 200,
      expect: "deck",
      body: {
        id: "ops",
        name: "Operations",
        settings: {},
        createdAt: 1,
        updatedAt: 2
      }
    });
    validateResponse({
      statusCode: 200,
      expect: "deckList",
      body: [
        {
          id: "ops",
          name: "Operations",
          settings: {},
          createdAt: 1,
          updatedAt: 2
        }
      ]
    });
  });
});

test("validateRequest rejects unsupported query combinations for custom command lookups", () => {
  assert.throws(() => {
    validateRequest({
      method: "GET",
      pathname: "/api/v1/custom-commands",
      params: {},
      query: {
        sessionId: "session-a"
      }
    });
  });
  assert.throws(() => {
    validateRequest({
      method: "GET",
      pathname: "/api/v1/custom-commands/docu",
      params: { commandName: "docu" },
      query: {
        scope: "global",
        sessionId: "session-a"
      }
    });
  });
});

test("validateRequest accepts and rejects operator composer placement patch payloads", () => {
  assert.doesNotThrow(() => {
    validateRequest({
      method: "PATCH",
      pathname: "/api/v1/operator/composer-placement",
      params: {},
      body: {
        mode: "active-overlay",
        pinnedSessionIds: ["session-1"],
        sharedDraft: "shared",
        pinnedDrafts: {
          "session-1": "pwd"
        }
      }
    });
  });

  assert.throws(() => {
    validateRequest({
      method: "PATCH",
      pathname: "/api/v1/operator/composer-placement",
      params: {},
      body: {}
    });
  });
  assert.throws(() => {
    validateRequest({
      method: "PATCH",
      pathname: "/api/v1/operator/composer-placement",
      params: {},
      body: {
        pinnedDrafts: {
          "": "bad"
        }
      }
    });
  });
});

test("validateResponse accepts operator composer placement payloads", () => {
  assert.doesNotThrow(() => {
    validateResponse({
      statusCode: 200,
      expect: "operatorComposerPlacement",
      body: {
        clientId: "client-1",
        mode: "active-overlay",
        pinnedSessionIds: ["session-1"],
        sharedDraft: "shared",
        pinnedDrafts: {
          "session-1": "pwd"
        }
      }
    });
  });
});
