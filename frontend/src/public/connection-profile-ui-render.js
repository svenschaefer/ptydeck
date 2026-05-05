function clearChildren(element) {
  if (!element || typeof element.removeChild !== "function") {
    return;
  }
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

export function setConnectionProfileSelectOptions(selectEl, options, selectedValue) {
  if (!selectEl) {
    return;
  }
  clearChildren(selectEl);
  for (const optionConfig of Array.isArray(options) ? options : []) {
    const option = optionConfig.documentRef?.createElement?.("option") || {
      value: "",
      textContent: "",
      selected: false,
      disabled: false
    };
    option.value = String(optionConfig.value || "");
    option.textContent = String(optionConfig.label || option.value);
    option.selected = option.value === String(selectedValue || "");
    option.disabled = optionConfig.disabled === true;
    selectEl.appendChild(option);
  }
  selectEl.value = String(selectedValue || "");
}

export function renderConnectionProfileProfileSelect({
  selectEl,
  profiles,
  documentRef
} = {}) {
  if (!selectEl) {
    return;
  }
  clearChildren(selectEl);
  if (!Array.isArray(profiles) || profiles.length === 0) {
    const option = documentRef?.createElement?.("option") || { value: "", textContent: "" };
    option.value = "";
    option.textContent = "No connection profiles";
    option.disabled = true;
    option.selected = true;
    selectEl.appendChild(option);
    return;
  }
  for (const profile of profiles) {
    const option = documentRef?.createElement?.("option") || { value: "", textContent: "" };
    option.value = profile.id;
    option.textContent = `[${profile.id}] ${profile.name}`;
    selectEl.appendChild(option);
  }
}

export function applyConnectionProfileDraftViewState({
  viewState,
  refs,
  setDraftStatus = () => {}
} = {}) {
  const safeViewState = viewState || {};
  const safeRefs = refs || {};
  const renderedProbeSelectValue = safeViewState.selectedSshProbeCandidateId || safeViewState.probeOptions?.[0]?.value || "";
  const renderedTrustSelectValue = safeViewState.selectedSshTrustEntryId || safeViewState.trustOptions?.[0]?.value || "";
  if (safeRefs.summaryEl) {
    safeRefs.summaryEl.textContent = safeViewState.summaryText || "";
  }
  if (safeRefs.sshFieldsEl) {
    safeRefs.sshFieldsEl.hidden = safeViewState.sshFieldsHidden === true;
  }
  if (safeRefs.draftRemotePrivateKeyFieldEl) {
    safeRefs.draftRemotePrivateKeyFieldEl.hidden = safeViewState.privateKeyFieldHidden === true;
  }
  if (safeRefs.authHintEl) {
    safeRefs.authHintEl.textContent = safeViewState.authHintText || "";
  }
  if (safeRefs.secretHintEl) {
    safeRefs.secretHintEl.textContent = safeViewState.secretHintText || "";
  }
  if (safeRefs.runtimeSecretFieldEl) {
    safeRefs.runtimeSecretFieldEl.hidden = safeViewState.runtimeSecretFieldHidden === true;
  }
  if (safeRefs.runtimeSecretInputEl) {
    safeRefs.runtimeSecretInputEl.hidden = safeViewState.runtimeSecretInputHidden === true;
    safeRefs.runtimeSecretInputEl.disabled = safeViewState.runtimeSecretInputDisabled === true;
    safeRefs.runtimeSecretInputEl.value = safeViewState.runtimeSecretInputValue || "";
  }
  if (safeRefs.draftLaunchTextareaEl) {
    safeRefs.draftLaunchTextareaEl.readOnly = true;
    safeRefs.draftLaunchTextareaEl.value = safeViewState.draftLaunchJson || "";
  }
  setDraftStatus(safeViewState.draftStatusText || "");
  if (safeRefs.deleteBtn) {
    safeRefs.deleteBtn.textContent = safeViewState.deleteButtonText || "";
  }
  if (safeRefs.deleteConfirmEl) {
    safeRefs.deleteConfirmEl.hidden = safeViewState.deleteConfirmHidden === true;
  }
  if (safeRefs.deleteConfirmMessageEl) {
    safeRefs.deleteConfirmMessageEl.textContent = safeViewState.deleteConfirmMessageText || "";
  }
  setConnectionProfileSelectOptions(safeRefs.sshProbeSelectEl, safeViewState.probeOptions, renderedProbeSelectValue);
  setConnectionProfileSelectOptions(safeRefs.sshTrustSelectEl, safeViewState.trustOptions, renderedTrustSelectValue);
  if (safeRefs.sshTrustKeyTypeInputEl) {
    safeRefs.sshTrustKeyTypeInputEl.value = safeViewState.trustKeyTypeValue || "";
    safeRefs.sshTrustKeyTypeInputEl.readOnly = true;
  }
  if (safeRefs.sshTrustFingerprintInputEl) {
    safeRefs.sshTrustFingerprintInputEl.value = safeViewState.trustFingerprintValue || "";
    safeRefs.sshTrustFingerprintInputEl.readOnly = true;
  }
  if (safeRefs.sshTrustPublicKeyTextareaEl) {
    safeRefs.sshTrustPublicKeyTextareaEl.value = safeViewState.trustPublicKeyValue || "";
    safeRefs.sshTrustPublicKeyTextareaEl.readOnly = true;
  }
  if (safeRefs.sshTrustGuidanceEl) {
    safeRefs.sshTrustGuidanceEl.textContent = safeViewState.trustGuidanceText || "";
  }
  if (safeRefs.sshTrustStatusEl) {
    safeRefs.sshTrustStatusEl.textContent = safeViewState.trustStatusText || "";
  }
  if (safeRefs.sshTrustCompareEl) {
    safeRefs.sshTrustCompareEl.hidden = safeViewState.trustCompareHidden === true;
  }
  if (safeRefs.sshTrustCompareStatusEl) {
    safeRefs.sshTrustCompareStatusEl.textContent = safeViewState.trustCompareStatusText || "";
  }
  if (safeRefs.sshTrustCurrentKeyTypeInputEl) {
    safeRefs.sshTrustCurrentKeyTypeInputEl.value = safeViewState.trustCurrentKeyTypeValue || "";
    safeRefs.sshTrustCurrentKeyTypeInputEl.readOnly = true;
  }
  if (safeRefs.sshTrustCurrentFingerprintInputEl) {
    safeRefs.sshTrustCurrentFingerprintInputEl.value = safeViewState.trustCurrentFingerprintValue || "";
    safeRefs.sshTrustCurrentFingerprintInputEl.readOnly = true;
  }
  if (safeRefs.sshTrustCandidateKeyTypeInputEl) {
    safeRefs.sshTrustCandidateKeyTypeInputEl.value = safeViewState.trustCandidateKeyTypeValue || "";
    safeRefs.sshTrustCandidateKeyTypeInputEl.readOnly = true;
  }
  if (safeRefs.sshTrustCandidateFingerprintInputEl) {
    safeRefs.sshTrustCandidateFingerprintInputEl.value = safeViewState.trustCandidateFingerprintValue || "";
    safeRefs.sshTrustCandidateFingerprintInputEl.readOnly = true;
  }
  if (safeRefs.sshTrustProbeBtn) {
    safeRefs.sshTrustProbeBtn.disabled = safeViewState.trustProbeDisabled === true;
  }
  if (safeRefs.sshTrustRefreshBtn) {
    safeRefs.sshTrustRefreshBtn.disabled = safeViewState.trustRefreshDisabled === true;
  }
  if (safeRefs.sshTrustSaveBtn) {
    safeRefs.sshTrustSaveBtn.disabled = safeViewState.trustSaveDisabled === true;
  }
  if (safeRefs.sshTrustDeleteBtn) {
    safeRefs.sshTrustDeleteBtn.disabled = safeViewState.trustDeleteDisabled === true;
  }
  if (safeRefs.sshTrustReplaceBtn) {
    safeRefs.sshTrustReplaceBtn.disabled = safeViewState.trustReplaceDisabled === true;
  }
  return {
    selectedSshTrustEntryId: safeViewState.selectedSshTrustEntryId || "",
    selectedSshProbeCandidateId: safeViewState.selectedSshProbeCandidateId || ""
  };
}
