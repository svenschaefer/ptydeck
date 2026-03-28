export function createClipboardRuntimeController(options = {}) {
  const navigatorRef = options.navigatorRef || globalThis.navigator || null;

  function canWriteText() {
    return !!navigatorRef?.clipboard && typeof navigatorRef.clipboard.writeText === "function";
  }

  function canReadText() {
    return !!navigatorRef?.clipboard && typeof navigatorRef.clipboard.readText === "function";
  }

  async function writeText(text) {
    if (!canWriteText()) {
      return false;
    }
    await navigatorRef.clipboard.writeText(String(text ?? ""));
    return true;
  }

  async function readText() {
    if (!canReadText()) {
      return "";
    }
    const text = await navigatorRef.clipboard.readText();
    return typeof text === "string" ? text : String(text ?? "");
  }

  return {
    canReadText,
    canWriteText,
    writeText,
    readText
  };
}
