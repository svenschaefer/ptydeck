function defaultNormalizeText(value) {
  return String(value || "").trim();
}

function defaultNormalizeLower(value) {
  return defaultNormalizeText(value).toLowerCase();
}

function formatSshTrustRecordLabel(record) {
  if (!record) {
    return "";
  }
  return `${record.keyType} · ${record.fingerprintSha256}`;
}

export function normalizeSshTrustEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  const id = defaultNormalizeText(entry.id);
  const host = defaultNormalizeText(entry.host);
  const port = Number.parseInt(String(entry.port ?? ""), 10);
  const keyType = defaultNormalizeText(entry.keyType);
  const publicKey = defaultNormalizeText(entry.publicKey);
  const fingerprintSha256 = defaultNormalizeText(entry.fingerprintSha256);
  if (!id || !host || !Number.isInteger(port) || port < 1 || port > 65535 || !keyType || !publicKey || !fingerprintSha256) {
    return null;
  }
  return {
    id,
    host,
    port,
    keyType,
    publicKey,
    fingerprintSha256,
    createdAt: Number.isInteger(entry.createdAt) ? entry.createdAt : 0,
    updatedAt: Number.isInteger(entry.updatedAt) ? entry.updatedAt : 0
  };
}

export function normalizeSshTrustEntryCollection(entries) {
  const next = [];
  const seen = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const normalized = normalizeSshTrustEntry(entry);
    if (!normalized || seen.has(normalized.id)) {
      continue;
    }
    seen.add(normalized.id);
    next.push(normalized);
  }
  next.sort((left, right) => {
    const hostCompare = left.host.localeCompare(right.host, "en-US", { sensitivity: "base" });
    if (hostCompare !== 0) {
      return hostCompare;
    }
    if (left.port !== right.port) {
      return left.port - right.port;
    }
    const keyTypeCompare = left.keyType.localeCompare(right.keyType, "en-US", { sensitivity: "base" });
    if (keyTypeCompare !== 0) {
      return keyTypeCompare;
    }
    return left.id.localeCompare(right.id, "en-US", { sensitivity: "base" });
  });
  return next;
}

export function normalizeSshHostKeyProbeCandidate(entry) {
  const normalizedTrustEntry = normalizeSshTrustEntry({
    ...entry,
    id:
      defaultNormalizeText(entry?.id) ||
      `${defaultNormalizeText(entry?.host)}:${Number.parseInt(String(entry?.port ?? ""), 10)}:${defaultNormalizeText(entry?.keyType)}:${defaultNormalizeText(entry?.fingerprintSha256)}`
  });
  if (!normalizedTrustEntry) {
    return null;
  }
  return {
    id: normalizedTrustEntry.id,
    host: normalizedTrustEntry.host,
    port: normalizedTrustEntry.port,
    keyType: normalizedTrustEntry.keyType,
    publicKey: normalizedTrustEntry.publicKey,
    fingerprintSha256: normalizedTrustEntry.fingerprintSha256
  };
}

export function normalizeSshHostKeyProbeCandidateCollection(entries) {
  const next = [];
  const seen = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const normalized = normalizeSshHostKeyProbeCandidate(entry);
    if (!normalized || seen.has(normalized.id)) {
      continue;
    }
    seen.add(normalized.id);
    next.push(normalized);
  }
  next.sort((left, right) => {
    const keyTypeCompare = left.keyType.localeCompare(right.keyType, "en-US", { sensitivity: "base" });
    if (keyTypeCompare !== 0) {
      return keyTypeCompare;
    }
    return left.fingerprintSha256.localeCompare(right.fingerprintSha256, "en-US", { sensitivity: "base" });
  });
  return next;
}

export function formatSshTarget(host, port, username) {
  const normalizedHost = defaultNormalizeText(host) || "?";
  const normalizedPort = Number.isInteger(Number(port)) ? Number(port) : 22;
  const normalizedUsername = defaultNormalizeText(username);
  return `${normalizedUsername ? `${normalizedUsername}@` : ""}${normalizedHost}:${normalizedPort}`;
}

export function getSshTrustTargetKey(target) {
  const host = defaultNormalizeText(target?.host);
  const port = Number.parseInt(String(target?.port ?? 22), 10);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    return "";
  }
  return `${host}:${port}`;
}

