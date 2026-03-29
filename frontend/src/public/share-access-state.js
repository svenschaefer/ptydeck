function decodeBase64UrlUtf8(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  if (typeof globalThis.Buffer?.from === "function") {
    return globalThis.Buffer.from(padded, "base64").toString("utf8");
  }
  throw new Error("No base64 decoder available.");
}

function decodeJwtPayload(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || !parts[1]) {
    return null;
  }
  try {
    return JSON.parse(decodeBase64UrlUtf8(parts[1]));
  } catch {
    return null;
  }
}

export function parseAccessStateFromToken(token) {
  const payload = decodeJwtPayload(token);
  if (!payload || payload.accessMode !== "spectator" || payload.permissionMode !== "read_only") {
    return {
      accessMode: "operator",
      readOnly: false,
      shareLinkId: "",
      targetType: "",
      targetId: "",
      summary: ""
    };
  }
  const targetType = typeof payload.shareTargetType === "string" ? payload.shareTargetType : "";
  const targetId = typeof payload.shareTargetId === "string" ? payload.shareTargetId : "";
  const targetLabel =
    targetType === "session"
      ? `session ${targetId || "unknown"}`
      : targetType === "deck"
        ? `deck ${targetId || "unknown"}`
        : "shared target";
  return {
    accessMode: "spectator",
    readOnly: true,
    shareLinkId: typeof payload.shareLinkId === "string" ? payload.shareLinkId : "",
    targetType,
    targetId,
    summary: `Spectator · Read-only ${targetLabel}`
  };
}

export function getShareTokenFromLocation(windowRef = globalThis.window) {
  const rawSearch = typeof windowRef?.location?.search === "string" ? windowRef.location.search : "";
  const params = new URLSearchParams(rawSearch);
  const token = params.get("share_token");
  return typeof token === "string" ? token.trim() : "";
}
