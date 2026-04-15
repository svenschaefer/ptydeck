# Startup and Sessions

Use this guide when you need to create sessions quickly, place them into the right deck, and recover the same work later.

## Create a Session

You can create sessions from the sidebar, from the `New Session` action, or with slash commands.

```text
/new bash
/new zsh
```

If you already know the deck you want, create or switch the deck first:

```text
/deck new ops
/deck switch ops
```

If your local runtime is reachable through both a canonical domain and a direct IP/dev-port URL, use the canonical browser origin consistently. Trusted-local identity, layout recall, and control state are browser-origin-local, so switching between origins such as `https://ptydeck.local.secos.rocks` and `http://172.26.86.97:18081` can make one physical browser look like two different devices unless `FRONTEND_CANONICAL_ORIGIN` redirects non-canonical opens first.

The full command surface lives in the [slash command reference](../reference/commands.md).

## Shape the Deck

The active deck owns the visible session set, filter, and deck-level terminal size.

```text
/size 120 34
/filter ops
/list
```

Use `Terminal Size` and `Saved Layouts` in the sidebar for the same operations through the UI.

## Restart or Rename Safely

Use slash commands when you already know the session selector, or use the session card toolbar when you are working visually.

```text
/rename 4 build-agent
/restart 4
```

If the session has startup settings, restart uses the current persisted startup contract from the session settings dialog.

## When to Use Session Settings

Open the session settings dialog when you need to change how the session starts or behaves the next time you use it.

- `Startup` changes launch-time state.
- `Input` changes send terminator, mouse forwarding, and send safety.
- `Note` stores persistent session notes and tags.
- `Theme` changes the active/inactive terminal appearance.

See [Session Settings](session-settings.md) for the workflow and [session settings reference](../reference/session-settings.md) for the exact field contract.
