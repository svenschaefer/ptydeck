import { createConnectionProfileRuntimeAssembly } from "./connection-profile-runtime-assembly.js";
import {
  buildBlankConnectionProfileLaunch,
  cloneThemeProfile,
  formatConnectionProfileReport,
  formatConnectionProfileSummary,
  normalizeConnectionProfileLaunch,
  normalizeConnectionProfileRecord
} from "./connection-profile-draft-state.js";

export {
  buildConnectionProfileLaunchFromSession,
  formatConnectionProfileReport,
  formatConnectionProfileSummary,
  normalizeConnectionProfileLaunch,
  normalizeConnectionProfileRecord,
  resolveConnectionProfileToken
} from "./connection-profile-draft-state.js";

function normalizeTextValue(value) {
  return String(value || "").trim();
}

function normalizeLowerValue(value) {
  return normalizeTextValue(value).toLowerCase();
}

function authMethodRequiresSecret(remoteAuth) {
  const method = normalizeLowerValue(remoteAuth?.method);
  return method === "password" || method === "keyboardinteractive";
}

export function createConnectionProfileRuntimeController(options = {}) {
  const windowRef = options.windowRef || globalThis;
  const api = options.api || {};
  const getDecks = typeof options.getDecks === "function" ? options.getDecks : () => [];
  const getSessions = typeof options.getSessions === "function" ? options.getSessions : () => [];
  const getSessionById =
    typeof options.getSessionById === "function"
      ? options.getSessionById
      : (sessionId) => (Array.isArray(getSessions()) ? getSessions().find((session) => session.id === sessionId) || null : null);
  const getActiveSessionId = typeof options.getActiveSessionId === "function" ? options.getActiveSessionId : () => "";
  const setActiveSession = typeof options.setActiveSession === "function" ? options.setActiveSession : () => {};
  const setActiveDeck = typeof options.setActiveDeck === "function" ? options.setActiveDeck : () => false;
  const applyRuntimeEvent = typeof options.applyRuntimeEvent === "function" ? options.applyRuntimeEvent : () => false;
  const setCommandFeedback = typeof options.setCommandFeedback === "function" ? options.setCommandFeedback : () => {};
  const setError = typeof options.setError === "function" ? options.setError : () => {};
  const getErrorMessage = typeof options.getErrorMessage === "function" ? options.getErrorMessage : (_, fallback) => fallback;
  const requestSecret = typeof options.requestSecret === "function" ? options.requestSecret : null;
  const formatSessionToken = typeof options.formatSessionToken === "function" ? options.formatSessionToken : (sessionId) => String(sessionId || "");
  const formatSessionDisplayName =
    typeof options.formatSessionDisplayName === "function" ? options.formatSessionDisplayName : (session) => session?.name || String(session?.id || "");
  const requestRender = typeof options.requestRender === "function" ? options.requestRender : () => {};
  const normalizeThemeProfile =
    typeof options.normalizeThemeProfile === "function" ? options.normalizeThemeProfile : (value) => (value && typeof value === "object" ? value : {});
  const defaultDeckId = normalizeTextValue(options.defaultDeckId) || "default";
  const defaultThemeProfile =
    cloneThemeProfile(options.defaultThemeProfile) || cloneThemeProfile(normalizeThemeProfile({})) || undefined;

  return createConnectionProfileRuntimeAssembly({
    ...options,
    windowRef,
    api,
    getDecks,
    getSessions,
    getSessionById,
    getActiveSessionId,
    setActiveSession,
    setActiveDeck,
    applyRuntimeEvent,
    setCommandFeedback,
    setError,
    getErrorMessage,
    requestSecret,
    formatSessionToken,
    formatSessionDisplayName,
    requestRender,
    normalizeThemeProfile,
    defaultDeckId,
    defaultThemeProfile,
    normalizeText: normalizeTextValue,
    normalizeLower: normalizeLowerValue,
    authMethodRequiresSecret,
    buildBlankConnectionProfileLaunch,
    normalizeConnectionLaunch: normalizeConnectionProfileLaunch
  });
}
