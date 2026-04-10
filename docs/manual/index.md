# ptydeck Handbook

The handbook is split into two layers:

- [Operator guides](startup-and-sessions.md) for real workflows and decisions.
- [Generated reference](../reference/README.md) for commands, API routes, and session-setting contracts.

## Start Here

- Use [Startup and Sessions](startup-and-sessions.md) if you need to create terminals, move around decks, or restart work quickly.
- Use [Session Settings](session-settings.md) when you need to change launch, input, note, or theme behavior.
- Use [Paste and Send Safety](paste-and-send-safety.md) when terminal-local paste or guarded sends behave differently between sessions.
- Use [Replay Copy and Paste](replay-copy-paste.md) for `/replay ...` and `/ccp ...` workflows.
- Use [Messaging Adapters](messaging-adapters.md) for the Telegram reference adapter, bounded inbound actions, and operator expectations around remote status/stop/retry/replay.
- Use [Workspace Library](workspace-library.md) for saved connection profiles and workspace presets.
- Use [Trusted-Local Control](trusted-local-control.md) for single-user multi-device takeover and layout recall.

## Reference Jump Points

- [Slash command reference](../reference/commands.md)
- [API reference](../reference/api.md)
- [Session settings reference](../reference/session-settings.md)

## Operating Model

- `ptydeck` is optimized for a single-user local runtime with multiple sessions and decks.
- Handbook reference pages are generated from code and contracts.
- Handbook guide pages stay short and link back to the generated reference instead of duplicating field-level truth.
