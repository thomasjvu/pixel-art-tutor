# Plan 022: Remove duplicated base projects from room transport

> Executor instructions: this plan fixes the structural-operation size wedge by changing the snapshot wire shape and its stale-base behavior. It is intentionally sequenced after the correlated-error and resync plans. Treat the protocol change as a coordinated client/worker deployment requirement.

## Status

- Priority: P1
- Effort: L
- Risk: HIGH
- Depends on: plans/020-room-error-reconciliation.md, plans/021-room-resync-after-patch-failure.md
- Category: bug / realtime / payload-size
- Planned at commit: b36fad5
- Planned at: 2026-09-03

## Why this matters

The project validator permits a project with up to 1,000,000 pixel cells, while room messages and project persistence use a 4,000,000-character limit. A structural room operation currently serializes both baseProject and project in one JSON envelope. A valid project can therefore fit the project limit while the operation envelope exceeds the client and server 4 MB caps.

The client sets inFlightOperation before checking the serialized envelope size. When the check fails, the operation remains in flight, the socket stays connected, and pending changes coalesce behind an operation that can never be sent. The room is effectively wedged with no automatic recovery.

The selected design removes the duplicate baseProject from the current snapshot operation wire payload. The client keeps the base project locally for rebasing, while the server accepts a snapshot only when its baseSeq is current. A stale snapshot is rejected with a correlated canonical snapshot; the client rebases and retries. This preserves deterministic conflict handling without transmitting two full projects.

## Current state

The relevant limits and flow are:

- src/projectLimits.ts:10 defines MAX_PROJECT_JSON_LENGTH as 4,000,000 and :12 permits MAX_TOTAL_PIXEL_CELLS of 1,000,000.
- src/realtime/protocol.ts:398-415 defines a snapshot operation containing baseProject and project, and projectChangeToRoomPatch returns null for structural changes.
- src/realtime/roomClient.ts:579-610 creates an in-flight snapshot operation with baseProject and project, serializes the full message, and rejects it when the string is larger than MAX_PROJECT_JSON_LENGTH.
- src/realtime/roomClient.ts:617-625 sends the operation only after the size check, but the in-flight record has already been installed.
- partykit/server.ts:247-250 applies the same raw message-length cap.
- partykit/server.ts uses mergeProjectChanges for a stale snapshot, which is why baseProject is currently present on the wire.

The current protocol is version 2. Existing room state is persisted independently of this message shape. A mixed client/worker rollout must be treated as a compatibility risk.

## Drift check

Run:

| Check | Command | Expected interpretation |
| --- | --- | --- |
| Committed drift | git diff --stat b36fad5..HEAD -- src/projectLimits.ts src/realtime/protocol.ts src/realtime/roomClient.ts partykit/server.ts src/store/uiStore.ts src/components/RoomPanel.tsx | Empty or explainable branch commits |
| Working-tree drift | git diff --stat b36fad5 -- src/projectLimits.ts src/realtime/protocol.ts src/realtime/roomClient.ts partykit/server.ts src/store/uiStore.ts src/components/RoomPanel.tsx | Expected to show active implementation changes |
| Size path | rg -n "MAX_PROJECT_JSON_LENGTH|baseProject|mode.*snapshot|projectChangeToRoomPatch|sendOperation|sendError" src/projectLimits.ts src/realtime/protocol.ts src/realtime/roomClient.ts partykit/server.ts | Confirm the duplicate-payload path |

If the deployed worker cannot be updated atomically with the client, stop before changing ROOM_PROTOCOL_VERSION and report the rollout dependency.

## Commands

Run from the repository root:

| Purpose | Command | Pass condition |
| --- | --- | --- |
| Typecheck | npm run typecheck | Exit 0 |
| Lint | npm run lint | Exit 0; the known CanvasStage warning may remain |
| Production build | npm run build | Exit 0 |
| Patch hygiene | git diff --check | No output |
| Payload audit | rg -n "baseProject|snapshot_request|ROOM_PROTOCOL_VERSION|roomSyncBlocked|too large" src/realtime/protocol.ts src/realtime/roomClient.ts partykit/server.ts src/store/uiStore.ts src/components/RoomPanel.tsx | Shows the new shape, migration, and terminal-size handling |

## Scope

Only edit:

- src/realtime/protocol.ts
- src/realtime/roomClient.ts
- partykit/server.ts
- src/store/uiStore.ts
- src/components/RoomPanel.tsx

Do not redesign project limits, add compression or chunking in this plan, change the persisted project schema, or add authentication. A standalone project whose own JSON cannot fit the server's raw message cap remains unsupported; it must produce an explicit terminal room-sync state rather than an infinite retry. Automated tests are deferred by the maintainer.

## Git workflow

Use a focused branch such as advisor/022-single-payload-room-snapshots if needed. Make one conventional commit, for example fix(realtime): avoid duplicate structural snapshots. Do not push without separate operator authorization. Deploy the worker and client as a coordinated protocol change only after the operator approves the rollout.

## Steps

### 1. Establish the new snapshot protocol shape

Change the current snapshot operation so its wire payload contains:

    {
      type: "operation";
      protocol: ROOM_PROTOCOL_VERSION;
      mode: "snapshot";
      operationId: string;
      baseSeq: number;
      project: Project;
      label: string;
    }

