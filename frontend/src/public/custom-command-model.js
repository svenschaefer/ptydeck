const CUSTOM_COMMAND_KIND_VALUES = new Set(["plain", "template"]);
const CUSTOM_COMMAND_TEMPLATE_PARAM_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const CUSTOM_COMMAND_TEMPLATE_VARIABLE_VALUES = new Set([
  "deck.id",
  "deck.name",
  "session.cwd",
  "session.id",
  "session.name",
  "session.note"
]);

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

export function normalizeCustomCommandName(name) {
  return normalizeLower(name);
}

export function normalizeCustomCommandKind(value) {
  const normalized = normalizeLower(value);
  return CUSTOM_COMMAND_KIND_VALUES.has(normalized) ? normalized : "plain";
}

export function normalizeCustomCommandTemplateVariables(values) {
  const normalized = [];
  const seen = new Set();
  for (const entry of Array.isArray(values) ? values : []) {
    const value = normalizeLower(entry);
    if (!CUSTOM_COMMAND_TEMPLATE_VARIABLE_VALUES.has(value) || seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push(value);
  }
  return normalized.sort((left, right) => left.localeCompare(right, "en-US"));
}

export function normalizeCustomCommandRecord(command) {
  if (!command || typeof command !== "object") {
    return null;
  }
  const name = normalizeCustomCommandName(command.name);
  if (!name) {
    return null;
  }
  return {
    name,
    content: typeof command.content === "string" ? command.content : "",
    kind: normalizeCustomCommandKind(command.kind),
    templateVariables: normalizeCustomCommandTemplateVariables(command.templateVariables),
    createdAt: Number(command.createdAt || 0),
    updatedAt: Number(command.updatedAt || 0)
  };
}

export function analyzeCustomCommandTemplate(content) {
  const text = typeof content === "string" ? content : "";
  const tokens = [];
  let invalid = false;
  const remainder = text.replaceAll(/{{[\s\S]*?}}/g, (wrapper) => {
    const match = /^{{\s*(param|var)\s*:\s*([A-Za-z0-9_.-]+)\s*}}$/.exec(wrapper);
    if (!match) {
      invalid = true;
      return "";
    }
    const type = match[1];
    const name = normalizeLower(match[2]);
    if (type === "param") {
      if (!CUSTOM_COMMAND_TEMPLATE_PARAM_NAME_PATTERN.test(name)) {
        invalid = true;
        return "";
      }
    } else if (!CUSTOM_COMMAND_TEMPLATE_VARIABLE_VALUES.has(name)) {
      invalid = true;
      return "";
    }
    tokens.push({ type, name });
    return "";
  });

  if (invalid || remainder.includes("{{") || remainder.includes("}}")) {
    return {
      ok: false,
      error: "Template custom-command content contains an invalid placeholder. Use '{{param:name}}' or '{{var:session.id}}'."
    };
  }

  const parameters = [];
  const seenParameters = new Set();
  const templateVariables = [];
  const seenTemplateVariables = new Set();
  for (const token of tokens) {
    if (token.type === "param") {
      if (!seenParameters.has(token.name)) {
        seenParameters.add(token.name);
        parameters.push(token.name);
      }
      continue;
    }
    if (!seenTemplateVariables.has(token.name)) {
      seenTemplateVariables.add(token.name);
      templateVariables.push(token.name);
    }
  }

  return {
    ok: true,
    tokens,
    parameters: parameters.sort((left, right) => left.localeCompare(right, "en-US")),
    templateVariables: templateVariables.sort((left, right) => left.localeCompare(right, "en-US"))
  };
}

function parseCustomCommandHeader(header, usageText) {
  const raw = normalizeText(header);
  if (!raw) {
    return { ok: false, error: usageText };
  }
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { ok: false, error: usageText };
  }
  let kind = "plain";
  let name = parts[0];
  if (parts[0] === "plain" || parts[0] === "template") {
    kind = parts[0];
    name = parts[1] || "";
    if (!name || parts.length !== 2) {
      return { ok: false, error: usageText };
    }
    return { ok: true, kind, name };
  }
  if (parts.length !== 1) {
    return { ok: false, error: "Block definition header must be '/custom <name>' or '/custom template <name>' only." };
  }
  return { ok: true, kind, name };
}

