import test from "node:test";
import assert from "node:assert/strict";
import {
  SLASH_WORKFLOW_AST_VERSION,
  SLASH_WORKFLOW_WAIT_SOURCES,
  SlashWorkflowParseError,
  parseSlashWorkflow
} from "../src/public/slash-workflow-parser.js";

test("parseSlashWorkflow builds a deterministic AST for wait and action steps", () => {
  const result = parseSlashWorkflow("/wait delay 10s\n/wait until line /^-{10,}$/ timeout 60s\n/docu");
  assert.equal(result.kind, "workflow");
  assert.equal(result.version, SLASH_WORKFLOW_AST_VERSION);
  assert.deepEqual(result.steps, [
    {
      type: "wait",
      mode: "delay",
      line: 1,
      raw: "/wait delay 10s",
      duration: { text: "10s", ms: 10000 }
    },
    {
      type: "wait",
      mode: "until",
      line: 2,
      raw: "/wait until line /^-{10,}$/ timeout 60s",
      source: "line",
      pattern: { literal: "/^-{10,}$/", source: "^-{10,}$", flags: "" },
      timeout: { text: "60s", ms: 60000 }
    },
    {
      type: "action",
      line: 3,
      raw: "/docu",
      command: "docu",
      args: [],
      payload: null
    }
  ]);
});

test("parseSlashWorkflow preserves opaque block payloads on action steps", () => {
  const result = parseSlashWorkflow("/status\n---\nfirst line\n/wait delay 10s\n---");
  assert.deepEqual(result.steps, [
    {
      type: "action",
      line: 1,
      raw: "/status",
      command: "status",
      args: [],
      payload: "first line\n/wait delay 10s"
    }
  ]);
});

test("parseSlashWorkflow accepts supported workflow sources explicitly", () => {
  assert.deepEqual(SLASH_WORKFLOW_WAIT_SOURCES, ["line", "visible-line", "status", "summary", "exit-code", "session-state"]);
});

test("parseSlashWorkflow reports invalid regex explicitly", () => {
  assert.throws(
    () => parseSlashWorkflow("/wait until line /[abc/ timeout 10s"),
    (error) => {
      assert.ok(error instanceof SlashWorkflowParseError);
      assert.equal(error.code, "workflow.invalid_regex");
      assert.equal(error.line, 1);
      return true;
    }
  );
});

test("parseSlashWorkflow reports missing timeout explicitly", () => {
  assert.throws(
    () => parseSlashWorkflow("/wait until line /^done$/"),
    (error) => {
      assert.ok(error instanceof SlashWorkflowParseError);
      assert.equal(error.code, "workflow.missing_timeout");
      assert.equal(error.line, 1);
      return true;
    }
  );
});

test("parseSlashWorkflow reports unknown workflow directives explicitly", () => {
  assert.throws(
    () => parseSlashWorkflow("/if line /^done$/"),
    (error) => {
      assert.ok(error instanceof SlashWorkflowParseError);
      assert.equal(error.code, "workflow.unknown_directive");
      assert.equal(error.directive, "if");
      return true;
    }
  );
});

test("parseSlashWorkflow reports malformed block boundaries explicitly", () => {
  assert.throws(
    () => parseSlashWorkflow("---\n/status"),
    (error) => {
      assert.ok(error instanceof SlashWorkflowParseError);
      assert.equal(error.code, "workflow.malformed_block");
      assert.equal(error.line, 1);
      return true;
    }
  );
});

test("parseSlashWorkflow reports unclosed block payloads explicitly", () => {
  assert.throws(
    () => parseSlashWorkflow("/status\n---\npayload"),
    (error) => {
      assert.ok(error instanceof SlashWorkflowParseError);
      assert.equal(error.code, "workflow.malformed_block");
      assert.equal(error.line, 2);
      return true;
    }
  );
});

test("parseSlashWorkflow rejects non-slash workflow lines", () => {
  assert.throws(
    () => parseSlashWorkflow("/wait delay 1s\nplain text"),
    (error) => {
      assert.ok(error instanceof SlashWorkflowParseError);
      assert.equal(error.code, "workflow.invalid_step");
      assert.equal(error.line, 2);
      return true;
    }
  );
});

test("parseSlashWorkflow supports composite duration tokens", () => {
  const result = parseSlashWorkflow("/wait idle 1m30s");
  assert.deepEqual(result.steps[0].duration, { text: "1m30s", ms: 90000 });
});
