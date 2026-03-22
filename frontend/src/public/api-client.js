/** @typedef {import("./api-types").Session} Session */

function withJson(body) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  };
}

export function createApiClient(baseUrl) {
  return {
    /** @returns {Promise<Session[]>} */
    async listSessions() {
      const res = await fetch(`${baseUrl}/sessions`);
      return res.json();
    },
    /** @returns {Promise<Session>} */
    async createSession(payload = {}) {
      const res = await fetch(`${baseUrl}/sessions`, withJson(payload));
      return res.json();
    },
    /** @returns {Promise<Session>} */
    async getSession(sessionId) {
      const res = await fetch(`${baseUrl}/sessions/${sessionId}`);
      return res.json();
    },
    async deleteSession(sessionId) {
      await fetch(`${baseUrl}/sessions/${sessionId}`, { method: "DELETE" });
    },
    async sendInput(sessionId, data) {
      await fetch(`${baseUrl}/sessions/${sessionId}/input`, withJson({ data }));
    },
    async resizeSession(sessionId, cols, rows) {
      await fetch(`${baseUrl}/sessions/${sessionId}/resize`, withJson({ cols, rows }));
    }
  };
}
