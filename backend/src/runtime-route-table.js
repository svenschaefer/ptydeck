import { ApiError } from "./errors.js";

function decodePathParam(value, name) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new ApiError(400, "ValidationError", `Invalid path parameter encoding for '${name}'.`);
  }
}

export function matchRuntimeRoute(pathname, method) {
  if (pathname === "/health" && method === "GET") {
    return { kind: "health" };
  }
  if (pathname === "/ready" && method === "GET") {
    return { kind: "ready" };
  }
  if (pathname === "/metrics" && method === "GET") {
    return { kind: "metrics" };
  }
  if (pathname === "/api/v1/sessions" && method === "GET") {
    return { kind: "listSessions" };
  }
  if (pathname === "/api/v1/sessions" && method === "POST") {
    return { kind: "createSession" };
  }
  if (pathname === "/api/v1/auth/dev-token" && method === "POST") {
    return { kind: "devToken" };
  }
  if (pathname === "/api/v1/auth/ws-ticket" && method === "POST") {
    return { kind: "wsTicket" };
  }
  if (pathname === "/api/v1/shares" && method === "GET") {
    return { kind: "listShares" };
  }
  if (pathname === "/api/v1/shares" && method === "POST") {
    return { kind: "createShareLink" };
  }
  if (pathname === "/api/v1/custom-commands" && method === "GET") {
    return { kind: "listCustomCommands" };
  }
  if (pathname === "/api/v1/decks" && method === "GET") {
    return { kind: "listDecks" };
  }
  if (pathname === "/api/v1/decks" && method === "POST") {
    return { kind: "createDeck" };
  }
  if (pathname === "/api/v1/layout-profiles" && method === "GET") {
    return { kind: "listLayoutProfiles" };
  }
  if (pathname === "/api/v1/layout-profiles" && method === "POST") {
    return { kind: "createLayoutProfile" };
  }
  if (pathname === "/api/v1/connection-profiles" && method === "GET") {
    return { kind: "listConnectionProfiles" };
  }
  if (pathname === "/api/v1/connection-profiles" && method === "POST") {
    return { kind: "createConnectionProfile" };
  }
  if (pathname === "/api/v1/workspace-presets" && method === "GET") {
    return { kind: "listWorkspacePresets" };
  }
  if (pathname === "/api/v1/workspace-presets" && method === "POST") {
    return { kind: "createWorkspacePreset" };
  }
  if (pathname === "/api/v1/ssh-trust-entries" && method === "GET") {
    return { kind: "listSshTrustEntries" };
  }
  if (pathname === "/api/v1/ssh-trust-entries" && method === "POST") {
    return { kind: "createSshTrustEntry" };
  }
  if (pathname === "/api/v1/ssh-host-key-probe" && method === "POST") {
    return { kind: "probeSshHostKeys" };
  }
  if (pathname === "/api/v1/operator/composer-placement" && method === "GET") {
    return { kind: "getOperatorComposerPlacement" };
  }
  if (pathname === "/api/v1/operator/composer-placement" && method === "PATCH") {
    return { kind: "updateOperatorComposerPlacement" };
  }

  const customCommandMatch = pathname.match(/^\/api\/v1\/custom-commands\/([^/]+)$/);
  if (customCommandMatch && method === "GET") {
    return { kind: "getCustomCommand", params: { commandName: decodePathParam(customCommandMatch[1], "commandName") } };
  }
  if (customCommandMatch && method === "PUT") {
    return {
      kind: "upsertCustomCommand",
      params: { commandName: decodePathParam(customCommandMatch[1], "commandName") }
    };
  }
  if (customCommandMatch && method === "DELETE") {
    return {
      kind: "deleteCustomCommand",
      params: { commandName: decodePathParam(customCommandMatch[1], "commandName") }
    };
  }

  const deckMatch = pathname.match(/^\/api\/v1\/decks\/([^/]+)$/);
  if (deckMatch && method === "GET") {
    return { kind: "getDeck", params: { deckId: decodePathParam(deckMatch[1], "deckId") } };
  }
  if (deckMatch && method === "PATCH") {
    return { kind: "updateDeck", params: { deckId: decodePathParam(deckMatch[1], "deckId") } };
  }
  if (deckMatch && method === "DELETE") {
    return { kind: "deleteDeck", params: { deckId: decodePathParam(deckMatch[1], "deckId") } };
  }

  const moveSessionMatch = pathname.match(/^\/api\/v1\/decks\/([^/]+)\/sessions\/([^/]+):move$/);
  if (moveSessionMatch && method === "POST") {
    return {
      kind: "moveSessionToDeck",
      params: {
        deckId: decodePathParam(moveSessionMatch[1], "deckId"),
        sessionId: decodePathParam(moveSessionMatch[2], "sessionId")
      }
    };
  }

  const layoutProfileMatch = pathname.match(/^\/api\/v1\/layout-profiles\/([^/]+)$/);
  if (layoutProfileMatch && method === "GET") {
    return { kind: "getLayoutProfile", params: { profileId: decodePathParam(layoutProfileMatch[1], "profileId") } };
  }
  if (layoutProfileMatch && method === "PATCH") {
    return { kind: "updateLayoutProfile", params: { profileId: decodePathParam(layoutProfileMatch[1], "profileId") } };
  }
  if (layoutProfileMatch && method === "DELETE") {
    return { kind: "deleteLayoutProfile", params: { profileId: decodePathParam(layoutProfileMatch[1], "profileId") } };
  }

  const connectionProfileMatch = pathname.match(/^\/api\/v1\/connection-profiles\/([^/]+)$/);
  if (connectionProfileMatch && method === "GET") {
    return {
      kind: "getConnectionProfile",
      params: { profileId: decodePathParam(connectionProfileMatch[1], "profileId") }
    };
  }
  if (connectionProfileMatch && method === "PATCH") {
    return {
      kind: "updateConnectionProfile",
      params: { profileId: decodePathParam(connectionProfileMatch[1], "profileId") }
    };
  }
  if (connectionProfileMatch && method === "DELETE") {
    return {
      kind: "deleteConnectionProfile",
      params: { profileId: decodePathParam(connectionProfileMatch[1], "profileId") }
    };
  }

  const workspacePresetMatch = pathname.match(/^\/api\/v1\/workspace-presets\/([^/]+)$/);
  if (workspacePresetMatch && method === "GET") {
    return { kind: "getWorkspacePreset", params: { presetId: decodePathParam(workspacePresetMatch[1], "presetId") } };
  }
  if (workspacePresetMatch && method === "PATCH") {
    return { kind: "updateWorkspacePreset", params: { presetId: decodePathParam(workspacePresetMatch[1], "presetId") } };
  }
  if (workspacePresetMatch && method === "DELETE") {
    return { kind: "deleteWorkspacePreset", params: { presetId: decodePathParam(workspacePresetMatch[1], "presetId") } };
  }

  const sshTrustEntryMatch = pathname.match(/^\/api\/v1\/ssh-trust-entries\/([^/]+)$/);
  if (sshTrustEntryMatch && method === "DELETE") {
    return {
      kind: "deleteSshTrustEntry",
      params: { entryId: decodePathParam(sshTrustEntryMatch[1], "entryId") }
    };
  }

  const shareLinkMatch = pathname.match(/^\/api\/v1\/shares\/([^/]+)$/);
  if (shareLinkMatch && method === "GET") {
    return { kind: "getShareLink", params: { shareId: decodePathParam(shareLinkMatch[1], "shareId") } };
  }

  const revokeShareLinkMatch = pathname.match(/^\/api\/v1\/shares\/([^/]+)\/revoke$/);
  if (revokeShareLinkMatch && method === "POST") {
    return { kind: "revokeShareLink", params: { shareId: decodePathParam(revokeShareLinkMatch[1], "shareId") } };
  }

  const getSessionMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)$/);
  if (getSessionMatch && method === "GET") {
    return { kind: "getSession", params: { sessionId: decodePathParam(getSessionMatch[1], "sessionId") } };
  }
  if (getSessionMatch && method === "PATCH") {
    return { kind: "updateSession", params: { sessionId: decodePathParam(getSessionMatch[1], "sessionId") } };
  }
  if (getSessionMatch && method === "DELETE") {
    return { kind: "deleteSession", params: { sessionId: decodePathParam(getSessionMatch[1], "sessionId") } };
  }

  const inputMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/input$/);
  if (inputMatch && method === "POST") {
    return { kind: "input", params: { sessionId: decodePathParam(inputMatch[1], "sessionId") } };
  }

  const swapQuickIdMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/swap-quick-id$/);
  if (swapQuickIdMatch && method === "POST") {
    return { kind: "swapSessionQuickId", params: { sessionId: decodePathParam(swapQuickIdMatch[1], "sessionId") } };
  }

  const replayExportMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/replay-export$/);
  if (replayExportMatch && method === "GET") {
    return { kind: "getSessionReplayExport", params: { sessionId: decodePathParam(replayExportMatch[1], "sessionId") } };
  }

  const replayExcerptMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/replay-excerpt$/);
  if (replayExcerptMatch && method === "GET") {
    return { kind: "getSessionReplayExcerpt", params: { sessionId: decodePathParam(replayExcerptMatch[1], "sessionId") } };
  }

  const fileTransferUploadMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/file-transfer\/upload$/);
  if (fileTransferUploadMatch && method === "POST") {
    return { kind: "uploadSessionFile", params: { sessionId: decodePathParam(fileTransferUploadMatch[1], "sessionId") } };
  }

  const fileTransferDownloadMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/file-transfer\/download$/);
  if (fileTransferDownloadMatch && method === "POST") {
    return { kind: "downloadSessionFile", params: { sessionId: decodePathParam(fileTransferDownloadMatch[1], "sessionId") } };
  }

  const resizeMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/resize$/);
  if (resizeMatch && method === "POST") {
    return { kind: "resize", params: { sessionId: decodePathParam(resizeMatch[1], "sessionId") } };
  }

  const takeControlMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/control\/take$/);
  if (takeControlMatch && method === "POST") {
    return { kind: "takeSessionControl", params: { sessionId: decodePathParam(takeControlMatch[1], "sessionId") } };
  }

  if (pathname === "/api/v1/session-control/take" && method === "POST") {
    return { kind: "takeSessionControlScope", params: {} };
  }

  const releaseControlMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/control\/release$/);
  if (releaseControlMatch && method === "POST") {
    return { kind: "releaseSessionControl", params: { sessionId: decodePathParam(releaseControlMatch[1], "sessionId") } };
  }

  const transferControlMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/control\/transfer$/);
  if (transferControlMatch && method === "POST") {
    return { kind: "transferSessionControl", params: { sessionId: decodePathParam(transferControlMatch[1], "sessionId") } };
  }

  const renameControlClientMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/control\/rename-client$/);
  if (renameControlClientMatch && method === "POST") {
    return {
      kind: "renameSessionControlClient",
      params: { sessionId: decodePathParam(renameControlClientMatch[1], "sessionId") }
    };
  }

  const forgetControlClientMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/control\/forget-client$/);
  if (forgetControlClientMatch && method === "POST") {
    return {
      kind: "forgetSessionControlClient",
      params: { sessionId: decodePathParam(forgetControlClientMatch[1], "sessionId") }
    };
  }

  const restartMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/restart$/);
  if (restartMatch && method === "POST") {
    return { kind: "restart", params: { sessionId: decodePathParam(restartMatch[1], "sessionId") } };
  }

  const startMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/start$/);
  if (startMatch && method === "POST") {
    return { kind: "start", params: { sessionId: decodePathParam(startMatch[1], "sessionId") } };
  }

  const stopMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/stop$/);
  if (stopMatch && method === "POST") {
    return { kind: "stop", params: { sessionId: decodePathParam(stopMatch[1], "sessionId") } };
  }

  const interruptMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/interrupt$/);
  if (interruptMatch && method === "POST") {
    return { kind: "interrupt", params: { sessionId: decodePathParam(interruptMatch[1], "sessionId") } };
  }

  const terminateMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/terminate$/);
  if (terminateMatch && method === "POST") {
    return { kind: "terminate", params: { sessionId: decodePathParam(terminateMatch[1], "sessionId") } };
  }

  const killMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/kill$/);
  if (killMatch && method === "POST") {
    return { kind: "kill", params: { sessionId: decodePathParam(killMatch[1], "sessionId") } };
  }

  return { kind: "notFound" };
}

