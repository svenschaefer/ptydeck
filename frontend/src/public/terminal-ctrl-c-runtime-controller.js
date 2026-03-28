function getSessionLabel(session) {
  const name = String(session?.name || "").trim();
  if (name) {
    return name;
  }
  const sessionId = String(session?.id || "").trim();
  return sessionId || "this session";
}

export function createTerminalCtrlCRuntimeController(options = {}) {
  const dialogEl = options.dialogEl || null;
  const messageEl = options.messageEl || null;
  const copyBtn = options.copyBtn || null;
  const cancelBtn = options.cancelBtn || null;

  let pendingResolve = null;

  function setMessage(session) {
    if (!messageEl) {
      return;
    }
    const sessionLabel = getSessionLabel(session);
    messageEl.textContent = `Ctrl-C on ${sessionLabel}: copy the current selection or send terminal cancel?`;
  }

  function closeDialog() {
    if (!dialogEl || typeof dialogEl.close !== "function") {
      return;
    }
    dialogEl.close();
  }

  function resolvePending(action) {
    if (typeof pendingResolve !== "function") {
      return;
    }
    const resolve = pendingResolve;
    pendingResolve = null;
    closeDialog();
    resolve(action);
  }

  function requestIntent({ session } = {}) {
    if (!dialogEl || !copyBtn || !cancelBtn) {
      return Promise.resolve("cancel");
    }
    if (pendingResolve) {
      return Promise.resolve(null);
    }
    setMessage(session);
    if (typeof dialogEl.showModal === "function") {
      dialogEl.showModal();
    } else {
      dialogEl.open = true;
    }
    return new Promise((resolve) => {
      pendingResolve = resolve;
    });
  }

  if (copyBtn && typeof copyBtn.addEventListener === "function") {
    copyBtn.addEventListener("click", () => {
      resolvePending("copy");
    });
  }

  if (cancelBtn && typeof cancelBtn.addEventListener === "function") {
    cancelBtn.addEventListener("click", () => {
      resolvePending("cancel");
    });
  }

  if (dialogEl && typeof dialogEl.addEventListener === "function") {
    dialogEl.addEventListener("cancel", (event) => {
      event.preventDefault?.();
      resolvePending(null);
    });
  }

  return {
    requestIntent
  };
}