function parseInlineCustomCommand(afterPrefix, usageText) {
  const trimmed = normalizeText(afterPrefix);
  if (!trimmed) {
    return { ok: false, error: usageText };
  }
  const firstWhitespace = trimmed.search(/\s/);
  if (firstWhitespace < 0) {
    return { ok: false, error: usageText };
  }
  const firstToken = trimmed.slice(0, firstWhitespace);
  let kind = "plain";
  let name = firstToken;
  let content = trimmed.slice(firstWhitespace).trimStart();

  if (firstToken === "plain" || firstToken === "template") {
    kind = firstToken;
    const rest = trimmed.slice(firstWhitespace).trimStart();
    const secondWhitespace = rest.search(/\s/);
    if (secondWhitespace < 0) {
      return { ok: false, error: usageText };
    }
    name = rest.slice(0, secondWhitespace);
    content = rest.slice(secondWhitespace).trimStart();
  }

  if (!content) {
    return { ok: false, error: "Inline custom-command content cannot be empty." };
  }
  return { ok: true, name, kind, content, mode: "inline" };
}

export function parseCustomCommandDefinition(rawInput, usageText = "Usage: /custom [plain|template] <name> <text> | /custom [plain|template] <name> + block") {
  const raw = String(rawInput || "").replaceAll("\r\n", "\n");
  const trimmedStart = raw.trimStart();
  const prefix = "/custom";
  if (!trimmedStart.startsWith(prefix)) {
    return { ok: false, error: "Invalid /custom command input." };
  }

  const afterPrefix = trimmedStart.slice(prefix.length);
  const newlineIndex = afterPrefix.indexOf("\n");
  const parsed =
    newlineIndex === -1
      ? parseInlineCustomCommand(afterPrefix, usageText)
      : (() => {
          const header = parseCustomCommandHeader(afterPrefix.slice(0, newlineIndex), usageText);
          if (!header.ok) {
            return header;
          }
          const trailing = afterPrefix.slice(newlineIndex + 1);
          const lines = trailing.split("\n");
          if (lines.length === 0 || lines[0].trim() !== "---") {
            return { ok: false, error: "Block definition must start with '---' on its own line." };
          }
          let closingIndex = -1;
          for (let index = 1; index < lines.length; index += 1) {
            if (lines[index].trim() === "---") {
              closingIndex = index;
              break;
            }
          }
          if (closingIndex < 0) {
            return { ok: false, error: "Block definition must end with a closing '---' line." };
          }
          const contentLines = lines.slice(1, closingIndex);
          const normalizedContentLines = contentLines.map((line) => (line.trim() === "\\---" ? "---" : line));
          const content = normalizedContentLines.join("\n");
          if (!content) {
            return { ok: false, error: "Block custom-command content cannot be empty." };
          }
          const trailingLines = lines.slice(closingIndex + 1);
          const afterClosing = trailingLines.join("\n").trim();
          if (afterClosing) {
            return {
              ok: false,
              error: "Block payload contains content after closing '---'. For a literal delimiter line inside payload, use '\\---'."
            };
          }
          return { ok: true, name: header.name, kind: header.kind, content, mode: "block" };
        })();

  if (!parsed.ok) {
    return parsed;
  }

  if (parsed.kind !== "template") {
    return {
      ...parsed,
      templateVariables: [],
      parameters: []
    };
  }

  const template = analyzeCustomCommandTemplate(parsed.content);
  if (!template.ok) {
    return { ok: false, error: template.error };
  }
  if (template.tokens.length === 0) {
    return {
      ok: false,
      error: "Template custom-command content must contain at least one '{{param:name}}' or '{{var:...}}' placeholder."
    };
  }

  return {
    ...parsed,
    templateVariables: template.templateVariables,
    parameters: template.parameters
  };
}

