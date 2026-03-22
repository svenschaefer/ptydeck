export function loadConfig(env = process.env) {
  const maxBodyBytes = Number(env.MAX_BODY_BYTES || 1024 * 1024);
  return {
    port: Number(env.PORT || 8080),
    shell: env.SHELL || "bash",
    dataPath: env.DATA_PATH || "./data/sessions.json",
    corsOrigin: env.CORS_ORIGIN || "*",
    maxBodyBytes: Number.isFinite(maxBodyBytes) && maxBodyBytes > 0 ? maxBodyBytes : 1024 * 1024
  };
}
