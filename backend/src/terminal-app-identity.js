import { basename } from "node:path";

export const TERMINAL_APP_IDENTITY_FAMILY_VALUES = Object.freeze([
  "shell",
  "coding-agent",
  "build-test",
  "editor",
  "pager",
  "tui",
  "unknown"
]);

export const TERMINAL_APP_IDENTITY_SOURCE_VALUES = Object.freeze([
  "unknown",
  "explicit-hint",
  "foreground-process",
  "shell-marker",
  "terminal-mode",
  "output-heuristic"
]);

const TERMINAL_APP_IDENTITY_FAMILY_SET = new Set(TERMINAL_APP_IDENTITY_FAMILY_VALUES);
const TERMINAL_APP_IDENTITY_SOURCE_SET = new Set(TERMINAL_APP_IDENTITY_SOURCE_VALUES);
const SHELL_LABELS = new Set(["bash", "zsh", "fish", "sh"]);
const BUILD_SUBCOMMAND_PATTERN = "(?:test|build|check|clippy|lint)";

const EXPLICIT_HINT_MATCHERS = Object.freeze([
  { family: "coding-agent", label: "codex", pattern: /\bcodex\b/i },
  { family: "coding-agent", label: "claude", pattern: /\bclaude\b/i },
  { family: "coding-agent", label: "gemini", pattern: /\bgemini\b/i },
  { family: "editor", label: "nvim", pattern: /\bnvim\b/i },
  { family: "editor", label: "vim", pattern: /\bvim\b/i },
  { family: "pager", label: "less", pattern: /\bless\b/i },
  { family: "pager", label: "man", pattern: /\bman\b/i },
  { family: "tui", label: "tmux", pattern: /\btmux\b/i },
  { family: "tui", label: "screen", pattern: /\bscreen\b/i }
]);

const BUILD_HINT_MATCHERS = Object.freeze([
  { label: "pytest", pattern: /\bpytest\b/i, subcommand: "test" },
  { label: "jest", pattern: /\bjest\b/i, subcommand: "test" },
  { label: "vitest", pattern: /\bvitest\b/i, subcommand: "test" },
  { label: "ctest", pattern: /\bctest\b/i, subcommand: "test" },
  { label: "cargo", pattern: new RegExp(`\\bcargo\\s+(${BUILD_SUBCOMMAND_PATTERN})\\b`, "i"), captureSubcommand: true },
  { label: "go", pattern: /\bgo\s+(test|build)\b/i, captureSubcommand: true },
  { label: "dotnet", pattern: /\bdotnet\s+(test|build)\b/i, captureSubcommand: true },
  { label: "npm", pattern: new RegExp(`\\bnpm\\s+(?:run\\s+)?(${BUILD_SUBCOMMAND_PATTERN})\\b`, "i"), captureSubcommand: true },
  { label: "pnpm", pattern: new RegExp(`\\bpnpm\\s+(?:run\\s+)?(${BUILD_SUBCOMMAND_PATTERN})\\b`, "i"), captureSubcommand: true },
  { label: "yarn", pattern: new RegExp(`\\byarn\\s+(${BUILD_SUBCOMMAND_PATTERN})\\b`, "i"), captureSubcommand: true },
  { label: "bun", pattern: new RegExp(`\\bbun\\s+(?:run\\s+)?(${BUILD_SUBCOMMAND_PATTERN})\\b`, "i"), captureSubcommand: true }
]);

function normalizeLabel(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().toLowerCase();
}

function normalizeHintText(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim();
}

function normalizeShellLabel(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }
  const candidate = normalizeLabel(basename(value.trim()));
  return SHELL_LABELS.has(candidate) ? candidate : "";
}

function normalizeDetailValue(value) {
  if (value === null) {
    return null;
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeDetailValue(entry));
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  const normalized = {};
  for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right, "en-US"))) {
    const normalizedEntry = normalizeDetailValue(value[key]);
    if (normalizedEntry !== undefined) {
      normalized[key] = normalizedEntry;
    }
  }
  return normalized;
}

function createExplicitHint(type, value, extras = {}) {
  return normalizeDetailValue({
    type,
    value,
    ...extras
  });
}

function buildIdentityDetails(hints = []) {
  const normalizedHints = hints
    .map((entry) => normalizeDetailValue(entry))
    .filter((entry) => entry && typeof entry === "object");
  if (!normalizedHints.length) {
    return {};
  }
  return {
    explicitHints: normalizedHints
  };
}

