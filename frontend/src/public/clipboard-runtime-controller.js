export function createClipboardRuntimeController(options = {}) {
  const navigatorRef = options.navigatorRef || globalThis.navigator || null;

  async function writeText(text) {
    if (!navigatorRef?.clipboard || typeof navigatorRef.clipboard.writeText !== "function") {
      return false;
    }
    await navigatorRef.clipboard.writeText(String(text ?? ""));
    return true;
  }

  async function readText() {
    if (!navigatorRef?.clipboard || typeof navigatorRef.clipboard.readText !== "function") {
      return "";
    }
    const text = await navigatorRef.clipboard.readText();
    return typeof text === "string" ? text : String(text ?? "");
  }

  return {
    writeText,
    readText
  };
}
