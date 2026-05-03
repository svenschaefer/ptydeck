# Slash Command Reference

Generated from `frontend/src/public/command-schema.js` and `frontend/src/public/system-slash-commands.js`.

## Canonical Commands

| Command | Description | Usage | Aliases |
| --- | --- | --- | --- |
| `/broadcast` | manage composer broadcast mode for workspace groups | `/broadcast`<br>`/broadcast off`<br>`/broadcast group [group]` | - |
| `/close` | delete sessions | `/close [selector[,selector...]]` | `/session.close` |
| `/connection` | manage saved connection profiles | `/connection`<br>`/connection new <name>`<br>`/connection save <name>`<br>`/connection show <profile>`<br>`/connection apply <profile>`<br>`/connection duplicate <profile> <name>`<br>`/connection rename <profile> <name>`<br>`/connection delete <profile>`<br>`/connection draft show`<br>`/connection draft new [name]`<br>`/connection draft active`<br>`/connection draft set <json>`<br>`/connection draft save [name]`<br>`/connection draft reset` | - |
| `/custom` | manage custom commands | `/custom list`<br>`/custom show [scope:global|scope:project|scope:session:<selector>] <name>`<br>`/custom preview [scope:global|scope:project|scope:session:<selector>] <name> [key=value ...] [-- <targetSelector>]`<br>`/custom remove [scope:global|scope:project|scope:session:<selector>] <name>`<br>`/custom [plain|template] [scope:global|scope:project|scope:session:<selector>] <name> <text>`<br>`/custom [plain|template] [scope:global|scope:project|scope:session:<selector>] <name> + block` | - |
| `/deck` | manage decks | `/deck`<br>`/deck new <name>`<br>`/deck rename <name>`<br>`/deck rename <deckSelector> <name>`<br>`/deck switch <deckSelector>`<br>`/deck delete [deckSelector] [force]` | - |
| `/filter` | filter visible terminals | `/filter [id/tag[,id/tag...]]` | - |
| `/help` | show command help | `/help`<br>`/help <topic>`<br>`/help <topic> <subcommand>` | - |
| `/layout` | manage persisted layout profiles | `/layout`<br>`/layout save <name>`<br>`/layout apply <profile>`<br>`/layout rename <profile> <name>`<br>`/layout delete <profile>` | - |
| `/list` | list sessions | `/list` | `/session.list` |
| `/move` | move sessions to a deck | `/move <sessionSelector> <deckSelector>` | - |
| `/new` | create a new session | `/new [shell]` | `/session.new` |
| `/next` | focus next session | `/next` | `/session.next` |
| `/note` | set or clear a persisted session note | `/note [text...]` | `/session.note` |
| `/prev` | focus previous session | `/prev` | `/session.prev` |
| `/rename` | rename a session | `/rename <name>` | `/session.rename` |
| `/replay` | view retained replay tails or preview/copy/paste normalized replay excerpts | `/replay view`<br>`/replay export`<br>`/replay copy`<br>`/replay copy <sourceSelector> <sliceSelector>`<br>`/replay preview <sourceSelector> <sliceSelector>`<br>`/replay paste <sourceSelector> <targetSelector> <sliceSelector>` | - |
| `/restart` | restart sessions | `/restart [selector[,selector...]]` | `/session.restart` |
| `/run` | run a newline-separated slash-command script | `/run + newline-separated slash commands`<br>`/cmd1 + newline + /cmd2` | - |
| `/settings` | inspect or manage session settings | `/settings show`<br>`/settings apply <json>`<br>`/settings startup show`<br>`/settings startup cwd <path>`<br>`/settings startup command <text...>`<br>`/settings startup env <json>`<br>`/settings startup tags <tag[,tag...]>`<br>`/settings startup terminator <auto|crlf|lf|cr|cr2|cr_delay>`<br>`/settings note show`<br>`/settings note set <text...>`<br>`/settings note clear`<br>`/settings theme show [active|inactive]`<br>`/settings theme preset <active|inactive> <theme>`<br>`/settings theme set <active|inactive> <key> <#rrggbb>`<br>`/settings theme reset <active|inactive>`<br>`/settings theme import <active|inactive> <auto|iterm2|windows-terminal|xresources|ptydeck> <payload...>`<br>`/settings theme export <active|inactive> <ptydeck|iterm2|windows-terminal|xresources>`<br>`/settings input-safety show`<br>`/settings input-safety set <field> <value>`<br>`/settings mouse-forwarding show`<br>`/settings mouse-forwarding set <off|application>` | - |
| `/share` | manage read-only spectator shares for sessions and decks | `/share`<br>`/share session`<br>`/share deck [deckSelector]`<br>`/share revoke <shareId>` | - |
| `/size` | set deck terminal size | `/size <cols> <rows>`<br>`/size c<cols>`<br>`/size r<rows>` | - |
| `/ssh` | start a one-shot SSH session without first saving a connection profile | `/ssh <target>`<br>`/ssh <target> --key <path>`<br>`/ssh <target> --password`<br>`/ssh <target> --keyboard-interactive`<br>`/ssh <target> [-l|--user <username>] [-p|--port <port>]` | - |
| `/swap` | swap quick ids between two sessions | `/swap <selectorA> <selectorB>` | `/session.swap` |
| `/switch` | switch active session | `/switch <sessionSelector>` | `/session.switch` |
| `/transfer` | upload or download bounded files for one session | `/transfer upload [path]`<br>`/transfer download <path>` | - |
| `/workspace` | manage persisted workspace presets | `/workspace`<br>`/workspace save <name>`<br>`/workspace show <preset>`<br>`/workspace apply <preset>`<br>`/workspace duplicate <preset> <name>`<br>`/workspace rename <preset> <name>`<br>`/workspace delete <preset>`<br>`/workspace group list`<br>`/workspace group save <name>`<br>`/workspace group apply <group>`<br>`/workspace group rename <group> <name>`<br>`/workspace group delete <group>`<br>`/workspace group clear` | - |

