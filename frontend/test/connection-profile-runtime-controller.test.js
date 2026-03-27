import test from "node:test";
import assert from "node:assert/strict";

import {
  buildConnectionProfileLaunchFromSession,
  createConnectionProfileRuntimeController,
  formatConnectionProfileSummary,
  resolveConnectionProfileToken
} from "../src/public/connection-profile-runtime-controller.js";

function createElement(tagName = "div") {
  return {
    tagName: String(tagName).toUpperCase(),
    value: "",
    textContent: "",
    disabled: false,
    selected: false,
    hidden: false,
    children: [],
    listeners: new Map(),
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) {
        this.children.splice(index, 1);
      }
      return child;
    },
    get firstChild() {
      return this.children[0] || null;
    },
    addEventListener(type, handler) {
      const list = this.listeners.get(type) || [];
      list.push(handler);
      this.listeners.set(type, list);
    },
    dispatch(type, event = {}) {
      for (const handler of this.listeners.get(type) || []) {
        handler({ type, preventDefault() {}, ...event });
      }
    },
    click() {
      this.dispatch("click");
    }
  };
}

function createDocumentRef() {
  return {
    createElement(tagName) {
      return createElement(tagName);
    }
  };
}

function createThemeProfile(seed) {
  return {
    background: seed,
    foreground: "#eeeeee",
    cursor: "#ffffff",
    black: "#111111",
    red: "#ff0000",
    green: "#00ff00",
    yellow: "#ffff00",
    blue: "#0000ff",
    magenta: "#ff00ff",
    cyan: "#00ffff",
    white: "#ffffff",
    brightBlack: "#222222",
    brightRed: "#ff1111",
    brightGreen: "#11ff11",
    brightYellow: "#ffff11",
    brightBlue: "#1111ff",
    brightMagenta: "#ff11ff",
    brightCyan: "#11ffff",
    brightWhite: "#f5f5f5"
  };
}

test("resolveConnectionProfileToken matches exact and unique prefix selectors", () => {
  const profiles = [
    {
      id: "ops-local",
      name: "Ops Local",
      launch: {
        kind: "local",
        deckId: "default",
        shell: "bash",
        startCwd: "/srv/ops",
        startCommand: "",
        env: {},
        tags: ["ops"],
        activeThemeProfile: createThemeProfile("#101010"),
        inactiveThemeProfile: createThemeProfile("#202020")
      }
    },
    {
      id: "ops-ssh",
      name: "Ops SSH",
      launch: {
        kind: "ssh",
        deckId: "ops",
        shell: "ssh",
        startCwd: "~",
        startCommand: "",
        env: {},
        tags: ["ssh"],
        activeThemeProfile: createThemeProfile("#303030"),
        inactiveThemeProfile: createThemeProfile("#404040"),
        remoteConnection: { host: "ops.example", port: 22, username: "ops" },
        remoteAuth: { method: "privateKey", privateKeyPath: "/home/ops/.ssh/id_ed25519" }
      }
    }
  ];

  assert.equal(resolveConnectionProfileToken(profiles, "ops-local").profile?.id, "ops-local");
  assert.equal(resolveConnectionProfileToken(profiles, "Ops SSH").profile?.id, "ops-ssh");
  assert.equal(resolveConnectionProfileToken(profiles, "ops-s").profile?.id, "ops-ssh");
  assert.match(resolveConnectionProfileToken(profiles, "missing").error, /Unknown connection profile/);
  assert.equal(formatConnectionProfileSummary(profiles[1]), "[ops-ssh] Ops SSH -> kind=ssh deck=ops shell=ssh target=ops@ops.example:22");
});

test("buildConnectionProfileLaunchFromSession captures reusable launch settings from a session", () => {
  const session = {
    id: "s1",
    kind: "ssh",
    deckId: "ops",
    shell: "ssh",
    cwd: "/ignored",
    startCwd: "~",
    startCommand: "tmux a || tmux",
    env: { LANG: "en_US.UTF-8" },
    tags: ["ops", "prod"],
    themeProfile: createThemeProfile("#111111"),
    activeThemeProfile: createThemeProfile("#121212"),
    inactiveThemeProfile: createThemeProfile("#131313"),
    remoteConnection: { host: "ops.example", port: 22, username: "ops" },
    remoteAuth: { method: "privateKey", privateKeyPath: "/home/ops/.ssh/id_ed25519" }
  };

  assert.deepEqual(buildConnectionProfileLaunchFromSession(session), {
    kind: "ssh",
    deckId: "ops",
    shell: "ssh",
    startCwd: "~",
    startCommand: "tmux a || tmux",
    env: { LANG: "en_US.UTF-8" },
    tags: ["ops", "prod"],
    themeProfile: createThemeProfile("#111111"),
    activeThemeProfile: createThemeProfile("#121212"),
    inactiveThemeProfile: createThemeProfile("#131313"),
    remoteConnection: { host: "ops.example", port: 22, username: "ops" },
    remoteAuth: { method: "privateKey", privateKeyPath: "/home/ops/.ssh/id_ed25519" }
  });
});

