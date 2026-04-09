# Workspace Library

The `Manage` entry in the control pane opens the `Workspace Library`.

Use it for saved connection profiles and saved workspace presets instead of overloading the left sidebar.

## Connections

Use the `Connections` tab when you want saved local or SSH launch profiles.

Typical flow:

1. open `Manage`
2. choose `Connections`
3. create a new local or SSH draft
4. save the profile or `Save and Launch`

Useful slash companions:

```text
/connection list
/connection new local
/connection save
/connection apply ops-ssh
```

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
