function buildReplayExcerptSummary(payload) {
  const selector = String(payload?.selector || "excerpt").trim() || "excerpt";
  const resolvedCount = Number.isInteger(payload?.resolvedCount) ? payload.resolvedCount : 0;
  const availableCount = Number.isInteger(payload?.availableCount) ? payload.availableCount : resolvedCount;
  const chars = Number.isInteger(payload?.chars) ? payload.chars : String(payload?.data || "").length;
  const lines = Number.isInteger(payload?.lines)
    ? payload.lines
    : String(payload?.data || "")
        .split("\n")
        .filter(Boolean).length;
  const partialSuffix = payload?.selectorSatisfied === true ? "" : ", partial";
  return `${selector} -> ${resolvedCount}/${availableCount} units, ${chars} chars, ${lines} lines${partialSuffix}`;
}

function buildReplayExcerptEmptyFeedback(session, selector, options = {}) {
  const formatSessionToken =
    typeof options.formatSessionToken === "function" ? options.formatSessionToken : (value) => String(value || "");
  const formatSessionDisplayName =
    typeof options.formatSessionDisplayName === "function"
      ? options.formatSessionDisplayName
      : (value) => String(value?.name || "");
  return `No replay excerpt matched ${selector} on [${formatSessionToken(session?.id)}] ${formatSessionDisplayName(session)}.`;
}

export { buildReplayExcerptSummary, buildReplayExcerptEmptyFeedback };

