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
