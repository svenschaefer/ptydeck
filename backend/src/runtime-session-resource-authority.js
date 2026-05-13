import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, posix, relative, resolve } from "node:path";

import { ApiError } from "./errors.js";

function expandHomePath(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    return "";
  }
  if (normalized === "~") {
    return homedir();
  }
  if (normalized.startsWith("~/")) {
    return resolve(homedir(), normalized.slice(2));
  }
  return resolve(normalized);
}

function normalizeSessionTransferPath(value, maxLength = 512) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    throw new ApiError(400, "ValidationError", "Field 'path' must be a non-empty relative file path.");
  }
  if (raw.length > maxLength) {
    throw new ApiError(
      400,
      "ValidationError",
      `Field 'path' exceeds maximum length (${maxLength}).`
    );
  }
  if (raw.startsWith("/") || /^[A-Za-z]:[\\/]/.test(raw)) {
    throw new ApiError(400, "ValidationError", "Field 'path' must be a relative file path inside the session root.");
  }
  const normalized = posix.normalize(raw.replaceAll("\\", "/"));
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new ApiError(400, "ValidationError", "Field 'path' must stay within the session root.");
  }
  if (normalized.endsWith("/")) {
    throw new ApiError(400, "ValidationError", "Field 'path' must reference a file path, not a directory.");
  }
  return normalized.replace(/^(?:\.\/)+/, "");
}

function ensurePathWithinRoot(rootPath, candidatePath, fieldName = "path") {
  const relativePath = relative(rootPath, candidatePath);
  if (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !relativePath.includes(`..${posix.sep}`) && !relativePath.includes(`..\\`))
  ) {
    return;
  }
  throw new ApiError(400, "ValidationError", `Field '${fieldName}' must stay within the session root.`);
}

function decodeBase64FileContent(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, "ValidationError", "Field 'contentBase64' must be a non-empty base64 string.");
  }
  try {
    return Buffer.from(value, "base64");
  } catch {
    throw new ApiError(400, "ValidationError", "Field 'contentBase64' must be valid base64.");
  }
}

function buildSessionReplayExportFilename(sessionId) {
  return `ptydeck-session-${String(sessionId || "").trim() || "unknown"}-replay.txt`;
}

