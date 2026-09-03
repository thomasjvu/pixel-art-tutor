# Plan 021: Resynchronize clients after an unapplied room patch

> Executor instructions: implement an explicit recovery path for a patch that cannot be applied locally. Preserve the existing optimistic outbox and welcome reconciliation. Run the drift checks before editing; the working tree is intentionally dirty, so expected active changes are not by themselves a blocker.

## Status

- Priority: P1
- Effort: M
- Risk: HIGH
- Depends on: plans/020-room-error-reconciliation.md
- Category: bug / realtime / convergence
- Planned at commit: b36fad5
- Planned at: 2026-09-03

## Why this matters

At src/realtime/roomClient.ts:465-477, a patch application failure reports an error and advances lastSeq. The socket remains open, no snapshot request is sent, and later patches can be accepted against a project that is already divergent. PartySocket reconnects after a closed connection, but this path neither closes nor reconnects. A client can therefore wait indefinitely for a fresh snapshot while believing it is connected.

The room protocol needs a small, explicit snapshot request. After a failed patch, the client must stop applying subsequent operations until it receives a canonical welcome/snapshot and has reconciled its local outbox.

## Current state

The relevant current behavior is:

- src/realtime/protocol.ts defines the server-to-client messages and the RoomClientMessage union, but there is no snapshot-request message.
- src/realtime/roomClient.ts:449-477 applies an incoming operation. When applyRoomPatch returns null, it sets lastSeq to the failed message sequence and calls setRoomError, then returns.
- src/realtime/roomClient.ts:216-249 handles welcome snapshots and currently assumes they are initial connection or ordinary reconnect reconciliation.
- party/server.ts routes hello, operation, undo, redo, presence, and leave messages in onMessage. There is no snapshot-request route.
- party/server.ts already has the canonical project and sequence available to send in the welcome path.

The existing RoomClient is built on PartySocket 1.3.0 with automatic reconnect. The client should use the supported reconnect path if a request cannot be sent, but must not call the intentional close helper used for leaving a room.

## Drift check

Run:

| Check | Command | Expected interpretation |
| --- | --- | --- |
| Committed drift | git diff --stat b36fad5..HEAD -- src/realtime/protocol.ts src/realtime/roomClient.ts party/server.ts | Empty or explainable branch commits |
| Working-tree drift | git diff --stat b36fad5 -- src/realtime/protocol.ts src/realtime/roomClient.ts party/server.ts | Expected to include current realtime implementation changes |
| Current failure path | rg -n "applyRoomPatch|lastSeq|onWelcome|onMessage|RoomClientMessage" src/realtime/protocol.ts src/realtime/roomClient.ts party/server.ts | Confirm the locations and names before editing |

If a resync mechanism already exists, verify that it actually blocks later patches and reconciles the outbox before replacing it.

## Commands

Run from the repository root:

| Purpose | Command | Pass condition |
| --- | --- | --- |
| Typecheck | npm run typecheck | Exit 0 |
| Lint | npm run lint | Exit 0; the known CanvasStage warning may remain |
| Production build | npm run build | Exit 0 |
| Patch hygiene | git diff --check | No output |
| Recovery-path review | rg -n "snapshot_request|resync|applyRoomPatch|onWelcome|reconnect" src/realtime/protocol.ts src/realtime/roomClient.ts party/server.ts | Shows request, guard, response, and fallback paths |

## Scope

Only edit:

- src/realtime/protocol.ts
- src/realtime/roomClient.ts
- party/server.ts

Do not change the project store, persistence format, authentication, or the semantics of explicit stop/join operations. Automated tests remain deferred by the maintainer; specify future test cases without creating test files.

## Git workflow

Use a focused branch such as advisor/021-room-resync-after-patch-failure if needed. Make one conventional commit, for example fix(realtime): request snapshots after patch failure. Do not push without separate operator authorization.

## Steps

### 1. Add a validated snapshot-request message

Add a RoomClientMessage variant with a stable shape:

    {
      type: "snapshot_request";
      protocol: ROOM_PROTOCOL_VERSION;
      lastSeq: number;
    }

Validate the protocol version and require a finite non-negative lastSeq. Keep this request distinct from hello so it does not reset room identity or presence unnecessarily. If the current protocol validation is not centralized, follow the existing manual validation style in party/server.ts and keep the new branch as strict as operation validation.

