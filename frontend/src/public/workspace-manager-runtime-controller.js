import { formatConnectionProfileSummary } from "./connection-profile-runtime-controller.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function openDialog(dialogEl) {
  if (!dialogEl) {
    return;
  }
  if (typeof dialogEl.showModal === "function") {
    if (!dialogEl.open) {
      dialogEl.showModal();
    }
    return;
  }
  dialogEl.open = true;
}

function closeDialog(dialogEl) {
  if (!dialogEl) {
    return;
  }
  if (typeof dialogEl.close === "function") {
    if (dialogEl.open) {
      dialogEl.close();
    }
    return;
  }
  dialogEl.open = false;
}

function setButtonActive(button, active) {
  if (!button) {
    return;
  }
  button.classList?.toggle?.("active", active === true);
  if (typeof button.setAttribute === "function") {
    button.setAttribute("aria-selected", active === true ? "true" : "false");
  }
}

function setPanelVisible(panel, visible) {
  if (!panel) {
    return;
  }
  panel.hidden = visible !== true;
}

function formatWorkspacePresetSummary(preset) {
  if (!preset) {
    return "No saved workspace preset selected.";
  }
  const workspace = preset.workspace || {};
  const deckId = normalizeText(workspace.activeDeckId) || "default";
  const layoutProfileId = normalizeText(workspace.layoutProfileId) || "-";
  const deckGroupCount = Object.keys(workspace.deckGroups || {}).length;
  return `[${preset.id}] ${preset.name} · deck=${deckId} · layout=${layoutProfileId} · grouped decks=${deckGroupCount}`;
}

export function createWorkspaceManagerRuntimeController(options = {}) {
  const dialogEl = options.dialogEl || null;
  const openBtn = options.openBtn || null;
  const closeBtn = options.closeBtn || null;
  const metaEl = options.metaEl || null;
  const connectionsTabBtn = options.connectionsTabBtn || null;
  const workspaceTabBtn = options.workspaceTabBtn || null;
  const connectionsPanelEl = options.connectionsPanelEl || null;
  const workspacePanelEl = options.workspacePanelEl || null;
  const connectionSelectEl = options.connectionSelectEl || null;
  const workspacePresetSelectEl = options.workspacePresetSelectEl || null;
  const workspaceGroupSelectEl = options.workspaceGroupSelectEl || null;
  const connectionSummaryEl = options.connectionSummaryEl || null;
  const workspacePresetSummaryEl = options.workspacePresetSummaryEl || null;
  const workspaceGroupSummaryEl = options.workspaceGroupSummaryEl || null;
  const getConnectionProfileRuntimeController =
    typeof options.getConnectionProfileRuntimeController === "function"
      ? options.getConnectionProfileRuntimeController
      : () => null;
  const getWorkspacePresetRuntimeController =
    typeof options.getWorkspacePresetRuntimeController === "function"
      ? options.getWorkspacePresetRuntimeController
      : () => null;
  const getActiveDeckId = typeof options.getActiveDeckId === "function" ? options.getActiveDeckId : () => "default";

  let activeTab = "connections";
  let uiEventsBound = false;

  function setActiveTab(nextTab) {
    activeTab = nextTab === "workspace" ? "workspace" : "connections";
    setButtonActive(connectionsTabBtn, activeTab === "connections");
    setButtonActive(workspaceTabBtn, activeTab === "workspace");
    setPanelVisible(connectionsPanelEl, activeTab === "connections");
    setPanelVisible(workspacePanelEl, activeTab === "workspace");
    if (metaEl) {
      metaEl.textContent =
        activeTab === "connections"
          ? "Create, edit, save, and launch guided local or SSH connection profiles outside the sidebar."
          : "Save/apply full workspace presets and manage deck-local groups outside the sidebar.";
    }
  }

  function open() {
    openDialog(dialogEl);
    setActiveTab(activeTab);
    render();
  }

  function close() {
    closeDialog(dialogEl);
  }

  function render() {
    const connectionController = getConnectionProfileRuntimeController();
    const workspaceController = getWorkspacePresetRuntimeController();
    const selectedConnection = connectionController?.getSelectedProfile?.() || null;
    const selectedPreset = workspaceController?.getSelectedPreset?.() || null;
    const activeDeckId = normalizeText(getActiveDeckId()) || "default";
    const groups = workspaceController?.listGroupsForDeck?.(activeDeckId) || [];
    const activeGroupId = normalizeText(workspaceController?.getActiveGroupIdForDeck?.(activeDeckId) || "");
    const activeGroup = groups.find((group) => normalizeText(group?.id) === activeGroupId) || null;

    if (connectionSummaryEl) {
      connectionSummaryEl.textContent = selectedConnection
        ? formatConnectionProfileSummary(selectedConnection)
        : "No saved connection profile selected.";
    }
    if (workspacePresetSummaryEl) {
      workspacePresetSummaryEl.textContent = formatWorkspacePresetSummary(selectedPreset);
    }
    if (workspaceGroupSummaryEl) {
      workspaceGroupSummaryEl.textContent = activeGroup
        ? `Deck [${activeDeckId}] · active group [${activeGroup.id}] ${activeGroup.name} · ${groups.length} group(s)`
        : `Deck [${activeDeckId}] · no active group · ${groups.length} group(s)`;
    }
  }

  function bindUiEvents() {
    if (uiEventsBound) {
      return;
    }
    uiEventsBound = true;
    openBtn?.addEventListener?.("click", () => {
      open();
    });
    closeBtn?.addEventListener?.("click", () => {
      close();
    });
    connectionsTabBtn?.addEventListener?.("click", () => {
      setActiveTab("connections");
      render();
    });
    workspaceTabBtn?.addEventListener?.("click", () => {
      setActiveTab("workspace");
      render();
    });
    connectionSelectEl?.addEventListener?.("change", () => {
      render();
    });
    workspacePresetSelectEl?.addEventListener?.("change", () => {
      render();
    });
    workspaceGroupSelectEl?.addEventListener?.("change", () => {
      render();
    });
  }

  bindUiEvents();
  setActiveTab(activeTab);
  render();

  return {
    open,
    close,
    setActiveTab,
    bindUiEvents,
    render,
    getActiveTab: () => activeTab
  };
}
