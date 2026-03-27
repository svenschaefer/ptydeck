function parseSlashLine(line) {
  const value = typeof line === "string" ? line : "";
  const body = value.startsWith("/") ? value.slice(1).trim() : "";
  const parts = body ? body.split(/\s+/) : [];
  return {
    kind: "control",
    command: parts[0] || "",
    args: parts.slice(1),
    raw: value
  };
}

function parseSlashScriptInput(input) {
  const lines = String(input || "").split(/\r?\n/);
  const nonEmptyLines = lines.map((line) => line.trim()).filter(Boolean);
  if (nonEmptyLines.length <= 1) {
    return null;
  }

  const firstLine = nonEmptyLines[0];
  if (firstLine === "/run") {
    const scriptLines = nonEmptyLines.slice(1);
    if (scriptLines.length === 0 || scriptLines.some((line) => !line.startsWith("/"))) {
      return null;
    }
    return {
      kind: "control-script",
      mode: "run-block",
      commands: scriptLines.map((line) => parseSlashLine(line)),
      raw: input
    };
  }

  if (nonEmptyLines.every((line) => line.startsWith("/"))) {
    return {
      kind: "control-script",
      mode: "multiline",
      commands: nonEmptyLines.map((line) => parseSlashLine(line)),
      raw: input
    };
  }

  return null;
}

export function interpretComposerInput(rawInput) {
  const input = typeof rawInput === "string" ? rawInput : "";

  if (input.startsWith(">") && !input.includes("\n")) {
    return {
      kind: "quick-switch",
      selector: input.slice(1).trim(),
      raw: input
    };
  }

  if (!input.startsWith("/")) {
    return {
      kind: "terminal",
      data: input
    };
  }

  const script = parseSlashScriptInput(input);
  if (script) {
    return script;
  }

  return parseSlashLine(input);
}
