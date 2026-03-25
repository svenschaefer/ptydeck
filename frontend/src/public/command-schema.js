function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function freezeArgs(args) {
  if (!Array.isArray(args) || args.length === 0) {
    return undefined;
  }
  return Object.freeze(
    args
      .map((arg) => {
        if (!arg || typeof arg !== "object" || Array.isArray(arg)) {
          return null;
        }
        const provider = normalizeText(arg.provider);
        if (!provider) {
          return null;
        }
        return Object.freeze({
          provider,
          optional: arg.optional === true
        });
      })
      .filter(Boolean)
  );
}

function freezeSubcommands(subcommands) {
  if (!subcommands || typeof subcommands !== "object" || Array.isArray(subcommands)) {
    return undefined;
  }
  const entries = Object.entries(subcommands)
    .map(([name, definition]) => {
      const normalizedName = normalizeLower(name);
      if (!normalizedName) {
        return null;
      }
      return [normalizedName, freezeCommandDefinition(definition, `slash:${normalizedName}`)];
    })
    .filter(Boolean);
  if (entries.length === 0) {
    return undefined;
  }
  return Object.freeze(Object.fromEntries(entries));
}

function freezeUsage(usage, insertText) {
  if (Array.isArray(usage)) {
    const values = usage.map((entry) => normalizeText(entry)).filter(Boolean);
    return values.length > 0 ? Object.freeze(values) : Object.freeze([`/${normalizeText(insertText)}`]);
  }
  const normalized = normalizeText(usage);
  return Object.freeze([normalized || `/${normalizeText(insertText)}`]);
}

function freezeCommandDefinition(definition, keyPrefix = "slash") {
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    return null;
  }
  const insertText = normalizeText(definition.insertText);
  if (!insertText) {
    return null;
  }
  const label = normalizeText(definition.label) || `/${insertText}`;
  const kind = normalizeText(definition.kind) || "command";
  const description = normalizeText(definition.description);
  const example = normalizeText(definition.example);
  const summary = normalizeText(definition.summary);
  const key = normalizeText(definition.key) || `${keyPrefix}:${normalizeLower(insertText)}`;
  return Object.freeze({
    key,
    insertText,
    label,
    kind,
    description,
    example,
    summary: summary || undefined,
    usage: freezeUsage(definition.usage, insertText),
    args: freezeArgs(definition.args),
    subcommands: freezeSubcommands(definition.subcommands)
  });
}

