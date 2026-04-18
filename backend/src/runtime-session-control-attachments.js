import { ApiError } from "./errors.js";
import { createSessionAttachedClient, createSessionControlPrincipal } from "./session-control-state.js";

export function normalizeSessionControlClientLabel(value, maxLength = 64) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, maxLength);
}

export function createSessionControlAttachmentRegistry({
  staleClientTtlMs,
  maxLabelLength = 64,
  isStopping = () => false,
  isStopped = () => false,
  onPruned = () => {},
  now = () => Date.now(),
  scheduleTimeout = setTimeout,
  clearScheduledTimeout = clearTimeout
}) {
  const attachments = new Map();
  let pruneTimer = null;

  function getAttachmentKey(input = {}) {
    const clientId = typeof input.clientId === "string" ? input.clientId.trim() : "";
    if (!clientId) {
      return "";
    }
    const principal = createSessionControlPrincipal(input.auth || input.principal || input);
    return [
      clientId,
      principal.subject,
      principal.tenantId,
      principal.accessMode,
      principal.permissionMode || ""
    ].join("\u001f");
  }

  function pruneStaleAttachments(currentNow = now()) {
    let removed = false;
    for (const [attachmentKey, entry] of attachments.entries()) {
      const client = entry?.client;
      if (!client || client.activeConnectionCount > 0) {
        continue;
      }
      if (!client.lastDisconnectedAt) {
        attachments.delete(attachmentKey);
        removed = true;
        continue;
      }
      if (currentNow - client.lastDisconnectedAt >= staleClientTtlMs) {
        attachments.delete(attachmentKey);
        removed = true;
      }
    }
    return removed;
  }

  function clearPruneTimer() {
    if (pruneTimer === null) {
      return;
    }
    clearScheduledTimeout(pruneTimer);
    pruneTimer = null;
  }

  function getNextPruneDelay(currentNow = now()) {
    let nextDelay = null;
    for (const entry of attachments.values()) {
      const client = entry?.client;
      if (!client || client.activeConnectionCount > 0 || !client.lastDisconnectedAt) {
        continue;
      }
      const expiresIn = Math.max(0, staleClientTtlMs - (currentNow - client.lastDisconnectedAt));
      nextDelay = nextDelay === null ? expiresIn : Math.min(nextDelay, expiresIn);
    }
    return nextDelay;
  }

  function schedulePrune() {
    clearPruneTimer();
    if (isStopping() || isStopped()) {
      return;
    }
    const delayMs = getNextPruneDelay();
    if (delayMs === null) {
      return;
    }
    pruneTimer = scheduleTimeout(() => {
      pruneTimer = null;
      const removed = pruneStaleAttachments();
      if (removed) {
        onPruned();
      }
      schedulePrune();
    }, delayMs);
  }

  function registerAttachment(input = {}) {
    const attachmentKey = getAttachmentKey(input);
    if (!attachmentKey) {
      return null;
    }
    const existing = attachments.get(attachmentKey) || null;
    const nextClient = createSessionAttachedClient({
      ...(existing?.client || {}),
      clientId: input.clientId,
      label: normalizeSessionControlClientLabel(input.label, maxLabelLength) || existing?.client?.label || "",
      principal: input.auth,
      connectedAt: existing?.client?.connectedAt || Number(now()),
      lastSeenAt: Number(now()),
      lastDisconnectedAt: null,
      activeConnectionCount: (existing?.client?.activeConnectionCount || 0) + 1,
      active: true
    });
    const auth =
      input.auth && typeof input.auth === "object" && !Array.isArray(input.auth)
        ? { ...input.auth }
        : null;
    attachments.set(attachmentKey, {
      key: attachmentKey,
      client: nextClient,
      auth
    });
    schedulePrune();
    return nextClient;
  }

  function unregisterAttachment(socket) {
    const attachmentKey = typeof socket?.sessionControlAttachmentKey === "string" ? socket.sessionControlAttachmentKey : "";
    if (!attachmentKey) {
      return;
    }
    const existing = attachments.get(attachmentKey);
    if (!existing?.client) {
      return;
    }
    const nextCount = Math.max(0, (existing.client.activeConnectionCount || 0) - 1);
    attachments.set(attachmentKey, {
      ...existing,
      client: createSessionAttachedClient({
        ...existing.client,
        lastSeenAt: Number(now()),
        lastDisconnectedAt: nextCount === 0 ? Number(now()) : null,
        activeConnectionCount: nextCount,
        active: nextCount > 0
      })
    });
    schedulePrune();
  }

  function updateAttachmentLabel(auth, clientId, label) {
    const attachmentKey = getAttachmentKey({ auth, clientId });
    if (!attachmentKey) {
      return null;
    }
    const existing = attachments.get(attachmentKey) || null;
    if (!existing?.client) {
      return null;
    }
    const nextLabel = normalizeSessionControlClientLabel(label, maxLabelLength);
    if (!nextLabel) {
      throw new ApiError(400, "ValidationError", "Field 'label' must be a non-empty string.");
    }
    const nextClient = createSessionAttachedClient({
      ...existing.client,
      label: nextLabel,
      principal: existing.auth || auth,
      lastSeenAt: Number(now())
    });
    attachments.set(attachmentKey, {
      ...existing,
      client: nextClient
    });
    return nextClient;
  }

  function forgetAttachment(auth, clientId) {
    const attachmentKey = getAttachmentKey({ auth, clientId });
    if (!attachmentKey) {
      return false;
    }
    return attachments.delete(attachmentKey);
  }

  function findActiveAttachment(auth = null, clientId = "") {
    const attachmentKey = getAttachmentKey({ auth, clientId });
    if (!attachmentKey) {
      return null;
    }
    const attachment = attachments.get(attachmentKey) || null;
    if (!attachment?.client || attachment.client.active !== true) {
      return null;
    }
    return attachment.client;
  }

  function listEntries() {
    return Array.from(attachments.values());
  }

  return {
    clearPruneTimer,
    findActiveAttachment,
    forgetAttachment,
    getAttachmentKey,
    getNextPruneDelay,
    listEntries,
    pruneStaleAttachments,
    registerAttachment,
    schedulePrune,
    unregisterAttachment,
    updateAttachmentLabel
  };
}
