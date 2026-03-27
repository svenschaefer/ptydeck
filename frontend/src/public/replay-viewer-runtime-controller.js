function normalizeText(value) {
  return typeof value === "string" ? value : String(value ?? "");
}

function buildViewerTitle(session, formatSessionToken, formatSessionDisplayName) {
  return `Replay Tail · [${formatSessionToken(session?.id)}] ${formatSessionDisplayName(session)}`;
}

function buildViewerMeta(payload, buildReplayRetentionSummary) {
  const summary = buildReplayRetentionSummary(payload);
  if (!summary) {
    return "Retained replay tail.";
  }
  return `Retained replay tail · ${summary}.`;
}

function buildViewerStatus(payload) {
  const text = normalizeText(payload?.data);
  if (!text) {
    return "No retained replay tail is currently available for this session.";
  }
  if (payload?.truncated === true) {
    return "Output is truncated to the retained replay tail.";
  }
  return "Showing the full retained replay tail currently available.";
}

function setDialogOpen(dialogEl, open) {
  if (!dialogEl) {
    return;
  }
  if (open) {
    if (typeof dialogEl.showModal === "function") {
      if (!dialogEl.open) {
        dialogEl.showModal();
      }
      return;
    }
    dialogEl.open = true;
    if (dialogEl.classList && typeof dialogEl.classList.add === "function") {
      dialogEl.classList.add("open");
    }
    return;
  }

  if (typeof dialogEl.close === "function") {
    if (dialogEl.open) {
      dialogEl.close();
    }
    return;
  }
  dialogEl.open = false;
  if (dialogEl.classList && typeof dialogEl.classList.remove === "function") {
    dialogEl.classList.remove("open");
  }
}

export function createReplayViewerRuntimeController(options = {}) {
  const dialogEl = options.dialogEl || null;
  const titleEl = options.titleEl || null;
  const metaEl = options.metaEl || null;
  const statusEl = options.statusEl || null;
  const contentEl = options.contentEl || null;
  const refreshBtn = options.refreshBtn || null;
  const downloadBtn = options.downloadBtn || null;
  const copyBtn = options.copyBtn || null;
  const closeBtn = options.closeBtn || null;
  const loadSessionReplay =
    typeof options.loadSessionReplay === "function" ? options.loadSessionReplay : async () => ({ data: "" });
  const exportSessionReplay =
    typeof options.exportSessionReplay === "function" ? options.exportSessionReplay : async () => ({ feedback: "" });
  const formatSessionToken =
    typeof options.formatSessionToken === "function" ? options.formatSessionToken : (sessionId) => String(sessionId || "");
  const formatSessionDisplayName =
    typeof options.formatSessionDisplayName === "function"
      ? options.formatSessionDisplayName
      : (session) => String(session?.name || session?.id || "");
  const buildReplayRetentionSummary =
    typeof options.buildReplayRetentionSummary === "function" ? options.buildReplayRetentionSummary : () => "";
  const setCommandFeedback = typeof options.setCommandFeedback === "function" ? options.setCommandFeedback : () => {};
  const getErrorMessage =
    typeof options.getErrorMessage === "function"
      ? options.getErrorMessage
      : (error, fallback) => (error instanceof Error && error.message ? error.message : fallback);

  let activeSession = null;
  let activePayload = null;
  let requestToken = 0;

  function render({ loading = false, error = "" } = {}) {
    if (titleEl) {
      titleEl.textContent = activeSession
        ? buildViewerTitle(activeSession, formatSessionToken, formatSessionDisplayName)
        : "Replay Tail";
    }
    if (metaEl) {
      metaEl.textContent = activePayload ? buildViewerMeta(activePayload, buildReplayRetentionSummary) : "";
    }
    if (statusEl) {
      if (loading) {
        statusEl.textContent = "Loading retained replay tail...";
      } else if (error) {
        statusEl.textContent = error;
      } else {
        statusEl.textContent = activePayload ? buildViewerStatus(activePayload) : "";
      }
    }
    if (contentEl) {
      if (loading) {
        contentEl.textContent = "";
      } else if (error) {
        contentEl.textContent = "";
      } else {
        contentEl.textContent = normalizeText(activePayload?.data);
      }
    }
    if (refreshBtn) {
      refreshBtn.disabled = loading || !activeSession;
    }
    if (downloadBtn) {
      downloadBtn.disabled = loading || !activeSession;
    }
    if (copyBtn) {
      copyBtn.disabled = loading || !activeSession;
    }
  }

  async function refreshActiveSession() {
    if (!activeSession?.id) {
      return null;
    }
    const currentToken = ++requestToken;
    render({ loading: true });
    try {
      const payload = await loadSessionReplay(activeSession);
      if (currentToken !== requestToken) {
        return payload;
      }
      activePayload = payload;
      render({ loading: false });
      return payload;
    } catch (error) {
      if (currentToken !== requestToken) {
        throw error;
      }
      activePayload = null;
      render({ loading: false, error: getErrorMessage(error, "Failed to load retained replay tail.") });
      throw error;
    }
  }

  async function openSessionReplayViewer(session) {
    if (!session?.id) {
      throw new Error("Replay viewer requires a session.");
    }
    activeSession = session;
    activePayload = null;
    setDialogOpen(dialogEl, true);
    await refreshActiveSession();
    return {
      feedback: `Opened replay viewer for [${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}.`
    };
  }

  function closeReplayViewer() {
    requestToken += 1;
    activeSession = null;
    activePayload = null;
    render({ loading: false });
    setDialogOpen(dialogEl, false);
  }

  async function handleExport(mode) {
    if (!activeSession?.id) {
      return null;
    }
    try {
      const outcome = await exportSessionReplay(activeSession, {
        mode,
        payload: activePayload
      });
      if (outcome?.feedback) {
        setCommandFeedback(outcome.feedback);
      }
      render({ loading: false });
      return outcome;
    } catch (error) {
      render({ loading: false, error: getErrorMessage(error, "Replay viewer action failed.") });
      throw error;
    }
  }

  if (refreshBtn && typeof refreshBtn.addEventListener === "function") {
    refreshBtn.addEventListener("click", () => {
      void refreshActiveSession().catch(() => {});
    });
  }
  if (downloadBtn && typeof downloadBtn.addEventListener === "function") {
    downloadBtn.addEventListener("click", () => {
      void handleExport("download").catch(() => {});
    });
  }
  if (copyBtn && typeof copyBtn.addEventListener === "function") {
    copyBtn.addEventListener("click", () => {
      void handleExport("copy").catch(() => {});
    });
  }
  if (closeBtn && typeof closeBtn.addEventListener === "function") {
    closeBtn.addEventListener("click", () => {
      closeReplayViewer();
    });
  }
  if (dialogEl && typeof dialogEl.addEventListener === "function") {
    dialogEl.addEventListener("cancel", (event) => {
      if (event && typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      closeReplayViewer();
    });
  }

  render({ loading: false });

  return {
    openSessionReplayViewer,
    refreshActiveSession,
    closeReplayViewer,
    getActiveSession: () => activeSession,
    getActivePayload: () => activePayload
  };
}
