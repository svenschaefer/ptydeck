# TODO - ptydeck

This file defines concrete, open implementation tasks only.
Ordering, versions, and dependency sequencing live in `ROADMAP.md`.
Completed work belongs in `CHANGELOG.md`.

## Ownership Model

- `CODY`: Codex documentation and delivery owner
- `BE`: Backend implementation owner
- `FE`: Frontend implementation owner
- `PLAT`: Tooling, CI/CD, and runtime owner
- `QA`: Test automation owner

## Active Open Tasks (Current)
- [ ] `MSG-074` Owner `BE`: Harden `codex_input_reply` fresh-start promotion so a Telegram-triggered reply cannot start from stale assistant tail, footer/prompt chrome, or other pre-existing PTY residue after the submit write completes. The first promoted reply block for a mapped Telegram input must require genuinely fresh post-submit Codex output rather than immediately consuming visible carryover such as `Keine Codeänderung in diesem Schritt. 9% left · ~/workspace/code/ptydeck ·`.
- [ ] `MSG-075` Owner `BE`: Prevent commentary/operator-analysis leakage from becoming Telegram-visible Codex outbound content. Commentary updates and other assistant-side analysis chatter that are not intended terminal answers must not be promoted through `codex_separator_section`, `codex_separator_info`, or `codex_input_reply` even if they appear in the PTY stream or in mixed captured blocks.
- [ ] `MSG-076` Owner `QA`: Validate the `v0.4.0-H123` Telegram reply-integrity wave end to end against the live 2026-04-14 field cases, including the `05:39`/`05:40` `MSG-029 Owner BE 29` false-start, the leaked commentary messages (`Ich prüfe jetzt die aktuelle Stream-to-message-Pipeline...`, `Ich ziehe jetzt die kritischen Seams...`, `Ich prüfe noch die Section-Assembly...`), and the `07:46` stale-tail reply (`Keine Codeänderung in diesem Schritt. 9% left · ~/workspace/code/ptydeck ·`), while proving that legitimate fresh multiline Codex replies still reach Telegram once and with the current formatting-preserving behavior intact.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