export function normalizeRuntimeMetricsPath(pathname) {
  if (/^\/api\/v1\/decks\/[^/]+\/sessions\/[^/]+:move$/.test(pathname)) {
    return "/api/v1/decks/{deckId}/sessions/{sessionId}:move";
  }
  if (/^\/api\/v1\/decks\/[^/]+$/.test(pathname)) {
    return "/api/v1/decks/{deckId}";
  }
  if (/^\/api\/v1\/layout-profiles\/[^/]+$/.test(pathname)) {
    return "/api/v1/layout-profiles/{profileId}";
  }
  if (/^\/api\/v1\/workspace-presets\/[^/]+$/.test(pathname)) {
    return "/api/v1/workspace-presets/{presetId}";
  }
  if (/^\/api\/v1\/connection-profiles\/[^/]+$/.test(pathname)) {
    return "/api/v1/connection-profiles/{profileId}";
  }
  if (/^\/api\/v1\/ssh-trust-entries\/[^/]+$/.test(pathname)) {
    return "/api/v1/ssh-trust-entries/{entryId}";
  }
  if (pathname === "/api/v1/operator/composer-placement") {
    return "/api/v1/operator/composer-placement";
  }
  if (/^\/api\/v1\/shares\/[^/]+\/revoke$/.test(pathname)) {
    return "/api/v1/shares/{shareId}/revoke";
  }
  if (/^\/api\/v1\/shares\/[^/]+$/.test(pathname)) {
    return "/api/v1/shares/{shareId}";
  }
  if (/^\/api\/v1\/custom-commands\/[^/]+$/.test(pathname)) {
    return "/api/v1/custom-commands/{commandName}";
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/input$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}/input";
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/swap-quick-id$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}/swap-quick-id";
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/replay-export$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}/replay-export";
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/replay-excerpt$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}/replay-excerpt";
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/file-transfer\/upload$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}/file-transfer/upload";
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/file-transfer\/download$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}/file-transfer/download";
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/resize$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}/resize";
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/control\/take$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}/control/take";
  }
  if (pathname === "/api/v1/session-control/take") {
    return "/api/v1/session-control/take";
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/control\/release$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}/control/release";
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/control\/transfer$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}/control/transfer";
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/control\/rename-client$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}/control/rename-client";
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/control\/forget-client$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}/control/forget-client";
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/restart$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}/restart";
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/start$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}/start";
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/stop$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}/stop";
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/interrupt$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}/interrupt";
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/terminate$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}/terminate";
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/kill$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}/kill";
  }
  if (/^\/api\/v1\/sessions\/[^/]+$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}";
  }
  return pathname;
}
