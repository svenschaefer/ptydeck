export function buildRestartSessionCreatePayload({
  sessionMeta,
  remoteSecret,
  updatedAt,
  trace
} = {}) {
  const snapshot = sessionMeta && typeof sessionMeta === "object" && !Array.isArray(sessionMeta) ? sessionMeta : {};
  const restartCwd =
    typeof snapshot.startCwd === "string" && snapshot.startCwd.trim()
      ? snapshot.startCwd
      : typeof snapshot.cwd === "string" && snapshot.cwd.trim()
        ? snapshot.cwd
        : undefined;
  return {
    id: snapshot.id,
    kind: snapshot.kind,
    remoteConnection: snapshot.remoteConnection,
    remoteAuth: snapshot.remoteAuth,
    remoteSecret,
    quickIdToken: snapshot.quickIdToken,
    cwd: restartCwd,
    shell: snapshot.shell,
    name: snapshot.name,
    startCwd: restartCwd,
    startCommand: typeof snapshot.startCommand === "string" ? snapshot.startCommand : "",
    env: snapshot.env && typeof snapshot.env === "object" && !Array.isArray(snapshot.env) ? snapshot.env : {},
    note: snapshot.note,
    mouseForwardingMode: snapshot.mouseForwardingMode,
    inputSafetyProfile: snapshot.inputSafetyProfile,
    tags: Array.isArray(snapshot.tags) ? snapshot.tags : [],
    quickSendUsage: Array.isArray(snapshot.quickSendUsage) ? snapshot.quickSendUsage : [],
    themeProfile: snapshot.themeProfile && typeof snapshot.themeProfile === "object" && !Array.isArray(snapshot.themeProfile)
      ? snapshot.themeProfile
      : {},
    activeThemeProfile: snapshot.activeThemeProfile,
    inactiveThemeProfile: snapshot.inactiveThemeProfile,
    createdAt: snapshot.createdAt,
    updatedAt,
    trace
  };
}