function buildForegroundProcessDetails(inspection, hints = []) {
  const normalizedHints = hints
    .map((entry) => normalizeDetailValue(entry))
    .filter((entry) => entry && typeof entry === "object");
  const representativeProcess =
    inspection?.representativeProcess && typeof inspection.representativeProcess === "object"
      ? normalizeDetailValue(inspection.representativeProcess)
      : null;
  const foregroundProcesses = Array.isArray(inspection?.foregroundProcesses)
    ? inspection.foregroundProcesses
        .map((entry) => normalizeDetailValue(entry))
        .filter((entry) => entry && typeof entry === "object")
    : [];
  const ancestry = Array.isArray(inspection?.ancestry)
    ? inspection.ancestry.map((entry) => normalizeDetailValue(entry)).filter((entry) => entry && typeof entry === "object")
    : [];
  return {
    ...(normalizedHints.length ? { foregroundHints: normalizedHints } : {}),
    foregroundProcess: {
      terminalPid: Number.isInteger(inspection?.terminalPid) ? inspection.terminalPid : null,
      terminalProcessGroupId: Number.isInteger(inspection?.terminalProcessGroupId) ? inspection.terminalProcessGroupId : null,
      terminalSessionId: Number.isInteger(inspection?.terminalSessionId) ? inspection.terminalSessionId : null,
      ttyPath: typeof inspection?.ttyPath === "string" ? inspection.ttyPath : "",
      foregroundProcessGroupId: Number.isInteger(inspection?.foregroundProcessGroupId)
        ? inspection.foregroundProcessGroupId
        : null,
      representativeProcess,
      foregroundProcesses,
      ancestry
    }
  };
}

function buildShellMarkerDetails(signalState, hints = []) {
  const normalizedHints = hints
    .map((entry) => normalizeDetailValue(entry))
    .filter((entry) => entry && typeof entry === "object");
  return {
    ...(normalizedHints.length ? { shellMarkerHints: normalizedHints } : {}),
    shellMarkers: {
      shellPhase: typeof signalState?.shellPhase === "string" ? signalState.shellPhase : "unknown",
      lastProtocol: typeof signalState?.lastShellMarkerProtocol === "string" ? signalState.lastShellMarkerProtocol : "",
      lastMarker: typeof signalState?.lastShellMarker === "string" ? signalState.lastShellMarker : "",
      lastMarkerAt: Number.isInteger(signalState?.lastShellMarkerAt) ? signalState.lastShellMarkerAt : null,
      currentDirectory: typeof signalState?.currentDirectory === "string" ? signalState.currentDirectory : "",
      currentDirectoryProtocol:
        typeof signalState?.currentDirectoryProtocol === "string" ? signalState.currentDirectoryProtocol : "",
      currentDirectoryUpdatedAt: Number.isInteger(signalState?.currentDirectoryUpdatedAt)
        ? signalState.currentDirectoryUpdatedAt
        : null
    }
  };
}

function buildTerminalModeDetails(signalState, hints = []) {
  const normalizedHints = hints
    .map((entry) => normalizeDetailValue(entry))
    .filter((entry) => entry && typeof entry === "object");
  return {
    ...(normalizedHints.length ? { terminalModeHints: normalizedHints } : {}),
    terminalMode: {
      alternateScreenActive: signalState?.alternateScreenActive === true,
      alternateScreenCode: Number.isInteger(signalState?.alternateScreenCode) ? signalState.alternateScreenCode : null,
      alternateScreenUpdatedAt: Number.isInteger(signalState?.alternateScreenUpdatedAt)
        ? signalState.alternateScreenUpdatedAt
        : null
    }
  };
}

