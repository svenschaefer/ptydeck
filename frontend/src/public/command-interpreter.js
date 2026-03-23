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

  const body = input.slice(1).trim();
  const parts = body ? body.split(/\s+/) : [];
  const command = parts[0] || "";
  const args = parts.slice(1);

  return {
    kind: "control",
    command,
    args,
    raw: input
  };
}
