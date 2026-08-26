# Plan 014: Make room edits survive socket races and reconnects

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report — do
> not improvise. Source changes must stay within the Scope list. When done, update
> this plan's status row in `plans/README.md` unless a reviewer maintains the
> index.
>
> **Drift check (run first)**: `git diff --stat 78aad52..HEAD -- src/realtime/roomClient.ts src/realtime/protocol.ts party/server.ts` and
> `git diff --stat 78aad52 -- src/realtime/roomClient.ts src/realtime/protocol.ts party/server.ts`.
> The second command includes the current unstaged prototype. If either command
> shows changes, compare the Current state excerpts with the live code before
> proceeding. A mismatch is a STOP condition until the plan is refreshed.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: HIGH (touches reconnect, ordering, undo, and duplicate-operation behavior)
- **Depends on**: plans/005-tool-input-hardening.md, plans/006-store-correctness.md, plans/007-stroke-coalescing.md
- **Category**: bug / security
- **Planned at**: commit `78aad52`, 2026-08-26

## Why this matters

The browser can accept a local edit and then lose the WebSocket before the edit is
actually handed to the room server. `RoomClient.sendOperation()` clears its only
pending change before calling `send()`, while `send()` silently returns when the
socket is no longer open. The user then sees a local canvas that can be replaced
by the reconnecting room snapshot with no actionable error. The same unchecked
send path affects undo/redo requests. This plan adds a small in-memory outbox that
reuses operation IDs on retry, using the server's existing operation-id
deduplication, and makes application errors distinguishable from offline state.

This guarantees no silent drop while the page remains alive. It does not make the
in-memory outbox survive a hard reload; that remains consistent with the repo's
documented in-memory undo history.

## Current state

- `src/realtime/roomClient.ts` — the browser PartySocket client and project-change
  bridge. Local project commits arrive through `subscribeProjectChanges`; remote
  snapshots are applied through `applyRoomProject`, which emits a `remote` source
  that the bridge ignores.
- `src/realtime/roomClient.ts:442-468` currently sends immediately:
  ```ts
  private onProjectChange(change: ProjectChange): void {
    if (change.source === "remote") return;
    if (this.isConnected) {
      this.sendOperation(change);
      return;
    }
    this.pendingChange = this.pendingChange
      ? { ...change, previousProject: this.pendingChange.previousProject }
      : change;
  }

  private sendOperation(change: ProjectChange): void {
    if (!this.isConnected) return;
    const operationId = randomId("op");
    this.lastLocalOperationId = operationId;
    this.lastUndoOperationId = null;
    this.pendingChange = null;
    useUi.getState().setRoomHistory(true, false);
    this.send({
      type: "operation",
      protocol: ROOM_PROTOCOL_VERSION,
      operationId,
      baseSeq: this.lastSeq,
      baseProject: cloneProject(change.previousProject),
      project: cloneProject(change.project),
      label: change.label,
    });
  }
  ```
- `src/realtime/roomClient.ts:471-477` has no success result:
  ```ts
  private send(message: RoomClientMessage): void {
    if (!this.socket || this.socket.readyState !== 1) return;
    try {
      this.socket.send(JSON.stringify(message));
    } catch (error) {
      this.setRoomError(error instanceof Error ? error.message : "Could not send room update.");
    }
  }
  ```
- `src/realtime/roomClient.ts:382-410` handles an operation broadcast, including
  the sender's own broadcast, but has no in-flight operation to acknowledge.
- `party/server.ts:280-283` already treats a repeated `operationId` as an
  idempotent retry by rebroadcasting the existing history entry. Preserve this
  server behavior; do not create a second operation for a retry.
- `src/realtime/roomClient.ts:437-439` currently reports any room error as
  `offline` whenever a socket object exists, even when the socket is connected.
  `RoomPanel.tsx` renders `offline` as “Trying again…”.
- Conventions: all project edits go through the zustand store; project payloads
  are cloned before crossing the room boundary; source `remote` must never be
  echoed back as a local operation; operation IDs are client-generated strings.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**:

- `src/realtime/roomClient.ts` — in-flight operation state, retry/flush logic,
  boolean send result, and accurate connection status for application errors.