export function createCommandExecutorReportingHandlers(options = {}) {
  const formatUsage =
    typeof options.formatUsage === "function"
      ? options.formatUsage
      : (commandName, subcommandName = "") => `Usage unavailable: ${commandName}${subcommandName ? ` ${subcommandName}` : ""}`;
  const resolveActiveOrDirectTargetSession =
    typeof options.resolveActiveOrDirectTargetSession === "function"
      ? options.resolveActiveOrDirectTargetSession
      : () => ({ error: "Missing target resolver.", session: null });
  const resolveSingleSessionForCommand =
    typeof options.resolveSingleSessionForCommand === "function"
      ? options.resolveSingleSessionForCommand
      : () => ({ error: "Missing target resolver.", session: null });
  const openSessionReplayViewer =
    typeof options.openSessionReplayViewer === "function" ? options.openSessionReplayViewer : async () => null;
  const exportSessionReplayDownload =
    typeof options.exportSessionReplayDownload === "function" ? options.exportSessionReplayDownload : async () => null;
  const exportSessionReplayCopy =
    typeof options.exportSessionReplayCopy === "function" ? options.exportSessionReplayCopy : async () => null;
  const loadSessionReplayExcerpt =
    typeof options.loadSessionReplayExcerpt === "function" ? options.loadSessionReplayExcerpt : async () => null;
  const copySessionReplayExcerpt =
    typeof options.copySessionReplayExcerpt === "function" ? options.copySessionReplayExcerpt : async () => null;
  const previewSessionReplayExcerpt =
    typeof options.previewSessionReplayExcerpt === "function" ? options.previewSessionReplayExcerpt : () => "";
  const submitTerminalPaste =
    typeof options.submitTerminalPaste === "function"
      ? options.submitTerminalPaste
      : async () => ({ ok: false, status: "unavailable", feedback: "Replay paste path is unavailable." });
  const uploadSessionFile =
    typeof options.uploadSessionFile === "function" ? options.uploadSessionFile : async () => null;
  const downloadSessionFile =
    typeof options.downloadSessionFile === "function" ? options.downloadSessionFile : async () => null;
  const formatSessionToken =
    typeof options.formatSessionToken === "function" ? options.formatSessionToken : (value) => String(value || "");
  const formatSessionDisplayName =
    typeof options.formatSessionDisplayName === "function"
      ? options.formatSessionDisplayName
      : (value) => String(value?.name || "");

  async function executeReplayCommand({ args, interpreted, sessions, activeSessionId }) {
    const subcommand = String(args[0] || "").trim().toLowerCase();
    if (subcommand === "view" || subcommand === "export" || (subcommand === "copy" && args.length === 1)) {
      const resolvedTarget = resolveActiveOrDirectTargetSession(
        interpreted,
        sessions,
        activeSessionId,
        "No active session for /replay.",
        "Replay selector"
      );
      if (resolvedTarget.error) {
        return resolvedTarget.error;
      }
      if (subcommand === "view") {
        const outcome = await openSessionReplayViewer(resolvedTarget.session);
        return outcome?.feedback || "";
      }
      const outcome =
        subcommand === "copy"
          ? await exportSessionReplayCopy(resolvedTarget.session)
          : await exportSessionReplayDownload(resolvedTarget.session);
      return outcome?.feedback || "";
    }

    if (subcommand === "preview" || subcommand === "copy" || subcommand === "paste") {
      if (subcommand === "preview" && args.length !== 3) {
        return formatUsage("replay", "preview");
      }
      if (subcommand === "copy" && args.length !== 3) {
        return formatUsage("replay", "copy");
      }
      if (subcommand === "paste" && args.length !== 4) {
        return formatUsage("replay", "paste");
      }

      const sourceResolution = resolveSingleSessionForCommand(
        args[1],
        sessions,
        activeSessionId,
        "Replay source selector must resolve to exactly one session.",
        "Replay source selector"
      );
      if (sourceResolution.error) {
        return sourceResolution.error;
      }
      const sliceSelector = String(args[subcommand === "paste" ? 3 : 2] || "").trim();
      if (!sliceSelector) {
        return formatUsage("replay", subcommand);
      }
      const excerptPayload = await loadSessionReplayExcerpt(sourceResolution.session, sliceSelector);
      if (!excerptPayload || typeof excerptPayload !== "object") {
        return "Failed to load replay excerpt.";
      }
      if (!excerptPayload.data) {
        return buildReplayExcerptEmptyFeedback(sourceResolution.session, sliceSelector, {
          formatSessionToken,
          formatSessionDisplayName
        });
      }
      if (subcommand === "preview") {
        return (
          previewSessionReplayExcerpt(sourceResolution.session, excerptPayload) ||
          `Preview from [${formatSessionToken(sourceResolution.session.id)}] ${formatSessionDisplayName(sourceResolution.session)} (${buildReplayExcerptSummary(excerptPayload)}).\n\n${excerptPayload.data}`
        );
      }
      if (subcommand === "copy") {
        const outcome = await copySessionReplayExcerpt(sourceResolution.session, sliceSelector, {
          payload: excerptPayload
        });
        return (
          outcome?.feedback ||
          `Copied replay excerpt from [${formatSessionToken(sourceResolution.session.id)}] ${formatSessionDisplayName(sourceResolution.session)} (${buildReplayExcerptSummary(excerptPayload)}).`
        );
      }
      const targetResolution = resolveSingleSessionForCommand(
        args[2],
        sessions,
        activeSessionId,
        "Replay target selector must resolve to exactly one session.",
        "Replay target selector"
      );
      if (targetResolution.error) {
        return targetResolution.error;
      }
      const pasteResult = await submitTerminalPaste(targetResolution.session.id, excerptPayload.data, {
        source: "replay-paste",
        activateTargetBeforeSend: true
      });
      if (pasteResult?.status === "sent") {
        return `Pasted replay excerpt ${buildReplayExcerptSummary(excerptPayload)} from [${formatSessionToken(sourceResolution.session.id)}] ${formatSessionDisplayName(sourceResolution.session)} to [${formatSessionToken(targetResolution.session.id)}] ${formatSessionDisplayName(targetResolution.session)}.`;
      }
      return pasteResult?.feedback || "Failed to paste replay excerpt.";
    }

    return formatUsage("replay");
  }

  async function executeTransferCommand({ args, interpreted, sessions, activeSessionId }) {
    const subcommand = String(args[0] || "").trim().toLowerCase();
    if (subcommand !== "upload" && subcommand !== "download") {
      return formatUsage("transfer");
    }
    const resolvedTarget = resolveActiveOrDirectTargetSession(
      interpreted,
      sessions,
      activeSessionId,
      "No active session for /transfer.",
      "Transfer selector"
    );
    if (resolvedTarget.error) {
      return resolvedTarget.error;
    }
    if (subcommand === "upload") {
      const remotePath = args.slice(1).join(" ").trim();
      const outcome = await uploadSessionFile(resolvedTarget.session, { remotePath });
      return outcome?.feedback || "";
    }
    const remotePath = args.slice(1).join(" ").trim();
    if (!remotePath) {
      return formatUsage("transfer", "download");
    }
    const outcome = await downloadSessionFile(resolvedTarget.session, { remotePath });
    return outcome?.feedback || "";
  }

  async function executeStructuredCommand(context = {}) {
    const command = String(context.command || "").trim().toLowerCase();
    if (command === "replay") {
      return executeReplayCommand(context);
    }
    if (command === "transfer") {
      return executeTransferCommand(context);
    }
    return null;
  }

  return Object.freeze({
    executeStructuredCommand,
    executeReplayCommand,
    executeTransferCommand
  });
}
