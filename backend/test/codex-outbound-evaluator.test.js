import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceCodexSeparatorInfoState,
  createCodexAllowlistState,
  createCodexStreamEntry
} from "../src/codex-outbound-evaluator.js";

function feed(state, text, occurredAt, promptBoundaries = []) {
  return advanceCodexSeparatorInfoState(
    state,
    createCodexStreamEntry(state, text, promptBoundaries, occurredAt)
  );
}

test("codex outbound evaluator merges one immediate continuation line into a candidate", () => {
  const state = createCodexAllowlistState();

  assert.deepEqual(
    feed(state, "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n", 1_000),
    []
  );
  assert.deepEqual(
    feed(state, "• Der Commit ist gepusht. Ich prüfe noch einmal kurz den finalen Repo-Zustand.\n", 1_200),
    []
  );
  const decisions = feed(state, "  Damit der Analyse-Slice sauber abgeschlossen ist.\n", 1_350);

  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].type, "candidate");
  assert.equal(decisions[0].reason, "continuation_merged");
  assert.equal(
    decisions[0].text,
    "Der Commit ist gepusht. Ich prüfe noch einmal kurz den finalen Repo-Zustand. Damit der Analyse-Slice sauber abgeschlossen ist."
  );
  assert.equal(
    decisions[0].key,
    "1:2:Der Commit ist gepusht. Ich prüfe noch einmal kurz den finalen Repo-Zustand. Damit der Analyse-Slice sauber abgeschlossen ist."
  );
});

test("codex outbound evaluator rejects anti-pattern first bullets", () => {
  const state = createCodexAllowlistState();

  feed(state, "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n", 2_000);
  const decisions = feed(state, "• Ran git status --short\n", 2_200);

  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].type, "rejection");
  assert.equal(decisions[0].reason, "first_bullet_ran");
  assert.equal(decisions[0].anchorSequence, 1);
  assert.equal(state.codexSeparatorCandidate, null);
});

test("codex outbound evaluator re-anchors when another separator appears before info", () => {
  const state = createCodexAllowlistState();

  feed(state, "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n", 3_000);
  const rejection = feed(state, "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n", 3_200);
  assert.equal(rejection.length, 1);
  assert.equal(rejection[0].type, "rejection");
  assert.equal(rejection[0].reason, "next_separator_before_info");
  assert.equal(rejection[0].anchorSequence, 1);

  assert.deepEqual(feed(state, "• Der erste Ad-hoc-Read war ein reiner Shell-Fehler bei node -e.\n", 3_450), []);
  const candidate = advanceCodexSeparatorInfoState(state, null, { flush: true });

  assert.equal(candidate.length, 1);
  assert.equal(candidate[0].type, "candidate");
  assert.equal(candidate[0].reason, "flush_after_info");
  assert.equal(candidate[0].anchorSequence, 2);
  assert.equal(candidate[0].infoSequence, 3);
  assert.match(candidate[0].text, /Der erste Ad-hoc-Read war ein reiner Shell-Fehler/);
});

test("codex outbound evaluator rejects prompt contamination before info", () => {
  const state = createCodexAllowlistState();

  feed(state, "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n", 4_000);
  const decisions = feed(state, "", 4_200, [0]);

  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].type, "rejection");
  assert.equal(decisions[0].reason, "marker_before_info");
});
