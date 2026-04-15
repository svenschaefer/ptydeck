# Trusted-Local Control

Trusted-local control is designed for a single user moving between devices or tabs.

There is one active writer per session.

## Take or Reclaim Control

When another client currently controls the session, the non-controller device is read-only for input and authoritative resize.

Use `Take Control` or `Reclaim Control` from the session UI or the compact `Control` dialog.

The takeover path is intentionally direct:

- no release-first requirement
- deterministic reclaim
- blocked write paths can retry after takeover

## Scope

Trusted-local takeover can be applied at three scopes:

- all sessions
- current deck
- current session

That is why the compact device-level `Control` dialog exists alongside per-session controls.

## Device-Local Layout Recall

When takeover succeeds, `ptydeck` reapplies the remembered layout and terminal-size baseline for the claiming device.

That keeps desktop and laptop form factors usable without forcing one shared layout across all devices.

## Origin Discipline

Trusted-local identity and layout recall are browser-origin-local. In practice, that means:

- `https://ptydeck.local.secos.rocks`
- `http://172.26.86.97:18081`

behave like two separate local devices even when they reach the same backend.

If operators mix a canonical domain with direct IP or dev-port access, configure `FRONTEND_CANONICAL_ORIGIN` so non-canonical opens redirect before trusted-local bootstrap starts. That prevents accidental device splits and stale-controller drift across origins.

When such a redirect still lands on the canonical origin after a split was already created, the frontend can now perform a bounded session-scoped control reclaim for the affected sessions if the backend shows only stale or inactive prior controllers for the same single-user owner.

## Startup Prompt

When a device opens the frontend and is not currently the controlling device, `ptydeck` can show a subtle startup prompt asking whether this device should take control and apply its local layouts.

## Related References

- [session settings reference](../reference/session-settings.md#input-tab)
- [slash command reference](../reference/commands.md)