**Out of scope**:

- `party/server.ts` protocol or persistence changes; its repeated-operation
  handling is the idempotency mechanism this plan consumes.
- `src/realtime/protocol.ts` message-shape changes.
- Durable outbox persistence across a full page reload.
- A CRDT or a replacement for `mergeProjectChanges`.
- Presence delivery; presence is ephemeral and must not be placed in the project
  operation queue.

## Git workflow

- Branch: `advisor/014-reliable-room-outbox`.
- Commit: `fix: retain room edits until the server acknowledges them`.
- Do not push or open a PR unless the operator explicitly asks.

## Steps

### Step 1: Add explicit in-flight and queued-change state

Add a private type near the `RoomClient` class:

```ts
interface InFlightOperation {
  operationId: string;
  change: ProjectChange;
}
```

Add `private inFlightOperation: InFlightOperation | null = null;` next to the
existing `pendingChange`. `pendingChange` remains a single coalesced change for
edits made while an operation is in flight or while disconnected. Its
`previousProject` must remain the state before the first queued edit, while its
`project` and `label` come from the latest queued edit.

Add a helper with this behavior:

```ts
private queueProjectChange(change: ProjectChange): void {
  this.pendingChange = this.pendingChange
    ? { ...change, previousProject: this.pendingChange.previousProject }
    : change;
}
```

Do not queue `remote` changes. Do not replace an in-flight operation's change
with a later local edit; the server must be allowed to acknowledge the exact
operation ID that was sent.

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Make send report success and retain the outbox on failure

Change `send(message)` to return `boolean`:

- return `false` when there is no socket or `readyState !== 1`;
- return `true` only after `socket.send(JSON.stringify(message))` returns;
- catch errors, report the error, and return `false`.

Do not log an offline `send` failure as a successful project operation. Presence
callers may ignore a false result, but project-operation callers must retain their
outbox entry. Keep the existing JSON serialization and message types.

**Verify**: `npm run typecheck` → exit 0; `rg -n "private send|return false|return true" src/realtime/roomClient.ts` shows the boolean implementation.

### Step 3: Send one operation at a time with a stable operation ID

Refactor `onProjectChange` and `sendOperation` as follows:

1. Ignore `remote` exactly as today.
2. If there is an `inFlightOperation` or the client is not connected, call
   `queueProjectChange(change)` and return.
3. Otherwise create an in-flight record with a fresh `randomId("op")` and call a
   `sendOperation(record)` helper.
4. When a queued change is promoted into `inFlightOperation`, clear the queued
   slot only after the complete change has been copied into the in-flight record;
   the in-flight record is the durable-in-memory copy for this send attempt.
   Never clear both records before a send attempt has a retained operation ID.
5. If `send()` returns `false`, keep the same `inFlightOperation`, set the
   connection state to offline through the existing error path, and wait for
   `onWelcome`/a later flush. If it returns `true`, keep the record until the
   matching server operation broadcast arrives. This is intentional: the socket
   can close after `send()` returns, and the server may have accepted the message.
6. A local edit received during the send race must stay in `pendingChange`. A
   failed send keeps the in-flight record; a successful send also keeps it until
   the matching server broadcast, because the server may have accepted the
   message even if the browser disconnects immediately afterward.

The operation message must continue to contain cloned
`baseProject`, `project`, `baseSeq`, `label`, and the stable `operationId`.

**Verify**: `npm run typecheck` → exit 0. Read the final method and confirm no
path clears an in-flight operation before its matching broadcast.

### Step 4: Acknowledge and flush in order

In `onOperation`, when `message.actorId === this.id` and the operation ID matches
`inFlightOperation.operationId`, clear the in-flight record. Preserve the current
local-project reconciliation and history flags. Then flush exactly one queued
change if the connection is still ready. The flush must create a new operation
ID and must not run before the previous acknowledgment has been processed.

On `onWelcome`:

- If an in-flight operation exists and the welcome project's serialized value is
  already equal to that operation's intended project, treat it as acknowledged
  and clear it.