export function createRuntimeSessionResourceAuthority(dependencies = {}) {
  const {
    manager = {
      getReplayExport: () => null,
      getReplayExcerpt: () => null,
      get: () => ({ meta: {} }),
      create: (payload) => payload,
      sessionReplayMemoryMaxChars: 0
    },
    getApiSessionOrThrow = () => null,
    getPersistedReplayOutputs = () => new Map(),
    sessionFileTransferMaxBytes = 256 * 1024,
    sessionFileTransferPathMaxLength = 512,
    sessionKindLocal = "local",
    sessionReplayExportScope = "retained_replay_tail",
    sessionReplayExcerptScope = "visible_replay_excerpt",
    sessionReplayExportFormat = "text",
    sessionReplayExcerptFormat = "text",
    sessionReplayExportContentType = "text/plain; charset=utf-8",
    sessionReplayExcerptContentType = "text/plain; charset=utf-8",
    sessionFileTransferContentType = "application/octet-stream",
    sessionFileTransferEncoding = "base64"
  } = dependencies;

  function buildSessionReplayExportOrThrow(sessionId) {
    const apiSession = getApiSessionOrThrow(sessionId);
    let replayExport = null;
    try {
      replayExport = manager.getReplayExport(sessionId);
    } catch (error) {
      if (!(error instanceof ApiError) || error.statusCode !== 404) {
        throw error;
      }
    }
    const persistedReplayOutput = getPersistedReplayOutputs().get(sessionId) || null;
    const data =
      typeof replayExport?.data === "string"
        ? replayExport.data
        : typeof persistedReplayOutput?.data === "string"
          ? persistedReplayOutput.data
          : "";
    const retainedChars = Number.isInteger(replayExport?.retainedChars)
      ? replayExport.retainedChars
      : Number.isInteger(persistedReplayOutput?.retainedChars)
        ? persistedReplayOutput.retainedChars
        : data.length;
    const retentionLimitChars = Number.isInteger(replayExport?.retentionLimitChars)
      ? replayExport.retentionLimitChars
      : Number.isInteger(persistedReplayOutput?.retentionLimitChars)
        ? persistedReplayOutput.retentionLimitChars
        : manager.sessionReplayMemoryMaxChars;
    return {
      sessionId: apiSession.id,
      sessionState: apiSession.state,
      scope: sessionReplayExportScope,
      format: sessionReplayExportFormat,
      contentType: sessionReplayExportContentType,
      fileName: buildSessionReplayExportFilename(apiSession.id),
      data,
      retainedChars,
      retentionLimitChars,
      truncated: replayExport?.truncated === true || persistedReplayOutput?.truncated === true
    };
  }

  function buildSessionReplayExcerptOrThrow(sessionId, selector) {
    const apiSession = getApiSessionOrThrow(sessionId);
    const excerpt = manager.getReplayExcerpt(sessionId, selector);
    return {
      sessionId: apiSession.id,
      sessionState: apiSession.state,
      scope: sessionReplayExcerptScope,
      format: sessionReplayExcerptFormat,
      contentType: sessionReplayExcerptContentType,
      selector: excerpt.selector,
      selectorKind: excerpt.selectorKind,
      requestedCount: excerpt.requestedCount,
      resolvedCount: excerpt.resolvedCount,
      availableCount: excerpt.availableCount,
      selectorSatisfied: excerpt.selectorSatisfied === true,
      shellBlocksSupported: excerpt.shellBlocksSupported === true,
      data: excerpt.data,
      chars: excerpt.chars,
      lines: excerpt.lines,
      sourceRetainedChars: excerpt.sourceRetainedChars,
      sourceRetentionLimitChars: excerpt.sourceRetentionLimitChars,
      sourceTruncated: excerpt.sourceTruncated === true
    };
  }

  function resolveSessionTransferRootOrThrow(session) {
    const rawRoot =
      typeof session?.meta?.cwd === "string" && session.meta.cwd.trim()
        ? session.meta.cwd
        : typeof session?.meta?.startCwd === "string" && session.meta.startCwd.trim()
          ? session.meta.startCwd
          : "";
    const expandedRoot = expandHomePath(rawRoot);
    if (!expandedRoot) {
      throw new ApiError(409, "FileTransferUnavailable", `Session '${session?.id || ""}' has no local transfer root.`);
    }
    return expandedRoot;
  }

  async function getTransferCapableSessionOrThrow(sessionId) {
    const apiSession = getApiSessionOrThrow(sessionId);
    if (apiSession.kind !== sessionKindLocal) {
      throw new ApiError(
        409,
        "FileTransferUnsupported",
        `Session '${sessionId}' does not support backend file transfer in the H47 baseline.`
      );
    }
    let session = null;
    try {
      session = manager.get(sessionId);
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 404) {
        throw new ApiError(
          409,
          "FileTransferUnavailable",
          `Session '${sessionId}' is not currently available for file transfer.`
        );
      }
      throw error;
    }
    const rootPath = resolveSessionTransferRootOrThrow(session);
    let rootRealPath = "";
    try {
      rootRealPath = await realpath(rootPath);
    } catch {
      throw new ApiError(
        409,
        "FileTransferUnavailable",
        `Session '${sessionId}' transfer root is unavailable on the local filesystem.`
      );
    }
    return { apiSession, session, rootPath: rootRealPath };
  }

  async function resolveSessionTransferTargetOrThrow(sessionId, transferPath, { allowMissing = false } = {}) {
    const { apiSession, session, rootPath } = await getTransferCapableSessionOrThrow(sessionId);
    const normalizedPath = normalizeSessionTransferPath(transferPath, sessionFileTransferPathMaxLength);
    const absolutePath = resolve(rootPath, normalizedPath);
    ensurePathWithinRoot(rootPath, absolutePath);
    if (!allowMissing) {
      let targetRealPath = "";
      try {
        targetRealPath = await realpath(absolutePath);
      } catch (error) {
        if (error && error.code === "ENOENT") {
          throw new ApiError(404, "FileNotFound", `File '${normalizedPath}' was not found for session '${sessionId}'.`);
        }
        throw error;
      }
      ensurePathWithinRoot(rootPath, targetRealPath);
      return { apiSession, session, rootPath, normalizedPath, absolutePath: targetRealPath };
    }
    return { apiSession, session, rootPath, normalizedPath, absolutePath };
  }

  async function buildSessionFileDownloadOrThrow(sessionId, transferPath) {
    const target = await resolveSessionTransferTargetOrThrow(sessionId, transferPath);
    let stats = null;
    try {
      stats = await stat(target.absolutePath);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        throw new ApiError(404, "FileNotFound", `File '${target.normalizedPath}' was not found for session '${sessionId}'.`);
      }
      throw error;
    }
    if (!stats.isFile()) {
      throw new ApiError(400, "ValidationError", "Field 'path' must reference a file inside the session root.");
    }
    if (stats.size > sessionFileTransferMaxBytes) {
      throw new ApiError(
        413,
        "FileTransferTooLarge",
        `File '${target.normalizedPath}' exceeds the transfer limit (${sessionFileTransferMaxBytes} bytes).`
      );
    }
    const content = await readFile(target.absolutePath);
    return {
      sessionId: target.apiSession.id,
      path: target.normalizedPath,
      fileName: basename(target.normalizedPath) || "download.bin",
      contentType: sessionFileTransferContentType,
      encoding: sessionFileTransferEncoding,
      contentBase64: content.toString("base64"),
      sizeBytes: content.length
    };
  }

  async function uploadSessionFileOrThrow(sessionId, transferPath, contentBase64) {
    const target = await resolveSessionTransferTargetOrThrow(sessionId, transferPath, { allowMissing: true });
    const content = decodeBase64FileContent(contentBase64);
    if (content.length > sessionFileTransferMaxBytes) {
      throw new ApiError(
        413,
        "FileTransferTooLarge",
        `Upload '${target.normalizedPath}' exceeds the transfer limit (${sessionFileTransferMaxBytes} bytes).`
      );
    }

    const targetDir = dirname(target.absolutePath);
    await mkdir(targetDir, { recursive: true });
    let targetDirRealPath = "";
    try {
      targetDirRealPath = await realpath(targetDir);
    } catch {
      throw new ApiError(409, "FileTransferUnavailable", `Failed to prepare upload path '${target.normalizedPath}'.`);
    }
    ensurePathWithinRoot(target.rootPath, targetDirRealPath);

    let created = true;
    try {
      const existingStats = await stat(target.absolutePath);
      if (!existingStats.isFile()) {
        throw new ApiError(400, "ValidationError", "Field 'path' must reference a file path inside the session root.");
      }
      const targetRealPath = await realpath(target.absolutePath);
      ensurePathWithinRoot(target.rootPath, targetRealPath);
      created = false;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      if (!error || error.code !== "ENOENT") {
        throw error;
      }
    }

    await writeFile(target.absolutePath, content);
    return {
      sessionId: target.apiSession.id,
      path: target.normalizedPath,
      fileName: basename(target.normalizedPath) || "upload.bin",
      sizeBytes: content.length,
      created
    };
  }

  function tryCreateRestoredSession({
    session,
    kind,
    remoteConnection,
    remoteAuth,
    shell,
    cwd,
    startCwd,
    startCommand,
    replayOutput,
    replayOutputTruncated,
    remoteSecret,
    env,
    note,
    mouseForwardingMode,
    inputSafetyProfile,
    tags,
    quickSendUsage,
    themeProfile,
    activeThemeProfile,
    inactiveThemeProfile,
    initialState
  }) {
    return manager.create({
      id: session.id,
      kind,
      remoteConnection,
      remoteAuth,
      remoteSecret,
      cwd,
      shell,
      name: session.name,
      deckId: session.deckId,
      startCwd,
      startCommand,
      replayOutput,
      replayOutputTruncated,
      env,
      note,
      mouseForwardingMode,
      inputSafetyProfile,
      tags,
      quickSendUsage,
      themeProfile,
      activeThemeProfile,
      inactiveThemeProfile,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      ...(typeof initialState === "string" ? { initialState } : {})
    });
  }

  return {
    buildSessionReplayExportOrThrow,
    buildSessionReplayExcerptOrThrow,
    buildSessionFileDownloadOrThrow,
    uploadSessionFileOrThrow,
    tryCreateRestoredSession
  };
}
