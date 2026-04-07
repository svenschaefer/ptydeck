const DEFAULT_STORAGE_KEY = "ptydeck.trusted-local-client.v1";
const CLIENT_FORMAT = "ptydeck.trusted-local-client.v1";
const MAX_LABEL_LENGTH = 64;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeParseRecord(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    if (normalizeText(parsed.format) !== CLIENT_FORMAT) {
      return null;
    }
    const clientId = normalizeText(parsed.clientId);
    const label = normalizeText(parsed.label);
    if (!clientId || !label || !Number.isInteger(parsed.createdAt)) {
      return null;
    }
    return {
      format: CLIENT_FORMAT,
      clientId,
      label,
      createdAt: parsed.createdAt
    };
  } catch {
    return null;
  }
}

function detectBrowserName(navigatorRef) {
  const userAgent = normalizeText(navigatorRef?.userAgent);
  if (!userAgent) {
    return "Browser";
  }
  if (/Edg\//.test(userAgent)) {
    return "Edge";
  }
  if (/Firefox\//.test(userAgent)) {
    return "Firefox";
  }
  if (/Chrome\//.test(userAgent) && !/Edg\//.test(userAgent)) {
    return "Chrome";
  }
  if (/Safari\//.test(userAgent) && !/Chrome\//.test(userAgent) && !/Chromium\//.test(userAgent)) {
    return "Safari";
  }
  return "Browser";
}

function detectPlatformName(navigatorRef) {
  const userAgentPlatform = normalizeText(navigatorRef?.userAgentData?.platform);
  if (userAgentPlatform) {
    return userAgentPlatform;
  }
  const platform = normalizeText(navigatorRef?.platform);
  if (/win/i.test(platform)) {
    return "Windows";
  }
  if (/mac/i.test(platform)) {
    return "macOS";
  }
  if (/linux/i.test(platform)) {
    return "Linux";
  }
  if (/iphone|ipad|ios/i.test(platform)) {
    return "iOS";
  }
  if (/android/i.test(platform)) {
    return "Android";
  }
  const userAgent = normalizeText(navigatorRef?.userAgent);
  if (/Windows/i.test(userAgent)) {
    return "Windows";
  }
  if (/Mac OS X|Macintosh/i.test(userAgent)) {
    return "macOS";
  }
  if (/Linux/i.test(userAgent)) {
    return "Linux";
  }
  if (/Android/i.test(userAgent)) {
    return "Android";
  }
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return "iOS";
  }
  return "Device";
}

function buildDefaultLabel(clientId, navigatorRef) {
  const browser = detectBrowserName(navigatorRef);
  const platform = detectPlatformName(navigatorRef);
  const shortId = clientId.slice(-4).toUpperCase();
  return `${browser} on ${platform} (${shortId})`.slice(0, MAX_LABEL_LENGTH);
}

function createClientId(cryptoRef, nowFn) {
  const uuid =
    typeof cryptoRef?.randomUUID === "function"
      ? cryptoRef.randomUUID()
      : `${Number(nowFn()).toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `trusted-${uuid}`;
}

export function createTrustedLocalClientRuntimeController(options = {}) {
  const storageRef = options.storageRef || options.localStorageRef || options.windowRef?.localStorage || null;
  const navigatorRef = options.navigatorRef || options.windowRef?.navigator || globalThis.navigator || null;
  const cryptoRef = options.cryptoRef || options.windowRef?.crypto || globalThis.crypto || null;
  const storageKey = normalizeText(options.storageKey) || DEFAULT_STORAGE_KEY;
  const nowFn = typeof options.nowFn === "function" ? options.nowFn : Date.now;
  let cachedRecord = null;

  function requireStorage() {
    if (!storageRef || typeof storageRef.getItem !== "function" || typeof storageRef.setItem !== "function") {
      throw new Error(
        "Trusted local multi-device control requires browser localStorage so this device can keep a stable control identity across reloads."
      );
    }
    return storageRef;
  }

  function readStoredRecord() {
    const storage = requireStorage();
    const parsed = safeParseRecord(storage.getItem(storageKey));
    cachedRecord = parsed;
    return parsed;
  }

  function createRecord() {
    const clientId = createClientId(cryptoRef, nowFn);
    return {
      format: CLIENT_FORMAT,
      clientId,
      label: buildDefaultLabel(clientId, navigatorRef),
      createdAt: Number(nowFn())
    };
  }

  async function ensureClientIdentity() {
    const existing = cachedRecord || readStoredRecord();
    if (existing) {
      return { ...existing };
    }
    const storage = requireStorage();
    const created = createRecord();
    storage.setItem(storageKey, JSON.stringify(created));
    const verified = readStoredRecord();
    if (!verified) {
      throw new Error("Failed to verify the trusted local device identity after writing it to localStorage.");
    }
    return { ...verified };
  }

  function getClientIdentity() {
    return cachedRecord ? { ...cachedRecord } : readStoredRecord();
  }

  function getWsTicketPayload() {
    const record = getClientIdentity();
    if (!record) {
      return {};
    }
    return {
      clientId: record.clientId,
      label: record.label
    };
  }

  return {
    ensureClientIdentity,
    getClientIdentity,
    getWsTicketPayload,
    getStorageKey: () => storageKey
  };
}

export const TRUSTED_LOCAL_CLIENT_STORAGE_KEY = DEFAULT_STORAGE_KEY;