function isConfidence(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function roundConfidence(value) {
  if (!isConfidence(value)) {
    return 0;
  }
  return Math.round(value * 100) / 100;
}

function detectBuildHint(text) {
  const normalized = normalizeHintText(text);
  if (!normalized) {
    return null;
  }
  for (const matcher of BUILD_HINT_MATCHERS) {
    const match = normalized.match(matcher.pattern);
    if (!match) {
      continue;
    }
    return {
      family: "build-test",
      label: matcher.label,
      subcommand: matcher.captureSubcommand ? normalizeLabel(match[1]) : matcher.subcommand || ""
    };
  }
  return null;
}

function detectNamedHint(text) {
  const normalized = normalizeHintText(text);
  if (!normalized) {
    return null;
  }
  for (const matcher of EXPLICIT_HINT_MATCHERS) {
    if (matcher.pattern.test(normalized)) {
      return {
        family: matcher.family,
        label: matcher.label
      };
    }
  }
  return detectBuildHint(normalized);
}

function mergeHintCandidates(candidates) {
  const merged = new Map();
  for (const candidate of candidates) {
    if (!candidate || !candidate.family || !candidate.label) {
      continue;
    }
    const key = `${candidate.family}:${candidate.label}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, {
        family: candidate.family,
        label: candidate.label,
        baseConfidence: candidate.baseConfidence,
        hints: [candidate.hint]
      });
      continue;
    }
    current.baseConfidence = Math.max(current.baseConfidence, candidate.baseConfidence);
    const hintKey = JSON.stringify(candidate.hint);
    if (!current.hints.some((entry) => JSON.stringify(entry) === hintKey)) {
      current.hints.push(candidate.hint);
    }
  }
  return Array.from(merged.values());
}

function scoreMergedCandidate(candidate) {
  const extraHints = Math.max(0, candidate.hints.length - 1);
  return Math.min(0.95, roundConfidence(candidate.baseConfidence + extraHints * 0.08));
}

function buildExplicitHintIdentity(session, updatedAt) {
  const candidates = [];
  const shellLabel = normalizeShellLabel(session?.shell);
  if (shellLabel) {
    candidates.push({
      family: "shell",
      label: shellLabel,
      baseConfidence: 0.64,
      hint: createExplicitHint("shell", shellLabel)
    });
  }

  const nameHint = detectNamedHint(session?.name);
  if (nameHint) {
    candidates.push({
      family: nameHint.family,
      label: nameHint.label,
      baseConfidence: 0.72,
      hint: createExplicitHint("sessionName", normalizeHintText(session?.name), {
        matchedLabel: nameHint.label,
        ...(nameHint.subcommand ? { subcommand: nameHint.subcommand } : {})
      })
    });
  }

  const startCommandHint = detectNamedHint(session?.startCommand);
  if (startCommandHint) {
    candidates.push({
      family: startCommandHint.family,
      label: startCommandHint.label,
      baseConfidence: 0.84,
      hint: createExplicitHint("startCommand", normalizeHintText(session?.startCommand), {
        matchedLabel: startCommandHint.label,
        ...(startCommandHint.subcommand ? { subcommand: startCommandHint.subcommand } : {})
      })
    });
  }

  const mergedCandidates = mergeHintCandidates(candidates);
  if (!mergedCandidates.length) {
    return buildUnknownTerminalAppIdentity(updatedAt);
  }

  mergedCandidates.sort((left, right) => {
    const confidenceDelta = scoreMergedCandidate(right) - scoreMergedCandidate(left);
    if (confidenceDelta !== 0) {
      return confidenceDelta;
    }
    return left.label.localeCompare(right.label, "en-US", { sensitivity: "base" });
  });

  const winner = mergedCandidates[0];
  return {
    family: winner.family,
    label: winner.label,
    source: "explicit-hint",
    confidence: scoreMergedCandidate(winner),
    details: buildIdentityDetails(winner.hints),
    updatedAt
  };
}

function createForegroundProcessHint(type, value, extras = {}) {
  return normalizeDetailValue({
    type,
    value,
    ...extras
  });
}

function buildForegroundProcessIdentity(inspection, updatedAt) {
  if (!inspection || typeof inspection !== "object") {
    return buildUnknownTerminalAppIdentity(updatedAt);
  }
  const representative = inspection.representativeProcess;
  if (!representative || typeof representative !== "object") {
    return buildUnknownTerminalAppIdentity(updatedAt);
  }

  const representativeName =
    normalizeLabel(representative.executableName) || normalizeLabel(representative.comm) || normalizeLabel(representative.name);
  const representativeCommandLine = Array.isArray(representative.commandLine)
    ? representative.commandLine.join(" ").trim()
    : "";
  const representativeCommandLineHint = detectNamedHint(representativeCommandLine);
  const representativeNameHint = detectNamedHint(representativeName);
  const shellLabel = normalizeShellLabel(representativeName);

  if (representativeNameHint) {
    const subcommand =
      representativeNameHint.subcommand ||
      representativeCommandLineHint?.subcommand ||
      "";
    return {
      family: representativeNameHint.family,
      label: representativeNameHint.label,
      source: "foreground-process",
      confidence: representativeCommandLineHint ? 0.97 : 0.94,
      details: buildForegroundProcessDetails(inspection, [
        createForegroundProcessHint("representativeProcess", representativeName, {
          matchedLabel: representativeNameHint.label,
          ...(subcommand ? { subcommand } : {})
        }),
        representativeCommandLine
          ? createForegroundProcessHint("commandLine", representativeCommandLine, {
              ...(representativeCommandLineHint?.label ? { matchedLabel: representativeCommandLineHint.label } : {}),
              ...(subcommand ? { subcommand } : {})
            })
          : null
      ]),
      updatedAt
    };
  }

  if (representativeCommandLineHint) {
    return {
      family: representativeCommandLineHint.family,
      label: representativeCommandLineHint.label,
      source: "foreground-process",
      confidence: 0.89,
      details: buildForegroundProcessDetails(inspection, [
        createForegroundProcessHint("commandLine", representativeCommandLine, {
          matchedLabel: representativeCommandLineHint.label,
          ...(representativeCommandLineHint.subcommand ? { subcommand: representativeCommandLineHint.subcommand } : {})
        })
      ]),
      updatedAt
    };
  }

  if (shellLabel) {
    return {
      family: "shell",
      label: shellLabel,
      source: "foreground-process",
      confidence: 0.78,
      details: buildForegroundProcessDetails(inspection, [
        createForegroundProcessHint("representativeProcess", representativeName || shellLabel, {
          matchedLabel: shellLabel
        })
      ]),
      updatedAt
    };
  }

  if (representativeName) {
    return {
      family: "unknown",
      label: representativeName,
      source: "foreground-process",
      confidence: 0.52,
      details: buildForegroundProcessDetails(inspection, [
        createForegroundProcessHint("representativeProcess", representativeName)
      ]),
      updatedAt
    };
  }

  return buildUnknownTerminalAppIdentity(updatedAt);
}

function buildTerminalSignalIdentity(signalState, session, normalizedExistingIdentity, updatedAt) {
  const shellLabel =
    normalizeShellLabel(session?.shell) ||
    (normalizedExistingIdentity.family === "shell" ? normalizeShellLabel(normalizedExistingIdentity.label) : "");
  const hasShellMarker = Number.isInteger(signalState?.lastShellMarkerAt);
  const hasCurrentDirectory = typeof signalState?.currentDirectory === "string" && signalState.currentDirectory.trim().length > 0;
  const hasAlternateScreen = signalState?.alternateScreenActive === true;

  if (hasAlternateScreen) {
    if (
      (normalizedExistingIdentity.source === "foreground-process" && normalizedExistingIdentity.confidence >= 0.75) ||
      (normalizedExistingIdentity.source === "explicit-hint" &&
        normalizedExistingIdentity.family !== "shell" &&
        normalizedExistingIdentity.confidence >= 0.84)
    ) {
      return normalizedExistingIdentity;
    }
    const family =
      normalizedExistingIdentity.family === "editor" ||
      normalizedExistingIdentity.family === "pager" ||
      normalizedExistingIdentity.family === "tui"
        ? normalizedExistingIdentity.family
        : "tui";
    return {
      family,
      label: family === "tui" ? "" : normalizedExistingIdentity.label,
      source: "terminal-mode",
      confidence: family === "tui" ? 0.64 : 0.68,
      details: buildTerminalModeDetails(signalState, [
        normalizeDetailValue({
          type: "alternateScreen",
          code: signalState?.alternateScreenCode,
          active: true
        })
      ]),
      updatedAt
    };
  }

  if (!hasShellMarker && !hasCurrentDirectory) {
    return normalizedExistingIdentity;
  }

  const nextIdentity = {
    family: "shell",
    label: shellLabel,
    source: "shell-marker",
    confidence: hasCurrentDirectory ? 0.78 : 0.72,
    details: buildShellMarkerDetails(signalState, [
      normalizeDetailValue({
        type: "shellMarker",
        protocol: signalState?.lastShellMarkerProtocol || "",
        marker: signalState?.lastShellMarker || "",
        ...(hasCurrentDirectory ? { currentDirectory: signalState.currentDirectory } : {})
      })
    ]),
    updatedAt
  };

  if (
    normalizedExistingIdentity.source === "foreground-process" &&
    normalizedExistingIdentity.family !== "unknown" &&
    normalizedExistingIdentity.confidence >= nextIdentity.confidence
  ) {
    return normalizedExistingIdentity;
  }
  if (
    normalizedExistingIdentity.source === "explicit-hint" &&
    normalizedExistingIdentity.family !== "unknown" &&
    normalizedExistingIdentity.family !== "shell" &&
    normalizedExistingIdentity.confidence >= nextIdentity.confidence
  ) {
    return normalizedExistingIdentity;
  }
  return nextIdentity;
}

export function buildUnknownTerminalAppIdentity(updatedAt = Date.now()) {
  return {
    family: "unknown",
    label: "",
    source: "unknown",
    confidence: 0,
    details: {},
    updatedAt: Number.isInteger(updatedAt) ? updatedAt : Date.now()
  };
}

export function normalizeTerminalAppIdentity(input, { fallbackUpdatedAt = Date.now() } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return buildUnknownTerminalAppIdentity(fallbackUpdatedAt);
  }
  const family = normalizeLabel(input.family);
  const source = normalizeLabel(input.source);
  const updatedAt = Number.isInteger(input.updatedAt) ? input.updatedAt : fallbackUpdatedAt;
  if (!TERMINAL_APP_IDENTITY_FAMILY_SET.has(family) || !TERMINAL_APP_IDENTITY_SOURCE_SET.has(source)) {
    return buildUnknownTerminalAppIdentity(updatedAt);
  }
  return {
    family,
    label: normalizeLabel(input.label),
    source,
    confidence: roundConfidence(input.confidence),
    details:
      input.details && typeof input.details === "object" && !Array.isArray(input.details)
        ? normalizeDetailValue(input.details)
        : {},
    updatedAt: Number.isInteger(updatedAt) ? updatedAt : Date.now()
  };
}

export function terminalAppIdentityEquals(left, right, { includeUpdatedAt = true } = {}) {
  const normalizedLeft = normalizeTerminalAppIdentity(left, { fallbackUpdatedAt: 0 });
  const normalizedRight = normalizeTerminalAppIdentity(right, { fallbackUpdatedAt: 0 });
  return (
    normalizedLeft.family === normalizedRight.family &&
    normalizedLeft.label === normalizedRight.label &&
    normalizedLeft.source === normalizedRight.source &&
    normalizedLeft.confidence === normalizedRight.confidence &&
    JSON.stringify(normalizedLeft.details) === JSON.stringify(normalizedRight.details) &&
    (!includeUpdatedAt || normalizedLeft.updatedAt === normalizedRight.updatedAt)
  );
}

export function deriveTerminalAppIdentityFromSessionHints(session, { existingIdentity = null, updatedAt = Date.now() } = {}) {
  const nextIdentity = buildExplicitHintIdentity(session, updatedAt);
  const normalizedExistingIdentity = normalizeTerminalAppIdentity(existingIdentity, {
    fallbackUpdatedAt: Number.isInteger(updatedAt) ? updatedAt : Date.now()
  });
  if (terminalAppIdentityEquals(normalizedExistingIdentity, nextIdentity, { includeUpdatedAt: false })) {
    return normalizedExistingIdentity;
  }
  return nextIdentity;
}

export function deriveTerminalAppIdentityFromForegroundProcess(
  inspection,
  { existingIdentity = null, updatedAt = Date.now() } = {}
) {
  const normalizedExistingIdentity = normalizeTerminalAppIdentity(existingIdentity, {
    fallbackUpdatedAt: Number.isInteger(updatedAt) ? updatedAt : Date.now()
  });
  const nextIdentity = buildForegroundProcessIdentity(inspection, updatedAt);
  if (nextIdentity.source === "unknown" && normalizedExistingIdentity.source !== "unknown") {
    return normalizedExistingIdentity;
  }
  if (terminalAppIdentityEquals(normalizedExistingIdentity, nextIdentity, { includeUpdatedAt: false })) {
    return normalizedExistingIdentity;
  }
  return nextIdentity;
}

export function deriveTerminalAppIdentityFromTerminalSignals(
  signalState,
  session,
  { existingIdentity = null, updatedAt = Date.now() } = {}
) {
  const normalizedExistingIdentity = normalizeTerminalAppIdentity(existingIdentity, {
    fallbackUpdatedAt: Number.isInteger(updatedAt) ? updatedAt : Date.now()
  });
  const nextIdentity = buildTerminalSignalIdentity(signalState, session, normalizedExistingIdentity, updatedAt);
  if (terminalAppIdentityEquals(normalizedExistingIdentity, nextIdentity, { includeUpdatedAt: false })) {
    return normalizedExistingIdentity;
  }
  return nextIdentity;
}
