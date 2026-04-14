import test from "node:test";
import assert from "node:assert/strict";
import { createAppSemanticAdapterRegistry } from "../src/app-semantic-adapters.js";

function normalizeLineBreaks(value) {
  return String(value || "").replace(/\r\n?/g, "\n").trim();
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function createComparableText(value) {
  return normalizeWhitespace(value).toLowerCase();
}

function createHelpers() {
  return {
    getSessionAppIdentity(session) {
      return {
        family: String(session?.appIdentity?.family || "").toLowerCase(),
        label: String(session?.appIdentity?.label || "").toLowerCase(),
        source: String(session?.appIdentity?.source || "").toLowerCase(),
        confidence: Number.isFinite(session?.appIdentity?.confidence) ? session.appIdentity.confidence : 0
      };
    },
    isCodingAgentContext(session, profile) {
      return session?.appIdentity?.family === "coding-agent" || profile === "coding-agent";
    },
    normalizeNonEmptyString(value) {
      return typeof value === "string" ? value.trim() : "";
    },
    normalizeLineBreaks,
    normalizeWhitespace,
    normalizeReplyPromotionInputText(value) {
      return normalizeWhitespace(normalizeLineBreaks(value));
    },
    trimCodingAgentLowValueTail(value) {
      return normalizeWhitespace(value);
    },
    stripTerminalNoiseFragments(value) {
      return normalizeWhitespace(value);
    },
    stripSemanticInlinePromptTail(value) {
      return normalizeWhitespace(String(value || "").split("›")[0] || "");
    },
    classifyNoiseSignature(value) {
      const comparableText = createComparableText(value);
      return {
        comparableText,
        lowInformation: !comparableText,
        noiseClass: !comparableText ? "empty" : ""
      };
    },
    isSeparatorHint() {
      return false;
    },
    isCommentaryLikeCodexOutboundText() {
      return false;
    },
    isCodexTelegramReplyMetaLine() {
      return false;
    },
    createComparableText,
    escapeRegExp(value) {
      return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    },
    noiseSeparatorOnlyPattern: /^\s*(?:[-_=|·•*]+)\s*$/u,
    codingAgentAntiBulletPattern: /^\s*□\s+/u,
    codingAgentWorkingOverlayPattern: /\bworking\b/iu,
    replyPromptEchoTailPattern: /\bworking\b/iu,
    codexTelegramReplyScope: "codex_input_reply",
    codexTelegramReplyMinTextLength: 24,
    codexTelegramReplyMinWords: 5,
    codexTelegramReplyMaxTextLength: 1200
  };
}

test("app semantic adapter registry resolves the codex adapter by app identity and builds a reply decision", () => {
  const registry = createAppSemanticAdapterRegistry(createHelpers());
  const session = {
    id: "session-1",
    name: "ptydeck",
    startCommand: "codex",
    appIdentity: {
      family: "coding-agent",
      label: "codex",
      source: "explicit-hint",
      confidence: 0.99
    }
  };
  const adapter = registry.resolveForSession(session, "coding-agent");
  assert.ok(adapter);
  assert.equal(adapter.adapterId, "codex-semantic-adapter");

  const descriptor = adapter.createDescriptor(session, "coding-agent", "projection-turn");
  assert.equal(descriptor.entityType, "AppSemanticAdapter");
  assert.equal(descriptor.adapterId, "codex-semantic-adapter");
  assert.deepEqual(descriptor.appLabels, ["codex"]);

  const decision = adapter.buildTurnSemanticDecision(
    {
      baseline: {
        snapshot: {
          activeVisibleLines: [],
          activeTailLines: []
        }
      },
      transcriptDelta: {
        entries: [
          {
            type: "pty_data",
            visibleText: "• Ok, verstanden"
          }
        ]
      },
      diff: {
        activeTailLines: {
          lines: [{ before: "", after: "• Ok, verstanden" }]
        },
        activeVisibleLines: {
          lines: []
        }
      },
      inputText: 'Nur ein Test. Bitte nur mit "Ok, verstanden" antworten.',
      turn: {
        turnId: "turn-1",
        correlationId: "corr-1",
        traceId: "trace-1"
      }
    },
    session,
    "coding-agent"
  );

  assert.equal(decision.deliveryScope, "codex_input_reply");
  assert.equal(decision.text, "Ok, verstanden");
  assert.equal(decision.deliveryBlockKey, "turn-1");
  assert.equal(decision.metadata.semanticExtractionSource, "turn-transcript-diff");
  assert.deepEqual(registry.listAdapterIds(), ["codex-semantic-adapter", "generic-coding-agent-semantic-adapter"]);
});

test("app semantic adapter registry resolves a generic coding-agent adapter for claude-style turn replies", () => {
  const registry = createAppSemanticAdapterRegistry(createHelpers());
  const session = {
    id: "session-2",
    name: "claude",
    startCommand: "claude",
    appIdentity: {
      family: "coding-agent",
      label: "claude",
      source: "explicit-hint",
      confidence: 0.99
    }
  };
  const adapter = registry.resolveForSession(session, "coding-agent");
  assert.ok(adapter);
  assert.equal(adapter.adapterId, "generic-coding-agent-semantic-adapter");

  const descriptor = adapter.createDescriptor(session, "coding-agent", "projection-turn");
  assert.equal(descriptor.entityType, "AppSemanticAdapter");
  assert.equal(descriptor.adapterId, "generic-coding-agent-semantic-adapter");
  assert.deepEqual(descriptor.appLabels, ["claude"]);

  const decision = adapter.buildTurnSemanticDecision(
    {
      baseline: {
        snapshot: {
          activeVisibleLines: [],
          activeTailLines: []
        }
      },
      transcriptDelta: {
        entries: [
          {
            type: "pty_data",
            visibleText: "Ok, acknowledged"
          }
        ]
      },
      diff: {
        activeTailLines: {
          lines: [{ before: "", after: "Ok, acknowledged" }]
        },
        activeVisibleLines: {
          lines: []
        }
      },
      inputText: 'Reply only with "Ok, acknowledged".',
      turn: {
        turnId: "turn-2",
        correlationId: "corr-2",
        traceId: "trace-2"
      }
    },
    session,
    "coding-agent"
  );

  assert.equal(decision.deliveryScope, "codex_input_reply");
  assert.equal(decision.text, "Ok, acknowledged");
  assert.equal(decision.deliveryBlockKey, "turn-2");
  assert.equal(decision.metadata.semanticExtractionSource, "generic-turn-transcript-diff");
});

test("app semantic adapter registry normalizes gemini-style section markers through the generic coding-agent adapter", () => {
  const registry = createAppSemanticAdapterRegistry(createHelpers());
  const session = {
    id: "session-3",
    name: "gemini",
    startCommand: "gemini",
    appIdentity: {
      family: "coding-agent",
      label: "gemini",
      source: "explicit-hint",
      confidence: 0.99
    }
  };
  const adapter = registry.resolveForSession(session, "coding-agent");
  assert.ok(adapter);
  assert.equal(adapter.adapterId, "generic-coding-agent-semantic-adapter");

  const decision = adapter.buildOutputEpisodeSemanticDecision(
    {
      baseline: {
        snapshot: {
          activeVisibleLines: [],
          activeTailLines: []
        }
      },
      transcriptDelta: {
        entries: [
          {
            type: "pty_data",
            visibleText: "✦ Summary:\n- First result\n- Second result"
          }
        ]
      },
      diff: {
        activeTailLines: {
          lines: [{ before: "", after: "✦ Summary:\n- First result\n- Second result" }]
        },
        activeVisibleLines: {
          lines: []
        }
      },
      outputEpisode: {
        episodeId: "episode-1"
      }
    },
    session,
    "coding-agent"
  );

  assert.equal(decision.deliveryScope, "codex_separator_section");
  assert.equal(decision.text, "Summary:\n- First result\n- Second result");
  assert.equal(decision.deliveryBlockKey, "episode-1");
  assert.equal(decision.metadata.semanticExtractionSource, "generic-output-episode-transcript-diff");
});

test("app semantic adapter registry leaves non-coding-agent sessions unresolved", () => {
  const registry = createAppSemanticAdapterRegistry(createHelpers());
  const session = {
    id: "session-4",
    name: "pytest",
    startCommand: "pytest",
    appIdentity: {
      family: "build-test",
      label: "pytest",
      source: "explicit-hint",
      confidence: 0.99
    }
  };
  assert.equal(registry.resolveForSession(session, "build-test"), null);
});