## /broadcast

manage composer broadcast mode for workspace groups

### Usage

- `/broadcast`
- `/broadcast off`
- `/broadcast group [group]`

### Subcommands

| Subcommand | Description | Usage |
| --- | --- | --- |
| `/broadcast group` | broadcast composer sends to the active or selected workspace group<br>Aliases: `/broadcast.group` | `/broadcast group [group]` |
| `/broadcast off` | disable broadcast mode<br>Aliases: `/broadcast.off` | `/broadcast off` |
| `/broadcast status` | show current broadcast mode<br>Aliases: `/broadcast.status` | `/broadcast status` |

## /close

delete sessions

### Usage

- `/close [selector[,selector...]]`

### Aliases

`/session.close`

## /connection

manage saved connection profiles

### Usage

- `/connection`
- `/connection new <name>`
- `/connection save <name>`
- `/connection show <profile>`
- `/connection apply <profile>`
- `/connection duplicate <profile> <name>`
- `/connection rename <profile> <name>`
- `/connection delete <profile>`
- `/connection draft show`
- `/connection draft new [name]`
- `/connection draft active`
- `/connection draft set <json>`
- `/connection draft save [name]`
- `/connection draft reset`

### Notes

- Bare `/connection` is shorthand for `/connection list`.
- The session-derived subcommands `/connection save <name>` and `/connection draft active` use the active session by default and support direct-route targeting.

### Subcommands

