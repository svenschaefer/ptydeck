export const ORIGIN_HANDOFF_QUERY_PARAM = "ptydeck_origin_handoff";

export function normalizeControlText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeOriginValue(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    return "";
  }
  try {
    return new URL(normalized).origin;
  } catch {
    return "";
  }
}

export function getWindowOrigin(win) {
  const location = win?.location || null;
  if (typeof location?.origin === "string" && location.origin.trim()) {
    return normalizeOriginValue(location.origin);
  }
  const protocol = typeof location?.protocol === "string" ? location.protocol : "";
  const host = typeof location?.host === "string" ? location.host : "";
  if (!protocol || !host) {
    return "";
  }
  return normalizeOriginValue(`${protocol}//${host}`);
}

export function buildCanonicalOriginRedirectUrl(win, canonicalOrigin, handoffOrigin, queryParam = ORIGIN_HANDOFF_QUERY_PARAM) {
  const location = win?.location || null;
  const targetUrl = new URL(
    typeof location?.pathname === "string" && location.pathname ? location.pathname : "/",
    canonicalOrigin
  );
  const params = new URLSearchParams(typeof location?.search === "string" ? location.search : "");
  params.delete(queryParam);
  if (handoffOrigin) {
    params.set(queryParam, handoffOrigin);
  }
  const search = params.toString();
  targetUrl.search = search ? `?${search}` : "";
  targetUrl.hash = typeof location?.hash === "string" ? location.hash : "";
  return targetUrl.toString();
}

export function readOriginHandoffSourceOrigin(win, queryParam = ORIGIN_HANDOFF_QUERY_PARAM) {
  const location = win?.location || null;
  const params = new URLSearchParams(typeof location?.search === "string" ? location.search : "");
  return normalizeOriginValue(params.get(queryParam) || "");
}

export function clearOriginHandoffSearchParam(win, queryParam = ORIGIN_HANDOFF_QUERY_PARAM) {
  const location = win?.location || null;
  const historyRef = win?.history || null;
  if (typeof historyRef?.replaceState !== "function") {
    return false;
  }
  const params = new URLSearchParams(typeof location?.search === "string" ? location.search : "");
  if (!params.has(queryParam)) {
    return false;
  }
  params.delete(queryParam);
  const pathname = typeof location?.pathname === "string" && location.pathname ? location.pathname : "/";
  const nextSearch = params.toString();
  const nextHash = typeof location?.hash === "string" ? location.hash : "";
  const nextUrl = `${pathname}${nextSearch ? `?${nextSearch}` : ""}${nextHash}`;
  historyRef.replaceState(historyRef.state || null, "", nextUrl);
  return true;
}

function readBooleanFlag(value) {
  return typeof value === "function" ? value() === true : value === true;
}

function readMessageValue(value) {
  if (typeof value === "function") {
    return String(value() || "");
  }
  return typeof value === "string" ? value : "";
}

function readRuntimeClientId(context = {}) {
  return normalizeControlText(context.runtimeClientId);
}

function readTrustedLocalClientLabel(context = {}) {
  return normalizeControlText(context.trustedLocalClientLabel);
}

function isReadOnlyMode(context = {}) {
  return readBooleanFlag(context.isReadOnlyMode);
}

function getReadOnlyModeMessage(context = {}) {
  return readMessageValue(context.getReadOnlyModeMessage);
}

function isRuntimeClientIdentityCreatedOnThisOrigin(context = {}) {
  return readBooleanFlag(context.runtimeClientIdentityCreatedOnThisOrigin);
}

function readOriginHandoffSource(context = {}) {
  return normalizeOriginValue(context.originHandoffSourceOrigin);
}

function readConnectionState(context = {}) {
  const value =
    typeof context.getConnectionState === "function" ? context.getConnectionState() : context.connectionState;
  return normalizeControlText(value).toLowerCase();
}

function hasConnectedSessionTransport(context = {}) {
  const connectionState = readConnectionState(context);
  return !connectionState || connectionState === "connected";
}

export function getSessionControlState(session) {
  return session?.controlState && typeof session.controlState === "object" ? session.controlState : null;
}

export function getCurrentSessionController(session) {
  const controlState = getSessionControlState(session);
  const controller = controlState?.currentController;
  return controller && typeof controller === "object" ? controller : null;
}

