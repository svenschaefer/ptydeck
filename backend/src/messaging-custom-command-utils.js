const CUSTOM_COMMAND_KIND_VALUES = new Set(["plain", "template"]);
const CUSTOM_COMMAND_SCOPE_VALUES = new Set(["global", "project", "session"]);
const DEFAULT_CUSTOM_COMMAND_SCOPE = "project";
const CUSTOM_COMMAND_SCOPE_PRECEDENCE = Object.freeze({
  global: 100,
  project: 200,
  session: 300
});
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

function normalizeCustomCommandName(name) {
  return normalizeLower(name);
}

function normalizeCustomCommandKind(value) {
  const normalized = normalizeLower(value);
  return CUSTOM_COMMAND_KIND_VALUES.has(normalized) ? normalized : "plain";
}

function normalizeCustomCommandScope(value) {
  const normalized = normalizeLower(value);
  return CUSTOM_COMMAND_SCOPE_VALUES.has(normalized) ? normalized : DEFAULT_CUSTOM_COMMAND_SCOPE;
}

function normalizeCustomCommandSessionId(value) {
  return normalizeText(value);
}

function getCustomCommandPrecedence(scope) {
  return CUSTOM_COMMAND_SCOPE_PRECEDENCE[normalizeCustomCommandScope(scope)] || CUSTOM_COMMAND_SCOPE_PRECEDENCE[DEFAULT_CUSTOM_COMMAND_SCOPE];
}

function buildCustomCommandLookupKey(name, scope, sessionId = "") {
  const normalizedName = normalizeCustomCommandName(name);
  const normalizedScope = normalizeCustomCommandScope(scope);
  const normalizedSessionId = normalizedScope === "session" ? normalizeCustomCommandSessionId(sessionId) : "";
  return `${normalizedScope}:${normalizedSessionId}:${normalizedName}`;
}

function normalizeCustomCommandTemplateVariables(values) {
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
  const scope = normalizeCustomCommandScope(command.scope);
  return {
    name,
    content: typeof command.content === "string" ? command.content : "",
    kind: normalizeCustomCommandKind(command.kind),
    scope,
    sessionId: scope === "session" ? normalizeCustomCommandSessionId(command.sessionId) : null,
    precedence: Number.isInteger(command.precedence) ? Number(command.precedence) : getCustomCommandPrecedence(scope),
    templateVariables: normalizeCustomCommandTemplateVariables(command.templateVariables),
    createdAt: Number(command.createdAt || 0),
    updatedAt: Number(command.updatedAt || 0),
    lookupKey: buildCustomCommandLookupKey(name, scope, command.sessionId)
  };
}

export function compareCustomCommandRecords(leftValue, rightValue) {
  const left = normalizeCustomCommandRecord(leftValue);
  const right = normalizeCustomCommandRecord(rightValue);
  if (!left && !right) {
    return 0;
  }
  if (!left) {
    return 1;
  }
  if (!right) {
    return -1;
  }
  const nameCompare = left.name.localeCompare(right.name, "en-US", { sensitivity: "base" });
  if (nameCompare !== 0) {
    return nameCompare;
  }
  if (left.precedence !== right.precedence) {
    return right.precedence - left.precedence;
  }
  const scopeCompare = left.scope.localeCompare(right.scope, "en-US", { sensitivity: "base" });
  if (scopeCompare !== 0) {
    return scopeCompare;
  }
  const sessionCompare = String(left.sessionId || "").localeCompare(String(right.sessionId || ""), "en-US", { sensitivity: "base" });
  if (sessionCompare !== 0) {
    return sessionCompare;
  }
  if (left.createdAt !== right.createdAt) {
    return left.createdAt - right.createdAt;
  }
  if (left.updatedAt !== right.updatedAt) {
    return left.updatedAt - right.updatedAt;
  }
  return left.content.localeCompare(right.content, "en-US", { sensitivity: "base" });
}

function analyzeCustomCommandTemplate(content) {
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

function collectTemplateInvocationAssignments(parameterTokens = []) {
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
  return {
    assignments,
    duplicateParameters,
    invalidTokens
  };
}

function validateTemplateParameterAssignments(template, parameterAssignments, customCommandName) {
  const missing = template.parameters.filter((name) => !Object.prototype.hasOwnProperty.call(parameterAssignments, name));
  if (missing.length > 0) {
    return `Missing template parameter(s) for /${customCommandName}: ${missing.join(", ")}.`;
  }
  const unknown = Object.keys(parameterAssignments).filter((name) => !template.parameters.includes(name));
  if (unknown.length > 0) {
    return `Unknown template parameter(s) for /${customCommandName}: ${unknown.join(", ")}.`;
  }
  return "";
}

function isCustomCommandVisibleForSession(command, sessionId) {
  const custom = normalizeCustomCommandRecord(command);
  if (!custom) {
    return false;
  }
  if (custom.scope === "session") {
    return normalizeCustomCommandSessionId(sessionId) === custom.sessionId;
  }
  return true;
}

export function resolveCustomCommandForSession(commands, name, sessionId) {
  const normalizedName = normalizeCustomCommandName(name);
  const visible = (Array.isArray(commands) ? commands : [])
    .map((entry) => normalizeCustomCommandRecord(entry))
    .filter((entry) => entry && entry.name === normalizedName && isCustomCommandVisibleForSession(entry, sessionId))
    .sort(compareCustomCommandRecords);
  return visible[0] || null;
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
  const parameterTokens = separatorIndex >= 0 ? segments.slice(0, separatorIndex) : segments.slice();
  let targetSelector = "";
  if (separatorIndex >= 0) {
    targetSelector = segments.slice(separatorIndex + 1).join(" ").trim();
  } else if (template.parameters.length === 0 && segments.every((token) => !token.includes("="))) {
    targetSelector = remainder;
  }

  const { assignments, duplicateParameters, invalidTokens } = collectTemplateInvocationAssignments(parameterTokens);

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

  const assignmentError = validateTemplateParameterAssignments(template, assignments, custom.name);
  if (assignmentError) {
    return {
      ok: false,
      error: assignmentError
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

  const assignmentError = validateTemplateParameterAssignments(template, parameterAssignments, custom.name);
  if (assignmentError) {
    return {
      ok: false,
      error: assignmentError
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

function countUnescapedSingleQuotes(line) {
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

function escapeUnescapedSingleQuotes(line) {
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
  return lines
    .map((line) => (countUnescapedSingleQuotes(line) % 2 !== 0 ? escapeUnescapedSingleQuotes(line) : line))
    .join("\n");
}