| Subcommand | Description | Usage |
| --- | --- | --- |
| `/connection apply` | start a session from a saved connection profile<br>Aliases: `/connection.apply` | `/connection apply <profile>` |
| `/connection delete` | delete a saved connection profile<br>Aliases: `/connection.delete` | `/connection delete <profile>` |
| `/connection draft` | inspect or edit the connection profile draft used by the Workspace Library | `/connection draft show`<br>`/connection draft new [name]`<br>`/connection draft active`<br>`/connection draft set <json>`<br>`/connection draft save [name]`<br>`/connection draft reset` |
| `/connection duplicate` | duplicate a saved connection profile<br>Aliases: `/connection.duplicate` | `/connection duplicate <profile> <name>` |
| `/connection list` | list saved connection profiles<br>Aliases: `/connection.list` | `/connection list` |
| `/connection new` | create a blank saved connection profile<br>Aliases: `/connection.new` | `/connection new <name>` |
| `/connection rename` | rename a saved connection profile<br>Aliases: `/connection.rename` | `/connection rename <profile> <name>` |
| `/connection save` | save a session launch preset as a connection profile<br>Aliases: `/connection.save`<br>Notes: Targets the active session by default. To target another session without switching, use `/help @` and the direct-route form `@<sessionSelector> /<command> ...`. | `/connection save <name>` |
| `/connection show` | show connection profile details<br>Aliases: `/connection.show` | `/connection show <profile>` |

## /custom

manage custom commands

### Usage

- `/custom list`
- `/custom show [scope:global|scope:project|scope:session:<selector>] <name>`
- `/custom preview [scope:global|scope:project|scope:session:<selector>] <name> [key=value ...] [-- <targetSelector>]`
- `/custom remove [scope:global|scope:project|scope:session:<selector>] <name>`
- `/custom [plain|template] [scope:global|scope:project|scope:session:<selector>] <name> <text>`
- `/custom [plain|template] [scope:global|scope:project|scope:session:<selector>] <name> + block`

### Notes

- Use `/custom list` to inspect saved commands.
- When the first token is not a recognized subcommand, `/custom ...` defines or updates a custom command.

### Subcommands

| Subcommand | Description | Usage |
| --- | --- | --- |
| `/custom list` | list saved custom commands | `/custom list` |
| `/custom preview` | preview custom command rendering<br>Aliases: `/custom.preview` | `/custom preview [scope:global|scope:project|scope:session:<selector>] <name> [key=value ...] [-- <targetSelector>]` |
| `/custom remove` | delete custom command<br>Aliases: `/custom.remove` | `/custom remove [scope:global|scope:project|scope:session:<selector>] <name>` |
| `/custom show` | show custom command<br>Aliases: `/custom.show` | `/custom show [scope:global|scope:project|scope:session:<selector>] <name>` |

## /deck

manage decks

### Usage

- `/deck`
- `/deck new <name>`
- `/deck rename <name>`
- `/deck rename <deckSelector> <name>`
- `/deck switch <deckSelector>`
- `/deck delete [deckSelector] [force]`

### Subcommands

| Subcommand | Description | Usage |
| --- | --- | --- |
| `/deck delete` | delete a deck<br>Aliases: `/deck.delete` | `/deck delete [deckSelector] [force]` |
| `/deck list` | list decks<br>Aliases: `/deck.list` | `/deck list` |
| `/deck new` | create a deck<br>Aliases: `/deck.new` | `/deck new <name>` |
| `/deck rename` | rename the active deck<br>Aliases: `/deck.rename` | `/deck rename <name>`<br>`/deck rename <deckSelector> <name>` |
| `/deck switch` | switch active deck<br>Aliases: `/deck.switch` | `/deck switch <deckSelector>` |

## /filter

filter visible terminals

### Usage

- `/filter [id/tag[,id/tag...]]`

## /help

show command help

### Usage

- `/help`
- `/help <topic>`
- `/help <topic> <subcommand>`

## /layout

manage persisted layout profiles

### Usage

- `/layout`
- `/layout save <name>`
- `/layout apply <profile>`
- `/layout rename <profile> <name>`
- `/layout delete <profile>`

### Subcommands

| Subcommand | Description | Usage |
| --- | --- | --- |
| `/layout apply` | apply a saved layout profile<br>Aliases: `/layout.apply` | `/layout apply <profile>` |
| `/layout delete` | delete a saved layout profile<br>Aliases: `/layout.delete` | `/layout delete <profile>` |
| `/layout list` | list saved layout profiles<br>Aliases: `/layout.list` | `/layout list` |
| `/layout rename` | rename a saved layout profile<br>Aliases: `/layout.rename` | `/layout rename <profile> <name>` |
| `/layout save` | save the current workspace layout as a named profile<br>Aliases: `/layout.save` | `/layout save <name>` |

