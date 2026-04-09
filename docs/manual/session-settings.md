# Session Settings

The session settings dialog is for persistent per-session behavior, not transient terminal output.

## Tabs

The dialog is intentionally split into four tabs:

- `Startup`
- `Input`
- `Note`
- `Theme`

The exact fields, defaults, and accepted values are generated in the [session settings reference](../reference/session-settings.md).

## Startup

Use `Startup` for launch-time state only.

Change these fields here:

- working directory
- start command line
- advanced startup environment variables

If you want the session to come back differently after restart, change `Startup` first and then restart the session.

## Input

Use `Input` for send behavior and guarded input behavior.

This is where you change:

- send terminator
- mouse forwarding
- send safety checks and thresholds

If terminal-local paste behaves differently between two sessions, compare the `Input` tab first. The fastest reference for that is the [Input tab section](../reference/session-settings.md#input-tab).

## Note

Use `Note` when you want durable operational context directly on the session card.

Typical uses:

- explain what the session is for
- pin a reminder about a deploy or branch
- add searchable tags like `prod`, `ops`, or `migration`

## Theme

Use `Theme` when you want different active/inactive visual treatment for a specific session.

The theme tab supports active/inactive slots, preset filtering, and advanced custom colors. For the exact contract, use the [Theme tab reference](../reference/session-settings.md#theme-tab).

## Save or Cancel

`Cancel`, dialog dismiss, and `Escape` all discard the draft and restore the current persisted session state.

`Save Settings` persists the current draft.
