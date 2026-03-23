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
  let authToken = typeof options.authToken === "string" ? options.authToken.trim() : "";

  async function request(path, fetchOptions = {}, { expectJson = true } = {}) {
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
    async createDevToken(payload = {}) {
      return request("/auth/dev-token", withJson(payload));
    },
    async upsertCustomCommand(commandName, content) {
      return request(`/custom-commands/${encodeURIComponent(commandName)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content })
      });
    },
    async listCustomCommands() {
      return request("/custom-commands");
    },
    async getCustomCommand(commandName) {
      return request(`/custom-commands/${encodeURIComponent(commandName)}`);
    },
    async deleteCustomCommand(commandName) {
      await request(`/custom-commands/${encodeURIComponent(commandName)}`, { method: "DELETE" }, { expectJson: false });
    }
  };
}
