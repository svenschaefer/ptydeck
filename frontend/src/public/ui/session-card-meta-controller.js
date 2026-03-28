export function createSessionCardMetaController(options = {}) {
  const normalizeSessionTags =
    typeof options.normalizeSessionTags === "function" ? options.normalizeSessionTags : (tags) => (Array.isArray(tags) ? tags : []);

  function setSettingsStatus(entry, text, kind = "") {
    if (!entry?.settingsStatus) {
      return;
    }
    entry.settingsStatus.textContent = String(text || "");
    entry.settingsStatus.classList.toggle("dirty", kind === "dirty");
    entry.settingsStatus.classList.toggle("saved", kind === "saved");
  }

  function setSettingsDirty(entry, dirty) {
    if (!entry) {
      return;
    }
    entry.settingsDirty = Boolean(dirty);
    if (entry.settingsApplyBtn) {
      entry.settingsApplyBtn.disabled = !entry.settingsDirty;
    }
    if (entry.settingsDirty) {
      setSettingsStatus(entry, "Unsaved changes", "dirty");
      return;
    }
    setSettingsStatus(entry, "Saved", "saved");
  }

  function hasMetaContent(entry) {
    const hasNote =
      Boolean(entry?.sessionNoteEl) &&
      entry.sessionNoteEl.hidden !== true &&
      String(entry.sessionNoteEl.textContent || "").trim().length > 0;
    const hasTags =
      Boolean(entry?.tagListEl) &&
      !entry.tagListEl.classList?.contains?.("empty") &&
      String(entry.tagListEl.textContent || "").trim().length > 0;
    return hasNote || hasTags;
  }

  function syncMetaRowVisibility(entry) {
    if (!entry?.sessionMetaRowEl) {
      return;
    }
    entry.sessionMetaRowEl.hidden = !hasMetaContent(entry);
  }

  function renderSessionTagList(entry, session) {
    if (!entry?.tagListEl) {
      return;
    }
    const tags = normalizeSessionTags(session?.tags);
    const nextText = tags.map((tag) => `#${tag}`).join(" ");
    entry.tagListEl.textContent = nextText;
    entry.tagListEl.title = nextText;
    entry.tagListEl.classList.toggle("empty", tags.length === 0);
    syncMetaRowVisibility(entry);
  }

  function renderSessionNote(entry, session) {
    if (!entry?.sessionNoteEl) {
      return;
    }
    const note = typeof session?.note === "string" ? session.note.trim() : "";
    const firstLine = note.split("\n", 1)[0] || "";
    const displayNote = note.includes("\n") ? `${firstLine}...` : firstLine;
    entry.sessionNoteEl.hidden = !note;
    entry.sessionNoteEl.textContent = displayNote;
    entry.sessionNoteEl.title = note;
    syncMetaRowVisibility(entry);
  }

  return {
    setSettingsStatus,
    setSettingsDirty,
    renderSessionTagList,
    renderSessionNote,
    syncMetaRowVisibility
  };
}
