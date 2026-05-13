# Paste and Send Safety

`ptydeck` has two different input paths:

- composer `Send`
- terminal-local paste or typing inside the mounted terminal

They share the same send-safety model, but they do not start from the same UI surface.

## Guarded Sends

If a rule in the session input-safety profile matches, the input is held for confirmation.

The control pane states that nothing has been sent yet, then shows `Send anyway` if you want to override the guard.

Use the [session settings reference](../reference/session-settings.md#input-tab) for the exact input-safety switches and thresholds.

## Composer Normalize

The composer now also exposes a `Normalize` action above `Send` in the shared footer and in pinned overlay composers.

`Normalize` is intentionally conservative:

- normalize CRLF to LF
- strip trailing horizontal whitespace on each line
- trim outer whitespace

It does not try to repair structure or rewrite internal indentation.

## Composer Placement Modes

`ptydeck` now supports two server-persisted composer placement modes for each operator client:

- `shared-footer`: one shared composer stays below the terminal grid
- `active-overlay`: the shared composer moves into the active terminal as a non-resizing overlay below the terminal header

In `active-overlay` mode, you can also pin individual terminals:

- pinned terminals get their own overlay composer block
- multiple terminals can stay pinned at the same time
- pinned terminals keep their own drafts
- the shared overlay composer is shown only for the active terminal when that terminal is not pinned

Use this when accidental sends happen because the footer composer is still visible while a different terminal is active.

## Terminal-Local Paste

Terminal-local paste is routed through the guarded send path instead of bypassing safety checks.

If a large paste looks incomplete, `ptydeck` can now classify the result as:

- complete
- partial
- placeholder-acknowledged
- stalled

For stalled terminal-local paste, use the explicit `Continue Paste` action in the control pane.

## Auto Continue

`Paste Auto Continue` is intentionally conservative.

Use it only when a session consistently shows the same partial-ack behavior, for example a coding-agent prompt that accepts the first large block and then waits for another submit signal.

## Practical Checks

When paste behavior differs across sessions, compare these first:

1. the `Input` tab
2. the session's send terminator
3. whether the session has stricter send-safety rules enabled
4. whether the operator client is using `shared-footer`, `active-overlay`, or one or more pinned overlays
5. whether `Normalize` should be applied before sending copied multiline input

The field-level truth stays in the [generated input reference](../reference/session-settings.md#input-tab).
