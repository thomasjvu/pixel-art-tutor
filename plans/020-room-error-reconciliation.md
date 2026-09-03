# Plan 020: Make room failures operation-scoped and preserve unrelated outbox edits

> Executor instructions: this is an implementation plan, not an invitation to redesign the room protocol. Work from the current live files and preserve the existing undoable-store and outbox model. Before editing, run the drift checks below. The repository has intentional uncommitted implementation changes; do not stop merely because the second diff command reports them. Stop only when the live excerpts materially differ from the Current state described here.

## Status

- Priority: P1
- Effort: M
- Risk: HIGH
- Depends on: plans/014-reliable-room-outbox.md, plans/016-bounded-room-operations.md
- Category: bug / realtime / reliability
- Planned at commit: b36fad5
- Planned at: 2026-09-03

## Why this matters

One collaborator's persistence failure currently becomes a broadcast room_error containing the canonical snapshot. Every connected client handles that snapshot as if its own optimistic operation failed. A client with an unrelated operation in flight can therefore clear the operation and its optimistic edit without ever receiving an acknowledgement or requeueing it. The local canvas can look correct until the page is reloaded, while the room never received that edit.

Room errors need enough scope to distinguish the failed request from a room-wide notice. A canonical snapshot must only replace, rebase, or clear the local queue when the client can identify the affected operation. This plan keeps the current protocol version unless the executor finds that an incompatible wire change is unavoidable; if a version bump is required, stop and document the migration requirement before changing it.

## Current state

The relevant behavior is split across three files:

- src/realtime/protocol.ts owns the room message types and message validation.
- party/server.ts applies operations and sends errors.
- src/realtime/roomClient.ts owns the optimistic in-flight operation, coalesced pending change, and canonical snapshot reconciliation.

The current error type at src/realtime/protocol.ts:164-170 is effectively:

    RoomErrorMessage = {
      type: "room_error";
      protocol: ROOM_PROTOCOL_VERSION;
      message: string;
      project?: Project;
      seq?: number;
    }

The server's persistence path at party/server.ts:495-510 restores the previous room state when persist fails and calls sendErrorToAll. The broadcast helper at party/server.ts:550-565 sends the canonical project and sequence to every connection. This is the problematic fan-out.

The client path at src/realtime/roomClient.ts:540-555 currently treats a valid error snapshot as a local reset: it clears inFlightOperation and history identifiers, applies the canonical project, and keeps only pendingChange. There is no operation identifier or sender scope in the message used by that decision.

Existing intentional queue clearing must remain unchanged: stop() and joinRoom() are explicit room-leave or room-switch boundaries. The fix is limited to asynchronous room errors while a connection remains active.

## Drift check

Run these before editing:

| Check | Command | Expected interpretation |
| --- | --- | --- |
| Committed drift | git diff --stat b36fad5..HEAD -- src/realtime/protocol.ts src/realtime/roomClient.ts party/server.ts | Empty or explainable branch commits |
| Working-tree drift | git diff --stat b36fad5 -- src/realtime/protocol.ts src/realtime/roomClient.ts party/server.ts | Expected to show the active implementation changes |
| Relevant symbols | rg -n "RoomErrorMessage|commitOperation|sendErrorToAll|onRoomError|inFlightOperation" src/realtime/protocol.ts src/realtime/roomClient.ts party/server.ts | Confirm the locations above still describe the code |

If the live error flow already has correlation and operation-preserving reconciliation, do not duplicate it; instead verify the six scenarios in the Done criteria and update this plan only if the implementation is genuinely complete.

## Commands

Run from the repository root:

| Purpose | Command | Pass condition |
| --- | --- | --- |
| Typecheck | npm run typecheck | Exit 0 |
| Lint | npm run lint | Exit 0; the known CanvasStage dependency warning may remain |
| Production build | npm run build | Exit 0 |
| Patch hygiene | git diff --check | No output |
| Review the resulting protocol paths | rg -n "scope|operationId|sendErrorToAll|restoreOptimisticEdits|inFlightOperation = null" src/realtime/protocol.ts src/realtime/roomClient.ts party/server.ts | Every clear/reset site is intentional and scoped |

## Scope

Only edit:

- src/realtime/protocol.ts
- src/realtime/roomClient.ts
- party/server.ts

Do not change project persistence, authentication, UI copy unrelated to room errors, the room operation model, or the intentional queue clearing performed when leaving a room. Do not add a durable offline queue. Automated tests are explicitly deferred by the maintainer; record future test targets in the Test plan section rather than adding test files in this change.

## Git workflow

Use a focused branch such as advisor/020-room-error-reconciliation if the operator has not supplied another branch. Make one conventional commit for this logical unit, for example fix(realtime): scope room errors to operations. Do not push unless the operator separately authorizes the push.

## Steps

### 1. Define a backward-tolerant error correlation contract

Update the room protocol types and validator so a new room_error can carry:

- scope: request or room;
- operationId when the error is attributable to a submitted operation; and
- the existing optional canonical project and seq.

Emit scope and operationId on all new operation-related errors whenever the incoming operation ID is valid. Keep the fields optional at the parser boundary if mixed-version rooms can still deliver old messages. Treat an omitted scope conservatively on the client: it must not clear an unrelated in-flight operation merely because a snapshot is present.

Document the semantics in the protocol source:

- request means only the identified request may be failed or retried;
- room means the canonical snapshot is authoritative for the room, but local optimistic edits must be rebased rather than discarded;
- an error without a matching operationId is not permission to clear a different in-flight operation.

Verify the typecheck after the protocol change:

    npm run typecheck

Expected output: the command exits 0.

### 2. Stop broadcasting another client's persistence failure as a local reset

Thread the originating connection and operation ID through the server operation and undo handlers into the persistence failure path. When persist fails after an operation was tentatively applied:

- restore the previous room state as today;
- send a request-scoped room_error with the failed operationId and canonical project/seq only to the originating connection;
- do not call sendErrorToAll for this request-scoped failure.

Audit every other sendError call in the operation and undo paths. Attach the request operation ID where it is known. Keep truly room-wide notices separate and mark them room-scoped; do not attach a misleading operation ID to those notices.

Do not weaken the existing validation, operation lock, persistence rollback, or rate-budget behavior. Verify:

    npm run typecheck

Expected output: the command exits 0 and no handler loses the connection parameter needed for correlation.

### 3. Reconcile only the affected local operation

Refactor roomClient error handling around explicit matching:

- If a request-scoped error names the current inFlightOperation, remove only that failed operation, apply the supplied canonical snapshot, reapply pendingChange, and flush the remaining queue.
- If a request-scoped error names an operation that is not the current in-flight operation, preserve the current in-flight and pending changes. Rebase them on the supplied canonical snapshot if one is supplied.
- If a room-scoped or legacy uncorrelated error supplies a canonical snapshot, apply it as a canonical update and reapply both in-flight and pending optimistic changes. Never clear a non-matching in-flight operation.
- If an error has no snapshot, leave an unmatched operation queued for the normal reconnect or welcome reconciliation path and surface the error text.
- Reset lastLocalOperationId, lastUndoOperationId, or equivalent history markers only for the operation that actually failed or when the existing welcome reconciliation proves that the canonical state supersedes those markers.

Use the existing optimistic restoration helper where possible so the store still receives edits through its actions and the canvas remains undoable. Ensure the failed operation cannot be retried forever, while an unrelated operation remains retryable with its original operation ID.

Verify:

    npm run lint

Expected output: exit 0 with at most the already documented CanvasStage warning.

### 4. Review race and compatibility cases before handoff

Read the final diff and trace these cases line by line:

1. Client A sends operation A; client B has operation B in flight; A's persist fails. B must retain B.
2. The failed operation is the one currently in flight. It must be removed once, pending edits must survive, and the canonical sequence must be adopted.
3. A room-wide error arrives while an operation is in flight. The operation must be rebased, not dropped.
4. A legacy error without operationId arrives while no operation is in flight. Its valid canonical snapshot may still be applied.
5. A duplicate error arrives after the failed operation was already removed. It must not clear a newly created operation.
6. stop() or joinRoom() still intentionally clears local room state.

Run the full verification:

    npm run build
    git diff --check

Expected output: build exits 0 and diff check prints nothing.

## Test plan

Automated test authoring is deferred by the maintainer. When tests are later enabled, prioritize a fake-socket/server test for the A/B persistence-failure race, an unmatched operationId snapshot test, duplicate error delivery, and legacy uncorrelated error handling. Browser QA should use two room clients and verify that the unaffected client can still receive an acknowledgement after another client's persistence failure.

## Done criteria

- Room errors emitted by current server code carry a scope and an operationId whenever the server knows the submitted operation.
- Persistence failure for one connection is not sent as a canonical-reset error to every connection.
- A client clears inFlightOperation only for a matching failed operation or an explicit room-leave/switch path.
- A valid canonical snapshot from an unmatched error re-applies the client's in-flight and pending optimistic changes.
- The same operation ID remains available for retry after an unrelated error.
- npm run typecheck, npm run lint, npm run build, and git diff --check pass.
- The final diff is limited to the three files in Scope.

## STOP conditions

Stop and report if:

- the deployed room protocol requires a version bump or a mixed-version migration that cannot be coordinated in this task;
- the server cannot identify the originating connection for a persistence failure without changing an external API;
- preserving an unmatched operation would require changing the project store or undo semantics outside Scope;
- the only available fix still discards an unrelated in-flight or pending change;
- verification exposes a pre-existing failure that cannot be isolated from this plan's edits.

## Maintenance notes

Keep request-scoped errors and room-wide notices distinct as new room features are added. Any future error that includes a canonical snapshot must state whether it supersedes one operation or requires all clients to rebase. Do not regress the explicit stop/join queue-clearing behavior.

