import {
  cloneDraftLaunch,
  formatConnectionProfileSummary,
  getDraftModeMessage,
  normalizeLower,
  normalizeText
} from "./connection-profile-draft-state.js";
import {
  buildSshTrustGuidance,
  buildSshTrustStatus
} from "./connection-profile-ssh-lifecycle.js";

function authMethodRequiresSecret(remoteAuth) {
  const method = normalizeLower(remoteAuth?.method);
  return method === "password" || method === "keyboardinteractive";
}

export function getSshAuthHint(launch) {
  if (normalizeLower(launch?.kind) !== "ssh") {
    return "";
  }
  const method = normalizeLower(launch?.remoteAuth?.method);
  if (method === "password") {
    return "Password auth stores only the method. The password is requested in a masked launch dialog each time you start this SSH connection.";
  }
  if (method === "keyboardinteractive") {
    return "Keyboard-interactive auth stores only the method. The challenge secret is requested in a masked launch dialog each time you start this SSH connection.";
  }
  return "Private-key auth stores only the optional key path. No SSH secret is stored in the saved profile or one-shot launch payload.";
}

export function getSshSecretHint(launch) {
  if (normalizeLower(launch?.kind) !== "ssh") {
    return "";
  }
  return authMethodRequiresSecret(launch?.remoteAuth)
    ? "Launching this SSH connection will request a masked runtime secret right before start."
    : "Launching this SSH connection will use key-based auth without prompting for a runtime secret.";
}

function buildOption(value, label, documentRef, disabled = false) {
  return {
    value,
    label,
    disabled,
    documentRef
  };
}

function findSshTrustConflictEntry(entries, probeCandidate) {
  if (!probeCandidate) {
    return null;
  }
  return (
    (Array.isArray(entries) ? entries : []).find(
      (entry) => entry.keyType === probeCandidate.keyType && entry.publicKey !== probeCandidate.publicKey
    ) || null
  );
}

