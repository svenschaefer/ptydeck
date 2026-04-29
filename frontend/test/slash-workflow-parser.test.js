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

test("parseSlashWorkflow freezes parsed workflow state and accepts hours, milliseconds, and escaped regex flags", () => {
  const result = parseSlashWorkflow("/wait delay 1h30m5s250ms\n/wait until visible-line /a\\/b/i timeout 500ms\n/STATUS now");
  assert.equal(result.steps[0].duration.ms, 5405250);
  assert.deepEqual(result.steps[1].pattern, {
    literal: "/a\\/b/i",
    source: "a\\/b",
    flags: "i"
  });
  assert.equal(result.steps[2].command, "status");
  assert.deepEqual(result.steps[2].args, ["now"]);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.steps), true);
  assert.equal(Object.isFrozen(result.steps[0].duration), true);
  assert.equal(Object.isFrozen(result.steps[1].pattern), true);
});

test("parseSlashWorkflow rejects invalid duration variants explicitly", () => {
  for (const input of ["/wait delay 0s", "/wait delay 10", "/wait until line /^done$/ timeout 0s"]) {
    assert.throws(
      () => parseSlashWorkflow(input),
      (error) => {
        assert.ok(error instanceof SlashWorkflowParseError);
        assert.equal(error.code, "workflow.invalid_duration");
        assert.equal(error.line, 1);
        return true;
      }
    );
  }
});

test("parseSlashWorkflow rejects invalid wait forms, empty steps, and empty workflows explicitly", () => {
  assert.throws(
    () => parseSlashWorkflow("/wait"),
    (error) => {
      assert.ok(error instanceof SlashWorkflowParseError);
      assert.equal(error.code, "workflow.invalid_wait");
      return true;
    }
  );

  assert.throws(
    () => parseSlashWorkflow("/"),
    (error) => {
      assert.ok(error instanceof SlashWorkflowParseError);
      assert.equal(error.code, "workflow.empty_step");
      return true;
    }
  );

  assert.throws(
    () => parseSlashWorkflow("\n  \n"),
    (error) => {
      assert.ok(error instanceof SlashWorkflowParseError);
      assert.equal(error.code, "workflow.empty");
      return true;
    }
  );
});

test("parseSlashWorkflow rejects invalid regex forms, unknown sources, and malformed timeout tails", () => {
  const expectations = [
    ["/wait until line plain timeout 1s", "workflow.invalid_regex"],
    ["/wait until line /^ok$/oops timeout 1s", "workflow.invalid_regex"],
    ["/wait until unknown /^ok$/ timeout 1s", "workflow.unknown_source"],
    ["/wait until line /^ok$/ later timeout 1s", "workflow.invalid_wait"]
  ];

  for (const [input, code] of expectations) {
    assert.throws(
      () => parseSlashWorkflow(input),
      (error) => {
        assert.ok(error instanceof SlashWorkflowParseError);
        assert.equal(error.code, code);
        assert.equal(error.line, 1);
        return true;
      }
    );
  }
});