- If an in-flight operation exists but the welcome project differs, keep the same
  operation ID and resend it with the welcome `seq` as its new `baseSeq`. Do not
  apply the welcome snapshot over the local in-flight edit.
- If there is no in-flight operation but `pendingChange` exists, send the queued
  change against the welcome sequence before applying a conflicting server
  snapshot.
- If neither exists, preserve the current snapshot-apply behavior.

After every acknowledgment or welcome reconciliation, call a single
`flushProjectOutbox()` helper. That helper must be a no-op when disconnected, when
an operation is in flight, or when no pending change exists.

**Verify**: `npm run typecheck` → exit 0; `rg -n "inFlightOperation|flushProjectOutbox" src/realtime/roomClient.ts` shows the state and all acknowledgment paths.

### Step 5: Separate application errors from offline state

Update `setRoomError` so that an application-level room error uses:

- `roomStatus: "connected"` when `this.isConnected` is true;
- `roomStatus: "offline"` only when a socket exists but is not ready;
- `roomStatus: "error"` when no socket exists.

Keep the error message and activity log. Update `requestUndo` and `requestRedo`
to check the boolean result from `send()` and surface a room error when the
request could not be sent. Do not queue undo/redo as project edits: the user can
retry them after reconnect, and their operation IDs are server-history IDs rather
than new edit IDs.

**Verify**: `npm run lint && npm run typecheck && npm run build` → all exit 0.

### Step 6: Review the race cases

Read the complete diff and verify these cases without changing unrelated code:

1. Socket closes immediately before `send()` — the in-flight change remains.
2. `socket.send()` throws — the in-flight change remains and status is offline.
3. Socket closes after `send()` returns but before the broadcast — reconnect
   resends the same operation ID.
4. Server accepted the operation before reconnect — the duplicate operation ID
   is acknowledged by the existing server dedupe path.
5. A second local edit arrives while the first is in flight — it is coalesced in
   `pendingChange` and sent only after the first broadcast.
6. A server room error arrives while connected — the UI still says connected,
   while the error is visible.
7. Remote project changes still do not enter the outbox.

**Verify**: `git diff --check` → no output; all three gates exit 0.

## Test plan

Automated tests are deferred by the maintainer decision recorded in
`plans/README.md`. When tests are introduced, add a focused `RoomClient` seam or
fake socket covering the seven race cases in Step 6, especially stable operation
IDs and one-at-a-time flush ordering. The existing two-browser room smoke flow
should also include a forced disconnect while painting.

## Done criteria

- [ ] `send()` returns a boolean and no project path silently discards a failed
      send.
- [ ] An in-flight operation retains its original `operationId` until its own
      broadcast or a welcome snapshot proves it was accepted.
- [ ] `pendingChange` is flushed only after the preceding operation is
      acknowledged.
- [ ] `rg -n "pendingChange = null" src/realtime/roomClient.ts` shows only paths
      that intentionally discard a queued change when leaving/switching rooms,
      never the pre-send path.
- [ ] Application errors do not label an otherwise connected room as offline.
- [ ] `npm run lint`, `npm run typecheck`, and `npm run build` exit 0.
- [ ] Only `src/realtime/roomClient.ts` is modified by this plan.

## STOP conditions

- The server no longer deduplicates repeated operation IDs; stop and update the
  protocol/server plan before implementing retries.
- `PartySocket.readyState` is not a reliable WebSocket-ready-state value in the
  installed version; stop and inspect the library API rather than guessing.
- Correct reconnect reconciliation requires changing `RoomOperationMessage` or
  the server's persistence format; stop and report the required protocol change.
- The current project listener emits a new local change while applying a remote
  snapshot; stop and resolve that source-label invariant before adding retries.

## Maintenance notes

- The outbox intentionally coalesces queued local edits, so it preserves the
  latest desired project state rather than every intermediate brush event. Plan
  007 reduces the number of events before they reach this path.
- Keep operation IDs stable across retry. Generating a new ID on every retry
  would turn a single user edit into duplicate history entries.
- If durable offline editing is requested later, add explicit persisted outbox
  storage and a recovery UX; do not silently put this in localStorage alongside
  the project snapshot.
