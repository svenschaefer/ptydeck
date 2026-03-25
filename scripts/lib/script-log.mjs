export function logScriptStart(scriptPath) {
  const timestamp = new Date().toISOString();
  process.stderr.write(`[script-start] ${scriptPath} ${timestamp}\n`);
}