const DEFAULT_SLASH_COMMAND_SCHEMA = Object.freeze({
  new: freezeCommandDefinition({
    key: "slash:new",
    insertText: "new",
    label: "/new",
    kind: "command",
    description: "create a new session",
    example: "/new bash",
    usage: "/new [shell]"
  }),
  deck: freezeCommandDefinition({
    key: "slash:deck",
    insertText: "deck",
    label: "/deck",
    kind: "command",
    description: "manage decks",
    example: "/deck switch ops",
    summary: "/deck list|new|rename|switch|delete",
    usage: [
      "/deck list",
      "/deck new <name>",
      "/deck rename <name>",
      "/deck rename <deckSelector> <name>",
      "/deck switch <deckSelector>",
      "/deck delete [deckSelector] [force]"
    ],
    subcommands: {
      list: {
        insertText: "list",
        label: "/deck list",
        kind: "subcommand",
        description: "list decks",
        example: "/deck list",
        key: "slash:deck:list",
        usage: "/deck list"
      },
      new: {
        insertText: "new",
        label: "/deck new",
        kind: "subcommand",
        description: "create a deck",
        example: "/deck new ops",
        key: "slash:deck:new",
        usage: "/deck new <name>"
      },
      rename: {
        insertText: "rename",
        label: "/deck rename",
        kind: "subcommand",
        description: "rename the active deck",
        example: "/deck rename ops-main",
        key: "slash:deck:rename",
        usage: [
          "/deck rename <name>",
          "/deck rename <deckSelector> <name>"
        ]
      },
      switch: {
        insertText: "switch",
        label: "/deck switch",
        kind: "subcommand",
        description: "switch active deck",
        example: "/deck switch ops",
        key: "slash:deck:switch",
        usage: "/deck switch <deckSelector>",
        args: [{ provider: "deck-selector" }]
      },
      delete: {
        insertText: "delete",
        label: "/deck delete",
        kind: "subcommand",
        description: "delete a deck",
        example: "/deck delete ops",
        key: "slash:deck:delete",
        usage: "/deck delete [deckSelector] [force]",
        args: [{ provider: "deck-selector", optional: true }]
      }
    }
  }),
  move: freezeCommandDefinition({
    key: "slash:move",
    insertText: "move",
    label: "/move",
    kind: "command",
    description: "move sessions to a deck",
    example: "/move 1 ops",
    usage: "/move <sessionSelector> <deckSelector>",
    args: [{ provider: "multi-target-selector" }, { provider: "deck-selector" }]
  }),
  size: freezeCommandDefinition({
    key: "slash:size",
    insertText: "size",
    label: "/size",
    kind: "command",
    description: "set deck terminal size",
    example: "/size 80 40",
    usage: [
      "/size <cols> <rows>",
      "/size c<cols>",
      "/size r<rows>"
    ]
  }),
  filter: freezeCommandDefinition({
    key: "slash:filter",
    insertText: "filter",
    label: "/filter",
    kind: "command",
    description: "filter visible terminals",
    example: "/filter ops",
    usage: "/filter [id/tag[,id/tag...]]",
    args: [{ provider: "filter-selector", optional: true }]
  }),
  close: freezeCommandDefinition({
    key: "slash:close",
    insertText: "close",
    label: "/close",
    kind: "command",
    description: "delete sessions",
    example: "/close 1",
    usage: "/close [selector[,selector...]]",
    args: [{ provider: "multi-target-selector", optional: true }]
  }),
  switch: freezeCommandDefinition({
    key: "slash:switch",
    insertText: "switch",
    label: "/switch",
    kind: "command",
    description: "switch active session",
    example: "/switch 1",
    usage: "/switch <id>",
    args: [{ provider: "session-selector" }]
  }),
  next: freezeCommandDefinition({
    key: "slash:next",
    insertText: "next",
    label: "/next",
    kind: "command",
    description: "focus next session",
    example: "/next",
    usage: "/next"
  }),
  prev: freezeCommandDefinition({
    key: "slash:prev",
    insertText: "prev",
    label: "/prev",
    kind: "command",
    description: "focus previous session",
    example: "/prev",
    usage: "/prev"
  }),
  list: freezeCommandDefinition({
    key: "slash:list",
    insertText: "list",
    label: "/list",
    kind: "command",
    description: "list sessions",
    example: "/list",
    usage: "/list"
  }),
  rename: freezeCommandDefinition({
    key: "slash:rename",
    insertText: "rename",
    label: "/rename",
    kind: "command",
    description: "rename a session",
    example: "/rename 1 api",
    usage: [
      "/rename <name>",
      "/rename <selector> <name>"
    ],
    args: [{ provider: "session-selector", optional: true }]
  }),
  restart: freezeCommandDefinition({
    key: "slash:restart",
    insertText: "restart",
    label: "/restart",
    kind: "command",
    description: "restart sessions",
    example: "/restart 1",
    usage: "/restart [selector[,selector...]]",
    args: [{ provider: "multi-target-selector", optional: true }]
  }),
  settings: freezeCommandDefinition({
    key: "slash:settings",
    insertText: "settings",
    label: "/settings",
    kind: "command",
    description: "inspect or apply session settings",
    example: "/settings show 1",
    usage: [
      "/settings show [selector]",
      "/settings apply <selector|active> <json>"
    ],
    subcommands: {
      show: {
        insertText: "show",
        label: "/settings show",
        kind: "subcommand",
        description: "show session settings",
        example: "/settings show 1",
        key: "slash:settings:show",
        usage: "/settings show [selector]",
        args: [{ provider: "session-selector", optional: true }]
      },
      apply: {
        insertText: "apply",
        label: "/settings apply",
        kind: "subcommand",
        description: "apply JSON settings patch",
        example: "/settings apply 1 {\"startCwd\":\"~\"}",
        key: "slash:settings:apply",
        usage: "/settings apply <selector|active> <json>",
        args: [{ provider: "session-selector" }]
      }
    }
  }),
  custom: freezeCommandDefinition({
    key: "slash:custom",
    insertText: "custom",
    label: "/custom",
    kind: "command",
    description: "manage custom commands",
    example: "/custom show deploy",
    usage: [
      "/custom <name> <text>",
      "/custom <name> + block"
    ],
    subcommands: {
      show: {
        insertText: "show",
        label: "/custom show",
        kind: "subcommand",
        description: "show custom command",
        example: "/custom show deploy",
        key: "slash:custom:show",
        usage: "/custom show <name>",
        args: [{ provider: "custom-command-name" }]
      },
      remove: {
        insertText: "remove",
        label: "/custom remove",
        kind: "subcommand",
        description: "delete custom command",
        example: "/custom remove deploy",
        key: "slash:custom:remove",
        usage: "/custom remove <name>",
        args: [{ provider: "custom-command-name" }]
      }
    }
  }),
  help: freezeCommandDefinition({
    key: "slash:help",
    insertText: "help",
    label: "/help",
    kind: "command",
    description: "show command help",
    example: "/help",
    usage: "/help"
  })
});

