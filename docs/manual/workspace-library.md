# Workspace Library

The `Manage` entry in the control pane opens the `Workspace Library`.

Use it for saved connection profiles and saved workspace presets instead of overloading the left sidebar.

## Connections

Use the `Connections` tab when you want saved local or SSH launch profiles.

Typical flow:

1. open `Manage`
2. choose `Connections`
3. create a new local or SSH draft
4. for a new SSH target, fetch the presented host keys, verify the expected fingerprint, and trust the selected key
5. save the profile or `Save and Launch`

Useful slash companions:

```text
/connection list
/ssh ixpqtwnk@carpo.uberspace.de --key ~/.ssh/id_ed25519
/connection draft new ops-ssh
/connection save
/connection apply ops-ssh
```

`/ssh ...` now starts a one-shot SSH session without first saving a connection profile, but the first launch for a new SSH target still depends on a trusted host-key entry. ptydeck fetches the presented host keys and stops if none is trusted yet; the host-key fetch/review/trust step still lives in the `Connections` UI instead of a slash-command-only workflow.

## Workspace Presets

Use the `Workspace Presets` tab when you want to persist the visible workspace shape and reapply it later.

Useful slash companions:

```text
/workspace list
/workspace save morning-ops
/workspace apply morning-ops
```

## Keep the Roles Separate

Use these surfaces for different problems:

- `Connections`: how a session starts
- `Workspace Presets`: what the visible workspace looks like
- session settings: how one session behaves
- layout profiles: reusable deck layout state

The handbook keeps the workflows here and the exact transport/field contract in the generated reference pages.
