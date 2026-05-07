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
  const notes = freezeStringList(definition.notes);
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
    notes,
    isAlias: Boolean(canonicalCommand)
  });
}

const ACTIVE_SESSION_DIRECT_ROUTE_NOTE = Object.freeze([
  "Targets the active session by default.",
  "To target another session without switching, use `/help @` and the direct-route form `@<sessionSelector> /<command> ...`."
]);

const DEFAULT_SLASH_COMMAND_SCHEMA = Object.freeze({
  new: freezeCommandDefinition({
    key: "slash:new",
    insertText: "new",
    label: "/new",
    kind: "command",
    description: "create a new session",
    example: "/new powershell",
    usage: "/new [shell]",
    notes: [
      "The optional shell token is passed through to the backend as the local session launcher.",
      "Use `/new powershell` to open Windows PowerShell directly from WSL-backed installs. Use `/new pwsh` when PowerShell 7 is available on PATH."
    ]
  }),
  deck: freezeCommandDefinition({
    key: "slash:deck",
    insertText: "deck",
    label: "/deck",
    kind: "command",
    description: "manage decks",
    example: "/deck switch ops",
    summary: "/deck | /deck new <name> | /deck rename ... | /deck switch <deckSelector> | /deck delete [deckSelector] [force]",
    usage: [
      "/deck",
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
    usage: "/rename <name>",
    notes: [
      "This command does not accept a positional session selector.",
      "Rename the active session with `/rename <name>`, or target another session with `@<sessionSelector> /rename <name>`."
    ]
  }),
  restart: freezeCommandDefinition({
    key: "slash:restart",
    insertText: "restart",
    label: "/restart",
    kind: "command",
    description: "restart sessions",
    example: "/restart 1",
    usage: "/restart [selector[,selector...]]",
    args: [{ provider: "multi-target-selector", optional: true }],
    notes: [
      "Without selector arguments, `/restart` targets the active session.",
      "Use `@<sessionSelector> /restart` for another single session without switching, or `/restart <selector[,selector...]>` for explicit targets."
    ]
  }),
  note: freezeCommandDefinition({
    key: "slash:note",
    insertText: "note",
    label: "/note",
    kind: "command",
    description: "set or clear a persisted session note",
    example: "/note needs review",
    usage: "/note [text...]",
    notes: [
      "This command does not accept a positional session selector.",
      "Update the active session note with `/note <text...>`, or target another session with `@<sessionSelector> /note <text...>`."
    ]
  }),
  connection: freezeCommandDefinition({
    key: "slash:connection",
    insertText: "connection",
    label: "/connection",
    kind: "command",
    description: "manage saved connection profiles",
    example: "/connection apply ops-shell",
    summary:
      "/connection | /connection new <name> | /connection save <name> | /connection show <profile> | /connection apply <profile> | /connection duplicate <profile> <name> | /connection rename <profile> <name> | /connection delete <profile> | /connection draft ...",
    usage: [
      "/connection",
      "/connection new <name>",
      "/connection save <name>",
      "/connection show <profile>",
      "/connection apply <profile>",
      "/connection duplicate <profile> <name>",
      "/connection rename <profile> <name>",
      "/connection delete <profile>",
      "/connection draft show",
      "/connection draft new [name]",
      "/connection draft active",
      "/connection draft set <json>",
      "/connection draft save [name]",
      "/connection draft reset"
    ],
    notes: [
      "Bare `/connection` is shorthand for `/connection list`.",
      "The session-derived subcommands `/connection save <name>` and `/connection draft active` use the active session by default and support direct-route targeting."
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
      new: {
        insertText: "new",
        label: "/connection new",
        kind: "subcommand",
        description: "create a blank saved connection profile",
        example: "/connection new ops-shell",
        key: "slash:connection:new",
        usage: "/connection new <name>"
      },
      save: {
        insertText: "save",
        label: "/connection save",
        kind: "subcommand",
        description: "save a session launch preset as a connection profile",
        example: "/connection save ops-shell",
        key: "slash:connection:save",
        usage: "/connection save <name>",
        notes: ACTIVE_SESSION_DIRECT_ROUTE_NOTE
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
      duplicate: {
        insertText: "duplicate",
        label: "/connection duplicate",
        kind: "subcommand",
        description: "duplicate a saved connection profile",
        example: "/connection duplicate ops-shell ops-shell-copy",
        key: "slash:connection:duplicate",
        usage: "/connection duplicate <profile> <name>"
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
      },
      draft: {
        insertText: "draft",
        label: "/connection draft",
        kind: "subcommand",
        description: "inspect or edit the connection profile draft used by the Workspace Library",
        example: "/connection draft active",
        key: "slash:connection:draft",
        usage: [
          "/connection draft show",
          "/connection draft new [name]",
          "/connection draft active",
          "/connection draft set <json>",
          "/connection draft save [name]",
          "/connection draft reset"
        ],
        subcommands: {
          show: {
            insertText: "show",
            label: "/connection draft show",
            kind: "subcommand",
            description: "show the current connection profile draft",
            example: "/connection draft show",
            key: "slash:connection:draft:show",
            usage: "/connection draft show"
          },
          new: {
            insertText: "new",
            label: "/connection draft new",
            kind: "subcommand",
            description: "open a blank connection profile draft",
            example: "/connection draft new ops-shell",
            key: "slash:connection:draft:new",
            usage: "/connection draft new [name]"
          },
          active: {
            insertText: "active",
            label: "/connection draft active",
            kind: "subcommand",
            description: "load the active or direct-targeted session into the connection draft",
            example: "/connection draft active",
            key: "slash:connection:draft:active",
            usage: "/connection draft active",
            notes: ACTIVE_SESSION_DIRECT_ROUTE_NOTE
          },
          set: {
            insertText: "set",
            label: "/connection draft set",
            kind: "subcommand",
            description: "replace the connection draft with a normalized launch JSON payload",
            example: "/connection draft set {\"kind\":\"local\",\"deckId\":\"default\"}",
            key: "slash:connection:draft:set",
            usage: "/connection draft set <json>"
          },
          save: {
            insertText: "save",
            label: "/connection draft save",
            kind: "subcommand",
            description: "save the current connection draft as a new or updated profile",
            example: "/connection draft save ops-shell",
            key: "slash:connection:draft:save",
            usage: "/connection draft save [name]"
          },
          reset: {
            insertText: "reset",
            label: "/connection draft reset",
            kind: "subcommand",
            description: "reset the connection draft back to the selected profile or a blank draft",
            example: "/connection draft reset",
            key: "slash:connection:draft:reset",
            usage: "/connection draft reset"
          }
        }
      }
    }
  }),
  ssh: freezeCommandDefinition({
    key: "slash:ssh",
    insertText: "ssh",
    label: "/ssh",
    kind: "command",
    description: "start one-shot SSH sessions and manage SSH host-key trust",
    example: "/ssh ops@example.com --deck ops --cwd /srv/app --command \"tmux a || tmux\" --key ~/.ssh/id_ed25519",
    summary:
      "/ssh <target> | /ssh <target> --key <path> | /ssh <target> --password | /ssh <target> --keyboard-interactive | /ssh <target> [-l|--user <username>] [-p|--port <port>] [--deck <deckSelector>] [--cwd <path>] [--command <command>] | /ssh hostkey list [target] | /ssh hostkey probe <target> | /ssh hostkey trust <target> [keyType|fingerprint] | /ssh hostkey delete <target> [keyType|fingerprint]",
    usage: [
      "/ssh <target>",
      "/ssh <target> --key <path>",
      "/ssh <target> --password",
      "/ssh <target> --keyboard-interactive",
      "/ssh <target> [-l|--user <username>] [-p|--port <port>] [--deck <deckSelector>] [--cwd <path>] [--command <command>]",
      "/ssh hostkey list [target]",
      "/ssh hostkey probe <target>",
      "/ssh hostkey trust <target> [keyType|fingerprint]",
      "/ssh hostkey delete <target> [keyType|fingerprint]"
    ],
    notes: [
      "Target syntax is `[user@]host[:port]`. You can override the parsed username or port with `-l` / `--user` and `-p` / `--port`.",
      "Private-key auth is the default. Use `-i` / `--key <path>` to pin an explicit key path, `--password` for password auth, or `--keyboard-interactive` for keyboard-interactive auth.",
      "Use `--deck <deckSelector>` to choose the destination deck explicitly, `--cwd <path>` for the starting directory, and `--command <command>` for a startup command. Quote multi-word commands so they stay one slash-command argument.",
      "If no trusted SSH host key exists for the target, use `/ssh hostkey probe <target>` to fetch the presented keys, verify the fingerprint, then `/ssh hostkey trust <target> <keyType|fingerprint>` before rerunning `/ssh ...`."
    ],
    subcommands: {
      hostkey: {
        insertText: "hostkey",
        label: "/ssh hostkey",
        kind: "subcommand",
        description: "manage SSH host-key trust for one-shot and saved SSH targets",
        example: "/ssh hostkey probe carpo.uberspace.de:22",
        key: "slash:ssh:hostkey",
        usage: [
          "/ssh hostkey list [target]",
          "/ssh hostkey probe <target>",
          "/ssh hostkey trust <target> [keyType|fingerprint]",
          "/ssh hostkey delete <target> [keyType|fingerprint]"
        ],
        notes: [
          "The target syntax matches `/ssh`: `[user@]host[:port]`. Username is ignored for trust storage; trust is keyed by host, port, and host-key type.",
          "Run `/ssh hostkey probe <target>` first. If multiple fetched or trusted keys exist for the target, specify one by key type or fingerprint."
        ]
      }
    }
  }),
  replay: freezeCommandDefinition({
    key: "slash:replay",
    insertText: "replay",
    label: "/replay",
    kind: "command",
    description: "view retained replay tails or preview/copy/paste normalized replay excerpts",
    example: "/replay preview 4 l:80",
    summary: "/replay view | /replay export | /replay copy | /replay preview | /replay paste",
    usage: [
      "/replay view",
      "/replay export",
      "/replay copy",
      "/replay copy <sourceSelector> <sliceSelector>",
      "/replay preview <sourceSelector> <sliceSelector>",
      "/replay paste <sourceSelector> <targetSelector> <sliceSelector>"
    ],
    notes: [
      "The `/replay view`, `/replay export`, and zero-selector `/replay copy` forms use the active session by default and support direct-route targeting.",
      "The excerpt-oriented `/replay copy <sourceSelector> <sliceSelector>`, `/replay preview ...`, and `/replay paste ...` forms use explicit positional selectors."
    ],
    subcommands: {
      view: {
        insertText: "view",
        label: "/replay view",
        kind: "subcommand",
        description: "open the retained replay tail in the reading viewer",
        example: "/replay view",
        key: "slash:replay:view",
        usage: "/replay view",
        notes: ACTIVE_SESSION_DIRECT_ROUTE_NOTE
      },
      export: {
        insertText: "export",
        label: "/replay export",
        kind: "subcommand",
        description: "download the retained replay tail",
        example: "/replay export",
        key: "slash:replay:export",
        usage: "/replay export",
        notes: ACTIVE_SESSION_DIRECT_ROUTE_NOTE
      },
      copy: {
        insertText: "copy",
        label: "/replay copy",
        kind: "subcommand",
        description: "copy the retained replay tail or a normalized replay excerpt to the clipboard",
        example: "/replay copy 4 l:80",
        key: "slash:replay:copy",
        usage: [
          "/replay copy",
          "/replay copy <sourceSelector> <sliceSelector>"
        ],
        args: [{ provider: "session-selector" }, { provider: "replay-slice-selector" }],
        notes: [
          "Without selector arguments, `/replay copy` uses the active session by default and supports direct-route targeting.",
          "Use `/replay copy <sourceSelector> <sliceSelector>` when you want an explicit replay excerpt source."
        ]
      },
      preview: {
        insertText: "preview",
        label: "/replay preview",
        kind: "subcommand",
        description: "preview a normalized replay excerpt from one source session",
        example: "/replay preview 4 sp:2",
        key: "slash:replay:preview",
        usage: "/replay preview <sourceSelector> <sliceSelector>",
        args: [{ provider: "session-selector" }, { provider: "replay-slice-selector" }]
      },
      paste: {
        insertText: "paste",
        label: "/replay paste",
        kind: "subcommand",
        description: "paste a normalized replay excerpt from one session into another session",
        example: "/replay paste 4 3 sp:2",
        key: "slash:replay:paste",
        usage: "/replay paste <sourceSelector> <targetSelector> <sliceSelector>",
        args: [{ provider: "session-selector" }, { provider: "session-selector" }, { provider: "replay-slice-selector" }]
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
    notes: [
      "Targets the active session by default.",
      "Use `@<sessionSelector> /transfer upload [path]` or `@<sessionSelector> /transfer download <path>` to route file transfer to another session without switching."
    ],
    subcommands: {
      upload: {
        insertText: "upload",
        label: "/transfer upload",
        kind: "subcommand",
        description: "pick a local file and upload it into the target session root",
        example: "/transfer upload logs/output.txt",
        key: "slash:transfer:upload",
        usage: "/transfer upload [path]",
        notes: ACTIVE_SESSION_DIRECT_ROUTE_NOTE
      },
      download: {
        insertText: "download",
        label: "/transfer download",
        kind: "subcommand",
        description: "download a bounded file from the target session root",
        example: "/transfer download logs/output.txt",
        key: "slash:transfer:download",
        usage: "/transfer download <path>",
        notes: ACTIVE_SESSION_DIRECT_ROUTE_NOTE
      }
    }
  }),
  settings: freezeCommandDefinition({
    key: "slash:settings",
    insertText: "settings",
    label: "/settings",
    kind: "command",
    description: "inspect or manage session settings",
    example: "/settings show",
    summary:
      "/settings show | /settings apply <json> | /settings startup ... | /settings note ... | /settings theme ... | /settings input-safety ... | /settings mouse-forwarding ...",
    usage: [
      "/settings show",
      "/settings apply <json>",
      "/settings startup show",
      "/settings startup cwd <path>",
      "/settings startup command <text...>",
      "/settings startup env <json>",
      "/settings startup tags <tag[,tag...]>",
      "/settings startup terminator <auto|crlf|lf|cr|cr2|cr_delay>",
      "/settings note show",
      "/settings note set <text...>",
      "/settings note clear",
      "/settings theme show [active|inactive]",
      "/settings theme preset <active|inactive> <theme>",
      "/settings theme set <active|inactive> <key> <#rrggbb>",
      "/settings theme reset <active|inactive>",
      "/settings theme import <active|inactive> <auto|iterm2|windows-terminal|xresources|ptydeck> <payload...>",
      "/settings theme export <active|inactive> <ptydeck|iterm2|windows-terminal|xresources>",
      "/settings input-safety show",
      "/settings input-safety set <field> <value>",
      "/settings mouse-forwarding show",
      "/settings mouse-forwarding set <off|application>"
    ],
    notes: [
      "This command family targets the active session by default and does not accept a positional session selector.",
      "Use `@<sessionSelector> /settings ...` to inspect or update another session without switching."
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
        description: "apply a normalized settings JSON payload",
        example: "/settings apply {\"note\":\"needs review\"}",
        key: "slash:settings:apply",
        usage: "/settings apply <json>",
        notes: ACTIVE_SESSION_DIRECT_ROUTE_NOTE
      },
      startup: {
        insertText: "startup",
        label: "/settings startup",
        kind: "subcommand",
        description: "inspect or edit startup-related session settings",
        example: "/settings startup cwd ~/src",
        key: "slash:settings:startup",
        usage: [
          "/settings startup show",
          "/settings startup cwd <path>",
          "/settings startup cwd clear",
          "/settings startup command <text...>",
          "/settings startup command clear",
          "/settings startup env <json>",
          "/settings startup env clear",
          "/settings startup tags <tag[,tag...]>",
          "/settings startup tags clear",
          "/settings startup terminator <auto|crlf|lf|cr|cr2|cr_delay>"
        ],
        subcommands: {
          show: {
            insertText: "show",
            label: "/settings startup show",
            kind: "subcommand",
            description: "show startup-related session settings",
            example: "/settings startup show",
            key: "slash:settings:startup:show",
            usage: "/settings startup show"
          },
          cwd: {
            insertText: "cwd",
            label: "/settings startup cwd",
            kind: "subcommand",
            description: "set or clear the persisted startup cwd",
            example: "/settings startup cwd ~/src",
            key: "slash:settings:startup:cwd",
            usage: ["/settings startup cwd <path>", "/settings startup cwd clear"]
          },
          command: {
            insertText: "command",
            label: "/settings startup command",
            kind: "subcommand",
            description: "set or clear the persisted startup command",
            example: "/settings startup command npm run dev",
            key: "slash:settings:startup:command",
            usage: ["/settings startup command <text...>", "/settings startup command clear"]
          },
          env: {
            insertText: "env",
            label: "/settings startup env",
            kind: "subcommand",
            description: "set or clear the persisted startup environment map",
            example: "/settings startup env {\"NODE_ENV\":\"development\"}",
            key: "slash:settings:startup:env",
            usage: ["/settings startup env <json>", "/settings startup env clear"]
          },
          tags: {
            insertText: "tags",
            label: "/settings startup tags",
            kind: "subcommand",
            description: "set or clear the persisted startup tags",
            example: "/settings startup tags api,dev",
            key: "slash:settings:startup:tags",
            usage: ["/settings startup tags <tag[,tag...]>", "/settings startup tags clear"]
          },
          terminator: {
            insertText: "terminator",
            label: "/settings startup terminator",
            kind: "subcommand",
            description: "set the configured command send terminator",
            example: "/settings startup terminator lf",
            key: "slash:settings:startup:terminator",
            usage: "/settings startup terminator <auto|crlf|lf|cr|cr2|cr_delay>"
          }
        }
      },
      note: {
        insertText: "note",
        label: "/settings note",
        kind: "subcommand",
        description: "inspect or edit the persisted session note",
        example: "/settings note set needs review",
        key: "slash:settings:note",
        usage: ["/settings note show", "/settings note set <text...>", "/settings note clear"],
        subcommands: {
          show: {
            insertText: "show",
            label: "/settings note show",
            kind: "subcommand",
            description: "show the persisted session note",
            example: "/settings note show",
            key: "slash:settings:note:show",
            usage: "/settings note show"
          },
          set: {
            insertText: "set",
            label: "/settings note set",
            kind: "subcommand",
            description: "set the persisted session note",
            example: "/settings note set needs review",
            key: "slash:settings:note:set",
            usage: "/settings note set <text...>"
          },
          clear: {
            insertText: "clear",
            label: "/settings note clear",
            kind: "subcommand",
            description: "clear the persisted session note",
            example: "/settings note clear",
            key: "slash:settings:note:clear",
            usage: "/settings note clear"
          }
        }
      },
      theme: {
        insertText: "theme",
        label: "/settings theme",
        kind: "subcommand",
        description: "inspect or edit active and inactive terminal theme slots",
        example: "/settings theme preset active solarized-dark",
        key: "slash:settings:theme",
        usage: [
          "/settings theme show [active|inactive]",
          "/settings theme preset <active|inactive> <theme>",
          "/settings theme set <active|inactive> <key> <#rrggbb>",
          "/settings theme reset <active|inactive>",
          "/settings theme import <active|inactive> <auto|iterm2|windows-terminal|xresources|ptydeck> <payload...>",
          "/settings theme export <active|inactive> <ptydeck|iterm2|windows-terminal|xresources>"
        ],
        subcommands: {
          show: {
            insertText: "show",
            label: "/settings theme show",
            kind: "subcommand",
            description: "show the active and inactive theme slots",
            example: "/settings theme show active",
            key: "slash:settings:theme:show",
            usage: "/settings theme show [active|inactive]"
          },
          preset: {
            insertText: "preset",
            label: "/settings theme preset",
            kind: "subcommand",
            description: "apply a known theme preset to a theme slot",
            example: "/settings theme preset active solarized-dark",
            key: "slash:settings:theme:preset",
            usage: "/settings theme preset <active|inactive> <theme>"
          },
          set: {
            insertText: "set",
            label: "/settings theme set",
            kind: "subcommand",
            description: "set one theme key on a theme slot",
            example: "/settings theme set active background #0a0d12",
            key: "slash:settings:theme:set",
            usage: "/settings theme set <active|inactive> <key> <#rrggbb>"
          },
          reset: {
            insertText: "reset",
            label: "/settings theme reset",
            kind: "subcommand",
            description: "reset a theme slot back to the default theme",
            example: "/settings theme reset inactive",
            key: "slash:settings:theme:reset",
            usage: "/settings theme reset <active|inactive>"
          },
          import: {
            insertText: "import",
            label: "/settings theme import",
            kind: "subcommand",
            description: "import an external theme payload into a theme slot",
            example: "/settings theme import active windows-terminal {\"background\":\"#000000\"}",
            key: "slash:settings:theme:import",
            usage: "/settings theme import <active|inactive> <auto|iterm2|windows-terminal|xresources|ptydeck> <payload...>"
          },
          export: {
            insertText: "export",
            label: "/settings theme export",
            kind: "subcommand",
            description: "export a theme slot in an external theme format",
            example: "/settings theme export active xresources",
            key: "slash:settings:theme:export",
            usage: "/settings theme export <active|inactive> <ptydeck|iterm2|windows-terminal|xresources>"
          }
        }
      },
      "input-safety": {
        insertText: "input-safety",
        label: "/settings input-safety",
        kind: "subcommand",
        description: "inspect or edit explicit input safety options",
        example: "/settings input-safety set syntax on",
        key: "slash:settings:input-safety",
        usage: ["/settings input-safety show", "/settings input-safety set <field> <value>"],
        subcommands: {
          show: {
            insertText: "show",
            label: "/settings input-safety show",
            kind: "subcommand",
            description: "show explicit input safety settings",
            example: "/settings input-safety show",
            key: "slash:settings:input-safety:show",
            usage: "/settings input-safety show"
          },
          set: {
            insertText: "set",
            label: "/settings input-safety set",
            kind: "subcommand",
            description: "set one explicit input safety field",
            example: "/settings input-safety set syntax on",
            key: "slash:settings:input-safety:set",
            usage: "/settings input-safety set <field> <value>"
          }
        }
      },
      "mouse-forwarding": {
        insertText: "mouse-forwarding",
        label: "/settings mouse-forwarding",
        kind: "subcommand",
        description: "inspect or edit the terminal mouse forwarding mode",
        example: "/settings mouse-forwarding set application",
        key: "slash:settings:mouse-forwarding",
        usage: ["/settings mouse-forwarding show", "/settings mouse-forwarding set <off|application>"],
        subcommands: {
          show: {
            insertText: "show",
            label: "/settings mouse-forwarding show",
            kind: "subcommand",
            description: "show the terminal mouse forwarding mode",
            example: "/settings mouse-forwarding show",
            key: "slash:settings:mouse-forwarding:show",
            usage: "/settings mouse-forwarding show"
          },
          set: {
            insertText: "set",
            label: "/settings mouse-forwarding set",
            kind: "subcommand",
            description: "set the terminal mouse forwarding mode",
            example: "/settings mouse-forwarding set application",
            key: "slash:settings:mouse-forwarding:set",
            usage: "/settings mouse-forwarding set <off|application>"
          }
        }
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
    summary: "/layout | /layout save <name> | /layout apply <profile> | /layout rename <profile> <name> | /layout delete <profile>",
    usage: [
      "/layout",
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
    summary:
      "/workspace | /workspace save <name> | /workspace show <preset> | /workspace apply <preset> | /workspace duplicate <preset> <name> | /workspace rename <preset> <name> | /workspace delete <preset> | /workspace group ...",
    usage: [
      "/workspace",
      "/workspace save <name>",
      "/workspace show <preset>",
      "/workspace apply <preset>",
      "/workspace duplicate <preset> <name>",
      "/workspace rename <preset> <name>",
      "/workspace delete <preset>",
      "/workspace group list",
      "/workspace group save <name>",
      "/workspace group apply <group>",
      "/workspace group rename <group> <name>",
      "/workspace group delete <group>",
      "/workspace group clear"
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
      show: {
        insertText: "show",
        label: "/workspace show",
        kind: "subcommand",
        description: "show workspace preset details",
        example: "/workspace show ops",
        key: "slash:workspace:show",
        usage: "/workspace show <preset>"
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
      duplicate: {
        insertText: "duplicate",
        label: "/workspace duplicate",
        kind: "subcommand",
        description: "duplicate a saved workspace preset",
        example: "/workspace duplicate ops ops-copy",
        key: "slash:workspace:duplicate",
        usage: "/workspace duplicate <preset> <name>"
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
      },
      group: {
        insertText: "group",
        label: "/workspace group",
        kind: "subcommand",
        description: "manage deck-local workspace groups on the active deck",
        example: "/workspace group save build",
        key: "slash:workspace:group",
        usage: [
          "/workspace group list",
          "/workspace group save <name>",
          "/workspace group apply <group>",
          "/workspace group rename <group> <name>",
          "/workspace group delete <group>",
          "/workspace group clear"
        ],
        subcommands: {
          list: {
            insertText: "list",
            label: "/workspace group list",
            kind: "subcommand",
            description: "list workspace groups for the active deck",
            example: "/workspace group list",
            key: "slash:workspace:group:list",
            usage: "/workspace group list"
          },
          save: {
            insertText: "save",
            label: "/workspace group save",
            kind: "subcommand",
            description: "save the current filtered deck view as a workspace group",
            example: "/workspace group save build",
            key: "slash:workspace:group:save",
            usage: "/workspace group save <name>"
          },
          apply: {
            insertText: "apply",
            label: "/workspace group apply",
            kind: "subcommand",
            description: "apply a workspace group on the active deck",
            example: "/workspace group apply build",
            key: "slash:workspace:group:apply",
            usage: "/workspace group apply <group>"
          },
          rename: {
            insertText: "rename",
            label: "/workspace group rename",
            kind: "subcommand",
            description: "rename a workspace group on the active deck",
            example: "/workspace group rename build build-main",
            key: "slash:workspace:group:rename",
            usage: "/workspace group rename <group> <name>"
          },
          delete: {
            insertText: "delete",
            label: "/workspace group delete",
            kind: "subcommand",
            description: "delete a workspace group on the active deck",
            example: "/workspace group delete build",
            key: "slash:workspace:group:delete",
            usage: "/workspace group delete <group>"
          },
          clear: {
            insertText: "clear",
            label: "/workspace group clear",
            kind: "subcommand",
            description: "clear the active workspace group on the active deck",
            example: "/workspace group clear",
            key: "slash:workspace:group:clear",
            usage: "/workspace group clear"
          }
        }
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
    summary: "/broadcast | /broadcast off | /broadcast group [group]",
    usage: [
      "/broadcast",
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
    summary: "/share | /share session | /share deck [deckSelector] | /share revoke <shareId>",
    usage: [
      "/share",
      "/share session",
      "/share deck [deckSelector]",
      "/share revoke <shareId>"
    ],
    notes: [
      "Bare `/share` is shorthand for `/share list`.",
      "The `/share session` subcommand uses the active session by default and supports direct-route targeting."
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
        usage: "/share session",
        notes: ACTIVE_SESSION_DIRECT_ROUTE_NOTE
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
    summary:
      "/custom list | /custom show ... | /custom preview ... | /custom remove ... | /custom [plain|template] [scope:...] <name> <text>",
    usage: [
      "/custom list",
      "/custom show [scope:global|scope:project|scope:session:<selector>] <name>",
      "/custom preview [scope:global|scope:project|scope:session:<selector>] <name> [key=value ...] [-- <targetSelector>]",
      "/custom remove [scope:global|scope:project|scope:session:<selector>] <name>",
      "/custom [plain|template] [scope:global|scope:project|scope:session:<selector>] <name> <text>",
      "/custom [plain|template] [scope:global|scope:project|scope:session:<selector>] <name> + block"
    ],
    notes: [
      "Use `/custom list` to inspect saved commands.",
      "When the first token is not a recognized subcommand, `/custom ...` defines or updates a custom command."
    ],
    subcommands: {
      list: {
        insertText: "list",
        label: "/custom list",
        kind: "subcommand",
        description: "list saved custom commands",
        example: "/custom list",
        key: "slash:custom:list",
        usage: "/custom list"
      },
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
    ],
    args: [
      { provider: "help-topic", optional: true },
      { provider: "help-subcommand", optional: true }
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
  { alias: "connection.new", command: "connection", subcommand: "new" },
  { alias: "connection.save", command: "connection", subcommand: "save" },
  { alias: "connection.show", command: "connection", subcommand: "show" },
  { alias: "connection.apply", command: "connection", subcommand: "apply" },
  { alias: "connection.duplicate", command: "connection", subcommand: "duplicate" },
  { alias: "connection.rename", command: "connection", subcommand: "rename" },
  { alias: "connection.delete", command: "connection", subcommand: "delete" },
  { alias: "workspace.list", command: "workspace", subcommand: "list" },
  { alias: "workspace.save", command: "workspace", subcommand: "save" },
  { alias: "workspace.show", command: "workspace", subcommand: "show" },
  { alias: "workspace.apply", command: "workspace", subcommand: "apply" },
  { alias: "workspace.duplicate", command: "workspace", subcommand: "duplicate" },
  { alias: "workspace.rename", command: "workspace", subcommand: "rename" },
  { alias: "workspace.delete", command: "workspace", subcommand: "delete" },
  { alias: "replay.view", command: "replay", subcommand: "view" },
  { alias: "replay.export", command: "replay", subcommand: "export" },
  { alias: "replay.copy", command: "replay", subcommand: "copy" },
  { alias: "replay.preview", command: "replay", subcommand: "preview" },
  { alias: "replay.paste", command: "replay", subcommand: "paste" },
  { alias: "ccp", command: "replay", subcommand: "paste" },
  { alias: "transfer.upload", command: "transfer", subcommand: "upload" },
  { alias: "transfer.download", command: "transfer", subcommand: "download" },
  { alias: "settings.show", command: "settings", subcommand: "show" },
  { alias: "settings.startup", command: "settings", subcommand: "startup" },
  { alias: "settings.note", command: "settings", subcommand: "note" },
  { alias: "settings.theme", command: "settings", subcommand: "theme" },
  { alias: "settings.input-safety", command: "settings", subcommand: "input-safety" },
  { alias: "settings.mouse-forwarding", command: "settings", subcommand: "mouse-forwarding" },
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
    const list = [...(aliasesByTarget.get(targetKey) || [])];
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
      ...(subcommand.notes || []).map((note) => `Note: ${note}`),
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
  if (command.notes?.length) {
    sections.push(...command.notes.map((note) => `Note: ${note}`));
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
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
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