export function getAttachedClientsForSession(session) {
  const controlState = getSessionControlState(session);
  return Array.isArray(controlState?.attachedClients) ? controlState.attachedClients : [];
}

export function getLocalSessionClient(session, context = {}) {
  const runtimeClientId = readRuntimeClientId(context);
  if (!runtimeClientId) {
    return null;
  }
  return getAttachedClientsForSession(session).find((entry) => normalizeControlText(entry?.clientId) === runtimeClientId) || null;
}

export function getLocalDeviceLabel(session = null, context = {}) {
  const localClient = session ? getLocalSessionClient(session, context) : null;
  return readTrustedLocalClientLabel(context) || normalizeControlText(localClient?.label) || "this device";
}

export function isLocalSessionController(session, context = {}) {
  const runtimeClientId = readRuntimeClientId(context);
  return normalizeControlText(getCurrentSessionController(session)?.clientId) === runtimeClientId && Boolean(runtimeClientId);
}

export function isLocalSessionOwner(session, context = {}) {
  const localClient = getLocalSessionClient(session, context);
  const owner = getSessionControlState(session)?.owner;
  if (!localClient || !owner) {
    return false;
  }
  return (
    normalizeControlText(localClient.subject) === normalizeControlText(owner.subject) &&
    normalizeControlText(localClient.tenantId) === normalizeControlText(owner.tenantId) &&
    normalizeControlText(localClient.accessMode) === normalizeControlText(owner.accessMode) &&
    normalizeControlText(localClient.permissionMode) === normalizeControlText(owner.permissionMode)
  );
}

export function isLocalOperatorSessionClient(session, context = {}) {
  const localClient = getLocalSessionClient(session, context);
  return Boolean(localClient) && normalizeControlText(localClient?.accessMode) !== "spectator";
}

export function canUseImplicitOwnerFallback(session, context = {}) {
  if (isReadOnlyMode(context) || !session) {
    return false;
  }
  if (!hasConnectedSessionTransport(context)) {
    return false;
  }
  if (!getSessionControlState(session)) {
    return true;
  }
  if (getCurrentSessionController(session)) {
    return false;
  }
  const attachedClients = getAttachedClientsForSession(session);
  return attachedClients.length === 0 || attachedClients.every((entry) => normalizeControlText(entry?.accessMode) === "spectator");
}

export function canWriteToSession(session, context = {}) {
  if (isReadOnlyMode(context) || !session) {
    return false;
  }
  if (!hasConnectedSessionTransport(context)) {
    return false;
  }
  return isLocalSessionController(session, context) || canUseImplicitOwnerFallback(session, context);
}

export function getSessionControlClientLabel(client) {
  const label = normalizeControlText(client?.label);
  if (label) {
    return label;
  }
  const subject = normalizeControlText(client?.subject) || "unknown";
  const tenantId = normalizeControlText(client?.tenantId);
  return tenantId ? `${subject}@${tenantId}` : subject;
}

export function getSessionWriteBlockMessage(session, context = {}) {
  if (isReadOnlyMode(context)) {
    return getReadOnlyModeMessage(context);
  }
  if (!session) {
    return "No active session selected.";
  }
  const connectionState = readConnectionState(context);
  if (connectionState && connectionState !== "connected") {
    return `Connection state: ${connectionState}. Wait for the session UI to establish session control before sending input or resizing.`;
  }
  if (canUseImplicitOwnerFallback(session, context)) {
    return "";
  }
  const runtimeClientId = readRuntimeClientId(context);
  const localDeviceLabel = getLocalDeviceLabel(session, context);
  if (!runtimeClientId || !getLocalSessionClient(session, context)) {
    return `Waiting for ${localDeviceLabel} to attach to session control.`;
  }
  const controller = getCurrentSessionController(session);
  if (!controller) {
    return "No client currently holds control for this session. Take control before sending input or resizing.";
  }
  if (normalizeControlText(controller.clientId) === runtimeClientId) {
    return "";
  }
  if (controller.active !== true) {
    if (isLocalOperatorSessionClient(session, context)) {
      return `Control is reserved for reconnecting device ${getSessionControlClientLabel(controller)}. Take control to reclaim it or wait for reconnect.`;
    }
    return `Control is reserved for reconnecting device ${getSessionControlClientLabel(controller)}. Input and resize are disabled on this device.`;
  }
  if (isLocalOperatorSessionClient(session, context)) {
    return `Device ${getSessionControlClientLabel(controller)} currently controls this session. Take control to override or wait for release.`;
  }
  return "This session is currently controlled by another client. Input and resize are disabled.";
}