export function normalizeSshTrustTargetInput(target, label = "SSH target") {
  const host = defaultNormalizeText(target?.host);
  const port = Number.parseInt(String(target?.port ?? 22), 10);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${label} must include a valid host and port.`);
  }
  return { host, port };
}

export function isSameSshTrustTarget(left, right) {
  const leftKey = getSshTrustTargetKey(left);
  return leftKey && leftKey === getSshTrustTargetKey(right);
}

export function isSshTrustConflictError(error) {
  const status = Number.parseInt(String(error?.status ?? ""), 10);
  const code = defaultNormalizeText(error?.error);
  return status === 409 && code === "SshHostKeyTrustConflict";
}

export function buildSshTrustGuidance({
  isSsh,
  target,
  matchingTrustEntries,
  probeCandidates,
  conflictEntry
}) {
  if (!isSsh) {
    return "SSH trust entries are only used for SSH profiles.";
  }
  if (!target) {
    return "Enter an SSH host and port to manage host-key trust.";
  }
  const targetLabel = formatSshTarget(target.host, target.port);
  if (conflictEntry) {
    return `Rotation review for ${targetLabel}: verify the trusted and fetched fingerprints below, then replace the stored trust entry only if the new fingerprint is expected.`;
  }
  if (matchingTrustEntries.length === 0 && probeCandidates.length === 0) {
    return `First connect for ${targetLabel}: fetch host keys, verify the expected fingerprint out of band, then trust the matching key before launching.`;
  }
  if (matchingTrustEntries.length === 0) {
    return `First connect for ${targetLabel}: ${probeCandidates.length} fetched host key candidate(s) are ready for review. Trust only the fingerprint that matches your server.`;
  }
  if (probeCandidates.length > 0) {
    return `${targetLabel} already has ${matchingTrustEntries.length} trusted key(s). Compare the fetched candidate before trusting an additional key or rotating an existing one.`;
  }
  return `Trusted host keys for ${targetLabel} are stored separately from the saved connection profile. Refresh, delete obsolete entries, or fetch current host keys when you suspect rotation.`;
}

export function buildSshTrustStatus({
  isSsh,
  target,
  matchingTrustEntries,
  probeCandidates,
  conflictEntry,
  probing
}) {
  if (!isSsh) {
    return "SSH trust entries are only used for SSH profiles.";
  }
  if (!target) {
    return "Enter an SSH host to manage trusted host keys.";
  }
  const targetLabel = formatSshTarget(target.host, target.port);
  if (probing) {
    return `Fetching host keys for ${targetLabel}...`;
  }
  if (conflictEntry) {
    return `Rotation candidate ready for ${targetLabel}`;
  }
  if (matchingTrustEntries.length === 0 && probeCandidates.length > 0) {
    return `First connect pending for ${targetLabel}`;
  }
  if (matchingTrustEntries.length === 0) {
    return `No trusted host key stored for ${targetLabel}`;
  }
  if (probeCandidates.length > 0) {
    return `${matchingTrustEntries.length} trusted · ${probeCandidates.length} fetched for ${targetLabel}`;
  }
  return `${matchingTrustEntries.length} trusted key(s) for ${targetLabel}`;
}

export function buildSshTrustConflictFeedback(target, conflictEntry, probeCandidate) {
  return `SSH host-key rotation review required for ${formatSshTarget(
    target.host,
    target.port
  )}. Trusted ${conflictEntry.keyType} fingerprint ${conflictEntry.fingerprintSha256} conflicts with fetched ${probeCandidate.fingerprintSha256}. Verify both fingerprints, then use Replace Trusted Key if the change is expected.`;
}

export function resolveSshTrustRecord(records, selectorText, {
  emptyError,
  ambiguousLabel
} = {}) {
  const candidates = Array.isArray(records) ? records.filter(Boolean) : [];
  if (candidates.length === 0) {
    return {
      record: null,
      error: emptyError || "No SSH host keys are available for this target."
    };
  }
  const selector = defaultNormalizeText(selectorText);
  if (!selector) {
    if (candidates.length === 1) {
      return { record: candidates[0], error: "" };
    }
    return {
      record: null,
      error:
        ambiguousLabel ||
        `Multiple SSH host keys match this target. Specify one by key type or fingerprint: ${candidates
          .map((entry) => formatSshTrustRecordLabel(entry))
          .join(", ")}.`
    };
  }
  const normalizedSelector = selector.toLowerCase();
  const matchBy = (predicate) => {
    const next = [];
    const seen = new Set();
    for (const candidate of candidates) {
      const keys = [
        candidate.id,
        candidate.keyType,
        candidate.fingerprintSha256,
        `${candidate.keyType}:${candidate.fingerprintSha256}`
      ]
        .map((value) => defaultNormalizeText(value).toLowerCase())
        .filter(Boolean);
      if (keys.some((key) => predicate(key))) {
        if (!seen.has(candidate.id)) {
          seen.add(candidate.id);
          next.push(candidate);
        }
      }
    }
    return next;
  };
  const exactMatches = matchBy((key) => key === normalizedSelector);
  if (exactMatches.length === 1) {
    return { record: exactMatches[0], error: "" };
  }
  if (exactMatches.length > 1) {
    return {
      record: null,
      error: `SSH host-key selector '${selector}' is ambiguous. Use a full key type or fingerprint.`
    };
  }
  const prefixMatches = matchBy((key) => key.startsWith(normalizedSelector));
  if (prefixMatches.length === 1) {
    return { record: prefixMatches[0], error: "" };
  }
  if (prefixMatches.length > 1) {
    return {
      record: null,
      error:
        ambiguousLabel ||
        `SSH host-key selector '${selector}' is ambiguous. Matches: ${prefixMatches.map((entry) => formatSshTrustRecordLabel(entry)).join(", ")}.`
    };
  }
  return {
    record: null,
    error: `No SSH host key matches '${selector}' for this target.`
  };
}

export function buildMissingSshTrustRecoveryMessage(target, launchContext, candidates) {
  const commandTarget = formatSshTarget(target.host, target.port);
  const candidateLines = Array.isArray(candidates) && candidates.length > 0
    ? candidates.map((candidate) => `- ${formatSshTrustRecordLabel(candidate)}`).join("\n")
    : "- No SSH host keys were fetched for this target.";
  const relaunchInstruction = launchContext?.seedDraftOnMissingTrust === true
    ? "Then rerun the same `/ssh ...` command."
    : "Then launch this SSH connection again.";
  return [
    `No trusted host key is stored for ${commandTarget}.`,
    `Fetched ${Array.isArray(candidates) ? candidates.length : 0} SSH host key candidate(s):`,
    candidateLines,
    `Verify the expected fingerprint, then trust one with \`/ssh hostkey trust ${commandTarget} <keyType|fingerprint>\`.`,
    `List stored trust entries with \`/ssh hostkey list ${commandTarget}\` or probe again with \`/ssh hostkey probe ${commandTarget}\`.`,
    relaunchInstruction
  ].join("\n");
}

