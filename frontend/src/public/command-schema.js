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

function freezeStringList(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return undefined;
  }
  const normalized = values.map((entry) => normalizeText(entry)).filter(Boolean);
  return normalized.length > 0 ? Object.freeze(normalized) : undefined;
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
  const canonicalCommand = normalizeLower(definition.canonicalCommand);
  const canonicalSubcommand = normalizeLower(definition.canonicalSubcommand);
  const aliasOf = normalizeText(definition.aliasOf);
  const argsPrefix = freezeStringList(definition.argsPrefix);
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
    subcommands: freezeSubcommands(definition.subcommands),
    canonicalCommand: canonicalCommand || undefined,
    canonicalSubcommand: canonicalSubcommand || undefined,
    aliasOf: aliasOf || undefined,
    argsPrefix,
    isAlias: Boolean(canonicalCommand)
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
    usage: "/switch <sessionSelector>",
    args: [{ provider: "session-selector" }]
  }),
  swap: freezeCommandDefinition({
    key: "slash:swap",
    insertText: "swap",
    label: "/swap",
    kind: "command",
    description: "swap quick ids between two sessions",
    example: "/swap 7 8",
    usage: "/swap <selectorA> <selectorB>",
    args: [{ provider: "session-selector" }, { provider: "session-selector" }]
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
    example: "/rename api",
    usage: "/rename <name>"
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
  note: freezeCommandDefinition({
    key: "slash:note",
    insertText: "note",
    label: "/note",
    kind: "command",
    description: "set or clear a persisted session note",
    example: "/note needs review",
    usage: "/note [text...]"
  }),
  connection: freezeCommandDefinition({
    key: "slash:connection",
    insertText: "connection",
    label: "/connection",
    kind: "command",
    description: "manage saved connection profiles",
    example: "/connection apply ops-shell",
    summary: "/connection list | /connection save <name> | /connection show <profile> | /connection apply <profile> | /connection rename <profile> <name> | /connection delete <profile>",
    usage: [
      "/connection list",
      "/connection save <name>",
      "/connection show <profile>",
      "/connection apply <profile>",
      "/connection rename <profile> <name>",
      "/connection delete <profile>"
    ],
    subcommands: {
      list: {
        insertText: "list",
        label: "/connection list",
        kind: "subcommand",
        description: "list saved connection profiles",
        example: "/connection list",
        key: "slash:connection:list",
        usage: "/connection list"
      },
      save: {
        insertText: "save",
        label: "/connection save",
        kind: "subcommand",
        description: "save a session launch preset as a connection profile",
        example: "/connection save ops-shell",
        key: "slash:connection:save",
        usage: "/connection save <name>"
      },
      show: {
        insertText: "show",
        label: "/connection show",
        kind: "subcommand",
        description: "show connection profile details",
        example: "/connection show ops-shell",
        key: "slash:connection:show",
        usage: "/connection show <profile>"
      },
      apply: {
        insertText: "apply",
        label: "/connection apply",
        kind: "subcommand",
        description: "start a session from a saved connection profile",
        example: "/connection apply ops-shell",
        key: "slash:connection:apply",
        usage: "/connection apply <profile>"
      },
      rename: {
        insertText: "rename",
        label: "/connection rename",
        kind: "subcommand",
        description: "rename a saved connection profile",
        example: "/connection rename ops-shell ops-shell-prod",
        key: "slash:connection:rename",
        usage: "/connection rename <profile> <name>"
      },
      delete: {
        insertText: "delete",
        label: "/connection delete",
        kind: "subcommand",
        description: "delete a saved connection profile",
        example: "/connection delete ops-shell",
        key: "slash:connection:delete",
        usage: "/connection delete <profile>"
      }
    }
  }),
  replay: freezeCommandDefinition({
    key: "slash:replay",
    insertText: "replay",
    label: "/replay",
    kind: "command",
    description: "view, export, or copy the retained replay tail for a session",
    example: "/replay view",
    summary: "/replay view | /replay export | /replay copy",
    usage: [
      "/replay view",
      "/replay export",
      "/replay copy"
    ],
    subcommands: {
      view: {
        insertText: "view",
        label: "/replay view",
        kind: "subcommand",
        description: "open the retained replay tail in the reading viewer",
        example: "/replay view",
        key: "slash:replay:view",
        usage: "/replay view"
      },
      export: {
        insertText: "export",
        label: "/replay export",
        kind: "subcommand",
        description: "download the retained replay tail",
        example: "/replay export",
        key: "slash:replay:export",
        usage: "/replay export"
      },
      copy: {
        insertText: "copy",
        label: "/replay copy",
        kind: "subcommand",
        description: "copy the retained replay tail to the clipboard",
        example: "/replay copy",
        key: "slash:replay:copy",
        usage: "/replay copy"
      }
    }
  }),
  transfer: freezeCommandDefinition({
    key: "slash:transfer",
    insertText: "transfer",
    label: "/transfer",
    kind: "command",
    description: "upload or download bounded files for one session",
    example: "/transfer download logs/output.txt",
    summary: "/transfer upload [path] | /transfer download <path>",
    usage: [
      "/transfer upload [path]",
      "/transfer download <path>"
    ],
    subcommands: {
      upload: {
        insertText: "upload",
        label: "/transfer upload",
        kind: "subcommand",
        description: "pick a local file and upload it into the target session root",
        example: "/transfer upload logs/output.txt",
        key: "slash:transfer:upload",
        usage: "/transfer upload [path]"
      },
      download: {
        insertText: "download",
        label: "/transfer download",
        kind: "subcommand",
        description: "download a bounded file from the target session root",
        example: "/transfer download logs/output.txt",
        key: "slash:transfer:download",
        usage: "/transfer download <path>"
      }
    }
  }),
  settings: freezeCommandDefinition({
    key: "slash:settings",
    insertText: "settings",
    label: "/settings",
    kind: "command",
    description: "inspect or apply session settings",
    example: "/settings show",
    usage: [
      "/settings show",
      "/settings apply <json>"
    ],
    subcommands: {
      show: {
        insertText: "show",
        label: "/settings show",
        kind: "subcommand",
        description: "show session settings",
        example: "/settings show",
        key: "slash:settings:show",
        usage: "/settings show"
      },
      apply: {
        insertText: "apply",
        label: "/settings apply",
        kind: "subcommand",
        description: "apply JSON settings patch",
        example: "/settings apply {\"startCwd\":\"~\"}",
        key: "slash:settings:apply",
        usage: "/settings apply <json>"
      }
    }
  }),
  layout: freezeCommandDefinition({
    key: "slash:layout",
    insertText: "layout",
    label: "/layout",
    kind: "command",
    description: "manage persisted layout profiles",
    example: "/layout apply ops",
    summary: "/layout list | /layout save <name> | /layout apply <profile> | /layout rename <profile> <name> | /layout delete <profile>",
    usage: [
      "/layout list",
      "/layout save <name>",
      "/layout apply <profile>",
      "/layout rename <profile> <name>",
      "/layout delete <profile>"
    ],
    subcommands: {
      list: {
        insertText: "list",
        label: "/layout list",
        kind: "subcommand",
        description: "list saved layout profiles",
        example: "/layout list",
        key: "slash:layout:list",
        usage: "/layout list"
      },
      save: {
        insertText: "save",
        label: "/layout save",
        kind: "subcommand",
        description: "save the current workspace layout as a named profile",
        example: "/layout save ops",
        key: "slash:layout:save",
        usage: "/layout save <name>"
      },
      apply: {
        insertText: "apply",
        label: "/layout apply",
        kind: "subcommand",
        description: "apply a saved layout profile",
        example: "/layout apply ops",
        key: "slash:layout:apply",
        usage: "/layout apply <profile>"
      },
      rename: {
        insertText: "rename",
        label: "/layout rename",
        kind: "subcommand",
        description: "rename a saved layout profile",
        example: "/layout rename ops ops-wide",
        key: "slash:layout:rename",
        usage: "/layout rename <profile> <name>"
      },
      delete: {
        insertText: "delete",
        label: "/layout delete",
        kind: "subcommand",
        description: "delete a saved layout profile",
        example: "/layout delete ops",
        key: "slash:layout:delete",
        usage: "/layout delete <profile>"
      }
    }
  }),
  workspace: freezeCommandDefinition({
    key: "slash:workspace",
    insertText: "workspace",
    label: "/workspace",
    kind: "command",
    description: "manage persisted workspace presets",
    example: "/workspace apply ops",
    summary: "/workspace list | /workspace save <name> | /workspace apply <preset> | /workspace rename <preset> <name> | /workspace delete <preset>",
    usage: [
      "/workspace list",
      "/workspace save <name>",
      "/workspace apply <preset>",
      "/workspace rename <preset> <name>",
      "/workspace delete <preset>"
    ],
    subcommands: {
      list: {
        insertText: "list",
        label: "/workspace list",
        kind: "subcommand",
        description: "list saved workspace presets",
        example: "/workspace list",
        key: "slash:workspace:list",
        usage: "/workspace list"
      },
      save: {
        insertText: "save",
        label: "/workspace save",
        kind: "subcommand",
        description: "save the current deck/layout/group workspace state as a named preset",
        example: "/workspace save ops",
        key: "slash:workspace:save",
        usage: "/workspace save <name>"
      },
      apply: {
        insertText: "apply",
        label: "/workspace apply",
        kind: "subcommand",
        description: "apply a saved workspace preset",
        example: "/workspace apply ops",
        key: "slash:workspace:apply",
        usage: "/workspace apply <preset>"
      },
      rename: {
        insertText: "rename",
        label: "/workspace rename",
        kind: "subcommand",
        description: "rename a saved workspace preset",
        example: "/workspace rename ops ops-focus",
        key: "slash:workspace:rename",
        usage: "/workspace rename <preset> <name>"
      },
      delete: {
        insertText: "delete",
        label: "/workspace delete",
        kind: "subcommand",
        description: "delete a saved workspace preset",
        example: "/workspace delete ops",
        key: "slash:workspace:delete",
        usage: "/workspace delete <preset>"
      }
    }
  }),
  broadcast: freezeCommandDefinition({
    key: "slash:broadcast",
    insertText: "broadcast",
    label: "/broadcast",
    kind: "command",
    description: "manage composer broadcast mode for workspace groups",
    example: "/broadcast group",
    summary: "/broadcast status | /broadcast off | /broadcast group [group]",
    usage: [
      "/broadcast status",
      "/broadcast off",
      "/broadcast group [group]"
    ],
    subcommands: {
      status: {
        insertText: "status",
        label: "/broadcast status",
        kind: "subcommand",
        description: "show current broadcast mode",
        example: "/broadcast status",
        key: "slash:broadcast:status",
        usage: "/broadcast status"
      },
      off: {
        insertText: "off",
        label: "/broadcast off",
        kind: "subcommand",
        description: "disable broadcast mode",
        example: "/broadcast off",
        key: "slash:broadcast:off",
        usage: "/broadcast off"
      },
      group: {
        insertText: "group",
        label: "/broadcast group",
        kind: "subcommand",
        description: "broadcast composer sends to the active or selected workspace group",
        example: "/broadcast group build",
        key: "slash:broadcast:group",
        usage: "/broadcast group [group]"
      }
    }
  }),
  share: freezeCommandDefinition({
    key: "slash:share",
    insertText: "share",
    label: "/share",
    kind: "command",
    description: "manage read-only spectator shares for sessions and decks",
    example: "/share session",
    summary: "/share list | /share session | /share deck | /share revoke <shareId>",
    usage: [
      "/share list",
      "/share session",
      "/share deck [deckSelector]",
      "/share revoke <shareId>"
    ],
    subcommands: {
      list: {
        insertText: "list",
        label: "/share list",
        kind: "subcommand",
        description: "list active and revoked share links",
        example: "/share list",
        key: "slash:share:list",
        usage: "/share list"
      },
      session: {
        insertText: "session",
        label: "/share session",
        kind: "subcommand",
        description: "create a read-only spectator link for one session",
        example: "/share session",
        key: "slash:share:session",
        usage: "/share session"
      },
      deck: {
        insertText: "deck",
        label: "/share deck",
        kind: "subcommand",
        description: "create a read-only spectator link for the active or selected deck",
        example: "/share deck ops",
        key: "slash:share:deck",
        usage: "/share deck [deckSelector]",
        args: [{ provider: "deck-selector", optional: true }]
      },
      revoke: {
        insertText: "revoke",
        label: "/share revoke",
        kind: "subcommand",
        description: "revoke an existing spectator link",
        example: "/share revoke share-0123456789abcdef01234567",
        key: "slash:share:revoke",
        usage: "/share revoke <shareId>"
      }
    }
  }),
  custom: freezeCommandDefinition({
    key: "slash:custom",
    insertText: "custom",
    label: "/custom",
    kind: "command",
    description: "manage custom commands",
    example: "/custom show scope:project deploy",
    usage: [
      "/custom [plain|template] [scope:global|scope:project|scope:session:<selector>] <name> <text>",
      "/custom [plain|template] [scope:global|scope:project|scope:session:<selector>] <name> + block"
    ],
    subcommands: {
      show: {
        insertText: "show",
        label: "/custom show",
        kind: "subcommand",
        description: "show custom command",
        example: "/custom show scope:project deploy",
        key: "slash:custom:show",
        usage: "/custom show [scope:global|scope:project|scope:session:<selector>] <name>",
        args: [{ provider: "custom-command-reference" }]
      },
      preview: {
        insertText: "preview",
        label: "/custom preview",
        kind: "subcommand",
        description: "preview custom command rendering",
        example: "/custom preview scope:session:7 deploy env=prod -- 7",
        key: "slash:custom:preview",
        usage: "/custom preview [scope:global|scope:project|scope:session:<selector>] <name> [key=value ...] [-- <targetSelector>]",
        args: [{ provider: "custom-command-reference" }]
      },
      remove: {
        insertText: "remove",
        label: "/custom remove",
        kind: "subcommand",
        description: "delete custom command",
        example: "/custom remove scope:project deploy",
        key: "slash:custom:remove",
        usage: "/custom remove [scope:global|scope:project|scope:session:<selector>] <name>",
        args: [{ provider: "custom-command-reference" }]
      }
    }
  }),
  help: freezeCommandDefinition({
    key: "slash:help",
    insertText: "help",
    label: "/help",
    kind: "command",
    description: "show command help",
    example: "/help deck",
    usage: [
      "/help",
      "/help <topic>",
      "/help <topic> <subcommand>"
    ]
  }),
  run: freezeCommandDefinition({
    key: "slash:run",
    insertText: "run",
    label: "/run",
    kind: "command",
    description: "run a newline-separated slash-command script",
    example: "/run",
    usage: [
      "/run + newline-separated slash commands",
      "/cmd1 + newline + /cmd2"
    ]
  })
});

