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
    dialogEl.classList?.add?.("open");
    return;
  }
  if (typeof dialogEl.close === "function") {
    if (dialogEl.open) {
      dialogEl.close();
    }
    return;
  }
  dialogEl.open = false;
  dialogEl.classList?.remove?.("open");
}

export function createActionDialogController(options = {}) {
  const windowRef = options.windowRef || globalThis.window || null;
  const dialogEl = options.dialogEl || null;
  const titleEl = options.titleEl || null;
  const messageEl = options.messageEl || null;
  const inputWrapEl = options.inputWrapEl || null;
  const inputLabelEl = options.inputLabelEl || null;
  const inputEl = options.inputEl || null;
  const confirmBtn = options.confirmBtn || null;
  const cancelBtn = options.cancelBtn || null;
  const closeBtn = options.closeBtn || null;

  let activeRequest = null;

  function hasDialogUi() {
    return Boolean(dialogEl && confirmBtn && cancelBtn);
  }

  function resetDialogState() {
    if (titleEl) {
      titleEl.textContent = "";
    }
    if (messageEl) {
      messageEl.textContent = "";
    }
    if (inputLabelEl) {
      inputLabelEl.textContent = "Value";
    }
    if (inputEl) {
      inputEl.value = "";
      inputEl.placeholder = "";
    }
    if (inputWrapEl) {
      inputWrapEl.hidden = true;
    }
    if (confirmBtn) {
      confirmBtn.textContent = "Confirm";
    }
    if (cancelBtn) {
      cancelBtn.textContent = "Cancel";
    }
  }

  function resolveRequest(value) {
    const request = activeRequest;
    if (!request) {
      return;
    }
    activeRequest = null;
    resetDialogState();
    setDialogOpen(dialogEl, false);
    request.resolve(value);
  }

  function scheduleFocus(mode) {
    const schedule =
      typeof windowRef?.requestAnimationFrame === "function"
        ? windowRef.requestAnimationFrame.bind(windowRef)
        : (callback) => globalThis.setTimeout(callback, 0);
    schedule(() => {
      if (mode === "text" && inputEl?.focus) {
        inputEl.focus();
        inputEl.select?.();
        return;
      }
      confirmBtn?.focus?.();
    });
  }

  function startRequest(config) {
    if (activeRequest) {
      resolveRequest(activeRequest.mode === "confirm" ? false : null);
    }
    return new Promise((resolve) => {
      activeRequest = {
        mode: config.mode,
        resolve
      };
      if (titleEl) {
        titleEl.textContent = String(config.title || "Confirm");
      }
      if (messageEl) {
        messageEl.textContent = String(config.message || "");
      }
      if (confirmBtn) {
        confirmBtn.textContent = String(config.confirmLabel || "Confirm");
      }
      if (cancelBtn) {
        cancelBtn.textContent = String(config.cancelLabel || "Cancel");
      }
      if (config.mode === "text" && inputWrapEl && inputEl) {
        inputWrapEl.hidden = false;
        if (inputLabelEl) {
          inputLabelEl.textContent = String(config.inputLabel || "Value");
        }
        inputEl.value = String(config.defaultValue || "");
        inputEl.placeholder = String(config.placeholder || "");
      } else if (inputWrapEl) {
        inputWrapEl.hidden = true;
      }
      setDialogOpen(dialogEl, true);
      scheduleFocus(config.mode);
    });
  }

  async function requestText(config = {}) {
    if (!hasDialogUi()) {
      if (typeof windowRef?.prompt === "function") {
        const result = windowRef.prompt(String(config.message || config.title || "Value"), String(config.defaultValue || ""));
        return result === null || result === undefined ? null : String(result);
      }
      return null;
    }
    return startRequest({
      ...config,
      mode: "text"
    });
  }

  async function confirm(config = {}) {
    if (!hasDialogUi()) {
      if (typeof windowRef?.confirm === "function") {
        return windowRef.confirm(String(config.message || config.title || "Are you sure?"));
      }
      return false;
    }
    return startRequest({
      ...config,
      mode: "confirm"
    });
  }

  confirmBtn?.addEventListener?.("click", () => {
    if (!activeRequest) {
      return;
    }
    if (activeRequest.mode === "text") {
      resolveRequest(String(inputEl?.value || ""));
      return;
    }
    resolveRequest(true);
  });

  cancelBtn?.addEventListener?.("click", () => {
    if (!activeRequest) {
      return;
    }
    resolveRequest(activeRequest.mode === "confirm" ? false : null);
  });

  closeBtn?.addEventListener?.("click", () => {
    if (!activeRequest) {
      setDialogOpen(dialogEl, false);
      return;
    }
    resolveRequest(activeRequest.mode === "confirm" ? false : null);
  });

  inputEl?.addEventListener?.("keydown", (event) => {
    if (!activeRequest || activeRequest.mode !== "text") {
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault?.();
      resolveRequest(String(inputEl.value || ""));
    }
  });

  dialogEl?.addEventListener?.("cancel", (event) => {
    event.preventDefault?.();
    if (!activeRequest) {
      setDialogOpen(dialogEl, false);
      return;
    }
    resolveRequest(activeRequest.mode === "confirm" ? false : null);
  });

  return {
    requestText,
    confirm
  };
}
