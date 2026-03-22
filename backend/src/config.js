export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT || 8080),
    shell: env.SHELL || "bash",
    dataPath: env.DATA_PATH || "./data/sessions.json",
    corsOrigin: env.CORS_ORIGIN || "*"
  };
}