const DEFAULT_SLASH_COMMAND_ALIAS_SOURCES = Object.freeze([
  { alias: "session.new", command: "new" },
  { alias: "session.close", command: "close" },
  { alias: "session.switch", command: "switch" },
  { alias: "session.swap", command: "swap" },
  { alias: "session.next", command: "next" },
  { alias: "session.prev", command: "prev" },
  { alias: "session.list", command: "list" },
  { alias: "session.rename", command: "rename" },
  { alias: "session.restart", command: "restart" },
  { alias: "session.note", command: "note" },
  { alias: "deck.list", command: "deck", subcommand: "list" },
  { alias: "deck.new", command: "deck", subcommand: "new" },
  { alias: "deck.rename", command: "deck", subcommand: "rename" },
  { alias: "deck.switch", command: "deck", subcommand: "switch" },
  { alias: "deck.delete", command: "deck", subcommand: "delete" },
  { alias: "layout.list", command: "layout", subcommand: "list" },
  { alias: "layout.save", command: "layout", subcommand: "save" },
  { alias: "layout.apply", command: "layout", subcommand: "apply" },
  { alias: "layout.rename", command: "layout", subcommand: "rename" },
  { alias: "layout.delete", command: "layout", subcommand: "delete" },
  { alias: "connection.list", command: "connection", subcommand: "list" },
  { alias: "connection.save", command: "connection", subcommand: "save" },
  { alias: "connection.show", command: "connection", subcommand: "show" },
  { alias: "connection.apply", command: "connection", subcommand: "apply" },
  { alias: "connection.rename", command: "connection", subcommand: "rename" },
  { alias: "connection.delete", command: "connection", subcommand: "delete" },
  { alias: "workspace.list", command: "workspace", subcommand: "list" },
  { alias: "workspace.save", command: "workspace", subcommand: "save" },
  { alias: "workspace.apply", command: "workspace", subcommand: "apply" },
  { alias: "workspace.rename", command: "workspace", subcommand: "rename" },
  { alias: "workspace.delete", command: "workspace", subcommand: "delete" },
  { alias: "replay.view", command: "replay", subcommand: "view" },
  { alias: "replay.export", command: "replay", subcommand: "export" },
  { alias: "replay.copy", command: "replay", subcommand: "copy" },
  { alias: "transfer.upload", command: "transfer", subcommand: "upload" },
  { alias: "transfer.download", command: "transfer", subcommand: "download" },
  { alias: "settings.show", command: "settings", subcommand: "show" },
  { alias: "settings.apply", command: "settings", subcommand: "apply" },
  { alias: "broadcast.status", command: "broadcast", subcommand: "status" },
  { alias: "broadcast.off", command: "broadcast", subcommand: "off" },
  { alias: "broadcast.group", command: "broadcast", subcommand: "group" },
  { alias: "share.list", command: "share", subcommand: "list" },
  { alias: "share.session", command: "share", subcommand: "session" },
  { alias: "share.deck", command: "share", subcommand: "deck" },
  { alias: "share.revoke", command: "share", subcommand: "revoke" },
  { alias: "custom.show", command: "custom", subcommand: "show" },
  { alias: "custom.preview", command: "custom", subcommand: "preview" },
  { alias: "custom.remove", command: "custom", subcommand: "remove" }
]);

