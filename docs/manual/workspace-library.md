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
/ssh hostkey probe carpo.uberspace.de:22
/ssh hostkey trust carpo.uberspace.de:22 ssh-ed25519
/connection draft new ops-ssh
/connection save ops-ssh
/connection apply ops-ssh
```

`/ssh ...` now starts a one-shot SSH session without first saving a connection profile, and the SSH host-key lifecycle is also available in the command plane. Use `/ssh hostkey probe <target>` to fetch the presented keys, verify the fingerprint, then `/ssh hostkey trust <target> <keyType|fingerprint>` before rerunning `/ssh ...`. The `Connections` UI still shows the same trust state for saved-profile workflows.

For password or keyboard-interactive SSH auth, both saved-profile launches and one-shot `/ssh ...` launches now request the runtime secret in one masked launch dialog right before start. The secret is not stored in the saved profile, browser state, or backend persistence.

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