test("connection profile runtime controller manages backend-backed lifecycle and launches sessions from profiles", async () => {
  const sessions = [
    {
      id: "s-local",
      deckId: "default",
      kind: "local",
      shell: "bash",
      cwd: "/workspace",
      startCwd: "/workspace",
      startCommand: "npm run dev",
      env: { NODE_ENV: "development" },
      tags: ["local", "dev"],
      themeProfile: createThemeProfile("#010101"),
      activeThemeProfile: createThemeProfile("#020202"),
      inactiveThemeProfile: createThemeProfile("#030303")
    }
  ];
  const calls = [];
  const selectEl = createElement("select");
  const statusEl = createElement("p");
  let activeSessionId = "s-local";
  const controller = createConnectionProfileRuntimeController({
    windowRef: {
      prompt(message) {
        calls.push(["prompt", message]);
        return "secret-1";
      },
      confirm() {
        calls.push(["confirm"]);
        return true;
      }
    },
    documentRef: createDocumentRef(),
    selectEl,
    statusEl,
    api: {
      async listConnectionProfiles() {
        calls.push(["list"]);
        return [
          {
            id: "ops-ssh",
            name: "Ops SSH",
            createdAt: 1,
            updatedAt: 1,
            launch: {
              kind: "ssh",
              deckId: "ops",
              shell: "ssh",
              startCwd: "~",
              startCommand: "",
              env: {},
              tags: ["ssh"],
              activeThemeProfile: createThemeProfile("#111111"),
              inactiveThemeProfile: createThemeProfile("#121212"),
              remoteConnection: { host: "ops.example", port: 22, username: "ops" },
              remoteAuth: { method: "password" }
            }
          }
        ];
      },
      async createConnectionProfile(payload) {
        calls.push(["create", payload]);
        return {
          id: "local-dev",
          name: payload.name,
          createdAt: 2,
          updatedAt: 2,
          launch: payload.launch
        };
      },
      async createSession(payload) {
        calls.push(["create-session", payload]);
        return {
          id: "s-created",
          deckId: "ops",
          name: "Ops SSH",
          kind: "ssh"
        };
      },
      async updateConnectionProfile(profileId, payload) {
        calls.push(["update", profileId, payload]);
        return {
          id: profileId,
          name: payload.name,
          createdAt: 1,
          updatedAt: 3,
          launch: {
            kind: "ssh",
            deckId: "ops",
            shell: "ssh",
            startCwd: "~",
            startCommand: "",
            env: {},
            tags: ["ssh"],
            activeThemeProfile: createThemeProfile("#111111"),
            inactiveThemeProfile: createThemeProfile("#121212"),
            remoteConnection: { host: "ops.example", port: 22, username: "ops" },
            remoteAuth: { method: "password" }
          }
        };
      },
      async deleteConnectionProfile(profileId) {
        calls.push(["delete", profileId]);
      }
    },
    getSessions: () => sessions,
    getSessionById: (sessionId) => sessions.find((session) => session.id === sessionId) || null,
    getActiveSessionId: () => activeSessionId,
    setActiveSession: (sessionId) => {
      calls.push(["set-active-session", sessionId]);
      activeSessionId = sessionId;
    },
    setActiveDeck: (deckId) => {
      calls.push(["set-active-deck", deckId]);
      return true;
    },
    applyRuntimeEvent: (event) => {
      calls.push(["runtime-event", event.type, event.session?.id || ""]);
      return true;
    },
    setCommandFeedback: (message) => calls.push(["feedback", message]),
    requestRender: () => calls.push(["render"]),
    formatSessionToken: (sessionId) => sessionId === "s-local" ? "1" : "8",
    formatSessionDisplayName: (session) => session?.name || session?.id || "",
    normalizeThemeProfile: (profile) => profile
  });

  await controller.loadProfiles();
  assert.equal(selectEl.children.length, 1);
  assert.equal(statusEl.textContent, "1 profile(s)");

  const saveFeedback = await controller.createProfileFromSession("s-local", "Local Dev");
  assert.equal(saveFeedback, "Saved connection profile [local-dev] Local Dev from [1] s-local.");
  assert.deepEqual(calls.find((entry) => entry[0] === "create")?.[1], {
    name: "Local Dev",
    launch: {
      kind: "local",
      deckId: "default",
      shell: "bash",
      startCwd: "/workspace",
      startCommand: "npm run dev",
      env: { NODE_ENV: "development" },
      tags: ["local", "dev"],
      themeProfile: createThemeProfile("#010101"),
      activeThemeProfile: createThemeProfile("#020202"),
      inactiveThemeProfile: createThemeProfile("#030303")
    }
  });

  const applyFeedback = await controller.applyProfileById("ops-ssh");
  assert.equal(applyFeedback, "Started session [8] Ops SSH from connection profile [ops-ssh] Ops SSH.");
  assert.deepEqual(calls.find((entry) => entry[0] === "create-session")?.[1], {
    connectionProfileId: "ops-ssh",
    remoteSecret: "secret-1"
  });
  assert.ok(calls.some((entry) => entry[0] === "set-active-deck" && entry[1] === "ops"));
  assert.ok(calls.some((entry) => entry[0] === "set-active-session" && entry[1] === "s-created"));
  assert.ok(calls.some((entry) => entry[0] === "runtime-event" && entry[1] === "session.created" && entry[2] === "s-created"));

  const renameFeedback = await controller.renameProfileById("ops-ssh", "Ops SSH Prod");
  assert.equal(renameFeedback, "Renamed connection profile [ops-ssh] to Ops SSH Prod.");

  const deleteFeedback = await controller.deleteProfileById("ops-ssh");
  assert.equal(deleteFeedback, "Deleted connection profile [ops-ssh] Ops SSH Prod.");
});
