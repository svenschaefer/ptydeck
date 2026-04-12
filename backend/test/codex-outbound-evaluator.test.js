import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceCodexSeparatorSectionState,
  advanceCodexSeparatorInfoState,
  CODEX_SEPARATOR_INFO_MAX_GAP_MS,
  CODEX_SEPARATOR_SECTION_SCOPE,
  CODEX_SEPARATOR_SUMMARY_SCOPE,
  createCodexAllowlistState,
  createCodexStreamEntry,
  evaluateCodexSeparatorSummaryCandidate
} from "../src/codex-outbound-evaluator.js";

function feed(state, text, occurredAt, promptBoundaries = []) {
  return advanceCodexSeparatorInfoState(
    state,
    createCodexStreamEntry(state, text, promptBoundaries, occurredAt)
  );
}

function feedSection(state, text, occurredAt, promptBoundaries = []) {
  return advanceCodexSeparatorSectionState(
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

test("codex outbound evaluator accepts a separator with only tiny redraw-tail contamination", () => {
  const state = createCodexAllowlistState();

  assert.deepEqual(
    feed(state, "───────────────────────────────────────────────────────────ooor\n", 5_000),
    []
  );
  const candidate = feed(
    state,
    "• Die .local-Runtime ist weiter sauber (runtime-contract, healthz, manage alle grün).\n",
    5_300
  );

  assert.equal(candidate.length, 0);
  const flushed = advanceCodexSeparatorInfoState(state, null, { flush: true });
  assert.equal(flushed.length, 1);
  assert.equal(flushed[0].type, "candidate");
  assert.equal(flushed[0].reason, "flush_after_info");
  assert.match(flushed[0].text, /Die \.local-Runtime ist weiter sauber/);
});

test("codex outbound evaluator allows the wider bounded separator-to-info gap for ai-playbooks-style timing", () => {
  const state = createCodexAllowlistState();

  feed(state, "───────────────────────────────────────────────────────────ooor\n", 6_000);
  assert.ok(CODEX_SEPARATOR_INFO_MAX_GAP_MS >= 3_923);
  const decisions = feed(
    state,
    "• Die .local-Runtime ist weiter sauber (runtime-contract, healthz, manage alle grün). Es fehlen jetzt noch der Diff-Whitespace-Check und der volle ci:check; danach committe und pushe ich.\n",
    9_923
  );

  assert.deepEqual(decisions, []);
  const flushed = advanceCodexSeparatorInfoState(state, null, { flush: true });
  assert.equal(flushed.length, 1);
  assert.equal(flushed[0].type, "candidate");
  assert.equal(flushed[0].reason, "flush_after_info");
  assert.match(flushed[0].text, /danach committe und pushe ich/);
});

test("codex section evaluator assembles a structured restart section from mixed entries", () => {
  const state = createCodexAllowlistState();

  assert.deepEqual(
    feedSection(state, "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n", 7_000),
    []
  );
  assert.deepEqual(
    feedSection(state, "• Der Restart ist sauber.›Find and fix a bug in @filename gpt-5.4 xhigh · 43% left · ~/workspace/code/ptydeck\n", 7_100),
    []
  );
  assert.deepEqual(feedSection(state, "  Live-Zustand\n", 7_200), []);
  assert.deepEqual(feedSection(state, "  - Backend: ok\n", 7_300), []);
  assert.deepEqual(feedSection(state, "  - Ready: ready\n", 7_400), []);
  assert.deepEqual(feedSection(state, "  Wichtig\n", 7_500), []);
  assert.deepEqual(feedSection(state, "  - Die Delivery-Counter sind nach dem Restart wieder bei 0.\n", 7_600), []);

  const finalized = feedSection(state, "• Ran git status --short\n", 7_700);

  assert.equal(finalized.length, 1);
  assert.equal(finalized[0].type, "candidate");
  assert.equal(finalized[0].family, CODEX_SEPARATOR_SECTION_SCOPE);
  assert.equal(finalized[0].reason, "section_closed_by_anti_bullet");
  assert.equal(finalized[0].windowState, "stable_section");
  assert.match(finalized[0].text, /^Der Restart ist sauber\./);
  assert.match(finalized[0].text, /\n\nLive-Zustand\n- Backend: ok\n- Ready: ready/);
  assert.match(finalized[0].text, /\n\nWichtig\n- Die Delivery-Counter sind nach dem Restart wieder bei 0\./);
});

test("codex section evaluator keeps single-bullet simple cases on the info-only path", () => {
  const state = createCodexAllowlistState();

  feedSection(state, "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n", 8_000);
  feedSection(state, "• Der Commit ist gepusht. Ich prüfe noch einmal kurz den finalen Repo-Zustand.\n", 8_100);
  feedSection(state, "  Damit der Analyse-Slice sauber abgeschlossen ist.\n", 8_200);
  const finalized = advanceCodexSeparatorSectionState(state, null, { flush: true });

  assert.equal(finalized.length, 1);
  assert.equal(finalized[0].type, "rejection");
  assert.equal(finalized[0].reason, "section_too_shallow");
});

test("codex summary evaluator accepts separator-hint sentence summaries with stable block identity", () => {
  const evaluated = evaluateCodexSeparatorSummaryCandidate(
    "Der Restart ist sauber und die Allowlist bleibt eng genug für den nächsten Live-Check.",
    {
      aggregationReason: "separator_hint",
      blockKey: "der restart ist sauber und die allowlist bleibt eng genug für den nächsten live-check."
    }
  );

  assert.equal(evaluated.ok, true);
  assert.equal(evaluated.family, CODEX_SEPARATOR_SUMMARY_SCOPE);
  assert.equal(evaluated.deliveryBlockKey, "der restart ist sauber und die allowlist bleibt eng genug für den nächsten live-check.");
  assert.match(evaluated.key, /^der restart ist sauber und die allowlist bleibt eng genug für den nächsten live-check\.:/);
});

test("codex summary evaluator rejects short or fragmented separator-hint summaries", () => {
  const short = evaluateCodexSeparatorSummaryCandidate("committed.", {
    aggregationReason: "separator_hint",
    firstObservedAt: 10_000,
    lastObservedAt: 10_200
  });
  const fragmented = evaluateCodexSeparatorSummaryCandidate(
    "Validated target apps: | committed.",
    {
      aggregationReason: "separator_hint",
      firstObservedAt: 10_300,
      lastObservedAt: 10_500
    }
  );

  assert.equal(short.ok, false);
  assert.equal(short.reason, "summary_length_out_of_range");
  assert.equal(fragmented.ok, false);
  assert.equal(fragmented.reason, "multi_fragment_summary");
});

test("codex summary evaluator rejects unsupported aggregation reasons and contaminated sentence candidates", () => {
  const unsupported = evaluateCodexSeparatorSummaryCandidate(
    "Der Restart ist sauber und die Allowlist bleibt eng genug für den nächsten Live-Check.",
    {
      aggregationReason: "lifecycle_exit"
    }
  );
  const trailingColon = evaluateCodexSeparatorSummaryCandidate(
    "Validated target apps for the next codex section:",
    {
      aggregationReason: "separator_hint"
    }
  );
  const contaminated = evaluateCodexSeparatorSummaryCandidate(
    "Updated Plan gpt-5.4 xhigh background terminal running while the next check is still open.",
    {
      aggregationReason: "separator_hint"
    }
  );
  const missingBoundary = evaluateCodexSeparatorSummaryCandidate(
    "This summary stays narrow enough for one check",
    {
      aggregationReason: "separator_hint"
    }
  );

  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.reason, "unsupported_aggregation_reason");
  assert.equal(trailingColon.ok, false);
  assert.equal(trailingColon.reason, "summary_trailing_colon");
  assert.equal(contaminated.ok, false);
  assert.equal(contaminated.reason, "summary_inline_contamination");
  assert.equal(missingBoundary.ok, false);
  assert.equal(missingBoundary.reason, "summary_missing_sentence_boundary");
});

test("codex outbound evaluator rejects contaminated continuation entries after a valid info bullet", () => {
  const state = createCodexAllowlistState();

  feed(state, "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n", 11_000);
  assert.deepEqual(
    feed(state, "• Der Commit ist gepusht. Ich prüfe noch einmal kurz den finalen Repo-Zustand.\n", 11_100),
    []
  );
  const decisions = feed(
    state,
    "  Damit der Analyse-Slice sauber abgeschlossen ist.\n  └ noisy tail that should not merge\n",
    11_200
  );

  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].type, "rejection");
  assert.equal(decisions[0].reason, "continuation_inline_contamination");
});

test("codex section evaluator finalizes a structured section before the next separator without poisoning the prior block", () => {
  const state = createCodexAllowlistState();

  feedSection(state, "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n", 12_000);
  feedSection(state, "• Der Restart ist sauber.\n", 12_100);
  feedSection(state, "  Live-Zustand\n", 12_200);
  feedSection(state, "  - Backend: ok\n", 12_300);
  const finalized = feedSection(
    state,
    "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n",
    12_400
  );

  assert.equal(finalized.length, 1);
  assert.equal(finalized[0].type, "candidate");
  assert.equal(finalized[0].family, CODEX_SEPARATOR_SECTION_SCOPE);
  assert.equal(finalized[0].reason, "section_closed_by_separator");
  assert.match(finalized[0].text, /^Der Restart ist sauber\./);
  assert.match(finalized[0].text, /\n\nLive-Zustand\n- Backend: ok/);
});