export function parseCustomCommandInvocation(rawInput, command) {
  const custom = normalizeCustomCommandRecord(command);
  if (!custom) {
    return { ok: false, error: "Unknown custom command." };
  }

  const prefix = `/${custom.name}`;
  const raw = normalizeText(rawInput);
  if (!raw.toLowerCase().startsWith(prefix.toLowerCase())) {
    return { ok: false, error: `Invalid custom command invocation for /${custom.name}.` };
  }
  const remainder = normalizeText(raw.slice(prefix.length));
  if (custom.kind !== "template") {
    return { ok: true, parameterAssignments: {}, targetSelector: remainder };
  }

  const template = analyzeCustomCommandTemplate(custom.content);
  if (!template.ok) {
    return { ok: false, error: `Template custom command /${custom.name} is invalid.` };
  }

  const segments = remainder ? remainder.split(/\s+/) : [];
  const separatorIndex = segments.indexOf("--");
  const parameterTokens =
    separatorIndex >= 0 ? segments.slice(0, separatorIndex) : segments.slice();
  let targetSelector = "";
  if (separatorIndex >= 0) {
    targetSelector = segments.slice(separatorIndex + 1).join(" ").trim();
  } else if (template.parameters.length === 0 && segments.every((token) => !token.includes("="))) {
    targetSelector = remainder;
  }

  const assignments = {};
  const duplicateParameters = [];
  const invalidTokens = [];
  for (const token of parameterTokens) {
    if (!token) {
      continue;
    }
    const equalsIndex = token.indexOf("=");
    if (equalsIndex < 1) {
      invalidTokens.push(token);
      continue;
    }
    const name = normalizeLower(token.slice(0, equalsIndex));
    const value = token.slice(equalsIndex + 1);
    if (!CUSTOM_COMMAND_TEMPLATE_PARAM_NAME_PATTERN.test(name)) {
      invalidTokens.push(token);
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(assignments, name)) {
      duplicateParameters.push(name);
      continue;
    }
    assignments[name] = value;
  }

  if (invalidTokens.length > 0) {
    return {
      ok: false,
      error: `Template custom command /${custom.name} uses 'key=value' parameters and optional '-- <targetSelector>'.`
    };
  }
  if (duplicateParameters.length > 0) {
    return {
      ok: false,
      error: `Duplicate template parameter assignment(s) for /${custom.name}: ${duplicateParameters.join(", ")}.`
    };
  }

  const missing = template.parameters.filter((name) => !Object.prototype.hasOwnProperty.call(assignments, name));
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing template parameter(s) for /${custom.name}: ${missing.join(", ")}.`
    };
  }

  const unknown = Object.keys(assignments).filter((name) => !template.parameters.includes(name));
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `Unknown template parameter(s) for /${custom.name}: ${unknown.join(", ")}.`
    };
  }

  return {
    ok: true,
    parameterAssignments: assignments,
    targetSelector
  };
}

function resolveBuiltInTemplateVariable(name, session = {}, deck = null) {
  switch (name) {
    case "session.id":
      return String(session?.id || "");
    case "session.name":
      return String(session?.name || "");
    case "session.cwd":
      return String(session?.cwd || session?.startCwd || "");
    case "session.note":
      return String(session?.note || "");
    case "deck.id":
      return String(deck?.id || session?.deckId || "");
    case "deck.name":
      return String(deck?.name || "");
    default:
      return "";
  }
}

export function renderCustomCommandForSession(command, session, deck, parameterAssignments = {}) {
  const custom = normalizeCustomCommandRecord(command);
  if (!custom) {
    return { ok: false, error: "Unknown custom command." };
  }
  if (custom.kind !== "template") {
    return { ok: true, text: custom.content };
  }

  const template = analyzeCustomCommandTemplate(custom.content);
  if (!template.ok) {
    return { ok: false, error: `Template custom command /${custom.name} is invalid.` };
  }

  const missing = template.parameters.filter((name) => !Object.prototype.hasOwnProperty.call(parameterAssignments, name));
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing template parameter(s) for /${custom.name}: ${missing.join(", ")}.`
    };
  }

  const unknown = Object.keys(parameterAssignments).filter((name) => !template.parameters.includes(name));
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `Unknown template parameter(s) for /${custom.name}: ${unknown.join(", ")}.`
    };
  }

  const text = custom.content.replaceAll(/{{[\s\S]*?}}/g, (wrapper) => {
    const match = /^{{\s*(param|var)\s*:\s*([A-Za-z0-9_.-]+)\s*}}$/.exec(wrapper);
    if (!match) {
      return wrapper;
    }
    const type = match[1];
    const name = normalizeLower(match[2]);
    if (type === "param") {
      return String(parameterAssignments[name] ?? "");
    }
    return resolveBuiltInTemplateVariable(name, session, deck);
  });

  return { ok: true, text };
}

export function formatCustomCommandDetail(command) {
  const custom = normalizeCustomCommandRecord(command);
  if (!custom) {
    return "";
  }
  if (custom.kind !== "template") {
    return custom.content;
  }
  const template = analyzeCustomCommandTemplate(custom.content);
  if (!template.ok) {
    return custom.content;
  }
  const parts = [];
  if (template.parameters.length > 0) {
    parts.push(`params=${template.parameters.join(",")}`);
  }
  if (template.templateVariables.length > 0) {
    parts.push(`vars=${template.templateVariables.join(",")}`);
  }
  const prefix = parts.length > 0 ? `${parts.join(" ")} · ` : "";
  return `${prefix}${custom.content}`;
}
