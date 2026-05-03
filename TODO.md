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

- [ ] `SSH-312` Owner `FE`: Polish the `Connections` SSH trust UX for first-connect and host-key rotation, including a surfaced trust section, explicit old/new fingerprint comparison, and a guided replace flow for `409 SshHostKeyTrustConflict`.
- [ ] `SSH-313` Owner `FE`: Expand one-shot `/ssh ...` launch parity with essential launch flags for deck, start directory, and startup command, then align README/manual/generated command help with the actual shipped contract.
- [ ] `SSH-314` Owner `QA`: Add focused regression coverage for secret-backed one-shot SSH launches, command-plane host-key trust lifecycle, host-key rotation conflict handling, and the expanded `/ssh ...` command/help/documentation contract.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `BE` ownership role is currently inactive.
- `FE` ownership role (active): own the active SSH operator-experience polish wave across the command plane, Connections UI, and frontend launch/runtime seams.
- `QA` ownership role (active): own regression coverage for the promoted SSH operator-experience wave.
- `PLAT` ownership role is currently inactive.
