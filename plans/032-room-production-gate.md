# Plan 032: Make the room production gate explicit

> Executor instructions: preserve the documented bearer-link prototype while
> making the deployment requirement impossible to miss. Do not invent auth or
> put an unknown production origin into source.

## Status

- **Priority**: P1 when rooms appear in the demo; P3 otherwise
- **Effort**: S
- **Risk**: MEDIUM
- **Depends on**: plan 028
- **Category**: realtime / deployment security
- **Planned at**: commit `77b3fa5`, 2026-09-03

## Steps

1. Keep `ROOM_ALLOWED_ORIGIN` deployment-only and set it to the exact live app
   origin during deployment.
2. Confirm the room worker and frontend revisions are coordinated.
3. Use a fresh high-entropy room URL for the recording.
4. Verify two-client presence, agent follow mode, one mutation, undo, and
   reconnect behavior on the live deployment.
5. Keep the bearer-link/no-auth warning in public documentation.

## Done criteria

- Production room requests are origin-restricted as configured.
- The demo never presents bearer-link rooms as authenticated private rooms.
- Live room behavior is tested in two browser contexts.
