import { getShareTokenFromLocation, parseAccessStateFromToken } from "./share-access-state.js";

export function createAuthBootstrapRuntimeController(options = {}) {
  const windowRef = options.windowRef || globalThis;
  const setTimeoutFn =
    typeof windowRef.setTimeout === "function"
      ? windowRef.setTimeout.bind(windowRef)
      : globalThis.setTimeout.bind(globalThis);
  const clearTimeoutFn =
    typeof windowRef.clearTimeout === "function"
      ? windowRef.clearTimeout.bind(windowRef)
      : globalThis.clearTimeout.bind(globalThis);
  const dateNow = typeof options.dateNow === "function" ? options.dateNow : () => Date.now();
  const api = options.api || {};
  const defaultDeckId = String(options.defaultDeckId || "default").trim() || "default";
  const getTerminalSettings =
    typeof options.getTerminalSettings === "function"
      ? options.getTerminalSettings
      : () => options.terminalSettings || { cols: 80, rows: 20 };
  const getPreferredActiveDeckId = options.getPreferredActiveDeckId || (() => defaultDeckId);
  const getRuntimeBootstrapSource = options.getRuntimeBootstrapSource || (() => "pending");
  const setDecks = options.setDecks || (() => {});
  const setSessions = options.setSessions || (() => {});
  const setUiError = options.setUiError || (() => {});
  const markRuntimeBootstrapReady = options.markRuntimeBootstrapReady || (() => {});
  const debugLog = options.debugLog || (() => {});
  const setAccessState = typeof options.setAccessState === "function" ? options.setAccessState : () => {};
  const devAuthRefreshMinDelayMs = Number(options.devAuthRefreshMinDelayMs) || 15_000;
  const devAuthRefreshSafetyMs = Number(options.devAuthRefreshSafetyMs) || 60_000;
  const devAuthRetryDelayMs = Number(options.devAuthRetryDelayMs) || 30_000;

  let bootstrapPromise = null;
  let wsAuthToken = "";
  let wsAuthTokenExpiresAtMs = 0;
  let authRefreshTimer = null;
  let devAuthRefreshPromise = null;

  function getDefaultDeckPayload() {
    const terminalSettings = getTerminalSettings() || {};
    return [
      {
        id: defaultDeckId,
        name: "Default",
        settings: {
          terminal: {
            cols: terminalSettings.cols,
            rows: terminalSettings.rows
          }
        }
      }
    ];
  }

  function clearAuthRefreshTimer() {
    if (authRefreshTimer === null) {
      return;
    }
    clearTimeoutFn(authRefreshTimer);
    authRefreshTimer = null;
  }

  function scheduleDevAuthRefreshDelay(delayMs) {
    clearAuthRefreshTimer();
    const normalizedDelay = Math.max(devAuthRefreshMinDelayMs, Math.floor(Number(delayMs) || 0));
    authRefreshTimer = setTimeoutFn(() => {
      bootstrapDevAuthToken({ reason: "scheduled-refresh" }).catch(() => {});
    }, normalizedDelay);
  }

  function scheduleDevAuthRefresh(expiresInSeconds) {
    const seconds = Number(expiresInSeconds);
    if (!Number.isFinite(seconds) || seconds <= 0 || !wsAuthToken) {
      clearAuthRefreshTimer();
      wsAuthTokenExpiresAtMs = 0;
      return;
    }
    const ttlMs = Math.max(1_000, Math.floor(seconds * 1_000));
    wsAuthTokenExpiresAtMs = dateNow() + ttlMs;
    scheduleDevAuthRefreshDelay(ttlMs - devAuthRefreshSafetyMs);
  }

  async function bootstrapRuntimeFallback() {
    if (getRuntimeBootstrapSource() !== "pending") {
      debugLog("runtime.bootstrap.skipped", { reason: "ws_snapshot_already_applied" });
      return;
    }
    if (bootstrapPromise) {
      return bootstrapPromise;
    }
    bootstrapPromise = (async () => {
      try {
        debugLog("runtime.bootstrap.start");
        const [decksResult, sessionsResult] = await Promise.allSettled([api.listDecks(), api.listSessions()]);

        if (getRuntimeBootstrapSource() === "ws") {
          debugLog("runtime.bootstrap.skipped", { reason: "ws_snapshot_already_applied" });
          return;
        }

        let hasError = false;
        if (decksResult.status === "fulfilled") {
          setDecks(decksResult.value, { preferredActiveDeckId: getPreferredActiveDeckId() });
        } else {
          hasError = true;
          debugLog("decks.bootstrap.error", {
            message: decksResult.reason instanceof Error ? decksResult.reason.message : String(decksResult.reason)
          });
          setDecks(getDefaultDeckPayload(), { preferredActiveDeckId: defaultDeckId });
        }

        if (sessionsResult.status === "fulfilled") {
          setSessions(sessionsResult.value || []);
        } else {
          hasError = true;
          debugLog("sessions.bootstrap.error", {
            message: sessionsResult.reason instanceof Error ? sessionsResult.reason.message : String(sessionsResult.reason)
          });
        }

        setUiError(hasError ? "Failed to fully load runtime state." : "");
        debugLog("runtime.bootstrap.ok", {
          decksLoaded: decksResult.status === "fulfilled",
          sessionsLoaded: sessionsResult.status === "fulfilled",
          sessionCount:
            sessionsResult.status === "fulfilled" && Array.isArray(sessionsResult.value) ? sessionsResult.value.length : 0
        });
        markRuntimeBootstrapReady("rest");
      } catch (err) {
        debugLog("runtime.bootstrap.error", {
          message: err instanceof Error ? err.message : String(err)
        });
        setUiError("Failed to load runtime state.");
        markRuntimeBootstrapReady("rest");
      } finally {
        bootstrapPromise = null;
      }
    })();
    return bootstrapPromise;
  }

  async function bootstrapDevAuthToken(options = {}) {
    if (devAuthRefreshPromise) {
      return devAuthRefreshPromise;
    }
    const reason = typeof options.reason === "string" && options.reason ? options.reason : "bootstrap";
    const shareToken = getShareTokenFromLocation(windowRef);
    if (shareToken) {
      wsAuthToken = shareToken;
      api.setAuthToken(wsAuthToken);
      clearAuthRefreshTimer();
      wsAuthTokenExpiresAtMs = 0;
      setAccessState(parseAccessStateFromToken(shareToken));
      debugLog("auth.share_token.ok", { reason });
      return true;
    }
    devAuthRefreshPromise = (async () => {
      try {
        const payload = await api.createDevToken();
        if (payload && typeof payload.accessToken === "string" && payload.accessToken.trim()) {
          wsAuthToken = payload.accessToken.trim();
          api.setAuthToken(wsAuthToken);
          scheduleDevAuthRefresh(payload.expiresIn);
          setAccessState(parseAccessStateFromToken(wsAuthToken));
          debugLog("auth.dev_token.ok", {
            reason,
            expiresIn: payload.expiresIn || 0,
            scope: payload.scope || "",
            refreshAtMs: wsAuthTokenExpiresAtMs
          });
          return true;
        }
      } catch (err) {
        const status = err && typeof err.status === "number" ? err.status : 0;
        if (status === 404 || status === 405) {
          clearAuthRefreshTimer();
          wsAuthTokenExpiresAtMs = 0;
          setAccessState({
            accessMode: "operator",
            readOnly: false,
            shareLinkId: "",
            targetType: "",
            targetId: "",
            summary: ""
          });
          debugLog("auth.dev_token.unavailable", { reason });
          return false;
        }
        scheduleDevAuthRefreshDelay(devAuthRetryDelayMs);
        debugLog("auth.dev_token.error", {
          reason,
          status,
          message: err instanceof Error ? err.message : String(err)
        });
        return false;
      } finally {
        devAuthRefreshPromise = null;
      }
      scheduleDevAuthRefreshDelay(devAuthRetryDelayMs);
      return false;
    })();
    return devAuthRefreshPromise;
  }

  function hasBootstrapInFlight() {
    return bootstrapPromise !== null;
  }

  function getWsAuthToken() {
    return wsAuthToken;
  }

  function dispose() {
    clearAuthRefreshTimer();
  }

  return {
    bootstrapRuntimeFallback,
    bootstrapDevAuthToken,
    hasBootstrapInFlight,
    getWsAuthToken,
    dispose
  };
}
