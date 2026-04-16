import { compareCustomCommandRecords, normalizeCustomCommandRecord } from "./messaging-custom-command-utils.js";

const TELEGRAM_COMMAND_MAX_COUNT = 100;
const TELEGRAM_COMMAND_NAME_MAX_LENGTH = 32;
const TELEGRAM_COMMAND_DESCRIPTION_MAX_LENGTH = 256;
const TELEGRAM_COMMAND_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;

function normalizeNonEmptyString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function truncateDescription(value) {
  const normalized = normalizeNonEmptyString(value).replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }
  if (normalized.length <= TELEGRAM_COMMAND_DESCRIPTION_MAX_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, TELEGRAM_COMMAND_DESCRIPTION_MAX_LENGTH - 1)).trimEnd()}…`;
}

function encodeTelegramCommandName(name) {
  const normalized = normalizeNonEmptyString(String(name || "").toLowerCase());
  if (!normalized) {
    return "";
  }
  let encoded = "";
  for (const char of normalized) {
    if ((char >= "a" && char <= "z") || (char >= "0" && char <= "9")) {
      encoded += char;
      continue;
    }
    if (char === "_") {
      encoded += "__";
      continue;
    }
    if (char === "-") {
      encoded += "_d";
      continue;
    }
    return "";
  }
  if (!encoded) {
    return "";
  }
  if (!(encoded[0] >= "a" && encoded[0] <= "z")) {
    encoded = `c_${encoded}`;
  }
  if (encoded.length > TELEGRAM_COMMAND_NAME_MAX_LENGTH) {
    return "";
  }
  return TELEGRAM_COMMAND_PATTERN.test(encoded) ? encoded : "";
}

function buildCustomCommandDescription(records, customName) {
  const entries = Array.isArray(records) ? records.filter(Boolean) : [];
  const scopes = new Set(entries.map((entry) => normalizeNonEmptyString(entry.scope)).filter(Boolean));
  const kind = normalizeNonEmptyString(entries[0]?.kind) || "plain";
  let scopeLabel = "custom command";
  if (scopes.size === 1) {
    if (scopes.has("global")) {
      scopeLabel = "global custom command";
    } else if (scopes.has("project")) {
      scopeLabel = "project custom command";
    } else if (scopes.has("session")) {
      scopeLabel = "session custom command";
    }
  } else if (scopes.size > 1) {
    scopeLabel = "scoped custom command";
  }
  const kindLabel = kind === "template" ? "template" : "plain";
  return truncateDescription(`${scopeLabel}; ${kindLabel}; /${customName}`);
}

function normalizeCatalogEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  const telegramCommand = normalizeNonEmptyString(entry.telegramCommand).toLowerCase();
  const action = normalizeNonEmptyString(entry.action).toLowerCase();
  const description = truncateDescription(entry.description);
  if (!telegramCommand || !action || !description || !TELEGRAM_COMMAND_PATTERN.test(telegramCommand)) {
    return null;
  }
  const normalized = {
    telegramCommand,
    action,
    description
  };
  if (action === "custom") {
    const customCommandName = normalizeNonEmptyString(entry.customCommandName).toLowerCase();
    if (!customCommandName) {
      return null;
    }
    normalized.customCommandName = customCommandName;
  }
  return Object.freeze(normalized);
}

export function normalizeTelegramCommandCatalog(catalog) {
  if (!catalog || typeof catalog !== "object") {
    return buildTelegramCommandCatalog();
  }
  const entries = Array.isArray(catalog.entries) ? catalog.entries.map(normalizeCatalogEntry).filter(Boolean) : [];
  const publishedCommands = entries.map((entry) =>
    Object.freeze({
      command: entry.telegramCommand,
      description: entry.description
    })
  );
  const skippedCommands = Array.isArray(catalog.skippedCommands)
    ? catalog.skippedCommands
        .map((entry) =>
          entry && typeof entry === "object"
            ? Object.freeze({
                name: normalizeNonEmptyString(entry.name).toLowerCase(),
                reason: normalizeNonEmptyString(entry.reason)
              })
            : null
        )
        .filter(Boolean)
    : [];
  return Object.freeze({
    entries: Object.freeze(entries),
    publishedCommands: Object.freeze(publishedCommands),
    skippedCommands: Object.freeze(skippedCommands)
  });
}

export function resolveTelegramCommandCatalogEntry(catalog, telegramCommand) {
  const normalizedCommand = normalizeNonEmptyString(telegramCommand).toLowerCase();
  if (!normalizedCommand) {
    return null;
  }
  const normalizedCatalog = normalizeTelegramCommandCatalog(catalog);
  return normalizedCatalog.entries.find((entry) => entry.telegramCommand === normalizedCommand) || null;
}

export function buildTelegramCommandCatalog(options = {}) {
  const customCommands = Array.isArray(options.customCommands) ? options.customCommands : [];
  const commandLimit =
    Number.isInteger(options.commandLimit) && options.commandLimit > 0 ? options.commandLimit : TELEGRAM_COMMAND_MAX_COUNT;
  const entries = [];
  const skippedCommands = [];
  const reservedNames = new Set();

  const byCustomName = new Map();
  for (const rawCommand of customCommands) {
    const command = normalizeCustomCommandRecord(rawCommand);
    if (!command) {
      continue;
    }
    const list = byCustomName.get(command.name) || [];
    list.push(command);
    byCustomName.set(command.name, list);
  }

  const customNames = Array.from(byCustomName.keys()).sort((left, right) => left.localeCompare(right, "en-US"));
  for (const customName of customNames) {
    const records = (byCustomName.get(customName) || []).slice().sort(compareCustomCommandRecords);
    const telegramCommand = encodeTelegramCommandName(customName);
    if (!telegramCommand) {
      skippedCommands.push(Object.freeze({ name: customName, reason: "telegram_name_invalid" }));
      continue;
    }
    if (reservedNames.has(telegramCommand)) {
      skippedCommands.push(Object.freeze({ name: customName, reason: "telegram_name_conflict" }));
      continue;
    }
    entries.push(
      Object.freeze({
        telegramCommand,
        action: "custom",
        customCommandName: customName,
        description: buildCustomCommandDescription(records, customName)
      })
    );
    reservedNames.add(telegramCommand);
  }

  const publishedEntries = entries.slice(0, commandLimit);
  if (entries.length > commandLimit) {
    for (const overflowEntry of entries.slice(commandLimit)) {
      skippedCommands.push(
        Object.freeze({
          name: overflowEntry.customCommandName || overflowEntry.telegramCommand,
          reason: "telegram_command_limit"
        })
      );
    }
  }

  return normalizeTelegramCommandCatalog({
    entries: publishedEntries,
    skippedCommands
  });
}
