const SESSION_CONTROL_ROLE_OWNER = "owner";
const SESSION_CONTROL_ROLE_CONTROLLER = "controller";
const SESSION_CONTROL_ROLE_SPECTATOR = "spectator";
const DEFAULT_CONTROL_SUBJECT = "local-operator";
const DEFAULT_CONTROL_TENANT_ID = "local";
const DEFAULT_CONTROL_ACCESS_MODE = "operator";
const DEFAULT_CONTROL_PERMISSION_MODE = "";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTimestamp(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function normalizeCount(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

export function createLocalOperatorPrincipal() {
  return {
    subject: DEFAULT_CONTROL_SUBJECT,
    tenantId: DEFAULT_CONTROL_TENANT_ID,
    accessMode: DEFAULT_CONTROL_ACCESS_MODE,
    permissionMode: DEFAULT_CONTROL_PERMISSION_MODE
  };
}

export function createSessionControlPrincipal(auth = null) {
  const fallback = createLocalOperatorPrincipal();
  const subject = normalizeText(auth?.subject) || fallback.subject;
  const tenantId = normalizeText(auth?.tenantId) || fallback.tenantId;
  const accessMode = normalizeText(auth?.accessMode) || fallback.accessMode;
  const permissionMode = normalizeText(auth?.permissionMode);
  return {
    subject,
    tenantId,
    accessMode,
    permissionMode
  };
}

export function sessionControlPrincipalsMatch(left, right) {
  return (
    normalizeText(left?.subject) === normalizeText(right?.subject) &&
    normalizeText(left?.tenantId) === normalizeText(right?.tenantId) &&
    normalizeText(left?.accessMode) === normalizeText(right?.accessMode) &&
    normalizeText(left?.permissionMode) === normalizeText(right?.permissionMode)
  );
}

function normalizePrincipal(input, fallback = createLocalOperatorPrincipal()) {
  const candidate = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  return {
    subject: normalizeText(candidate.subject) || fallback.subject,
    tenantId: normalizeText(candidate.tenantId) || fallback.tenantId,
    accessMode: normalizeText(candidate.accessMode) || fallback.accessMode,
    permissionMode: normalizeText(candidate.permissionMode) || fallback.permissionMode || ""
  };
}

function normalizeLastInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const at = normalizeTimestamp(input.at);
  const subject = normalizeText(input.subject);
  const tenantId = normalizeText(input.tenantId);
  const accessMode = normalizeText(input.accessMode);
  if (!at || !subject || !tenantId || !accessMode) {
    return null;
  }
  const clientId = normalizeText(input.clientId);
  return {
    at,
    clientId: clientId || null,
    subject,
    tenantId,
    accessMode,
    permissionMode: normalizeText(input.permissionMode)
  };
}

export function normalizeSessionControlState(input, options = {}) {
  const fallbackOwner = normalizePrincipal(options.fallbackOwner, createLocalOperatorPrincipal());
  const nowFn = typeof options.nowFn === "function" ? options.nowFn : Date.now;
  const candidate = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const controllerClientId = normalizeText(candidate.controllerClientId);
  return {
    owner: normalizePrincipal(candidate.owner, fallbackOwner),
    allowAutoAssign: candidate.allowAutoAssign !== false,
    controllerClientId: controllerClientId || null,
    controllerChangedAt:
      normalizeTimestamp(candidate.controllerChangedAt) || (controllerClientId ? Number(nowFn()) : null),
    lastInput: normalizeLastInput(candidate.lastInput)
  };
}

export function createSessionAttachedClient(input = {}) {
  const principal = normalizePrincipal(input.principal || input.auth || input, createLocalOperatorPrincipal());
  const clientId = normalizeText(input.clientId);
  if (!clientId) {
    throw new Error("Session attached client requires a non-empty clientId.");
  }
  const connectedAt = normalizeTimestamp(input.connectedAt) || Number(Date.now());
  const lastSeenAt = normalizeTimestamp(input.lastSeenAt) || connectedAt;
  const activeConnectionCount = normalizeCount(input.activeConnectionCount);
  const active = typeof input.active === "boolean" ? input.active : activeConnectionCount > 0;
  return {
    clientId,
    label: normalizeText(input.label),
    connectedAt,
    lastSeenAt,
    lastDisconnectedAt: normalizeTimestamp(input.lastDisconnectedAt),
    activeConnectionCount,
    active,
    subject: principal.subject,
    tenantId: principal.tenantId,
    accessMode: principal.accessMode,
    permissionMode: principal.permissionMode || ""
  };
}

function compareAttachedClients(left, right) {
  if (Boolean(left.active) !== Boolean(right.active)) {
    return left.active ? -1 : 1;
  }
  if (left.connectedAt !== right.connectedAt) {
    return left.connectedAt - right.connectedAt;
  }
  return left.clientId.localeCompare(right.clientId, "en-US", { sensitivity: "base" });
}

export function buildSessionControlStateView(controlState, attachedClients = []) {
  const normalizedState = normalizeSessionControlState(controlState);
  const clients = Array.isArray(attachedClients)
    ? attachedClients
        .map((entry) => createSessionAttachedClient(entry))
        .sort(compareAttachedClients)
    : [];
  const decoratedClients = clients.map((entry) => {
    let role = SESSION_CONTROL_ROLE_SPECTATOR;
    if (normalizedState.controllerClientId && entry.clientId === normalizedState.controllerClientId) {
      role = SESSION_CONTROL_ROLE_CONTROLLER;
    } else if (sessionControlPrincipalsMatch(entry, normalizedState.owner)) {
      role = SESSION_CONTROL_ROLE_OWNER;
    }
    return {
      ...entry,
      role
    };
  });
  const currentController =
    decoratedClients.find((entry) => entry.clientId === normalizedState.controllerClientId) || null;
  return {
    owner: { ...normalizedState.owner },
    controllerClientId: normalizedState.controllerClientId,
    controllerChangedAt: normalizedState.controllerChangedAt,
    currentController,
    lastInput: normalizedState.lastInput ? { ...normalizedState.lastInput } : null,
    attachedClients: decoratedClients
  };
}

export function updateSessionControlLastInput(controlState, input = {}, options = {}) {
  const nowFn = typeof options.nowFn === "function" ? options.nowFn : Date.now;
  const normalizedState = normalizeSessionControlState(controlState);
  const principal = normalizePrincipal(input.principal || input.auth, normalizedState.owner);
  const clientId = normalizeText(input.clientId);
  return {
    ...normalizedState,
    lastInput: {
      at: Number(nowFn()),
      clientId: clientId || null,
      subject: principal.subject,
      tenantId: principal.tenantId,
      accessMode: principal.accessMode,
      permissionMode: principal.permissionMode || ""
    }
  };
}

export function setSessionControllerClient(controlState, clientId, options = {}) {
  const nowFn = typeof options.nowFn === "function" ? options.nowFn : Date.now;
  const normalizedState = normalizeSessionControlState(controlState);
  const nextClientId = normalizeText(clientId) || null;
  const nextAllowAutoAssign =
    typeof options.allowAutoAssign === "boolean" ? options.allowAutoAssign : normalizedState.allowAutoAssign;
  if (
    normalizedState.controllerClientId === nextClientId &&
    normalizedState.allowAutoAssign === nextAllowAutoAssign
  ) {
    return normalizedState;
  }
  return {
    ...normalizedState,
    allowAutoAssign: nextAllowAutoAssign,
    controllerClientId: nextClientId,
    controllerChangedAt: nextClientId ? Number(nowFn()) : null
  };
}

export {
  SESSION_CONTROL_ROLE_CONTROLLER,
  SESSION_CONTROL_ROLE_OWNER,
  SESSION_CONTROL_ROLE_SPECTATOR
};
