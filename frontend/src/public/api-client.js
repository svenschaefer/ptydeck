/** @typedef {import("./api-types").Session} Session */

class ApiClientError extends Error {
  constructor(message, { status, error, details } = {}) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.error = error;
    this.details = details;
  }
}

function withJson(body) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  };
}

function appendCustomCommandScopeQuery(path, options = {}) {
  const scope = typeof options.scope === "string" ? options.scope.trim() : "";
  const sessionId = typeof options.sessionId === "string" ? options.sessionId.trim() : "";
  if (!scope && !sessionId) {
    return path;
  }
  const search = new URLSearchParams();
  if (scope) {
    search.set("scope", scope);
  }
  if (sessionId) {
    search.set("sessionId", sessionId);
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function readResponse(response, { expectJson = true } = {}) {
  if (!response.ok) {
    const payload = await parseJsonSafe(response);
    const message =
      (payload && typeof payload.message === "string" && payload.message) ||
      `Request failed with status ${response.status}.`;
    const error = payload && typeof payload.error === "string" ? payload.error : "RequestFailed";
    const details = payload && Object.prototype.hasOwnProperty.call(payload, "details") ? payload.details : undefined;
    throw new ApiClientError(message, { status: response.status, error, details });
  }

  if (!expectJson) {
    return undefined;
  }

  return response.json();
}

export function createApiClient(baseUrl, options = {}) {
  const debug = options.debug === true;
  const log = typeof options.log === "function" ? options.log : () => {};
  const onUnauthorized = typeof options.onUnauthorized === "function" ? options.onUnauthorized : null;
  let authToken = typeof options.authToken === "string" ? options.authToken.trim() : "";
  let unauthorizedRefreshPromise = null;
  const readyUrl = new URL("/ready", baseUrl).toString();

  async function tryUnauthorizedRecovery(path) {
    if (!onUnauthorized) {
      return false;
    }
    const normalizedPath = String(path || "");
    if (normalizedPath.startsWith("/auth/")) {
      return false;
    }
    if (unauthorizedRefreshPromise) {
      return unauthorizedRefreshPromise;
    }
    unauthorizedRefreshPromise = (async () => {
      try {
        return (await onUnauthorized()) === true;
      } catch {
        return false;
      } finally {
        unauthorizedRefreshPromise = null;
      }
    })();
    return unauthorizedRefreshPromise;
  }

  async function request(path, fetchOptions = {}, { expectJson = true, retriedUnauthorized = false } = {}) {
    const method = fetchOptions.method || "GET";
    const startedAt = Date.now();
    if (debug) {
      log("api.request.start", { method, path });
    }

    try {
      const headers = {
        ...(fetchOptions.headers || {})
      };
      if (authToken && !headers.authorization) {
        headers.authorization = `Bearer ${authToken}`;
      }
      const res = await fetch(`${baseUrl}${path}`, {
        ...fetchOptions,
        headers
      });
      const data = await readResponse(res, { expectJson });
      if (debug) {
        log("api.request.ok", { method, path, status: res.status, durationMs: Date.now() - startedAt });
      }
      return data;
    } catch (err) {
      if (debug) {
        log("api.request.error", {
          method,
          path,
          durationMs: Date.now() - startedAt,
          message: err instanceof Error ? err.message : String(err)
        });
      }
      if (
        err instanceof ApiClientError &&
        err.status === 401 &&
        retriedUnauthorized !== true
      ) {
        const recovered = await tryUnauthorizedRecovery(path);
        if (recovered) {
          if (debug) {
            log("api.request.retry_after_unauthorized", { method, path });
          }
          return request(path, fetchOptions, { expectJson, retriedUnauthorized: true });
        }
      }
      throw err;
    }
  }

  async function requestAbsolute(url, fetchOptions = {}, { expectJson = true, retriedUnauthorized = false } = {}) {
    const normalizedUrl = String(url || "");
    const method = fetchOptions.method || "GET";
    const startedAt = Date.now();
    if (debug) {
      log("api.request.start", { method, url: normalizedUrl });
    }

    try {
      const headers = {
        ...(fetchOptions.headers || {})
      };
      if (authToken && !headers.authorization) {
        headers.authorization = `Bearer ${authToken}`;
      }
      const res = await fetch(normalizedUrl, {
        ...fetchOptions,
        headers
      });
      const data = await readResponse(res, { expectJson });
      if (debug) {
        log("api.request.ok", { method, url: normalizedUrl, status: res.status, durationMs: Date.now() - startedAt });
      }
      return data;
    } catch (err) {
      if (debug) {
        log("api.request.error", {
          method,
          url: normalizedUrl,
          durationMs: Date.now() - startedAt,
          message: err instanceof Error ? err.message : String(err)
        });
      }
      if (
        err instanceof ApiClientError &&
        err.status === 401 &&
        retriedUnauthorized !== true
      ) {
        const recovered = await tryUnauthorizedRecovery(normalizedUrl);
        if (recovered) {
          if (debug) {
            log("api.request.retry_after_unauthorized", { method, url: normalizedUrl });
          }
          return requestAbsolute(normalizedUrl, fetchOptions, { expectJson, retriedUnauthorized: true });
        }
      }
      throw err;
    }
  }

  return {
    setAuthToken(token) {
      authToken = typeof token === "string" ? token.trim() : "";
    },
    /** @returns {Promise<Session[]>} */
    async listSessions() {
      return request("/sessions");
    },
    async getReadyStatus() {
      return requestAbsolute(readyUrl);
    },
    async listDecks() {
      return request("/decks");
    },
    async createDeck(payload) {
      return request("/decks", withJson(payload || {}));
    },
    async updateDeck(deckId, payload) {
      return request(`/decks/${encodeURIComponent(deckId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload || {})
      });
    },
    async deleteDeck(deckId, options = {}) {
      const force = options && options.force === true ? "true" : "false";
      await request(`/decks/${encodeURIComponent(deckId)}?force=${force}`, { method: "DELETE" }, { expectJson: false });
    },
    async listLayoutProfiles() {
      return request("/layout-profiles");
    },
    async listConnectionProfiles() {
      return request("/connection-profiles");
    },
    async createConnectionProfile(payload) {
      return request("/connection-profiles", withJson(payload || {}));
    },
    async updateConnectionProfile(profileId, payload) {
      return request(`/connection-profiles/${encodeURIComponent(profileId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload || {})
      });
    },
    async deleteConnectionProfile(profileId) {
      await request(`/connection-profiles/${encodeURIComponent(profileId)}`, { method: "DELETE" }, { expectJson: false });
    },
    async createLayoutProfile(payload) {
      return request("/layout-profiles", withJson(payload || {}));
    },
    async updateLayoutProfile(profileId, payload) {
      return request(`/layout-profiles/${encodeURIComponent(profileId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload || {})
      });
    },
    async deleteLayoutProfile(profileId) {
      await request(`/layout-profiles/${encodeURIComponent(profileId)}`, { method: "DELETE" }, { expectJson: false });
    },
    async listWorkspacePresets() {
      return request("/workspace-presets");
    },
    async createWorkspacePreset(payload) {
      return request("/workspace-presets", withJson(payload || {}));
    },
    async updateWorkspacePreset(presetId, payload) {
      return request(`/workspace-presets/${encodeURIComponent(presetId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload || {})
      });
    },
    async deleteWorkspacePreset(presetId) {
      await request(`/workspace-presets/${encodeURIComponent(presetId)}`, { method: "DELETE" }, { expectJson: false });
    },
    async moveSessionToDeck(deckId, sessionId) {
      await request(
        `/decks/${encodeURIComponent(deckId)}/sessions/${encodeURIComponent(sessionId)}:move`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}"
        },
        { expectJson: false }
      );
      return request(`/sessions/${encodeURIComponent(sessionId)}`);
    },
    /** @returns {Promise<Session>} */
    async createSession(payload = {}) {
      return request("/sessions", withJson(payload));
    },
    /** @returns {Promise<Session>} */
    async getSession(sessionId) {
      return request(`/sessions/${sessionId}`);
    },
    async getSessionReplayExport(sessionId) {
      return request(`/sessions/${sessionId}/replay-export`);
    },
    /** @returns {Promise<Session>} */
    async updateSession(sessionId, payload) {
      return request(`/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
    },
    async deleteSession(sessionId) {
      await request(`/sessions/${sessionId}`, { method: "DELETE" }, { expectJson: false });
    },
    async sendInput(sessionId, data) {
      await request(`/sessions/${sessionId}/input`, withJson({ data }), { expectJson: false });
    },
    async resizeSession(sessionId, cols, rows) {
      await request(`/sessions/${sessionId}/resize`, withJson({ cols, rows }), { expectJson: false });
    },
    /** @returns {Promise<Session>} */
    async restartSession(sessionId) {
      return request(`/sessions/${sessionId}/restart`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}"
      });
    },
    async interruptSession(sessionId) {
      await request(`/sessions/${sessionId}/interrupt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}"
      }, { expectJson: false });
    },
    async terminateSession(sessionId) {
      await request(`/sessions/${sessionId}/terminate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}"
      }, { expectJson: false });
    },
    async killSession(sessionId) {
      await request(`/sessions/${sessionId}/kill`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}"
      }, { expectJson: false });
    },
    async createDevToken(payload = {}) {
      return request("/auth/dev-token", withJson(payload));
    },
    async createWsTicket(payload = {}) {
      return request("/auth/ws-ticket", withJson(payload));
    },
    async upsertCustomCommand(commandName, payload) {
      const body =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? payload
          : { content: String(payload || "") };
      return request(`/custom-commands/${encodeURIComponent(commandName)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
    },
    async listCustomCommands(options = {}) {
      return request(appendCustomCommandScopeQuery("/custom-commands", options));
    },
    async getCustomCommand(commandName, options = {}) {
      return request(appendCustomCommandScopeQuery(`/custom-commands/${encodeURIComponent(commandName)}`, options));
    },
    async deleteCustomCommand(commandName, options = {}) {
      await request(
        appendCustomCommandScopeQuery(`/custom-commands/${encodeURIComponent(commandName)}`, options),
        { method: "DELETE" },
        { expectJson: false }
      );
    }
  };
}
