# Startup and Sessions

Use this guide when you need to create sessions quickly, place them into the right deck, and recover the same work later.

## Create a Session

You can create sessions from the sidebar, from the `New Session` action, or with slash commands.

```text
/new bash
/new zsh
/new powershell
/new ps
/new pwsh
```

On WSL-backed installs, `/new powershell` launches Windows PowerShell directly instead of opening a WSL shell and running PowerShell inside it. `/new ps` is shorthand for the same launcher. If PowerShell 7 is installed in a standard Windows location or is already available on PATH, `/new pwsh` starts that launcher directly.

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

## Restart, Stop, or Rename Safely

Use slash commands when you already know the session selector, or use the session card toolbar when you are working visually.

Not every session-bound command uses the same targeting shape:

- commands with an explicit selector slot, such as `/restart`, take selectors positionally
- free-text commands such as `/rename`, `/note`, `/settings`, and `/transfer` target the active session by default; use `@<sessionSelector> /...` to route them to another session without switching

```text
/switch 4
/rename build-agent
@4 /rename build-agent
/restart 4
```

If the session has startup settings, restart uses the current persisted startup contract from the session settings dialog.

Each session header now also exposes a start/stop toggle beside `Refresh` and `Settings`.

- Running sessions show `Stop`.
- Stopped sessions show `Start`.
- Exited sessions also show `Start`, which relaunches the session through the existing restart contract while preserving the session identity and card slot.
- Stopping a session keeps the session card and layout slot on screen, but clears the terminal viewport so the reserved area stays visually empty until you start it again.
- The stopped/running state is server-persisted across backend restart and restore:
  - stopped sessions stay stopped
  - exited sessions stay visible as exited and can be relaunched from the header `Start` action
  - running sessions are started again during restore

The stopped state is intentionally stronger than a local hide or pause:

- direct terminal typing is blocked
- composer sends and quick-send actions are blocked
- the card remains visible so deck/layout structure does not collapse
- the same session-control ownership gate still applies, so a non-controller client must reclaim control before it can start or stop the session

For secret-backed SSH sessions, ptydeck still does not persist the runtime secret itself. If you restore a stopped password-based or keyboard-interactive SSH session after backend restart and the original runtime secret is no longer available, ptydeck now keeps the card in the stopped state but disables `Start` with an explicit explanation. Recover that case by deleting and relaunching the session with a fresh secret, or by updating it through the API with a new `remoteSecret`.

When you work from the session cards, hover the toolbar area to reveal quick actions for that specific session:

- up to five of the most frequently sent custom commands for that session
- one `Clipboard` action that reads the browser clipboard and routes it through the existing guarded paste/send path

The quick-send ranking is backend-authoritative and restart-persistent. It follows the session across reloads, browser profiles, and operator devices with normal write access, while read-only share spectators do not receive the ranking data.

## When to Use Session Settings

Open the session settings dialog when you need to change how the session starts or behaves the next time you use it.

- `Startup` changes launch-time state.
- `Input` changes send terminator, mouse forwarding, and send safety.
- `Note` stores persistent session notes and tags.
- `Theme` changes the active/inactive terminal appearance.

See [Session Settings](session-settings.md) for the workflow and [session settings reference](../reference/session-settings.md) for the exact field contract.