## /list

list sessions

### Usage

- `/list`

### Aliases

`/session.list`

## /move

move sessions to a deck

### Usage

- `/move <sessionSelector> <deckSelector>`

## /new

create a new session

### Usage

- `/new [shell]`

### Aliases

`/session.new`

## /next

focus next session

### Usage

- `/next`

### Aliases

`/session.next`

## /note

set or clear a persisted session note

### Usage

- `/note [text...]`

### Notes

- This command does not accept a positional session selector.
- Update the active session note with `/note <text...>`, or target another session with `@<sessionSelector> /note <text...>`.

### Aliases

`/session.note`

## /prev

focus previous session

### Usage

- `/prev`

### Aliases

`/session.prev`

## /rename

rename a session

### Usage

- `/rename <name>`

### Notes

- This command does not accept a positional session selector.
- Rename the active session with `/rename <name>`, or target another session with `@<sessionSelector> /rename <name>`.

### Aliases

`/session.rename`

## /replay

view retained replay tails or preview/copy/paste normalized replay excerpts

### Usage

- `/replay view`
- `/replay export`
- `/replay copy`
- `/replay copy <sourceSelector> <sliceSelector>`
- `/replay preview <sourceSelector> <sliceSelector>`
- `/replay paste <sourceSelector> <targetSelector> <sliceSelector>`

### Notes

- The `/replay view`, `/replay export`, and zero-selector `/replay copy` forms use the active session by default and support direct-route targeting.
- The excerpt-oriented `/replay copy <sourceSelector> <sliceSelector>`, `/replay preview ...`, and `/replay paste ...` forms use explicit positional selectors.

### Subcommands

| Subcommand | Description | Usage |
| --- | --- | --- |
| `/replay copy` | copy the retained replay tail or a normalized replay excerpt to the clipboard<br>Aliases: `/replay.copy`<br>Notes: Without selector arguments, `/replay copy` uses the active session by default and supports direct-route targeting. Use `/replay copy <sourceSelector> <sliceSelector>` when you want an explicit replay excerpt source. | `/replay copy`<br>`/replay copy <sourceSelector> <sliceSelector>` |
| `/replay export` | download the retained replay tail<br>Aliases: `/replay.export`<br>Notes: Targets the active session by default. To target another session without switching, use `/help @` and the direct-route form `@<sessionSelector> /<command> ...`. | `/replay export` |
| `/replay paste` | paste a normalized replay excerpt from one session into another session<br>Aliases: `/ccp`, `/replay.paste` | `/replay paste <sourceSelector> <targetSelector> <sliceSelector>` |
| `/replay preview` | preview a normalized replay excerpt from one source session<br>Aliases: `/replay.preview` | `/replay preview <sourceSelector> <sliceSelector>` |
| `/replay view` | open the retained replay tail in the reading viewer<br>Aliases: `/replay.view`<br>Notes: Targets the active session by default. To target another session without switching, use `/help @` and the direct-route form `@<sessionSelector> /<command> ...`. | `/replay view` |

## /restart

restart sessions

### Usage

- `/restart [selector[,selector...]]`

### Notes

- Without selector arguments, `/restart` targets the active session.
- Use `@<sessionSelector> /restart` for another single session without switching, or `/restart <selector[,selector...]>` for explicit targets.

### Aliases

`/session.restart`

## /run

run a newline-separated slash-command script

### Usage

- `/run + newline-separated slash commands`
- `/cmd1 + newline + /cmd2`

## /settings

inspect or manage session settings

### Usage

