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
  requireValidShellSyntax: true,
  confirmOnIncompleteShellConstruct: true,
  confirmOnNaturalLanguageInput: true,
  confirmOnDangerousShellCommand: true,
  confirmOnMultilineInput: false,
  confirmOnRecentTargetSwitch: true,
  targetSwitchGraceMs: 4000,
  pasteLengthConfirmThreshold: 400,
  pasteLineConfirmThreshold: 5
};

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

test("validateResponse checks session list schema", () => {
  assert.doesNotThrow(() => {
    validateResponse({
      statusCode: 200,
      expect: "sessionList",
      body: [
        {
          id: "a",
          deckId: "default",
          state: "running",
          cwd: "/tmp",
          shell: "bash",
          note: "needs review",
          inputSafetyProfile: INPUT_SAFETY_PROFILE,
          startCwd: "/tmp",
          startCommand: "",
          env: {},
          tags: [],
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
      body: {}
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