Remove baseProject from the current-version wire message. The local ProjectChange still retains previousProject and project because the client needs previousProject to rebase after a stale rejection.

Because this is an incompatible v2 wire-shape change, bump ROOM_PROTOCOL_VERSION to 3 unless the executor proves that a backward-compatible tagged variant can be accepted by both old and new workers without ambiguity. Update all validators, unions, and protocol comments consistently. Do not silently allow a v2 client to send a v3 message or vice versa.

Run:

    npm run typecheck

Expected output: exit 0.

### 2. Make the server reject stale snapshots without needing a base payload

In the snapshot branch of partykit/server.ts:

- validate the project as a complete project;
- require baseSeq to equal the current room sequence for the new protocol;
- if it is stale, send a request-scoped, operation-correlated room_error with the canonical project and seq, without mutating room state or appending history;
- if it is current, clone and commit the supplied project using the existing persistence and operation-lock path.

Keep patch operations' existing stale-safe behavior. If a temporary compatibility branch for old snapshot messages is required during rollout, put it behind an explicit protocol-version branch and a documented removal point; do not keep the duplicate payload as the normal v3 path.

Run:

    npm run lint

Expected output: exit 0 with at most the existing warning.

### 3. Rebase and retry stale local structural work

Add a client helper that, given a canonical project and sequence, applies the local in-flight ProjectChange to that canonical project using the existing change-application/merge policy. For a stale snapshot:

- replace the in-flight change's previousProject with the canonical project;
- replace its project with the rebased result;
- update the base sequence to the canonical sequence;
- retain the same operationId;
- send only the single-project snapshot payload.

Apply the same rebasing principle to a pending structural change when a welcome or correlated error arrives before it is sent. Do not rebase a completed operation twice, and do not turn a patch operation into a snapshot operation.

Ensure the in-flight record is not installed before a size preflight can fail. Build the exact current-version message, measure its serialized length, and only then mark the operation as in flight/send it. A normal structural operation must now be approximately one project plus a small envelope, not two projects.

Run:

    npm run typecheck

Expected output: exit 0.

### 4. Make the remaining over-cap case explicit and recoverable

If the single-project envelope still exceeds MAX_PROJECT_JSON_LENGTH or the server raw message cap:

- do not leave an endlessly retrying in-flight operation;
- preserve the current local project in the store;
- clear or detach the unsendable room operation in a way that cannot be mistaken for acknowledgement;
- set a roomSyncBlocked/error state with actionable copy explaining that the project is too large for room sync;
- expose the existing project export/download path from RoomPanel so the user can save the unsynced project before leaving or reducing it;
- prevent flushProjectOutbox from retrying while blocked, and clear the blocked state only on an explicit new room join/reconnect decision.

Do not claim that a too-large project was saved to the room. Keep ordinary offline behavior distinct from this terminal payload error.

Run:

    npm run build
    git diff --check

Expected output: build exits 0 and diff check has no output.

### 5. Review rollout and edge cases

Trace:

1. A valid structural edit with a project below the single-payload cap sends and commits.
2. Two clients make structural edits; the second gets a stale error, rebases on the canonical snapshot, and retries with the same operationId.
3. A stale error arrives while another pending edit exists; both local edits survive in order.
4. The client reconnects during a structural retry; welcome reconciliation does not duplicate or drop the operation.
5. A project at the old two-project envelope boundary now sends if its single-project envelope fits.
6. A project whose own single-project envelope is too large enters a visible blocked state and never loops.
7. A v2 client/worker mismatch is rejected or migrated explicitly, never interpreted as a valid v3 operation.

## Test plan

Automated test authoring is deferred. Later tests should generate projects near the 4 MB boundary, assert that the serialized v3 snapshot has one project, exercise stale structural rebase with concurrent sprite/frame changes, and verify that an over-cap project leaves no retry loop while remaining exportable. Two-client browser QA is required before deployment because protocol compatibility and race timing are central to this change.

## Done criteria

- Current-version snapshot operations serialize one project payload and no baseProject.
- Structural snapshots are accepted only at the advertised current base sequence; stale ones return a correlated canonical snapshot without mutation.
- The client rebases stale in-flight and pending structural changes and retries with the same operation ID.
- Size preflight occurs before installing an in-flight operation.
- An over-cap standalone project enters an explicit roomSyncBlocked/error state, remains locally exportable, and is not retried indefinitely.
- npm run typecheck, npm run lint, npm run build, and git diff --check pass.
- The final diff is limited to Scope.

## STOP conditions

Stop and report if:

- the worker and client cannot be deployed with a coordinated protocol version;
- removing baseProject would change a required conflict-resolution guarantee that cannot be reproduced by client rebasing;
- the existing mergeProjectChanges behavior cannot rebase a structural edit without losing a local or remote change;
- the UI has no safe export action available and adding one would require broader product work;
- the one-project payload still exceeds the cap for normal projects because another envelope or server limit was overlooked;
- verification exposes an unrelated baseline failure.

## Maintenance notes

Keep the wire-size invariant visible near the protocol type: a structural operation must not regain a second full project payload. If compression or chunking is later added, it should be a separate protocol design with explicit limits, cleanup of partial transfers, and deployment compatibility.