- `/settings show`
- `/settings apply <json>`
- `/settings startup show`
- `/settings startup cwd <path>`
- `/settings startup command <text...>`
- `/settings startup env <json>`
- `/settings startup tags <tag[,tag...]>`
- `/settings startup terminator <auto|crlf|lf|cr|cr2|cr_delay>`
- `/settings note show`
- `/settings note set <text...>`
- `/settings note clear`
- `/settings theme show [active|inactive]`
- `/settings theme preset <active|inactive> <theme>`
- `/settings theme set <active|inactive> <key> <#rrggbb>`
- `/settings theme reset <active|inactive>`
- `/settings theme import <active|inactive> <auto|iterm2|windows-terminal|xresources|ptydeck> <payload...>`
- `/settings theme export <active|inactive> <ptydeck|iterm2|windows-terminal|xresources>`
- `/settings input-safety show`
- `/settings input-safety set <field> <value>`
- `/settings mouse-forwarding show`
- `/settings mouse-forwarding set <off|application>`

### Notes

- This command family targets the active session by default and does not accept a positional session selector.
- Use `@<sessionSelector> /settings ...` to inspect or update another session without switching.

### Subcommands

| Subcommand | Description | Usage |
| --- | --- | --- |
| `/settings apply` | apply a normalized settings JSON payload<br>Notes: Targets the active session by default. To target another session without switching, use `/help @` and the direct-route form `@<sessionSelector> /<command> ...`. | `/settings apply <json>` |
| `/settings input-safety` | inspect or edit explicit input safety options<br>Aliases: `/settings.input-safety` | `/settings input-safety show`<br>`/settings input-safety set <field> <value>` |
| `/settings mouse-forwarding` | inspect or edit the terminal mouse forwarding mode<br>Aliases: `/settings.mouse-forwarding` | `/settings mouse-forwarding show`<br>`/settings mouse-forwarding set <off|application>` |
| `/settings note` | inspect or edit the persisted session note<br>Aliases: `/settings.note` | `/settings note show`<br>`/settings note set <text...>`<br>`/settings note clear` |
| `/settings show` | show session settings<br>Aliases: `/settings.show` | `/settings show` |
| `/settings startup` | inspect or edit startup-related session settings<br>Aliases: `/settings.startup` | `/settings startup show`<br>`/settings startup cwd <path>`<br>`/settings startup cwd clear`<br>`/settings startup command <text...>`<br>`/settings startup command clear`<br>`/settings startup env <json>`<br>`/settings startup env clear`<br>`/settings startup tags <tag[,tag...]>`<br>`/settings startup tags clear`<br>`/settings startup terminator <auto|crlf|lf|cr|cr2|cr_delay>` |
| `/settings theme` | inspect or edit active and inactive terminal theme slots<br>Aliases: `/settings.theme` | `/settings theme show [active|inactive]`<br>`/settings theme preset <active|inactive> <theme>`<br>`/settings theme set <active|inactive> <key> <#rrggbb>`<br>`/settings theme reset <active|inactive>`<br>`/settings theme import <active|inactive> <auto|iterm2|windows-terminal|xresources|ptydeck> <payload...>`<br>`/settings theme export <active|inactive> <ptydeck|iterm2|windows-terminal|xresources>` |

## /share

manage read-only spectator shares for sessions and decks

### Usage

- `/share`
- `/share session`
- `/share deck [deckSelector]`
- `/share revoke <shareId>`

### Notes

- Bare `/share` is shorthand for `/share list`.
- The `/share session` subcommand uses the active session by default and supports direct-route targeting.

### Subcommands

| Subcommand | Description | Usage |
| --- | --- | --- |
| `/share deck` | create a read-only spectator link for the active or selected deck<br>Aliases: `/share.deck` | `/share deck [deckSelector]` |
| `/share list` | list active and revoked share links<br>Aliases: `/share.list` | `/share list` |
| `/share revoke` | revoke an existing spectator link<br>Aliases: `/share.revoke` | `/share revoke <shareId>` |
| `/share session` | create a read-only spectator link for one session<br>Aliases: `/share.session`<br>Notes: Targets the active session by default. To target another session without switching, use `/help @` and the direct-route form `@<sessionSelector> /<command> ...`. | `/share session` |

## /size

set deck terminal size

### Usage

- `/size <cols> <rows>`
- `/size c<cols>`
- `/size r<rows>`

