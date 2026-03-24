export function withSingleTrailingNewline(value, mode = "auto") {
  const normalizedLines = String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n+$/g, "");
  const lineSeparator = mode === "lf" ? "\n" : "\r";
  const suffix =
    mode === "lf" ? "\n" : mode === "crlf" ? "\r\n" : mode === "cr2" ? "\r\r" : "\r";
  const body = normalizedLines.replace(/\n/g, lineSeparator);
  return `${body}${suffix}`;
}

export function normalizePayloadWithoutTrailingNewline(value, mode = "auto") {
  const normalizedLines = String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n+$/g, "");
  const lineSeparator = mode === "lf" ? "\n" : "\r";
  return normalizedLines.replace(/\n/g, lineSeparator);
}

export async function sendInputWithConfiguredTerminator(sendInput, sessionId, value, mode, options = {}) {
  const normalizeMode =
    typeof options.normalizeMode === "function" ? options.normalizeMode : (inputMode) => String(inputMode || "");
  const delayedSubmitMs = Number.isFinite(options.delayedSubmitMs) ? options.delayedSubmitMs : 90;
  const normalizedMode = normalizeMode(String(mode || "").toLowerCase());
  if (normalizedMode === "cr_delay") {
    const body = normalizePayloadWithoutTrailingNewline(value, "cr");
    if (body) {
      await sendInput(sessionId, body);
    }
    await new Promise((resolve) => setTimeout(resolve, delayedSubmitMs));
    await sendInput(sessionId, "\r");
    return;
  }
  const payload = withSingleTrailingNewline(value, normalizedMode);
  await sendInput(sessionId, payload);
}

export function countUnescapedSingleQuotes(line) {
  let count = 0;
  let escaped = false;
  const text = String(line || "");
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "'") {
      count += 1;
    }
  }
  return count;
}

export function escapeUnescapedSingleQuotes(line) {
  let escaped = false;
  let result = "";
  const text = String(line || "");
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      result += char;
      escaped = true;
      continue;
    }
    if (char === "'") {
      result += "\\'";
      continue;
    }
    result += char;
  }
  return result;
}

export function normalizeCustomCommandPayloadForShell(value) {
  const lines = String(value || "").replace(/\r\n/g, "\n").split("\n");
  const normalized = lines.map((line) => {
    if (countUnescapedSingleQuotes(line) % 2 !== 0) {
      return escapeUnescapedSingleQuotes(line);
    }
    return line;
  });
  return normalized.join("\n");
}
