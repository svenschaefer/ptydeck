# Replay Copy and Paste

Replay-based copy and paste is the bounded way to move visible terminal output from one session into another without selecting text manually.

## Preview Before You Move Content

Use preview when you want to inspect the excerpt first:

```text
/replay preview 4 l:40
/replay preview 4 sp:1
```

Selectors:

- `l:N` for the last visible lines
- `c:N` for the last visible characters
- `sp:N` for complete shell blocks when shell-block tracking is available

## Copy to the Browser Clipboard

```text
/replay copy 4 l:80
```

This copies the normalized visible-text excerpt, not raw ANSI control sequences.

## Paste into Another Session

```text
/replay paste 4 3 sp:2
/ccp 4 3 l:80
```

`/ccp` is just the compact alias for `/replay paste`.

The target path reuses the normal paste/send runtime, which means replay paste still respects:

- send terminators
- send safety
- trusted-local controller gating
- reclaim-and-retry behavior

## When `sp:N` Is Unavailable

`sp:N` is intentionally strict. If robust shell-block boundaries are not available for the source session, the command fails explicitly instead of guessing with prompt regexes.

Use `l:N` or `c:N` as the fallback.

The exact command contract stays in the [slash command reference](../reference/commands.md#replay).
