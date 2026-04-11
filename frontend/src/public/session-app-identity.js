const SESSION_APP_IDENTITY_FAMILY_VALUES = Object.freeze([
  "shell",
  "coding-agent",
  "build-test",
  "editor",
  "pager",
  "tui",
  "unknown"
]);

const SESSION_APP_IDENTITY_SOURCE_VALUES = Object.freeze([
  "unknown",
  "explicit-hint",
  "foreground-process",
  "shell-marker",
  "terminal-mode",
  "output-heuristic"
]);

const SESSION_APP_IDENTITY_FAMILY_SET = new Set(SESSION_APP_IDENTITY_FAMILY_VALUES);
const SESSION_APP_IDENTITY_SOURCE_SET = new Set(SESSION_APP_IDENTITY_SOURCE_VALUES);

const SESSION_APP_IDENTITY_FAMILY_DISPLAY = Object.freeze({
  shell: "shell",
  "coding-agent": "agent",
  "build-test": "build/test",
  editor: "editor",
  pager: "pager",
  tui: "tui",
  unknown: ""
});

const SESSION_APP_IDENTITY_SOURCE_DISPLAY = Object.freeze({
  unknown: "unknown source",
  "explicit-hint": "launch hint",
  "foreground-process": "foreground process",
  "shell-marker": "shell marker",
  "terminal-mode": "terminal mode",
  "output-heuristic": "output heuristic"
});

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
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
    const nextValue = normalizeDetailValue(value[key]);
    if (nextValue !== undefined) {
      normalized[key] = nextValue;
    }
  }
  return normalized;
}

function normalizeConfidence(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  const clamped = Math.max(0, Math.min(1, value));
  return Math.round(clamped * 100) / 100;
}

function normalizeIdentityCore(value) {
  const family = normalizeText(value?.family).toLowerCase();
  const source = normalizeText(value?.source).toLowerCase();
  const label = normalizeText(value?.label).toLowerCase();
  return {
    family: SESSION_APP_IDENTITY_FAMILY_SET.has(family) ? family : "unknown",
    label,
    source: SESSION_APP_IDENTITY_SOURCE_SET.has(source) ? source : "unknown",
    confidence: normalizeConfidence(value?.confidence),
    details: normalizeDetailValue(value?.details) || {},
    updatedAt: Number.isFinite(value?.updatedAt) ? Number(value.updatedAt) : null
  };
}

export function normalizeSessionAppIdentity(value) {
  const normalized = normalizeIdentityCore(value);
  if (normalized.family === "unknown") {
    return {
      family: "unknown",
      label: normalized.label || "",
      source: normalized.source === "unknown" ? "unknown" : normalized.source,
      confidence: normalized.source === "unknown" ? 0 : normalized.confidence,
      details: normalized.details,
      updatedAt: normalized.updatedAt
    };
  }
  return normalized;
}

export function resolveSessionAppIdentity(session) {
  return normalizeSessionAppIdentity(session?.appIdentity || session?.meta?.appIdentity || null);
}

export function isVisibleSessionAppIdentity(identity, options = {}) {
  const normalized = normalizeSessionAppIdentity(identity);
  if (normalized.family === "unknown") {
    return false;
  }
  if (options.includeShell !== true && normalized.family === "shell") {
    return false;
  }
  return Boolean(normalized.label || normalized.family !== "unknown");
}

export function formatSessionAppIdentityText(identity, options = {}) {
  const normalized = normalizeSessionAppIdentity(identity);
  if (!isVisibleSessionAppIdentity(normalized, options)) {
    return "";
  }
  if (normalized.label) {
    return normalized.label;
  }
  return SESSION_APP_IDENTITY_FAMILY_DISPLAY[normalized.family] || normalized.family;
}

export function formatSessionHeaderAppLabel(identity, sessionName = "") {
  const normalized = normalizeSessionAppIdentity(identity);
  const appText = formatSessionAppIdentityText(normalized);
  if (!appText) {
    return "";
  }
  const normalizedSessionName = normalizeText(sessionName).toLowerCase();
  if (normalizedSessionName && normalizedSessionName === appText.toLowerCase()) {
    return "";
  }
  return appText;
}

export function formatSessionAppIdentityTitle(identity) {
  const normalized = normalizeSessionAppIdentity(identity);
  if (normalized.family === "unknown") {
    return "";
  }
  const sourceText = SESSION_APP_IDENTITY_SOURCE_DISPLAY[normalized.source] || normalized.source;
  const confidencePercent = Math.round(normalized.confidence * 100);
  const labelText = normalized.label
    ? normalized.label === normalized.family
      ? normalized.label
      : `${normalized.label} (${normalized.family})`
    : normalized.family;
  return `Active app: ${labelText} via ${sourceText} · ${confidencePercent}% confidence.`;
}

export function getSessionPasteObservationProfile(session) {
  const identity = resolveSessionAppIdentity(session);
  if (identity.label === "codex") {
    return "codex";
  }
  if (identity.family === "unknown") {
    return "generic";
  }
  return "";
}

export function formatSessionPasteObservationAppLabel(session) {
  const identity = resolveSessionAppIdentity(session);
  if (identity.label === "codex") {
    return "Codex";
  }
  if (identity.label) {
    return identity.label;
  }
  if (identity.family === "unknown") {
    return "";
  }
  return SESSION_APP_IDENTITY_FAMILY_DISPLAY[identity.family] || identity.family;
}

export {
  SESSION_APP_IDENTITY_FAMILY_VALUES,
  SESSION_APP_IDENTITY_SOURCE_VALUES
};
