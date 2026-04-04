export function createSessionSettingsDialogController(options = {}) {
  const windowRef = options.windowRef || (typeof window !== "undefined" ? window : null);
  const confirmAction =
    typeof options.confirmAction === "function"
      ? options.confirmAction
      : async ({ message = "" } = {}) => {
          if (!windowRef || typeof windowRef.confirm !== "function") {
            return true;
          }
          return windowRef.confirm(message);
        };

  function open(dialog) {
    if (!dialog) {
      return;
    }
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) {
        dialog.showModal();
      }
      return;
    }
    dialog.open = true;
    if (dialog.classList && typeof dialog.classList.add === "function") {
      dialog.classList.add("open");
    }
  }

  function close(dialog) {
    if (!dialog) {
      return;
    }
    if (typeof dialog.close === "function") {
      if (dialog.open) {
        dialog.close();
      }
      return;
    }
    dialog.open = false;
    if (dialog.classList && typeof dialog.classList.remove === "function") {
      dialog.classList.remove("open");
    }
  }

  function toggle(dialog) {
    if (!dialog) {
      return;
    }
    if (dialog.open) {
      close(dialog);
      return;
    }
    open(dialog);
  }

  async function confirmSessionDelete(session) {
    const sessionLabel = String(session?.name || session?.id || "").trim() || "this session";
    const message = `Delete session '${sessionLabel}' permanently?`;
    return confirmAction({
      title: "Delete Session",
      message,
      confirmLabel: "Delete"
    });
  }

  return {
    open,
    close,
    toggle,
    confirmSessionDelete
  };
}
