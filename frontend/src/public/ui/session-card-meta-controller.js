function normalizeDurationStatus(statusText) {
  const match = String(statusText || "").match(/^(.*\()(?:(\d+)m\s*)?(\d{1,2})s([^)]+\))$/);
  if (!match) {
    return null;
  }
  const minutes = match[2] ? Number.parseInt(match[2], 10) : 0;
  const secondsPart = Number.parseInt(match[3], 10);
  return {
    prefix: match[1],
    seconds: minutes * 60 + secondsPart,
    suffix: match[4]
  };
}

export function createSessionCardMetaController(options = {}) {
  const normalizeSessionTags =
    typeof options.normalizeSessionTags === "function" ? options.normalizeSessionTags : (tags) => (Array.isArray(tags) ? tags : []);
  const onTick = typeof options.onTick === "function" ? options.onTick : () => {};
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const win = options.windowRef || (typeof window !== "undefined" ? window : null);
  const durationAnchors = new Map();
  let statusTickerTimer = null;

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

  function renderSessionTagList(entry, session) {
    if (!entry?.tagListEl) {
      return;
    }
    const tags = normalizeSessionTags(session?.tags);
    entry.tagListEl.textContent = tags.map((tag) => `#${tag}`).join(" ");
    entry.tagListEl.classList.toggle("empty", tags.length === 0);
  }

  function renderSessionPluginBadges(entry, session) {
    if (!entry?.pluginBadgesEl) {
      return;
    }
    const badges = Array.isArray(session?.pluginBadges) ? session.pluginBadges.filter((badge) => badge && badge.text) : [];
    entry.pluginBadgesEl.textContent = badges.map((badge) => badge.text).join(" · ");
    entry.pluginBadgesEl.classList.toggle("empty", badges.length === 0);
  }

  function formatLiveSessionStatus(session) {
    const rawStatus = typeof session?.statusText === "string" ? session.statusText.trim() : "";
    if (!rawStatus) {
      durationAnchors.delete(session?.id);
      return "";
    }
    const parsed = normalizeDurationStatus(rawStatus);
    if (!parsed || !Number.isFinite(parsed.seconds) || session?.interpretationState !== "working") {
      durationAnchors.delete(session?.id);
      return rawStatus;
    }
    const sessionId = String(session?.id || "");
    if (!sessionId) {
      return rawStatus;
    }
    const nowMs = now();
    const existing = durationAnchors.get(sessionId);
    if (!existing || existing.rawStatus !== rawStatus) {
      durationAnchors.set(sessionId, {
        rawStatus,
        baseSeconds: parsed.seconds,
        baseAtMs: nowMs,
        prefix: parsed.prefix,
        suffix: parsed.suffix
      });
      return rawStatus;
    }
    const elapsedSeconds = Math.max(0, Math.floor((nowMs - existing.baseAtMs) / 1000));
    return `${existing.prefix}${existing.baseSeconds + elapsedSeconds}s${existing.suffix}`;
  }

  function hasLiveDurationStatus(session) {
    const rawStatus = typeof session?.statusText === "string" ? session.statusText.trim() : "";
    if (!rawStatus || session?.interpretationState !== "working") {
      return false;
    }
    const parsed = normalizeDurationStatus(rawStatus);
    return Boolean(parsed && Number.isFinite(parsed.seconds));
  }

  function syncStatusTicker(sessions) {
    const shouldTick = Array.isArray(sessions) && sessions.some((session) => hasLiveDurationStatus(session));
    if (shouldTick && statusTickerTimer === null) {
      statusTickerTimer = setInterval(() => {
        if (win?.document?.hidden === true) {
          return;
        }
        onTick();
      }, 1000);
      return;
    }
    if (!shouldTick && statusTickerTimer !== null) {
      clearInterval(statusTickerTimer);
      statusTickerTimer = null;
    }
  }

  function renderSessionStatus(entry, session) {
    if (!entry?.sessionStatusEl) {
      return;
    }
    const statusText = formatLiveSessionStatus(session);
    entry.sessionStatusEl.hidden = !statusText;
    entry.sessionStatusEl.textContent = statusText;
  }

  function renderSessionArtifacts(entry, session) {
    if (!entry?.sessionArtifactsEl) {
      return;
    }
    const artifacts = Array.isArray(session?.artifacts) ? session.artifacts.filter((artifact) => artifact && artifact.title) : [];
    const artifactText = artifacts.map((artifact) => `${artifact.title}: ${artifact.text}`).join("\n\n");
    const nextKey = artifactText.trim();

    if (!nextKey) {
      entry.artifactRenderKey = "";
      entry.dismissedArtifactKey = "";
      entry.sessionArtifactsEl.hidden = true;
      entry.sessionArtifactsEl.textContent = "";
      if (entry.sessionArtifactsOverlayEl) {
        entry.sessionArtifactsOverlayEl.hidden = true;
      }
      return;
    }

    const previousKey = typeof entry.artifactRenderKey === "string" ? entry.artifactRenderKey : "";
    if (previousKey !== nextKey) {
      entry.dismissedArtifactKey = "";
    }
    entry.artifactRenderKey = nextKey;

    const hidden = entry.dismissedArtifactKey === nextKey;
    entry.sessionArtifactsEl.hidden = hidden;
    entry.sessionArtifactsEl.textContent = artifactText;
    if (entry.sessionArtifactsOverlayEl) {
      entry.sessionArtifactsOverlayEl.hidden = hidden;
    }
  }

  function clearSessionStatusAnchor(sessionId) {
    durationAnchors.delete(sessionId);
  }

  return {
    setSettingsStatus,
    setSettingsDirty,
    renderSessionTagList,
    renderSessionPluginBadges,
    renderSessionStatus,
    renderSessionArtifacts,
    syncStatusTicker,
    clearSessionStatusAnchor
  };
}