Run:

    npm run typecheck

Expected output: exit 0.

### 2. Return the canonical snapshot from the server

Add a server handler that only responds for a ready connection. It should send the same canonical project/seq and peer information as the welcome path, using the existing server helper or a factored snapshot sender. It must not mutate room state, append operation history, or alter undo/redo cursors.

Use the existing message budget or add an equivalent small rate guard so a client cannot turn snapshot requests into an unbounded server workload. A request should be idempotent: repeated requests return the current canonical snapshot and do not create operations.

Route snapshot_request from onMessage. Invalid or not-ready requests should use the existing non-throwing error response and should not close healthy connections unless that is already the established malformed-message policy.

Run:

    npm run lint

Expected output: exit 0 with only the known warning.

### 3. Track resync state on the client

Add explicit client state for resyncRequired and whether a snapshot request is already outstanding. On the first failed applyRoomPatch:

- do not advance lastSeq past the failed operation;
- set resyncRequired;
- surface the existing room error message;
- send one snapshot_request with the last known good sequence.

While resyncRequired is true, ignore or hold incoming operation messages. Do not update lastSeq from those messages, do not apply their patches, and do not flush a new local operation against the divergent project. This prevents a second patch from compounding the mismatch.

Make the send failure path recoverable. If the request cannot be sent because the socket is not open, invoke PartySocket's reconnect behavior or close the socket through a non-intentional recovery path so the normal hello/welcome handshake can provide a snapshot. Do not use closeSocket/stop in a way that marks the room leave as intentional.

Run:

    npm run typecheck

Expected output: exit 0.

### 4. Use welcome reconciliation to exit resync

Update onWelcome so a welcome received during resync:

- installs the canonical project and sequence;
- clears resyncRequired and the outstanding-request flag;
- preserves and rebases the current in-flight and pending local changes using the existing optimistic reconciliation;
- resumes the normal outbox flush only after the canonical snapshot is installed.

Make this path safe for both an explicit snapshot response and a reconnect welcome. A stale or duplicate welcome must not clear a newer local operation. Keep the existing initial-join behavior and the intentional stop/join clearing behavior intact.

Run the full verification:

    npm run build
    git diff --check

Expected output: build exits 0 and diff check has no output.

### 5. Review sequence and race behavior

Trace these cases in the final diff:

1. A patch for seq N fails; the client sends one request and does not accept N+1 before the snapshot.
2. The snapshot request is lost; PartySocket reconnects and hello receives a welcome.
3. A local edit is created while resync is pending; it remains pending and is rebased after welcome.
4. A snapshot response and reconnect welcome both arrive; the second is harmless.
5. The server receives a request from a connection that has not completed hello; no room mutation occurs.
6. The patch was rejected because it was stale rather than malformed; the same recovery path still converges.

## Test plan

Automated test authoring is deferred. Later tests should cover failed patch application, the no-advance-lastSeq invariant, holding later patches, lost snapshot requests, reconnect fallback, and preservation of in-flight/pending local changes. Browser QA should intentionally corrupt one client's local project or use a stale patch fixture and verify that it converges without a manual page reload.

## Done criteria

- A failed local patch causes exactly one in-flight snapshot request and enters a resync state.
- lastSeq is not advanced past the failed patch until a canonical welcome/snapshot is received.
- Later operations are not applied while resyncRequired is true.
- The server handles snapshot_request without mutating room state or operation history.
- Both explicit snapshot response and reconnect welcome clear resync state and flush reconciled local work.
- npm run typecheck, npm run lint, npm run build, and git diff --check pass.
- The final diff is limited to the three files in Scope.

## STOP conditions

Stop and report if:

- PartySocket's installed API cannot perform a non-intentional reconnect and the existing connection cannot be safely closed for recovery;
- a deployed older worker will reject the new message and there is no coordinated protocol rollout;
- welcome handling cannot distinguish an explicit resync from an intentional room switch without changing store or UI contracts;
- holding later patches would require dropping them instead of obtaining a canonical snapshot;
- verification reveals an unrelated baseline failure that cannot be isolated.

## Maintenance notes

Keep resync state separate from offline state. A connected socket can still be divergent and must be represented as recovering until a canonical snapshot is processed. Any future message that depends on sequence continuity should be gated by the same resync state.