export function buildConnectionProfileDraftViewState(options = {}) {
  const draftState = options.draftState || null;
  const getProfile = typeof options.getProfile === "function" ? options.getProfile : () => null;
  const selectedProfile = options.selectedProfile || null;
  const currentLaunch = cloneDraftLaunch(options.currentLaunch);
  const pendingDeleteProfileId = normalizeText(options.pendingDeleteProfileId);
  const target = options.target || null;
  const matchingTrustEntries = Array.isArray(options.matchingTrustEntries) ? options.matchingTrustEntries.slice() : [];
  const probeCandidates = Array.isArray(options.probeCandidates) ? options.probeCandidates.slice() : [];
  const documentRef = options.documentRef || null;
  const api = options.api || {};
  const probingSshHostKeys = options.probingSshHostKeys === true;
  const loadingSshTrustEntries = options.loadingSshTrustEntries === true;

  const isSsh = normalizeLower(currentLaunch?.kind) === "ssh";
  const authMethod = normalizeLower(currentLaunch?.remoteAuth?.method) || "privatekey";
  const hasSelectedTrustEntry = matchingTrustEntries.some((entry) => entry.id === normalizeText(options.selectedSshTrustEntryId));
  const selectedSshTrustEntryId = hasSelectedTrustEntry ? normalizeText(options.selectedSshTrustEntryId) : matchingTrustEntries[0]?.id || "";
  const hasSelectedProbeCandidate = probeCandidates.some((entry) => entry.id === normalizeText(options.selectedSshProbeCandidateId));
  const selectedSshProbeCandidateId = hasSelectedProbeCandidate ? normalizeText(options.selectedSshProbeCandidateId) : probeCandidates[0]?.id || "";
  const selectedProbeCandidate = probeCandidates.find((entry) => entry.id === selectedSshProbeCandidateId) || null;
  const selectedTrustEntry = matchingTrustEntries.find((entry) => entry.id === selectedSshTrustEntryId) || null;
  const selectedConflictEntry = findSshTrustConflictEntry(matchingTrustEntries, selectedProbeCandidate);
  const selectedPreview = selectedProbeCandidate || selectedTrustEntry;

  const trustOptions = matchingTrustEntries.length
    ? matchingTrustEntries.map((entry) => buildOption(entry.id, `${entry.keyType} · ${entry.fingerprintSha256}`, documentRef))
    : [
        buildOption(
          "",
          isSsh ? "No trusted keys for this SSH target" : "Switch to SSH to manage trust entries",
          documentRef,
          true
        )
      ];

  const probeOptions = probeCandidates.length
    ? probeCandidates.map((entry) => buildOption(entry.id, `${entry.keyType} · ${entry.fingerprintSha256}`, documentRef))
    : [
        buildOption(
          "",
          isSsh ? "Fetch host keys to review one before trusting it" : "Switch to SSH to fetch host keys",
          documentRef,
          true
        )
      ];

  return {
    summaryText: selectedProfile
      ? formatConnectionProfileSummary(selectedProfile)
      : "No saved connection profile selected. You can still save and launch the draft below.",
    sshFieldsHidden: !isSsh,
    privateKeyFieldHidden: !isSsh || authMethod !== "privatekey",
    authHintText: getSshAuthHint(currentLaunch),
    secretHintText: getSshSecretHint(currentLaunch),
    runtimeSecretFieldHidden: true,
    runtimeSecretInputHidden: true,
    runtimeSecretInputDisabled: true,
    runtimeSecretInputValue: "",
    draftLaunchJson: JSON.stringify(currentLaunch, null, 2),
    draftStatusText: getDraftModeMessage(draftState, { getProfile }),
    deleteButtonText:
      pendingDeleteProfileId && pendingDeleteProfileId === selectedProfile?.id ? "Confirm Delete Saved" : "Delete Saved",
    deleteConfirmHidden: !(selectedProfile && pendingDeleteProfileId === selectedProfile.id),
    deleteConfirmMessageText:
      selectedProfile && pendingDeleteProfileId === selectedProfile.id
        ? `Delete saved connection profile [${selectedProfile.id}] ${selectedProfile.name}? This removes only the saved profile, not any already running sessions.`
        : "",
    selectedSshTrustEntryId,
    selectedSshProbeCandidateId,
    trustOptions,
    probeOptions,
    trustKeyTypeValue: selectedPreview?.keyType || "",
    trustFingerprintValue: selectedPreview?.fingerprintSha256 || "",
    trustPublicKeyValue: selectedPreview?.publicKey || "",
    trustGuidanceText: buildSshTrustGuidance({
      isSsh,
      target,
      matchingTrustEntries,
      probeCandidates,
      conflictEntry: selectedConflictEntry
    }),
    trustStatusText: buildSshTrustStatus({
      isSsh,
      target,
      matchingTrustEntries,
      probeCandidates,
      conflictEntry: selectedConflictEntry,
      probing: probingSshHostKeys
    }),
    trustCompareHidden: !selectedConflictEntry,
    trustCompareStatusText:
      selectedConflictEntry && selectedProbeCandidate
        ? `${selectedConflictEntry.fingerprintSha256} -> ${selectedProbeCandidate.fingerprintSha256}`
        : "",
    trustCurrentKeyTypeValue: selectedConflictEntry?.keyType || "",
    trustCurrentFingerprintValue: selectedConflictEntry?.fingerprintSha256 || "",
    trustCandidateKeyTypeValue: selectedConflictEntry ? selectedProbeCandidate?.keyType || "" : "",
    trustCandidateFingerprintValue: selectedConflictEntry ? selectedProbeCandidate?.fingerprintSha256 || "" : "",
    trustProbeDisabled: typeof api.probeSshHostKeys !== "function" || !isSsh || !target || probingSshHostKeys,
    trustRefreshDisabled: typeof api.listSshTrustEntries !== "function" || !isSsh || loadingSshTrustEntries,
    trustSaveDisabled: typeof api.createSshTrustEntry !== "function" || !isSsh || !selectedProbeCandidate || Boolean(selectedConflictEntry),
    trustDeleteDisabled: typeof api.deleteSshTrustEntry !== "function" || !selectedSshTrustEntryId,
    trustReplaceDisabled:
      typeof api.createSshTrustEntry !== "function" ||
      typeof api.deleteSshTrustEntry !== "function" ||
      !isSsh ||
      !target ||
      !selectedProbeCandidate ||
      !selectedConflictEntry
  };
}