## /ssh

start a one-shot SSH session without first saving a connection profile

### Usage

- `/ssh <target>`
- `/ssh <target> --key <path>`
- `/ssh <target> --password`
- `/ssh <target> --keyboard-interactive`
- `/ssh <target> [-l|--user <username>] [-p|--port <port>]`

### Notes

- Target syntax is `[user@]host[:port]`. You can override the parsed username or port with `-l` / `--user` and `-p` / `--port`.
- Private-key auth is the default. Use `-i` / `--key <path>` to pin an explicit key path, `--password` for password auth, or `--keyboard-interactive` for keyboard-interactive auth.
- If no trusted SSH host key exists for the target, ptydeck fetches the presented host keys and stops. Trust the matching key in `Manage -> Connections`, then rerun the `/ssh ...` command.

## /swap

swap quick ids between two sessions

### Usage

- `/swap <selectorA> <selectorB>`

### Aliases

`/session.swap`

## /switch

switch active session

### Usage

- `/switch <sessionSelector>`

### Aliases

`/session.switch`

## /transfer

upload or download bounded files for one session

### Usage

- `/transfer upload [path]`
- `/transfer download <path>`

### Notes

- Targets the active session by default.
- Use `@<sessionSelector> /transfer upload [path]` or `@<sessionSelector> /transfer download <path>` to route file transfer to another session without switching.

### Subcommands

| Subcommand | Description | Usage |
| --- | --- | --- |
| `/transfer download` | download a bounded file from the target session root<br>Aliases: `/transfer.download`<br>Notes: Targets the active session by default. To target another session without switching, use `/help @` and the direct-route form `@<sessionSelector> /<command> ...`. | `/transfer download <path>` |
| `/transfer upload` | pick a local file and upload it into the target session root<br>Aliases: `/transfer.upload`<br>Notes: Targets the active session by default. To target another session without switching, use `/help @` and the direct-route form `@<sessionSelector> /<command> ...`. | `/transfer upload [path]` |

## /workspace

manage persisted workspace presets

### Usage

- `/workspace`
- `/workspace save <name>`
- `/workspace show <preset>`
- `/workspace apply <preset>`
- `/workspace duplicate <preset> <name>`
- `/workspace rename <preset> <name>`
- `/workspace delete <preset>`
- `/workspace group list`
- `/workspace group save <name>`
- `/workspace group apply <group>`
- `/workspace group rename <group> <name>`
- `/workspace group delete <group>`
- `/workspace group clear`

### Subcommands

| Subcommand | Description | Usage |
| --- | --- | --- |
| `/workspace apply` | apply a saved workspace preset<br>Aliases: `/workspace.apply` | `/workspace apply <preset>` |
| `/workspace delete` | delete a saved workspace preset<br>Aliases: `/workspace.delete` | `/workspace delete <preset>` |
| `/workspace duplicate` | duplicate a saved workspace preset<br>Aliases: `/workspace.duplicate` | `/workspace duplicate <preset> <name>` |
| `/workspace group` | manage deck-local workspace groups on the active deck | `/workspace group list`<br>`/workspace group save <name>`<br>`/workspace group apply <group>`<br>`/workspace group rename <group> <name>`<br>`/workspace group delete <group>`<br>`/workspace group clear` |
| `/workspace list` | list saved workspace presets<br>Aliases: `/workspace.list` | `/workspace list` |
| `/workspace rename` | rename a saved workspace preset<br>Aliases: `/workspace.rename` | `/workspace rename <preset> <name>` |
| `/workspace save` | save the current deck/layout/group workspace state as a named preset<br>Aliases: `/workspace.save` | `/workspace save <name>` |
| `/workspace show` | show workspace preset details<br>Aliases: `/workspace.show` | `/workspace show <preset>` |

## Help Topics

Use `/help` for the alphabetical command overview, `/help <command>` for a command topic, `/help <command> <subcommand>` for a specific subcommand topic, and `/help @` / `/help >` for direct-route and quick-switch help.
