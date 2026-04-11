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

export const TERMINAL_APP_IDENTITY_RUNTIME_SOURCE_VALUES = Object.freeze([
  "explicit-hint",
  "foreground-process",
  "shell-marker",
  "terminal-mode",
  "output-heuristic"
]);

const TERMINAL_APP_IDENTITY_FAMILY_SET = new Set(TERMINAL_APP_IDENTITY_FAMILY_VALUES);
const TERMINAL_APP_IDENTITY_SOURCE_SET = new Set(TERMINAL_APP_IDENTITY_SOURCE_VALUES);
const TERMINAL_APP_IDENTITY_RUNTIME_SOURCE_SET = new Set(TERMINAL_APP_IDENTITY_RUNTIME_SOURCE_VALUES);
const SHELL_LABELS = new Set(["bash", "zsh", "fish", "sh"]);
const FOREGROUND_PROCESS_WRAPPER_LABELS = new Set(["bash", "zsh", "fish", "sh", "node", "nodejs", "env", "timeout"]);
const FOREGROUND_PROCESS_MULTIPLEXER_LABELS = new Set(["tmux", "screen"]);
const BUILD_SUBCOMMAND_PATTERN = "(?:test|build|check|clippy|lint)";
const OUTPUT_HEURISTIC_MAX_AGE_MS = 10_000;
const RECENT_CANDIDATE_HISTORY_LIMIT = 12;
const FAMILY_REPLACEMENT_DELTA = 0.03;
const LABEL_REPLACEMENT_DELTA = 0.02;
const TUI_FAMILY_CONTINUITY_DELTA = 0.04;

const SOURCE_PRIORITY_RANK = Object.freeze({
  unknown: 0,
  "output-heuristic": 1,
  "terminal-mode": 2,
  "shell-marker": 3,
  "foreground-process": 4,
  "explicit-hint": 5
});

const SOURCE_PRIORITY_WEIGHT = Object.freeze({
  unknown: 0,
  "output-heuristic": 0.02,
  "terminal-mode": 0.03,
  "shell-marker": 0.04,
  "foreground-process": 0.05,
  "explicit-hint": 0.06
});

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