function rewriteAliasUsage(alias, commandName, subcommandName, usage) {
  const sourcePrefix = subcommandName ? `/${commandName} ${subcommandName}` : `/${commandName}`;
  const aliasPrefix = `/${alias}`;
  const normalizedUsage = normalizeText(usage);
  if (!normalizedUsage) {
    return aliasPrefix;
  }
  return normalizedUsage.startsWith(sourcePrefix) ? `${aliasPrefix}${normalizedUsage.slice(sourcePrefix.length)}` : aliasPrefix;
}

function rewriteAliasExample(alias, commandName, subcommandName, example) {
  return rewriteAliasUsage(alias, commandName, subcommandName, example);
}

function createAliasCommandDefinition(aliasSource, canonicalCommand) {
  const commandName = normalizeLower(aliasSource?.command);
  const subcommandName = normalizeLower(aliasSource?.subcommand);
  const alias = normalizeText(aliasSource?.alias);
  if (!commandName || !alias || !canonicalCommand) {
    return null;
  }
  const target = subcommandName ? canonicalCommand.subcommands?.[subcommandName] || null : canonicalCommand;
  if (!target) {
    return null;
  }
  const usage = Array.isArray(target.usage)
    ? target.usage.map((entry) => rewriteAliasUsage(alias, commandName, subcommandName, entry))
    : [`/${alias}`];
  return freezeCommandDefinition({
    key: `slash:alias:${normalizeLower(alias)}`,
    insertText: alias,
    label: `/${alias}`,
    kind: "command",
    description: target.description,
    example: rewriteAliasExample(alias, commandName, subcommandName, target.example),
    summary: `Alias for ${target.label}`,
    usage,
    args: target.args,
    canonicalCommand: commandName,
    canonicalSubcommand: subcommandName,
    aliasOf: target.label,
    argsPrefix: subcommandName ? [subcommandName] : []
  });
}

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

