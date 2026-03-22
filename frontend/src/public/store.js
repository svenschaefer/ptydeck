export function createStore() {
  const state = {
    sessions: [],
    activeSessionId: null,
    connectionState: "connecting"
  };

  const listeners = new Set();

  function set(partial) {
    Object.assign(state, partial);
    for (const listener of listeners) {
      listener({ ...state });
    }
  }

  return {
    getState() {
      return { ...state };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setSessions(sessions) {
      const activeSessionId =
        state.activeSessionId && sessions.some((s) => s.id === state.activeSessionId)
          ? state.activeSessionId
          : sessions[0]?.id || null;
      if (state.sessions === sessions && state.activeSessionId === activeSessionId) {
        return;
      }
      set({ sessions, activeSessionId });
    },
    setActiveSession(sessionId) {
      if (state.activeSessionId === sessionId) {
        return;
      }
      set({ activeSessionId: sessionId });
    },
    setConnectionState(connectionState) {
      if (state.connectionState === connectionState) {
        return;
      }
      set({ connectionState });
    }
  };
}