function createGenericSlashCommandDefinition(name) {
  const normalizedName = normalizeLower(name);
  if (!normalizedName) {
    return null;
  }
  return freezeCommandDefinition({
    key: `slash:${normalizedName}`,
    insertText: normalizedName,
    label: `/${normalizedName}`,
    kind: "command",
    description: "system command",
    example: `/${normalizedName}`,
    usage: `/${normalizedName}`
  });
}

export function createSlashCommandSchema(systemSlashCommands = []) {
  const ordered = [];
  const seen = new Set();
  for (const entry of Array.isArray(systemSlashCommands) ? systemSlashCommands : []) {
    const name = normalizeLower(entry);
    if (!name || seen.has(name)) {
      continue;
    }
    seen.add(name);
    ordered.push(DEFAULT_SLASH_COMMAND_SCHEMA[name] || createGenericSlashCommandDefinition(name));
  }
  return Object.freeze(ordered.filter(Boolean));
}

export function createSlashCommandRegistry(systemSlashCommands = []) {
  const schema = createSlashCommandSchema(systemSlashCommands);
  const byName = new Map(
    schema
      .map((entry) => [normalizeLower(entry?.insertText), entry])
      .filter((entry) => Boolean(entry[0]) && Boolean(entry[1]))
  );
  return Object.freeze({
    list() {
      return schema;
    },
    get(commandName) {
      return byName.get(normalizeLower(commandName)) || null;
    }
  });
}

export function getSlashCommandUsage(commandName, subcommandName = "") {
  const command = DEFAULT_SLASH_COMMAND_SCHEMA[normalizeLower(commandName)];
  if (!command) {
    return "";
  }
  if (subcommandName && command.subcommands) {
    const subcommand = command.subcommands[normalizeLower(subcommandName)];
    if (subcommand?.usage?.length) {
      return subcommand.usage.join(" | ");
    }
  }
  return command.usage?.join(" | ") || "";
}

export function createCommandHelpText(systemSlashCommands = [], options = {}) {
  const includeQuickSwitch = options.includeQuickSwitch !== false;
  const quickSwitchUsages = Array.isArray(options.quickSwitchUsages)
    ? options.quickSwitchUsages.map((entry) => normalizeText(entry)).filter(Boolean)
    : [">selector", ">deckSelector::sessionSelector"];
  const parts = [];
  for (const command of createSlashCommandSchema(systemSlashCommands)) {
    const summary = normalizeText(command?.summary);
    if (summary) {
      parts.push(summary);
      continue;
    }
    const usages = Array.isArray(command?.usage) ? command.usage : [];
    if (usages.length > 0) {
      parts.push(usages.join(", "));
    }
  }
  if (includeQuickSwitch) {
    parts.push(...quickSwitchUsages);
  }
  return `Commands: ${parts.join(", ")}`;
}