export function createSlashCommandSchema(systemSlashCommands = [], options = {}) {
  const includeAliases = options.includeAliases !== false;
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
  if (!includeAliases) {
    return Object.freeze(ordered.filter(Boolean));
  }
  const aliases = DEFAULT_SLASH_COMMAND_ALIAS_SOURCES.map((aliasSource) => {
    const canonical = ordered.find((entry) => entry?.insertText === aliasSource.command);
    return createAliasCommandDefinition(aliasSource, canonical);
  }).filter(Boolean);
  return Object.freeze([...ordered.filter(Boolean), ...aliases]);
}

export function createSlashCommandRegistry(systemSlashCommands = []) {
  const schema = createSlashCommandSchema(systemSlashCommands);
  const byName = new Map(
    schema
      .map((entry) => [normalizeLower(entry?.insertText), entry])
      .filter((entry) => Boolean(entry[0]) && Boolean(entry[1]))
  );
  const aliasesByTarget = new Map();
  for (const entry of schema) {
    if (!entry?.isAlias || !entry.canonicalCommand) {
      continue;
    }
    const targetKey = `${entry.canonicalCommand}:${entry.canonicalSubcommand || ""}`;
    const list = aliasesByTarget.get(targetKey) || [];
    list.push(entry);
    aliasesByTarget.set(targetKey, Object.freeze(list));
  }
  return Object.freeze({
    list() {
      return schema;
    },
    listCanonical() {
      return schema.filter((entry) => entry?.isAlias !== true);
    },
    get(commandName) {
      return byName.get(normalizeLower(commandName)) || null;
    },
    resolve(commandName) {
      const entry = byName.get(normalizeLower(commandName)) || null;
      if (!entry) {
        return null;
      }
      const canonicalCommand = entry.canonicalCommand || normalizeLower(entry.insertText);
      const canonicalSubcommand = entry.canonicalSubcommand || "";
      const canonicalEntry = byName.get(canonicalCommand) || null;
      const canonicalTarget = canonicalSubcommand ? canonicalEntry?.subcommands?.[canonicalSubcommand] || null : canonicalEntry;
      return Object.freeze({
        entry,
        canonicalCommand,
        canonicalSubcommand,
        canonicalEntry: canonicalTarget || entry,
        argsPrefix: Array.isArray(entry.argsPrefix) ? [...entry.argsPrefix] : []
      });
    },
    listAliasesFor(commandName, subcommandName = "") {
      return aliasesByTarget.get(`${normalizeLower(commandName)}:${normalizeLower(subcommandName)}`) || Object.freeze([]);
    }
  });
}