export function getSessionControlSummary(session, context = {}) {
  const runtimeClientId = readRuntimeClientId(context);
  const controller = getCurrentSessionController(session);
  const localClient = getLocalSessionClient(session, context);
  const localDeviceLabel = getLocalDeviceLabel(session, context);
  const connectionState = readConnectionState(context);
  if (!session) {
    return "Control unavailable.";
  }
  if (connectionState && connectionState !== "connected") {
    return `Connection state: ${connectionState}. Waiting for ${localDeviceLabel} to attach.`;
  }
  if (!runtimeClientId || !localClient) {
    if (canUseImplicitOwnerFallback(session, context)) {
      return "Local operator write access is active until a session control client attaches.";
    }
    return `Waiting for ${localDeviceLabel} to attach.`;
  }
  if (!controller) {
    return `No active controller. ${localDeviceLabel} can take control.`;
  }
  if (normalizeControlText(controller.clientId) === runtimeClientId) {
    const tabCount = Number.isInteger(localClient.activeConnectionCount) ? localClient.activeConnectionCount : 0;
    return tabCount > 1
      ? `${localDeviceLabel} controls this session. ${tabCount} tabs are attached for this device.`
      : `${localDeviceLabel} controls this session.`;
  }
  if (controller.active !== true) {
    if (isLocalOperatorSessionClient(session, context)) {
      return `Control is reserved for reconnecting device ${getSessionControlClientLabel(controller)}. ${localDeviceLabel} can reclaim it.`;
    }
    return `Control is reserved for reconnecting device ${getSessionControlClientLabel(controller)}.`;
  }
  if (isLocalOperatorSessionClient(session, context)) {
    return `Device ${getSessionControlClientLabel(controller)} controls this session. ${localDeviceLabel} can take control.`;
  }
  return `Device ${getSessionControlClientLabel(controller)} controls this session. Observe-only on this device.`;
}

export function canTakeSessionControl(session, context = {}) {
  if (isReadOnlyMode(context) || !session || !readRuntimeClientId(context)) {
    return false;
  }
  if (!hasConnectedSessionTransport(context)) {
    return false;
  }
  const localClient = getLocalSessionClient(session, context);
  if (!localClient || localClient.active !== true) {
    return false;
  }
  if (normalizeControlText(localClient.accessMode) === "spectator") {
    return false;
  }
  if (isLocalSessionController(session, context)) {
    return false;
  }
  return true;
}

export function isOriginHandoffRepairableSession(session, context = {}) {
  if (!readOriginHandoffSource(context) || !session || !readRuntimeClientId(context)) {
    return false;
  }
  const controller = getCurrentSessionController(session);
  if (!controller || controller.active === true) {
    return false;
  }
  if (normalizeControlText(controller.clientId) === readRuntimeClientId(context)) {
    return false;
  }
  if (!isRuntimeClientIdentityCreatedOnThisOrigin(context)) {
    return false;
  }
  if (!isLocalOperatorSessionClient(session, context) || !isLocalSessionOwner(session, context)) {
    return false;
  }
  return canTakeSessionControl(session, context);
}

export function listOriginHandoffRepairableSessions(sessions, context = {}) {
  return (Array.isArray(sessions) ? sessions : []).filter((session) => isOriginHandoffRepairableSession(session, context));
}

export function canReleaseSessionControl(session, context = {}) {
  if (isReadOnlyMode(context) || !session || !readRuntimeClientId(context)) {
    return false;
  }
  if (!hasConnectedSessionTransport(context)) {
    return false;
  }
  const localClient = getLocalSessionClient(session, context);
  if (!localClient || localClient.active !== true) {
    return false;
  }
  return isLocalSessionController(session, context) || isLocalSessionOwner(session, context);
}

