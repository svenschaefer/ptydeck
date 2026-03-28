import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeCustomCommandRecord,
  parseCustomCommandReferenceArgs,
  resolveCustomCommandForSession,
  resolveExactCustomCommand
} from "../src/public/custom-command-model.js";

test("custom command model normalizes default project scope and precedence metadata", () => {
  const command = normalizeCustomCommandRecord({
    name: " Deploy ",
    content: "echo project",
    createdAt: 1,
    updatedAt: 2
  });

  assert.deepEqual(command, {
    name: "deploy",
    content: "echo project",
    kind: "plain",
    scope: "project",
    sessionId: null,
    precedence: 200,
    templateVariables: [],
    createdAt: 1,
    updatedAt: 2,
    lookupKey: "project::deploy"
  });
});

test("custom command model parses scoped custom-command references", () => {
  assert.deepEqual(parseCustomCommandReferenceArgs(["scope:global", "deploy"]), {
    ok: true,
    name: "deploy",
    scope: "global",
    sessionSelector: "",
    rest: []
  });
  assert.deepEqual(parseCustomCommandReferenceArgs(["scope:session:7", "deploy", "env=prod"]), {
    ok: true,
    name: "deploy",
    scope: "session",
    sessionSelector: "7",
    rest: ["env=prod"]
  });
});

test("custom command model resolves effective precedence as session over project over global", () => {
  const commands = [
    { name: "deploy", content: "echo global", scope: "global" },
    { name: "deploy", content: "echo project", scope: "project" },
    { name: "deploy", content: "echo session", scope: "session", sessionId: "s1" }
  ];

  assert.equal(resolveCustomCommandForSession(commands, "deploy", "s1")?.content, "echo session");
  assert.equal(resolveCustomCommandForSession(commands, "deploy", "s2")?.content, "echo project");
  assert.equal(resolveExactCustomCommand(commands, "deploy", "global", "")?.content, "echo global");
  assert.equal(resolveExactCustomCommand(commands, "deploy", "session", "s1")?.content, "echo session");
});