export function getSlashCommandUsage(commandName, subcommandName = "", systemSlashCommands = Object.keys(DEFAULT_SLASH_COMMAND_SCHEMA)) {
  const registry = createSlashCommandRegistry(systemSlashCommands);
  const resolved = registry.resolve(subcommandName ? commandName : normalizeLower(commandName));
  if (!subcommandName && resolved?.entry?.usage?.length) {
    return resolved.entry.usage.join(" | ");
  }
  const command = resolved?.entry && !resolved.entry.isAlias ? resolved.entry : DEFAULT_SLASH_COMMAND_SCHEMA[normalizeLower(commandName)];
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

export function createCommandTopicHelpText(commandName, subcommandName = "", systemSlashCommands = []) {
  const normalizedCommandName = normalizeLower(commandName);
  if (normalizedCommandName === "@") {
    return [
      "@",
      "Usage: @<sessionSelector> /<command> ...",
      "Route a single-session slash command to another session without changing the active session.",
      "Examples: @3 /note test · @ops /rename api-shell"
    ].join("\n");
  }
  if (normalizedCommandName === ">") {
    return [
      ">",
      "Usage: >sessionSelector",
      "Quick-switch the active session. Session selectors win by default; use 'deck:<deckSelector>' for a deck or '<deckSelector>::<sessionSelector>' for an explicit cross-deck session."
    ].join("\n");
  }
  const registry = createSlashCommandRegistry(systemSlashCommands);
  const command = registry.get(commandName);
  if (!command) {
    return "";
  }

  if (subcommandName) {
    const subcommand = command.subcommands?.[normalizeLower(subcommandName)] || null;
    if (!subcommand) {
      return "";
    }
    const aliases = registry.listAliasesFor(normalizeLower(commandName), normalizeLower(subcommandName));
    return [
      subcommand.label,
      `Usage: ${subcommand.usage.join(" | ")}`,
      subcommand.description,
      aliases.length > 0 ? `Aliases: ${aliases.map((entry) => entry.label).join(" ")}` : ""
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (command.isAlias) {
    return [command.label, `Usage: ${command.usage.join(" | ")}`, command.description, `Alias for: ${command.aliasOf}`]
      .filter(Boolean)
      .join("\n");
  }

  const sections = [command.label];
  if (command.summary) {
    sections.push(command.summary);
  }
  if (command.usage?.length) {
    sections.push(`Usage: ${command.usage.join(" | ")}`);
  }
  if (command.description) {
    sections.push(command.description);
  }
  if (command.subcommands && Object.keys(command.subcommands).length > 0) {
    sections.push(
      `Subcommands: ${Object.values(command.subcommands)
        .map((entry) => entry.insertText)
        .join(" ")}`
    );
  }
  const aliases = registry.listAliasesFor(command.insertText, "");
  if (aliases.length > 0) {
    sections.push(`Aliases: ${aliases.map((entry) => entry.label).join(" ")}`);
  }
  return sections.filter(Boolean).join("\n");
}

export function createCommandHelpText(systemSlashCommands = [], options = {}) {
  const includeQuickSwitch = options.includeQuickSwitch !== false;
  const includeDirectRouting = options.includeDirectRouting !== false;
  const registry = createSlashCommandRegistry(systemSlashCommands);
  const commandNames = registry
    .listCanonical()
    .map((command) => normalizeText(command?.insertText))
    .filter(Boolean);
  const parts = [];
  if (includeDirectRouting) {
    parts.push("@");
  }
  if (includeQuickSwitch) {
    parts.push(">");
  }
  if (commandNames.length > 0) {
    parts.push("/");
    parts.push(...commandNames);
  }
  return `Commands: ${parts.join(" ")}`.trim();
}