export function canTransferSessionControl(session, targetClientId, context = {}) {
  if (isReadOnlyMode(context) || !session || !readRuntimeClientId(context)) {
    return false;
  }
  if (!hasConnectedSessionTransport(context)) {
    return false;
  }
  const normalizedTargetClientId = normalizeControlText(targetClientId);
  if (!normalizedTargetClientId) {
    return false;
  }
  const targetClient = getAttachedClientsForSession(session).find(
    (entry) => normalizeControlText(entry?.clientId) === normalizedTargetClientId
  );
  if (!targetClient || targetClient.active !== true) {
    return false;
  }
  const controllerClientId = normalizeControlText(getCurrentSessionController(session)?.clientId);
  if (normalizedTargetClientId === controllerClientId) {
    return false;
  }
  return isLocalSessionController(session, context) || isLocalSessionOwner(session, context);
}

export function canManageTrustedLocalDevice(session, context = {}) {
  if (isReadOnlyMode(context) || !session || !readRuntimeClientId(context)) {
    return false;
  }
  if (!hasConnectedSessionTransport(context)) {
    return false;
  }
  const localClient = getLocalSessionClient(session, context);
  if (!localClient || localClient.active !== true) {
    return false;
  }
  return normalizeControlText(localClient.accessMode) !== "spectator";
}

export function canForgetSessionControlClient(session, targetClientId, context = {}) {
  if (!canManageTrustedLocalDevice(session, context)) {
    return false;
  }
  const runtimeClientId = readRuntimeClientId(context);
  const normalizedTargetClientId = normalizeControlText(targetClientId);
  if (!normalizedTargetClientId || normalizedTargetClientId === runtimeClientId) {
    return false;
  }
  const targetClient = getAttachedClientsForSession(session).find(
    (entry) => normalizeControlText(entry?.clientId) === normalizedTargetClientId
  );
  if (!targetClient) {
    return false;
  }
  return targetClient.active !== true && (targetClient.activeConnectionCount || 0) === 0;
}

export function getTakeOrReclaimControlLabel(session, context = {}) {
  const controller = getCurrentSessionController(session);
  const reclaiming = Boolean(controller) && controller.active !== true && canTakeSessionControl(session, context);
  return reclaiming ? "Reclaim Control" : "Take Control";
}

export function getSessionControlBadgeState(session, context = {}) {
  if (!session) {
    return { label: "", tone: "", title: "" };
  }
  const connectionState = readConnectionState(context);
  if (connectionState && connectionState !== "connected") {
    return {
      label: "ATTACHING",
      tone: "pending",
      title: `Connection state: ${connectionState}. Waiting for ${getLocalDeviceLabel(session, context)} to attach to session control metadata.`
    };
  }
  const runtimeClientId = readRuntimeClientId(context);
  if (canUseImplicitOwnerFallback(session, context)) {
    return {
      label: "LOCAL",
      tone: "owner",
      title: "Local operator write access is active until a session control client attaches."
    };
  }
  const localClient = getLocalSessionClient(session, context);
  if (!runtimeClientId || !localClient) {
    return {
      label: "ATTACHING",
      tone: "pending",
      title: `Waiting for ${getLocalDeviceLabel(session, context)} to attach to session control metadata.`
    };
  }
  if (isLocalSessionController(session, context)) {
    return {
      label: "CONTROLLER",
      tone: "controller",
      title: "This browser client currently controls terminal input and resize for this session."
    };
  }
  if (normalizeControlText(localClient?.accessMode) === "spectator") {
    return {
      label: "READ ONLY",
      tone: "spectator",
      title: "This browser client is attached in read-only spectator mode."
    };
  }
  if (!getCurrentSessionController(session)) {
    return {
      label: "ATTACHED",
      tone: "owner",
      title: `${getLocalDeviceLabel(session, context)} is attached and can take control.`
    };
  }
  if (getCurrentSessionController(session)?.active !== true && isLocalOperatorSessionClient(session, context)) {
    return {
      label: "RECLAIM",
      tone: "owner",
      title: "Another device is reconnecting. This browser client can reclaim control."
    };
  }
  if (isLocalOperatorSessionClient(session, context)) {
    return {
      label: "ATTACHED",
      tone: "owner",
      title: `${getLocalDeviceLabel(session, context)} is attached and can take or transfer control.`
    };
  }
  return {
    label: "REMOTE",
    tone: "remote",
    title: "Another attached client currently controls this session."
  };
}
