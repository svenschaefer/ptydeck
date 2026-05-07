import { ApiError } from "./errors.js";
import { buildReplayExcerpt, parseReplaySliceSelector } from "./replay-excerpt.js";
import {
  buildReplayRetentionResult,
  buildReplayRetentionState,
  normalizeReplayShellBlocks
} from "./session-manager-lifecycle.js";

const DEFAULT_SESSION_REPLAY_MEMORY_MAX_CHARS = 16 * 1024;

function getTextLength(value) {
  return typeof value === "string" ? value.length : 0;
}

function normalizePromptBoundaries(promptBoundaries, chunkLength) {
  const maxLength = Number.isInteger(chunkLength) && chunkLength >= 0 ? chunkLength : 0;
  return (Array.isArray(promptBoundaries) ? promptBoundaries : [])
    .map((entry) => (Number.isInteger(entry) && entry >= 0 && entry <= maxLength ? entry : null))
    .filter((entry) => entry !== null)
    .sort((left, right) => left - right);
}

function normalizeReplayMemoryMaxChars(maxChars) {
  return Number.isInteger(maxChars) && maxChars >= 0
    ? maxChars
    : DEFAULT_SESSION_REPLAY_MEMORY_MAX_CHARS;
}

export function createSessionManagerReplayRuntime({
  sessionReplayMemoryMaxChars = DEFAULT_SESSION_REPLAY_MEMORY_MAX_CHARS
} = {}) {
  const replayMemoryMaxChars = normalizeReplayMemoryMaxChars(sessionReplayMemoryMaxChars);

  const runtime = {
    buildReplayRetentionResult(value, maxChars = replayMemoryMaxChars) {
      return buildReplayRetentionResult(value, maxChars);
    },

    buildReplayRetentionState(
      value,
      shellBlocks = [],
      currentShellBlockStart = null,
      maxChars = replayMemoryMaxChars
    ) {
      return buildReplayRetentionState(value, shellBlocks, currentShellBlockStart, maxChars);
    },

    appendReplayOutput(session, cleaned, promptBoundaries = []) {
      if (!session) {
        return;
      }
      const chunk = typeof cleaned === "string" ? cleaned : "";
      const normalizedPromptBoundaries = normalizePromptBoundaries(promptBoundaries, chunk.length);
      const combinedOutput = `${session.outputBuffer || ""}${chunk}`;
      const absolutePromptBoundaries = normalizedPromptBoundaries.map(
        (entry) => getTextLength(session.outputBuffer) + entry
      );
      const nextShellBlocks = normalizeReplayShellBlocks(
        session.replayShellBlocks,
        getTextLength(session.outputBuffer)
      );
      let currentShellBlockStart = Number.isInteger(session.currentShellBlockStart)
        ? session.currentShellBlockStart
        : null;
      for (const boundary of absolutePromptBoundaries) {
        if (Number.isInteger(currentShellBlockStart) && boundary > currentShellBlockStart) {
          nextShellBlocks.push({ start: currentShellBlockStart, end: boundary });
        }
        currentShellBlockStart = boundary;
      }
      const replayState = runtime.buildReplayRetentionState(
        combinedOutput,
        nextShellBlocks,
        currentShellBlockStart,
        replayMemoryMaxChars
      );
      session.outputBuffer = replayState.value;
      session.outputTruncated = session.outputTruncated === true || replayState.truncated === true;
      session.replayShellBlocks = replayState.shellBlocks;
      session.currentShellBlockStart = replayState.currentShellBlockStart;
    },

    trimReplayOutput(value, maxChars = replayMemoryMaxChars) {
      return runtime.buildReplayRetentionResult(value, maxChars).value;
    },

    getSnapshot(sessionRecords, { outputMaxChars, includeTruncationMetadata = false, includeEmptyOutputs = false } = {}) {
      const effectiveOutputMaxChars =
        Number.isInteger(outputMaxChars) && outputMaxChars >= 0
          ? Math.min(outputMaxChars, replayMemoryMaxChars)
          : replayMemoryMaxChars;
      const sessions = [];
      const outputs = [];
      for (const session of sessionRecords || []) {
        sessions.push(session.meta);
        const retainedReplayOutput = runtime.buildReplayRetentionResult(
          session.outputBuffer,
          effectiveOutputMaxChars
        );
        const replayOutputTruncated = session.outputTruncated === true || retainedReplayOutput.truncated === true;
        if (retainedReplayOutput.value || (includeEmptyOutputs && replayOutputTruncated)) {
          outputs.push({
            sessionId: session.id,
            data: retainedReplayOutput.value,
            ...(includeTruncationMetadata ? { truncated: replayOutputTruncated } : {})
          });
        }
      }
      return { sessions, outputs };
    },

    getReplayExport(session) {
      return {
        sessionId: session.id,
        data: session.outputBuffer,
        retainedChars: session.outputBuffer.length,
        retentionLimitChars: replayMemoryMaxChars,
        truncated: session.outputTruncated === true
      };
    },

    getReplayExcerpt(sessionId, session, selectorText) {
      const selector = parseReplaySliceSelector(selectorText);
      if (!selector) {
        throw new ApiError(400, "ValidationError", "Field 'slice' must match 'l:N', 'c:N', or 'sp:N'.");
      }
      const excerpt = buildReplayExcerpt({
        selector: selector.selector,
        text: session.outputBuffer,
        shellBlocks: session.replayShellBlocks,
        shellBlocksSupported: session.replayShellBlockTrackingSupported === true
      });
      if (!excerpt) {
        throw new ApiError(500, "ReplayExcerptUnavailable", "Replay excerpt could not be generated.");
      }
      if (excerpt.unavailableReason === "shell_blocks_unavailable") {
        throw new ApiError(
          409,
          "ReplayExcerptUnsupported",
          `Selector '${selector.selector}' is unavailable for session '${sessionId}'. Use 'l:N' or 'c:N'.`
        );
      }
      return {
        ...excerpt,
        sourceRetainedChars: session.outputBuffer.length,
        sourceRetentionLimitChars: replayMemoryMaxChars,
        sourceTruncated: session.outputTruncated === true
      };
    }
  };

  return runtime;
}
