# Session Settings Reference

Generated from `frontend/src/public/index.html`, `frontend/src/public/input-safety-profile.js`, and `frontend/src/public/session-mouse-forwarding.js`.

Dialog tabs: `Startup`, `Input`, `Note`, `Theme`.

Use Startup for launch settings, Input for send and terminal behavior, Note for saved notes and tags, and Theme for appearance. Cancel discards draft changes; Save Settings keeps the current settings.

## Startup Tab

Launch-time session settings. These values affect how the session starts or restarts.

- Working Directory
- Start Command Line
- Environment Variables (KEY=VALUE per line)

## Input Tab

Send behavior, terminal interaction, and guarded input rules.

### Send Terminator

| Value | Label | Default |
| --- | --- | --- |
| `auto` | Auto (CR / Enter) | Yes |
| `crlf` | CRLF (\\r\\n) | No |
| `lf` | LF (\\n) | No |
| `cr` | CR (\\r) | No |
| `cr2` | CR2 (\\r\\r) | No |
| `cr_delay` | CR_DELAY (text then delayed \\r) | No |

### Mouse Forwarding

| Value | Label | Runtime Accepted |
| --- | --- | --- |
| `off` | Off | Yes |
| `application` | Application-controlled | Yes |

### Send Safety Checks

| Setting | Default | Behavior |
| --- | --- | --- |
| Always confirm before send | No | Catch-all guard. Every non-empty send requires confirmation. |
| Require structurally valid shell syntax | No | Rejects clearly broken shell input such as unbalanced quotes or unfinished blocks. |
| Confirm incomplete shell constructs | No | Prompts when shell syntax still looks unfinished even if it is not fully rejected. |
| Confirm likely natural-language text | No | Heuristic only. Catches prose-like input that does not look like a shell command. |
| Confirm known dangerous shell patterns | No | Pattern-based matcher for destructive commands such as `rm -rf` or `git reset --hard`. |
| Confirm multiline or large paste input | No | Uses the line and character thresholds configured below. |
| Auto continue stalled terminal paste | No | Terminal-local paste only. Sends the configured terminator automatically after bounded partial-ack stall detection. |
| Confirm recent target switches | No | Uses the grace window configured below. Outside that window, no prompt is shown. |

### Threshold Defaults

| Setting | Default |
| --- | --- |
| Target Switch Grace (ms) | `4000` |
| Paste Length Threshold | `400` |
| Paste Line Threshold | `5` |

## Note Tab

Persisted per-session note and tag metadata.

- Session Note
- Tags (comma/space/newline separated)

## Theme Tab

Session-local appearance controls for active and inactive terminal views.

Primary selectors: `Theme Slot`, `Theme Category`, `Theme Search`, `Theme Preset`.

Theme slots: `active` (Active), `inactive` (Inactive).

Theme categories: `all` (All), `dark` (Dark), `light` (Light).

Import/export controls: `Import Format`, `Import Payload`, `Export Format`, `Export Payload`.

Import formats: `auto` (Auto-detect), `iterm2` (iTerm2 JSON), `windows-terminal` (Windows Terminal JSON), `xresources` (Xresources), `ptydeck` (ptydeck JSON).

Export formats: `ptydeck` (ptydeck JSON), `iterm2` (iTerm2 JSON), `windows-terminal` (Windows Terminal JSON), `xresources` (Xresources).

Theme import writes the selected active/inactive slot as a draft. Use `Save Settings` to persist imported UI changes.

Advanced custom colors: `Background`, `Foreground`, `Cursor`, `Black`, `Red`, `Green`, `Yellow`, `Blue`, `Magenta`, `Cyan`, `White`, `Bright Black`, `Bright Red`, `Bright Green`, `Bright Yellow`, `Bright Blue`, `Bright Magenta`, `Bright Cyan`, `Bright White`.