export function createConnectionProfileSshLifecycle(options = {}) {
  const api = options.api || {};
  const defaultDeckId = options.defaultDeckId || "default";
  const normalizeText = typeof options.normalizeText === "function" ? options.normalizeText : defaultNormalizeText;
  const normalizeLower = typeof options.normalizeLower === "function" ? options.normalizeLower : defaultNormalizeLower;
  const authMethodRequiresSecret =
    typeof options.authMethodRequiresSecret === "function" ? options.authMethodRequiresSecret : () => false;
  const requestSecret = typeof options.requestSecret === "function" ? options.requestSecret : null;
  const describeSshLaunchContext =
    typeof options.describeSshLaunchContext === "function"
      ? options.describeSshLaunchContext
      : () => ({ label: "SSH launch", target: formatSshTarget("?", 22) });
  const getErrorMessage = typeof options.getErrorMessage === "function" ? options.getErrorMessage : (_, fallback) => fallback;
  const getState = typeof options.getState === "function" ? options.getState : () => ({});
  const updateState = typeof options.updateState === "function" ? options.updateState : () => {};
  const getCurrentSshTrustTarget = typeof options.getCurrentSshTrustTarget === "function" ? options.getCurrentSshTrustTarget : () => null;
  const shouldRenderSshTrustTarget =
    typeof options.shouldRenderSshTrustTarget === "function" ? options.shouldRenderSshTrustTarget : () => false;
  const renderDraftComputedState = typeof options.renderDraftComputedState === "function" ? options.renderDraftComputedState : () => {};
  const setCommandFeedback = typeof options.setCommandFeedback === "function" ? options.setCommandFeedback : () => {};
  const setStatus = typeof options.setStatus === "function" ? options.setStatus : () => {};
  const getSshProbeCandidatesForTarget =
    typeof options.getSshProbeCandidatesForTarget === "function" ? options.getSshProbeCandidatesForTarget : () => [];
  const getSshTrustEntriesForTarget =
    typeof options.getSshTrustEntriesForTarget === "function" ? options.getSshTrustEntriesForTarget : () => [];
  const findSshTrustConflictEntry =
    typeof options.findSshTrustConflictEntry === "function" ? options.findSshTrustConflictEntry : () => null;
  const seedDraftOnMissingTrust =
    typeof options.seedDraftOnMissingTrust === "function" ? options.seedDraftOnMissingTrust : () => {};
  const selectProfileForMissingTrust =
    typeof options.selectProfileForMissingTrust === "function" ? options.selectProfileForMissingTrust : () => {};

  function getTrustEntries() {
    return Array.isArray(getState().sshTrustEntries) ? getState().sshTrustEntries : [];
  }

  function getSelectedSshProbeCandidateId() {
    return normalizeText(getState().selectedSshProbeCandidateId);
  }

  function getSelectedSshTrustEntryId() {
    return normalizeText(getState().selectedSshTrustEntryId);
  }

  async function refreshSshTrustEntries(runtimeOptions = {}) {
    if (typeof api.listSshTrustEntries !== "function") {
      updateState({ sshTrustEntries: [] });
      renderDraftComputedState();
      return [];
    }
    if (getState().loadingSshTrustEntries) {
      return getTrustEntries().slice();
    }
    updateState({ loadingSshTrustEntries: true });
    renderDraftComputedState();
    try {
      const payload = await api.listSshTrustEntries();
      const normalizedEntries = normalizeSshTrustEntryCollection(payload);
      updateState({ sshTrustEntries: normalizedEntries });
      renderDraftComputedState();
      return normalizedEntries.slice();
    } catch (error) {
      if (runtimeOptions.silent !== true) {
        throw error;
      }
      return getTrustEntries().slice();
    } finally {
      updateState({ loadingSshTrustEntries: false });
      renderDraftComputedState();
    }
  }

  async function promptForLaunchSecret(profile) {
    if (!authMethodRequiresSecret(profile?.launch?.remoteAuth)) {
      return { ok: true, remoteSecret: undefined, cancelled: false };
    }
    if (!requestSecret) {
      throw new Error("SSH runtime-secret prompt is unavailable.");
    }
    const context = describeSshLaunchContext(profile);
    const secret = await requestSecret({
      title: "SSH Runtime Secret",
      message: `Enter the SSH runtime secret for ${context.label} (${context.target}).`,
      inputLabel: "Runtime Secret",
      placeholder: "Required only for password or keyboard-interactive SSH launches",
      confirmLabel: "Launch SSH",
      cancelLabel: "Cancel"
    });
    if (secret === null || secret === undefined) {
      return { ok: false, remoteSecret: undefined, cancelled: true };
    }
    if (!String(secret).trim()) {
      throw new Error("SSH secret is required for password and keyboard-interactive SSH launches.");
    }
    return { ok: true, remoteSecret: String(secret), cancelled: false };
  }

  async function ensureTrustedHostKeyBeforeLaunch(profile) {
    const launch = profile?.launch;
    if (normalizeLower(launch?.kind) !== "ssh") {
      return "";
    }
    const host = normalizeText(launch?.remoteConnection?.host);
    const port = Number.parseInt(String(launch?.remoteConnection?.port ?? 22), 10);
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("Enter an SSH host and port before launching this SSH connection.");
    }
    const matchingTrustEntries = getTrustEntries().filter((entry) => entry.host === host && entry.port === port);
    if (matchingTrustEntries.length > 0) {
      return "";
    }
    if (profile?.seedDraftOnMissingTrust === true) {
      seedDraftOnMissingTrust(profile, launch, defaultDeckId);
    } else {
      selectProfileForMissingTrust(profile);
    }
    const { candidates } = await probeSshHostKeysForTarget({ host, port }, { auto: true, silent: true });
    throw new Error(buildMissingSshTrustRecoveryMessage({ host, port }, profile, candidates));
  }

  async function probeSshHostKeysForTarget(targetInput, runtimeOptions = {}) {
    const target = normalizeSshTrustTargetInput(targetInput, "SSH host-key target");
    if (typeof api.probeSshHostKeys !== "function") {
      throw new Error("SSH host-key probing is not available.");
    }
    updateState({ probingSshHostKeys: true });
    if (shouldRenderSshTrustTarget(target)) {
      renderDraftComputedState();
    }
    try {
      const payload = await api.probeSshHostKeys({
        host: target.host,
        port: target.port
      });
      const candidates = normalizeSshHostKeyProbeCandidateCollection(payload);
      updateState({
        sshHostKeyProbeCandidates: candidates,
        selectedSshProbeCandidateId: candidates[0]?.id || "",
        sshProbeTargetKey: getSshTrustTargetKey(target)
      });
      if (shouldRenderSshTrustTarget(target)) {
        renderDraftComputedState();
      }
      const feedback = runtimeOptions.auto === true
        ? `Fetched SSH host keys for ${formatSshTarget(target.host, target.port)}. Review the fingerprint and trust the selected key before launching.`
        : `Fetched ${candidates.length} SSH host key(s) for ${formatSshTarget(target.host, target.port)}.`;
      if (runtimeOptions.silent !== true) {
        setCommandFeedback(feedback);
        setStatus(feedback);
      }
      return {
        target,
        candidates: getSshProbeCandidatesForTarget(target),
        feedback
      };
    } finally {
      updateState({ probingSshHostKeys: false });
      if (shouldRenderSshTrustTarget(target)) {
        renderDraftComputedState();
      }
    }
  }

  async function probeSshHostKeysFlow(runtimeOptions = {}) {
    const target = getCurrentSshTrustTarget();
    if (!target) {
      throw new Error("Enter an SSH host and port before fetching host keys.");
    }
    const result = await probeSshHostKeysForTarget(target, runtimeOptions);
    return result.feedback;
  }

  async function saveTrustEntryForTarget(targetInput, selectorText = "", runtimeOptions = {}) {
    const target = normalizeSshTrustTargetInput(targetInput, "SSH host-key target");
    if (typeof api.createSshTrustEntry !== "function") {
      throw new Error("SSH trust entry management is not available.");
    }
    const probeCandidates = getSshProbeCandidatesForTarget(target);
    const selectedProbeCandidate = resolveSshTrustRecord(probeCandidates, selectorText, {
      emptyError: `No fetched SSH host keys are cached for ${formatSshTarget(target.host, target.port)}. Run \`/ssh hostkey probe ${formatSshTarget(
        target.host,
        target.port
      )}\` first.`,
      ambiguousLabel: `Multiple fetched SSH host keys are available for ${formatSshTarget(
        target.host,
        target.port
      )}. Specify one by key type or fingerprint.`
    });
    if (selectedProbeCandidate.error || !selectedProbeCandidate.record) {
      throw new Error(selectedProbeCandidate.error || "Fetch SSH host keys and select the key you want to trust first.");
    }
    const created = await api.createSshTrustEntry({
      host: target.host,
      port: target.port,
      keyType: selectedProbeCandidate.record.keyType,
      publicKey: selectedProbeCandidate.record.publicKey
    });
    const normalizedCreated = normalizeSshTrustEntry(created);
    if (!normalizedCreated) {
      throw new Error("SSH trust entry API returned an invalid trust entry.");
    }
    await refreshSshTrustEntries({ silent: true });
    updateState({
      selectedSshTrustEntryId: normalizedCreated.id,
      selectedSshProbeCandidateId: `${normalizedCreated.host}:${normalizedCreated.port}:${normalizedCreated.keyType}:${normalizedCreated.fingerprintSha256}`
    });
    if (shouldRenderSshTrustTarget(target)) {
      renderDraftComputedState();
    }
    const feedback = `Trusted SSH host key for ${formatSshTarget(target.host, target.port)} (${normalizedCreated.keyType} · ${normalizedCreated.fingerprintSha256}).`;
    if (runtimeOptions.silent !== true) {
      setCommandFeedback(feedback);
      setStatus(feedback);
    }
    return {
      target,
      entry: normalizedCreated,
      feedback
    };
  }

  async function saveTrustEntryFlow() {
    const target = getCurrentSshTrustTarget();
    if (!target) {
      throw new Error("Enter an SSH host and port before trusting a host key.");
    }
    try {
      const result = await saveTrustEntryForTarget(target, getSelectedSshProbeCandidateId());
      return result.feedback;
    } catch (error) {
      if (!isSshTrustConflictError(error)) {
        throw error;
      }
      const selectedProbeCandidate = getSshProbeCandidatesForTarget(target).find((entry) => entry.id === getSelectedSshProbeCandidateId()) || null;
      const conflictEntry = selectedProbeCandidate ? findSshTrustConflictEntry(target, selectedProbeCandidate) : null;
      if (!selectedProbeCandidate || !conflictEntry) {
        throw error;
      }
      const feedback = buildSshTrustConflictFeedback(target, conflictEntry, selectedProbeCandidate);
      setCommandFeedback(feedback);
      setStatus(feedback);
      renderDraftComputedState();
      return feedback;
    }
  }

  async function replaceTrustEntryForTarget(targetInput, selectorText = "", runtimeOptions = {}) {
    const target = normalizeSshTrustTargetInput(targetInput, "SSH host-key target");
    if (typeof api.createSshTrustEntry !== "function" || typeof api.deleteSshTrustEntry !== "function") {
      throw new Error("SSH trust entry replacement is not available.");
    }
    if (runtimeOptions.refresh !== false) {
      await refreshSshTrustEntries({ silent: true });
    }
    const probeCandidates = getSshProbeCandidatesForTarget(target);
    const selectedProbeCandidate = resolveSshTrustRecord(probeCandidates, selectorText, {
      emptyError: `No fetched SSH host keys are cached for ${formatSshTarget(target.host, target.port)}. Run \`/ssh hostkey probe ${formatSshTarget(
        target.host,
        target.port
      )}\` first.`,
      ambiguousLabel: `Multiple fetched SSH host keys are available for ${formatSshTarget(
        target.host,
        target.port
      )}. Specify one by key type or fingerprint.`
    });
    if (selectedProbeCandidate.error || !selectedProbeCandidate.record) {
      throw new Error(selectedProbeCandidate.error || "Fetch SSH host keys and select the key you want to trust first.");
    }
    const conflictEntry = findSshTrustConflictEntry(target, selectedProbeCandidate.record);
    if (!conflictEntry) {
      throw new Error(`No conflicting trusted SSH host key is selected for ${formatSshTarget(target.host, target.port)}.`);
    }
    await api.deleteSshTrustEntry(conflictEntry.id);
    let normalizedCreated = null;
    try {
      const created = await api.createSshTrustEntry({
        host: target.host,
        port: target.port,
        keyType: selectedProbeCandidate.record.keyType,
        publicKey: selectedProbeCandidate.record.publicKey
      });
      normalizedCreated = normalizeSshTrustEntry(created);
      if (!normalizedCreated) {
        throw new Error("SSH trust entry API returned an invalid trust entry.");
      }
    } catch (error) {
      let restored = false;
      try {
        await api.createSshTrustEntry({
          host: conflictEntry.host,
          port: conflictEntry.port,
          keyType: conflictEntry.keyType,
          publicKey: conflictEntry.publicKey
        });
        restored = true;
      } catch {
        restored = false;
      }
      await refreshSshTrustEntries({ silent: true });
      renderDraftComputedState();
      if (restored) {
        throw new Error(
          `Failed to replace trusted SSH host key for ${formatSshTarget(
            target.host,
            target.port
          )}. Restored the previous trusted fingerprint ${conflictEntry.fingerprintSha256}. ${getErrorMessage(
            error,
            "Failed to trust the replacement host key."
          )}`
        );
      }
      throw new Error(
        `Failed to replace trusted SSH host key for ${formatSshTarget(
          target.host,
          target.port
        )}. The previous trusted fingerprint ${conflictEntry.fingerprintSha256} could not be restored automatically. ${getErrorMessage(
          error,
          "Failed to trust the replacement host key."
        )}`
      );
    }
    await refreshSshTrustEntries({ silent: true });
    updateState({
      selectedSshTrustEntryId: normalizedCreated.id,
      selectedSshProbeCandidateId: `${normalizedCreated.host}:${normalizedCreated.port}:${normalizedCreated.keyType}:${normalizedCreated.fingerprintSha256}`
    });
    if (shouldRenderSshTrustTarget(target)) {
      renderDraftComputedState();
    }
    const feedback = `Replaced trusted SSH host key for ${formatSshTarget(
      target.host,
      target.port
    )} (${conflictEntry.keyType}, ${conflictEntry.fingerprintSha256} -> ${normalizedCreated.fingerprintSha256}).`;
    if (runtimeOptions.silent !== true) {
      setCommandFeedback(feedback);
      setStatus(feedback);
    }
    return {
      target,
      previousEntry: conflictEntry,
      entry: normalizedCreated,
      feedback
    };
  }

  async function replaceTrustEntryFlow() {
    const target = getCurrentSshTrustTarget();
    if (!target) {
      throw new Error("Enter an SSH host and port before replacing a trusted host key.");
    }
    const result = await replaceTrustEntryForTarget(target, getSelectedSshProbeCandidateId(), { refresh: false });
    return result.feedback;
  }

  async function listSshTrustEntriesForTarget(targetInput = null, runtimeOptions = {}) {
    if (runtimeOptions.refresh !== false) {
      await refreshSshTrustEntries({ silent: true });
    }
    if (!targetInput) {
      return getTrustEntries().slice();
    }
    const target = normalizeSshTrustTargetInput(targetInput, "SSH host-key target");
    return getSshTrustEntriesForTarget(target);
  }

  async function deleteTrustEntryForTarget(targetInput, selectorText = "", runtimeOptions = {}) {
    const target = normalizeSshTrustTargetInput(targetInput, "SSH host-key target");
    if (typeof api.deleteSshTrustEntry !== "function") {
      throw new Error("SSH trust entry management is not available.");
    }
    if (runtimeOptions.refresh !== false) {
      await refreshSshTrustEntries({ silent: true });
    }
    const selectedEntry = resolveSshTrustRecord(getSshTrustEntriesForTarget(target), selectorText, {
      emptyError: `No trusted SSH host keys are stored for ${formatSshTarget(target.host, target.port)}.`,
      ambiguousLabel: `Multiple trusted SSH host keys are stored for ${formatSshTarget(
        target.host,
        target.port
      )}. Specify one by key type or fingerprint.`
    });
    if (selectedEntry.error || !selectedEntry.record) {
      throw new Error(selectedEntry.error || "Select a trusted SSH host key to delete.");
    }
    await api.deleteSshTrustEntry(selectedEntry.record.id);
    await refreshSshTrustEntries({ silent: true });
    if (getSelectedSshTrustEntryId() === selectedEntry.record.id) {
      updateState({ selectedSshTrustEntryId: "" });
    }
    if (shouldRenderSshTrustTarget(target)) {
      renderDraftComputedState();
    }
    const feedback = selectedEntry.record
      ? `Deleted trusted SSH host key for ${formatSshTarget(selectedEntry.record.host, selectedEntry.record.port)} (${selectedEntry.record.keyType}).`
      : "Deleted trusted SSH host key.";
    if (runtimeOptions.silent !== true) {
      setCommandFeedback(feedback);
      setStatus(feedback);
    }
    return {
      target,
      entry: selectedEntry.record,
      feedback
    };
  }

  async function deleteTrustEntryFlow() {
    if (!getSelectedSshTrustEntryId()) {
      throw new Error("Select a trusted SSH host key to delete.");
    }
    const target = getCurrentSshTrustTarget();
    if (!target) {
      throw new Error("Enter an SSH host and port before deleting a trusted host key.");
    }
    const result = await deleteTrustEntryForTarget(target, getSelectedSshTrustEntryId(), { refresh: false });
    return result.feedback;
  }

  return {
    refreshSshTrustEntries,
    promptForLaunchSecret,
    ensureTrustedHostKeyBeforeLaunch,
    probeSshHostKeysForTarget,
    probeSshHostKeysFlow,
    saveTrustEntryForTarget,
    saveTrustEntryFlow,
    replaceTrustEntryForTarget,
    replaceTrustEntryFlow,
    listSshTrustEntriesForTarget,
    deleteTrustEntryForTarget,
    deleteTrustEntryFlow
  };
}
