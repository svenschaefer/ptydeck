function normalizeText(value) {
  return String(value || "").trim();
}

function stripAnsi(text) {
  return String(text || "").replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

function normalizeLine(line) {
  return stripAnsi(line).trim();
}

function normalizeArtifactKind(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "result") {
    return "result";
  }
  if (normalized === "next step" || normalized === "next steps") {
    return "next-steps";
  }
  return "summary";
}

function formatArtifactTitle(kind) {
  if (kind === "result") {
    return "Result";
  }
  if (kind === "next-steps") {
    return "Next Steps";
  }
  return "Summary";
}

function createArtifactAction(kind, text) {
  const normalizedText = normalizeText(text);
  if (!normalizedText) {
    return null;
  }
  return {
    type: "upsertSessionArtifact",
    artifact: {
      id: `artifact:${kind}`,
      kind,
      title: formatArtifactTitle(kind),
      text: normalizedText
    }
  };
}

function parseInlineArtifact(line) {
  const normalized = normalizeLine(line);
  const match = normalized.match(/^(summary|result|next steps?)\s*:\s*(.+)$/i);
  if (!match) {
    return null;
  }
  const kind = normalizeArtifactKind(match[1]);
  return createArtifactAction(kind, match[2]);
}

function parseBlockHeader(line) {
  const normalized = normalizeLine(line);
  const match =
    normalized.match(/^#{1,3}\s*(summary|result|next steps?)\s*:?\s*$/i) ||
    normalized.match(/^[-=]{3,}\s*(summary|result|next steps?)\s*[-=]{3,}$/i) ||
    normalized.match(/^(summary|result|next steps?)\s*$/i);
  if (!match) {
    return "";
  }
  return normalizeArtifactKind(match[1]);
}

export function createArtifactStreamPlugins() {
  const blockCaptureBySession = new Map();

  function finalizeBlock(sessionId) {
    const capture = blockCaptureBySession.get(sessionId);
    if (!capture || capture.lines.length === 0) {
      blockCaptureBySession.delete(sessionId);
      return null;
    }
    blockCaptureBySession.delete(sessionId);
    return createArtifactAction(capture.kind, capture.lines.join("\n"));
  }

  return [
    {
      id: "summary-artifacts",
      priority: 30,
      onSessionDispose(session) {
        blockCaptureBySession.delete(session.id);
      },
      onLine(session, line) {
        const sessionId = normalizeText(session?.id);
        if (!sessionId) {
          return null;
        }
        const normalized = normalizeLine(line);
        const activeBlock = blockCaptureBySession.get(sessionId);
        if (activeBlock) {
          if (!normalized) {
            const artifactAction = finalizeBlock(sessionId);
            return artifactAction ? [artifactAction] : null;
          }
          activeBlock.lines.push(normalized);
          if (activeBlock.lines.length >= 8) {
            const artifactAction = finalizeBlock(sessionId);
            return artifactAction ? [artifactAction] : null;
          }
          return null;
        }

        const inlineArtifact = parseInlineArtifact(normalized);
        if (inlineArtifact) {
          return [inlineArtifact];
        }

        const blockKind = parseBlockHeader(normalized);
        if (blockKind) {
          blockCaptureBySession.set(sessionId, { kind: blockKind, lines: [] });
        }
        return null;
      },
      onIdle(session) {
        const sessionId = normalizeText(session?.id);
        if (!sessionId || !blockCaptureBySession.has(sessionId)) {
          return null;
        }
        const artifactAction = finalizeBlock(sessionId);
        return artifactAction ? [artifactAction] : null;
      }
    }
  ];
}