const OUTPUT_HEURISTIC_MATCHERS = Object.freeze([
  Object.freeze({
    family: "coding-agent",
    label: "codex",
    confidence: 0.48,
    type: "separator",
    pattern: /(?:^|\n)\s*─{16,}\s*(?=\n|$)/u
  }),
  Object.freeze({
    family: "coding-agent",
    label: "gemini",
    confidence: 0.46,
    type: "section-marker",
    pattern: /(?:^|\n)\s*✦(?:\s|$)/u
  }),
  Object.freeze({
    family: "build-test",
    label: "jest",
    confidence: 0.44,
    type: "summary",
    pattern: /\bTest Suites:\s+\d+\s+(?:failed|passed|total)/i
  }),
  Object.freeze({
    family: "build-test",
    label: "pytest",
    confidence: 0.44,
    type: "summary",
    pattern: /(?:^|\n)=+\s+\d+\s+(?:passed|failed|error(?:s)?|skipped).+?in\s+[0-9.]+s\s+=+(?:\n|$)/i
  })
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

function buildOutputHeuristicDetails(output, matcher) {
  return {
    outputHeuristics: {
      type: matcher.type,
      label: matcher.label,
      preview: normalizeHintText(typeof output === "string" ? output.slice(0, 240) : "")
    }
  };
}

function buildArbitrationDetails(baseDetails, group) {
  const normalizedBaseDetails =
    baseDetails && typeof baseDetails === "object" && !Array.isArray(baseDetails)
      ? normalizeDetailValue(baseDetails)
      : {};
  return {
    ...normalizedBaseDetails,
    arbitration: {
      familyScore: group.effectiveScore,
      supportingSources: group.supportingSources,
      labelSupportSources: group.labelSupportingSources,
      candidateCount: group.candidates.length,
      recentCandidateCount: group.recentCandidateCount
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

function clampConfidenceScore(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.round(Math.max(0, Math.min(0.99, value)) * 100) / 100;
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
  return roundConfidence(Math.min(0.95, candidate.baseConfidence + extraHints * 0.08));
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

function collectForegroundInspectionProcesses(inspection) {
  const entries = [];
  const seen = new Set();
  const append = (processSnapshot, relation) => {
    if (!processSnapshot || typeof processSnapshot !== "object") {
      return;
    }
    const pid = Number.isInteger(processSnapshot.pid) ? processSnapshot.pid : null;
    const key =
      pid !== null
        ? `pid:${pid}`
        : `${relation}:${normalizeLabel(processSnapshot.executableName || processSnapshot.comm || processSnapshot.name)}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    entries.push({
      relation,
      process: processSnapshot
    });
  };
  append(inspection?.representativeProcess, "representativeProcess");
  for (const processSnapshot of Array.isArray(inspection?.foregroundProcesses) ? inspection.foregroundProcesses : []) {
    append(processSnapshot, "foregroundProcess");
  }
  for (const processSnapshot of Array.isArray(inspection?.ancestry) ? inspection.ancestry : []) {
    append(processSnapshot, "ancestry");
  }
  return entries;
}

function getForegroundProcessCandidateBaseConfidence(relation, { viaCommandLine = false, wrapperMatch = false } = {}) {
  if (relation === "representativeProcess") {
    if (viaCommandLine) {
      return wrapperMatch ? 0.92 : 0.89;
    }
    return 0.94;
  }
  if (relation === "foregroundProcess") {
    if (viaCommandLine) {
      return wrapperMatch ? 0.94 : 0.87;
    }
    return 0.92;
  }
  if (viaCommandLine) {
    return wrapperMatch ? 0.86 : 0.81;
  }
  return 0.84;
}

function buildForegroundProcessCandidateEntries(inspection) {
  const candidates = [];
  for (const entry of collectForegroundInspectionProcesses(inspection)) {
    const processSnapshot = entry.process;
    const relation = entry.relation;
    const processName =
      normalizeLabel(processSnapshot?.executableName) ||
      normalizeLabel(processSnapshot?.comm) ||
      normalizeLabel(processSnapshot?.name);
    const processCommandLine = Array.isArray(processSnapshot?.commandLine)
      ? processSnapshot.commandLine.join(" ").trim()
      : "";
    const processNameHint = detectNamedHint(processName);
    const processCommandLineHint = detectNamedHint(processCommandLine);
    const shellLabel = normalizeShellLabel(processName);
    const wrapperMatch = FOREGROUND_PROCESS_WRAPPER_LABELS.has(processName);
    const multiplexerMatch = FOREGROUND_PROCESS_MULTIPLEXER_LABELS.has(processName);
    const baseHintDetails = {
      relation,
      pid: Number.isInteger(processSnapshot?.pid) ? processSnapshot.pid : null
    };

    if (processNameHint) {
      candidates.push({
        family: processNameHint.family,
        label: processNameHint.label,
        baseConfidence: getForegroundProcessCandidateBaseConfidence(relation, {
          viaCommandLine: false,
          wrapperMatch
        }),
        hint: createForegroundProcessHint("processName", processName, {
          ...baseHintDetails,
          matchedLabel: processNameHint.label,
          ...(processNameHint.subcommand ? { subcommand: processNameHint.subcommand } : {})
        })
      });
    }

    if (processCommandLineHint) {
      candidates.push({
        family: processCommandLineHint.family,
        label: processCommandLineHint.label,
        baseConfidence: getForegroundProcessCandidateBaseConfidence(relation, {
          viaCommandLine: true,
          wrapperMatch
        }),
        hint: createForegroundProcessHint("commandLine", processCommandLine, {
          ...baseHintDetails,
          matchedLabel: processCommandLineHint.label,
          ...(processCommandLineHint.subcommand ? { subcommand: processCommandLineHint.subcommand } : {})
        })
      });
    }

    if (shellLabel) {
      candidates.push({
        family: "shell",
        label: shellLabel,
        baseConfidence: relation === "representativeProcess" ? 0.78 : relation === "foregroundProcess" ? 0.75 : 0.7,
        hint: createForegroundProcessHint("processName", processName || shellLabel, {
          ...baseHintDetails,
          matchedLabel: shellLabel
        })
      });
    }

    if (multiplexerMatch) {
      candidates.push({
        family: "tui",
        label: processName,
        baseConfidence: relation === "representativeProcess" ? 0.76 : relation === "foregroundProcess" ? 0.72 : 0.66,
        hint: createForegroundProcessHint("processName", processName, {
          ...baseHintDetails,
          matchedLabel: processName
        })
      });
    }
  }
  return candidates;
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
  const mergedCandidates = mergeHintCandidates(buildForegroundProcessCandidateEntries(inspection));
  if (mergedCandidates.length) {
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
      source: "foreground-process",
      confidence: scoreMergedCandidate(winner),
      details: buildForegroundProcessDetails(inspection, winner.hints),
      updatedAt
    };
  }

  if (representativeName) {
    return {
      family: "unknown",
      label: representativeName,
      source: "foreground-process",
      confidence: 0.52,
      details: buildForegroundProcessDetails(inspection, [createForegroundProcessHint("representativeProcess", representativeName)]),
      updatedAt
    };
  }

  return buildUnknownTerminalAppIdentity(updatedAt);
}

function buildShellMarkerIdentity(signalState, session, updatedAt) {
  const hasShellMarker = Number.isInteger(signalState?.lastShellMarkerAt);
  const hasCurrentDirectory = typeof signalState?.currentDirectory === "string" && signalState.currentDirectory.trim().length > 0;
  if (!hasShellMarker && !hasCurrentDirectory) {
    return buildUnknownTerminalAppIdentity(updatedAt);
  }
  const shellLabel = normalizeShellLabel(session?.shell);
  return {
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
}

function buildTerminalModeIdentity(signalState, updatedAt) {
  if (signalState?.alternateScreenActive !== true) {
    return buildUnknownTerminalAppIdentity(updatedAt);
  }
  return {
    family: "tui",
    label: "",
    source: "terminal-mode",
    confidence: 0.64,
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

function buildOutputHeuristicIdentity(output, updatedAt) {
  const normalizedOutput = typeof output === "string" ? output : "";
  if (!normalizedOutput.trim()) {
    return buildUnknownTerminalAppIdentity(updatedAt);
  }
  for (const matcher of OUTPUT_HEURISTIC_MATCHERS) {
    if (!matcher.pattern.test(normalizedOutput)) {
      continue;
    }
    return {
      family: matcher.family,
      label: matcher.label,
      source: "output-heuristic",
      confidence: matcher.confidence,
      details: buildOutputHeuristicDetails(normalizedOutput, matcher),
      updatedAt
    };
  }
  return buildUnknownTerminalAppIdentity(updatedAt);
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

function buildUnknownCandidateMap(updatedAt) {
  return Object.fromEntries(
    TERMINAL_APP_IDENTITY_RUNTIME_SOURCE_VALUES.map((source) => [source, buildUnknownTerminalAppIdentity(updatedAt)])
  );
}

function createRecentCandidateEntry(source, candidate, observedAt) {
  return normalizeDetailValue({
    source,
    candidateSource: candidate?.source || "unknown",
    family: candidate?.family || "unknown",
    label: candidate?.label || "",
    confidence: isConfidence(candidate?.confidence) ? roundConfidence(candidate.confidence) : 0,
    observedAt: Number.isInteger(observedAt) ? observedAt : null
  });
}

export function createTerminalAppIdentityRuntimeState(
  session,
  { currentIdentity = null, updatedAt = Date.now() } = {}
) {
  const normalizedUpdatedAt = Number.isInteger(updatedAt) ? updatedAt : Date.now();
  const explicitCandidate = buildExplicitHintIdentity(session, normalizedUpdatedAt);
  const initialCurrent = normalizeTerminalAppIdentity(currentIdentity || explicitCandidate, {
    fallbackUpdatedAt: normalizedUpdatedAt
  });
  const candidates = {
    ...buildUnknownCandidateMap(normalizedUpdatedAt),
    "explicit-hint": explicitCandidate
  };
  if (
    initialCurrent.source !== "unknown" &&
    Object.prototype.hasOwnProperty.call(candidates, initialCurrent.source)
  ) {
    candidates[initialCurrent.source] = initialCurrent;
  }
  return {
    current: initialCurrent,
    candidates,
    recentCandidates:
      explicitCandidate.source === "unknown"
        ? []
        : [createRecentCandidateEntry("explicit-hint", explicitCandidate, normalizedUpdatedAt)],
    lastForegroundProbeAt: 0,
    lastOutputHintAt: 0
  };
}

export function normalizeTerminalAppIdentityRuntimeState(
  input,
  { session = null, currentIdentity = null, updatedAt = Date.now() } = {}
) {
  const fallback = createTerminalAppIdentityRuntimeState(session, {
    currentIdentity,
    updatedAt
  });
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return fallback;
  }
  const normalizedCandidates = buildUnknownCandidateMap(updatedAt);
  const rawCandidates = input.candidates && typeof input.candidates === "object" && !Array.isArray(input.candidates) ? input.candidates : {};
  for (const source of TERMINAL_APP_IDENTITY_RUNTIME_SOURCE_VALUES) {
    normalizedCandidates[source] = normalizeTerminalAppIdentity(rawCandidates[source], { fallbackUpdatedAt: updatedAt });
  }
  if (normalizedCandidates["explicit-hint"].source === "unknown") {
    normalizedCandidates["explicit-hint"] = fallback.candidates["explicit-hint"];
  }
  return {
    current: normalizeTerminalAppIdentity(input.current || currentIdentity || fallback.current, {
      fallbackUpdatedAt: updatedAt
    }),
    candidates: normalizedCandidates,
    recentCandidates: Array.isArray(input.recentCandidates)
      ? input.recentCandidates
          .map((entry) => normalizeDetailValue(entry))
          .filter((entry) => entry && typeof entry === "object")
          .slice(-RECENT_CANDIDATE_HISTORY_LIMIT)
      : fallback.recentCandidates,
    lastForegroundProbeAt: Number.isInteger(input.lastForegroundProbeAt) ? input.lastForegroundProbeAt : 0,
    lastOutputHintAt: Number.isInteger(input.lastOutputHintAt) ? input.lastOutputHintAt : 0
  };
}

function getCandidateEffectiveScore(candidate, { updatedAt, lastOutputHintAt = 0 } = {}) {
  const normalizedCandidate = normalizeTerminalAppIdentity(candidate, { fallbackUpdatedAt: updatedAt });
  if (normalizedCandidate.family === "unknown" || normalizedCandidate.source === "unknown") {
    return -1;
  }
  if (normalizedCandidate.source === "output-heuristic") {
    const referenceAt = Number.isInteger(normalizedCandidate.updatedAt)
      ? normalizedCandidate.updatedAt
      : Number.isInteger(lastOutputHintAt)
        ? lastOutputHintAt
        : 0;
    if (!referenceAt || updatedAt - referenceAt > OUTPUT_HEURISTIC_MAX_AGE_MS) {
      return -1;
    }
  }
  return clampConfidenceScore(normalizedCandidate.confidence + (SOURCE_PRIORITY_WEIGHT[normalizedCandidate.source] || 0));
}

function compareCandidateEntries(left, right) {
  const effectiveDelta = right.effectiveScore - left.effectiveScore;
  if (effectiveDelta !== 0) {
    return effectiveDelta;
  }
  const confidenceDelta = right.candidate.confidence - left.candidate.confidence;
  if (confidenceDelta !== 0) {
    return confidenceDelta;
  }
  const priorityDelta = (SOURCE_PRIORITY_RANK[right.candidate.source] || 0) - (SOURCE_PRIORITY_RANK[left.candidate.source] || 0);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }
  return left.candidate.label.localeCompare(right.candidate.label, "en-US", { sensitivity: "base" });
}

function buildArbitrationGroups(candidateMap, { updatedAt, recentCandidates = [], lastOutputHintAt = 0 } = {}) {
  const groups = new Map();
  for (const source of TERMINAL_APP_IDENTITY_RUNTIME_SOURCE_VALUES) {
    const candidate = normalizeTerminalAppIdentity(candidateMap?.[source], { fallbackUpdatedAt: updatedAt });
    const effectiveScore = getCandidateEffectiveScore(candidate, { updatedAt, lastOutputHintAt });
    if (effectiveScore < 0) {
      continue;
    }
    const entry = { source, candidate, effectiveScore };
    let group = groups.get(candidate.family);
    if (!group) {
      group = {
        family: candidate.family,
        candidates: [],
        labels: new Map(),
        recentCandidateCount: recentCandidates.length
      };
      groups.set(candidate.family, group);
    }
    group.candidates.push(entry);
    const labelKey = candidate.label || "";
    if (!group.labels.has(labelKey)) {
      group.labels.set(labelKey, {
        label: labelKey,
        candidates: []
      });
    }
    group.labels.get(labelKey).candidates.push(entry);
  }

  const normalizedGroups = Array.from(groups.values()).map((group) => {
    group.candidates.sort(compareCandidateEntries);
    const supportingSources = Array.from(new Set(group.candidates.map((entry) => entry.candidate.source))).sort(
      (left, right) => (SOURCE_PRIORITY_RANK[right] || 0) - (SOURCE_PRIORITY_RANK[left] || 0)
    );
    const topEntry = group.candidates[0];
    const supportBonus = Math.min(0.12, (group.candidates.length - 1) * 0.08);
    const effectiveScore = clampConfidenceScore(topEntry.effectiveScore + supportBonus);
    const labelGroups = Array.from(group.labels.values()).map((labelGroup) => {
      labelGroup.candidates.sort(compareCandidateEntries);
      const labelTopEntry = labelGroup.candidates[0];
      const labelSupportBonus = labelGroup.label ? Math.min(0.08, (labelGroup.candidates.length - 1) * 0.06) : 0;
      const labelEffectiveScore = clampConfidenceScore(labelTopEntry.effectiveScore + labelSupportBonus);
      const labelSupportingSources = Array.from(new Set(labelGroup.candidates.map((entry) => entry.candidate.source))).sort(
        (left, right) => (SOURCE_PRIORITY_RANK[right] || 0) - (SOURCE_PRIORITY_RANK[left] || 0)
      );
      return {
        ...labelGroup,
        topEntry: labelTopEntry,
        labelEffectiveScore,
        labelSupportingSources
      };
    });
    labelGroups.sort((left, right) => {
      const effectiveDelta = right.labelEffectiveScore - left.labelEffectiveScore;
      if (effectiveDelta !== 0) {
        return effectiveDelta;
      }
      if (left.label && !right.label) {
        return -1;
      }
      if (!left.label && right.label) {
        return 1;
      }
      return left.label.localeCompare(right.label, "en-US", { sensitivity: "base" });
    });
    const bestLabelGroup = labelGroups[0];
    const resolvedLabel =
      bestLabelGroup && bestLabelGroup.label && bestLabelGroup.labelEffectiveScore >= effectiveScore - 0.08
        ? bestLabelGroup.label
        : "";
    const resolvedLabelGroup =
      labelGroups.find((labelGroup) => labelGroup.label === resolvedLabel) || bestLabelGroup || { candidates: group.candidates, labelSupportingSources: [] };
    const resolvedTopEntry = resolvedLabelGroup.topEntry || topEntry;
    const resolvedConfidence = roundConfidence(
      Math.min(0.99, resolvedTopEntry.candidate.confidence + Math.min(0.12, (group.candidates.length - 1) * 0.06))
    );
    return {
      family: group.family,
      candidates: group.candidates,
      topEntry,
      effectiveScore,
      resolvedLabel,
      resolvedTopEntry,
      resolvedConfidence,
      supportingSources,
      labelSupportingSources: resolvedLabelGroup.labelSupportingSources || [],
      recentCandidateCount: group.recentCandidateCount
    };
  });

  normalizedGroups.sort((left, right) => {
    const effectiveDelta = right.effectiveScore - left.effectiveScore;
    if (effectiveDelta !== 0) {
      return effectiveDelta;
    }
    const priorityDelta =
      (SOURCE_PRIORITY_RANK[right.resolvedTopEntry?.candidate?.source] || 0) -
      (SOURCE_PRIORITY_RANK[left.resolvedTopEntry?.candidate?.source] || 0);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return left.family.localeCompare(right.family, "en-US", { sensitivity: "base" });
  });

  return normalizedGroups;
}

function buildIdentityFromGroup(group, updatedAt) {
  const topCandidate = normalizeTerminalAppIdentity(group?.resolvedTopEntry?.candidate, { fallbackUpdatedAt: updatedAt });
  if (topCandidate.family === "unknown" || topCandidate.source === "unknown") {
    return buildUnknownTerminalAppIdentity(updatedAt);
  }
  return {
    family: group.family,
    label: group.resolvedLabel,
    source: topCandidate.source,
    confidence: group.resolvedConfidence,
    details: buildArbitrationDetails(topCandidate.details, group),
    updatedAt
  };
}

function getCurrentReferenceScore(currentIdentity, groups, { candidateMap = null, updatedAt, lastOutputHintAt = 0 } = {}) {
  const normalizedCurrent = normalizeTerminalAppIdentity(currentIdentity, { fallbackUpdatedAt: updatedAt });
  if (normalizedCurrent.family === "unknown" || normalizedCurrent.source === "unknown") {
    return -1;
  }
  if (TERMINAL_APP_IDENTITY_RUNTIME_SOURCE_SET.has(normalizedCurrent.source)) {
    const sourceCandidate = normalizeTerminalAppIdentity(candidateMap?.[normalizedCurrent.source], {
      fallbackUpdatedAt: updatedAt
    });
    if (!terminalAppIdentityEquals(sourceCandidate, normalizedCurrent, { includeUpdatedAt: false })) {
      return -1;
    }
  }
  const matchingGroup = groups.find((group) => group.family === normalizedCurrent.family);
  if (matchingGroup) {
    return matchingGroup.effectiveScore;
  }
  return Math.max(-1, getCandidateEffectiveScore(normalizedCurrent, { updatedAt, lastOutputHintAt }) - 0.04);
}

function selectArbitratedIdentity(candidateMap, { currentIdentity = null, recentCandidates = [], updatedAt = Date.now(), lastOutputHintAt = 0 } = {}) {
  const groups = buildArbitrationGroups(candidateMap, {
    updatedAt,
    recentCandidates,
    lastOutputHintAt
  });
  const normalizedCurrent = normalizeTerminalAppIdentity(currentIdentity, { fallbackUpdatedAt: updatedAt });
  if (!groups.length) {
    return normalizedCurrent.source !== "unknown" ? normalizedCurrent : buildUnknownTerminalAppIdentity(updatedAt);
  }
  const winner = groups[0];
  if (normalizedCurrent.family === "unknown" || normalizedCurrent.source === "unknown") {
    return buildIdentityFromGroup(winner, updatedAt);
  }
  const currentScore = getCurrentReferenceScore(normalizedCurrent, groups, {
    candidateMap,
    updatedAt,
    lastOutputHintAt
  });
  const bestSpecificGroup = groups.find((group) => group.family !== "shell" && group.family !== "unknown");
  const winnerDynamicSupportCount = winner.supportingSources.filter(
    (source) => source === "foreground-process" || source === "shell-marker" || source === "terminal-mode"
  ).length;
  const terminalModeGroup = groups.find(
    (group) => group.resolvedTopEntry?.candidate?.source === "terminal-mode" && group.family === "tui"
  );
  if (
    terminalModeGroup &&
    (
      (winner.family === "shell" && terminalModeGroup.effectiveScore >= winner.effectiveScore - 0.2) ||
      ((normalizedCurrent.family === "shell" || normalizedCurrent.family === "unknown") &&
        terminalModeGroup.effectiveScore >= currentScore - 0.12)
    )
  ) {
    return buildIdentityFromGroup(terminalModeGroup, updatedAt);
  }
  if (
    winner.family !== normalizedCurrent.family &&
    normalizedCurrent.source === "explicit-hint" &&
    winnerDynamicSupportCount >= 2 &&
    winner.effectiveScore >= currentScore - 0.12
  ) {
    return buildIdentityFromGroup(winner, updatedAt);
  }
  if (
    normalizedCurrent.family === "shell" &&
    bestSpecificGroup &&
    bestSpecificGroup.effectiveScore >= currentScore - 0.22
  ) {
    return buildIdentityFromGroup(bestSpecificGroup, updatedAt);
  }
  if (winner.family !== normalizedCurrent.family && winner.effectiveScore < currentScore + FAMILY_REPLACEMENT_DELTA) {
    return normalizedCurrent;
  }
  if (
    winner.family === normalizedCurrent.family &&
    winner.resolvedLabel !== normalizedCurrent.label &&
    winner.effectiveScore < currentScore + LABEL_REPLACEMENT_DELTA
  ) {
    return normalizedCurrent;
  }
  if (
    winner.family === "tui" &&
    (normalizedCurrent.family === "editor" || normalizedCurrent.family === "pager" || normalizedCurrent.family === "tui") &&
    winner.effectiveScore < currentScore + TUI_FAMILY_CONTINUITY_DELTA
  ) {
    return normalizedCurrent;
  }
  return buildIdentityFromGroup(winner, updatedAt);
}

export function reconcileTerminalAppIdentityRuntimeState(
  state,
  updates,
  { session = null, currentIdentity = null, updatedAt = Date.now() } = {}
) {
  const normalizedUpdatedAt = Number.isInteger(updatedAt) ? updatedAt : Date.now();
  const normalizedState = normalizeTerminalAppIdentityRuntimeState(state, {
    session,
    currentIdentity,
    updatedAt: normalizedUpdatedAt
  });
  const nextState = {
    ...normalizedState,
    candidates: {
      ...normalizedState.candidates
    },
    recentCandidates: [...normalizedState.recentCandidates]
  };
  const normalizedUpdates = updates && typeof updates === "object" && !Array.isArray(updates) ? updates : {};

  for (const source of TERMINAL_APP_IDENTITY_RUNTIME_SOURCE_VALUES) {
    if (!Object.prototype.hasOwnProperty.call(normalizedUpdates, source)) {
      continue;
    }
    const nextCandidate = normalizeTerminalAppIdentity(normalizedUpdates[source], {
      fallbackUpdatedAt: normalizedUpdatedAt
    });
    const previousCandidate = normalizeTerminalAppIdentity(nextState.candidates[source], {
      fallbackUpdatedAt: normalizedUpdatedAt
    });
    nextState.candidates[source] = nextCandidate;
    if (!terminalAppIdentityEquals(previousCandidate, nextCandidate)) {
      nextState.recentCandidates.push(createRecentCandidateEntry(source, nextCandidate, normalizedUpdatedAt));
      nextState.recentCandidates = nextState.recentCandidates.slice(-RECENT_CANDIDATE_HISTORY_LIMIT);
    }
    if (source === "foreground-process") {
      nextState.lastForegroundProbeAt = normalizedUpdatedAt;
    }
    if (source === "output-heuristic" && nextCandidate.source === "output-heuristic") {
      nextState.lastOutputHintAt = normalizedUpdatedAt;
    }
  }

  const resolvedCurrent = selectArbitratedIdentity(nextState.candidates, {
    currentIdentity: currentIdentity || normalizedState.current,
    recentCandidates: nextState.recentCandidates,
    updatedAt: normalizedUpdatedAt,
    lastOutputHintAt: nextState.lastOutputHintAt
  });
  nextState.current = resolvedCurrent;
  return {
    state: nextState,
    current: resolvedCurrent
  };
}

export function deriveTerminalAppIdentityCandidateFromSessionHints(session, { updatedAt = Date.now() } = {}) {
  return buildExplicitHintIdentity(session, updatedAt);
}

export function deriveTerminalAppIdentityCandidateFromForegroundProcess(inspection, { updatedAt = Date.now() } = {}) {
  return buildForegroundProcessIdentity(inspection, updatedAt);
}

export function deriveTerminalAppIdentityCandidatesFromTerminalSignals(
  signalState,
  session,
  { updatedAt = Date.now() } = {}
) {
  return {
    "shell-marker": buildShellMarkerIdentity(signalState, session, updatedAt),
    "terminal-mode": buildTerminalModeIdentity(signalState, updatedAt)
  };
}

export function deriveTerminalAppIdentityCandidateFromOutputHeuristics(output, { updatedAt = Date.now() } = {}) {
  return buildOutputHeuristicIdentity(output, updatedAt);
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
  const runtimeState = createTerminalAppIdentityRuntimeState(session, {
    currentIdentity: existingIdentity,
    updatedAt
  });
  const reconciled = reconcileTerminalAppIdentityRuntimeState(
    runtimeState,
    deriveTerminalAppIdentityCandidatesFromTerminalSignals(signalState, session, { updatedAt }),
    {
      session,
      currentIdentity: existingIdentity,
      updatedAt
    }
  );
  const normalizedExistingIdentity = normalizeTerminalAppIdentity(existingIdentity, {
    fallbackUpdatedAt: Number.isInteger(updatedAt) ? updatedAt : Date.now()
  });
  if (terminalAppIdentityEquals(normalizedExistingIdentity, reconciled.current, { includeUpdatedAt: false })) {
    return normalizedExistingIdentity;
  }
  return reconciled.current;
}
