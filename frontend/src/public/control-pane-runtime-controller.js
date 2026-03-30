function normalizeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeControlPanePosition(value) {
  const normalized = normalizeLower(value);
  return ["top", "bottom"].includes(normalized) ? normalized : "bottom";
}

function normalizeControlPaneSize(value) {
  const normalized = Number.parseInt(String(value ?? ""), 10);
  if (Number.isInteger(normalized) && normalized >= 120 && normalized <= 960) {
    return normalized;
  }
  return 240;
}

function clampControlPaneSize(value) {
  const normalized = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(normalized)) {
    return 240;
  }
  return Math.max(120, Math.min(960, normalized));
}

function normalizeControlPaneState(source) {
  const value = source && typeof source === "object" && !Array.isArray(source) ? source : {};
  return {
    controlPaneVisible: value.controlPaneVisible !== false,
    controlPanePosition: normalizeControlPanePosition(value.controlPanePosition),
    controlPaneSize: normalizeControlPaneSize(value.controlPaneSize)
  };
}

function setClassState(element, className, active) {
  if (!element || !element.classList || typeof element.classList.toggle !== "function") {
    return;
  }
  element.classList.toggle(className, active === true);
}

export function createControlPaneRuntimeController(options = {}) {
  const windowRef = options.windowRef || globalThis.window || null;
  const workspaceShellEl = options.workspaceShellEl || null;
  const controlPaneEl = options.controlPaneEl || null;
  const controlPaneLauncherBtn = options.controlPaneLauncherBtn || null;
  const controlPaneToggleBtn = options.controlPaneToggleBtn || null;
  const controlPanePositionSelectEl = options.controlPanePositionSelectEl || null;
  const controlPaneStatusEl = options.controlPaneStatusEl || null;
  const controlPaneResizeHandleEl = options.controlPaneResizeHandleEl || null;
  const scheduleGlobalResize =
    typeof options.scheduleGlobalResize === "function" ? options.scheduleGlobalResize : () => {};
  const scheduleDeferredResizePasses =
    typeof options.scheduleDeferredResizePasses === "function" ? options.scheduleDeferredResizePasses : () => {};

  let controlPaneState = normalizeControlPaneState(options.initialState);
  let lastRenderKey = "";

  function getEffectivePosition() {
    return controlPaneState.controlPanePosition;
  }

  function applyRenderedState() {
    const effectivePosition = getEffectivePosition();
    const renderKey = JSON.stringify({
      visible: controlPaneState.controlPaneVisible,
      storedPosition: controlPaneState.controlPanePosition,
      effectivePosition,
      size: controlPaneState.controlPaneSize
    });
    const changed = renderKey !== lastRenderKey;
    lastRenderKey = renderKey;

    if (workspaceShellEl) {
      workspaceShellEl.style?.setProperty?.("--control-pane-size-px", `${controlPaneState.controlPaneSize}px`);
      setClassState(workspaceShellEl, "control-pane-hidden", controlPaneState.controlPaneVisible !== true);
      setClassState(workspaceShellEl, "control-pane-visible", controlPaneState.controlPaneVisible === true);
      setClassState(workspaceShellEl, "control-pane-pos-top", effectivePosition === "top");
      setClassState(workspaceShellEl, "control-pane-pos-bottom", effectivePosition === "bottom");
      setClassState(workspaceShellEl, "control-pane-pos-left", false);
      setClassState(workspaceShellEl, "control-pane-pos-right", false);
    }

    if (controlPaneEl) {
      controlPaneEl.hidden = false;
      if (controlPaneEl.dataset) {
        controlPaneEl.dataset.position = controlPaneState.controlPanePosition;
        controlPaneEl.dataset.effectivePosition = effectivePosition;
      }
    }

    if (controlPaneLauncherBtn) {
      controlPaneLauncherBtn.hidden = true;
    }

    if (controlPaneToggleBtn) {
      controlPaneToggleBtn.textContent = controlPaneState.controlPaneVisible === true ? "Hide" : "Show";
      controlPaneToggleBtn.setAttribute?.(
        "aria-label",
        controlPaneState.controlPaneVisible === true ? "Hide control pane" : "Show control pane"
      );
    }

    if (controlPanePositionSelectEl) {
      controlPanePositionSelectEl.value = controlPaneState.controlPanePosition;
    }

    if (controlPaneStatusEl) {
      controlPaneStatusEl.textContent = "";
    }

    if (controlPaneResizeHandleEl) {
      controlPaneResizeHandleEl.hidden = controlPaneState.controlPaneVisible !== true;
      if (controlPaneResizeHandleEl.dataset) {
        controlPaneResizeHandleEl.dataset.position = effectivePosition;
      }
    }

    return changed;
  }

  function render({ scheduleResize = false, scheduleDeferredResize = false } = {}) {
    const changed = applyRenderedState();
    if (changed || scheduleResize) {
      scheduleGlobalResize({ force: true });
    }
    if (changed || scheduleDeferredResize) {
      scheduleDeferredResizePasses({ force: true });
    }
    return getState();
  }

  function getState() {
    return { ...controlPaneState };
  }

  function setState(nextState = {}, renderOptions = {}) {
    const merged = normalizeControlPaneState({
      ...controlPaneState,
      ...(nextState && typeof nextState === "object" && !Array.isArray(nextState) ? nextState : {})
    });
    const changed =
      merged.controlPaneVisible !== controlPaneState.controlPaneVisible ||
      merged.controlPanePosition !== controlPaneState.controlPanePosition ||
      merged.controlPaneSize !== controlPaneState.controlPaneSize;
    controlPaneState = merged;
    if (changed || renderOptions.force === true) {
      render({
        scheduleResize: renderOptions.scheduleResize !== false,
        scheduleDeferredResize: renderOptions.scheduleDeferredResize !== false
      });
    }
    return getState();
  }

  function hide() {
    return setState({ controlPaneVisible: false });
  }

  function show() {
    return setState({ controlPaneVisible: true });
  }

  function bindResizeHandle() {
    if (!controlPaneResizeHandleEl || typeof controlPaneResizeHandleEl.addEventListener !== "function") {
      return;
    }
    controlPaneResizeHandleEl.addEventListener("pointerdown", (event) => {
      event.preventDefault?.();
      if (!windowRef || typeof windowRef.addEventListener !== "function" || typeof workspaceShellEl?.getBoundingClientRect !== "function") {
        return;
      }
      const rect = workspaceShellEl.getBoundingClientRect();
      const effectivePosition = getEffectivePosition();

      const onPointerMove = (moveEvent) => {
        let nextSize = controlPaneState.controlPaneSize;
        if (effectivePosition === "top") {
          nextSize = moveEvent.clientY - rect.top;
        } else {
          nextSize = rect.bottom - moveEvent.clientY;
        }
        controlPaneState = {
          ...controlPaneState,
          controlPaneSize: clampControlPaneSize(nextSize)
        };
        render({ scheduleResize: true, scheduleDeferredResize: false });
      };

      const onPointerUp = () => {
        if (typeof windowRef.removeEventListener === "function") {
          windowRef.removeEventListener("pointermove", onPointerMove);
          windowRef.removeEventListener("pointerup", onPointerUp);
          windowRef.removeEventListener("pointercancel", onPointerUp);
        }
        scheduleDeferredResizePasses({ force: true });
      };

      windowRef.addEventListener("pointermove", onPointerMove);
      windowRef.addEventListener("pointerup", onPointerUp);
      windowRef.addEventListener("pointercancel", onPointerUp);
    });
  }

  function bindInteractions() {
    controlPaneLauncherBtn?.addEventListener?.("click", () => {
      show();
    });
    controlPaneToggleBtn?.addEventListener?.("click", () => {
      if (controlPaneState.controlPaneVisible === true) {
        hide();
        return;
      }
      show();
    });
    controlPanePositionSelectEl?.addEventListener?.("change", (event) => {
      setState({
        controlPaneVisible: true,
        controlPanePosition: event?.target?.value
      });
    });
    if (windowRef && typeof windowRef.addEventListener === "function") {
      windowRef.addEventListener("resize", () => {
        render({ scheduleResize: true, scheduleDeferredResize: true });
      });
    }
    bindResizeHandle();
  }

  bindInteractions();
  render({ scheduleResize: false, scheduleDeferredResize: false });

  return {
    getState,
    getEffectivePosition,
    setState,
    show,
    hide,
    render
  };
}
