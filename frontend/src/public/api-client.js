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

export function createApiClient(baseUrl) {
  return {
    /** @returns {Promise<Session[]>} */
    async listSessions() {
      const res = await fetch(`${baseUrl}/sessions`);
      return readResponse(res);
    },
    /** @returns {Promise<Session>} */
    async createSession(payload = {}) {
      const res = await fetch(`${baseUrl}/sessions`, withJson(payload));
      return readResponse(res);
    },
    /** @returns {Promise<Session>} */
    async getSession(sessionId) {
      const res = await fetch(`${baseUrl}/sessions/${sessionId}`);
      return readResponse(res);
    },
    async deleteSession(sessionId) {
      const res = await fetch(`${baseUrl}/sessions/${sessionId}`, { method: "DELETE" });
      await readResponse(res, { expectJson: false });
    },
    async sendInput(sessionId, data) {
      const res = await fetch(`${baseUrl}/sessions/${sessionId}/input`, withJson({ data }));
      await readResponse(res, { expectJson: false });
    },
    async resizeSession(sessionId, cols, rows) {
      const res = await fetch(`${baseUrl}/sessions/${sessionId}/resize`, withJson({ cols, rows }));
      await readResponse(res, { expectJson: false });
    }
  };
}
