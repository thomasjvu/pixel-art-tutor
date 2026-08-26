# Plan 016: Use bounded cell patches for high-frequency room edits

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report — do
> not improvise. Modify only the files in Scope. Update this plan's status row in
> `plans/README.md` when complete unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 78aad52..HEAD -- src/realtime/protocol.ts src/realtime/roomClient.ts party/server.ts` and
> `git diff --stat 78aad52 -- src/realtime/protocol.ts src/realtime/roomClient.ts party/server.ts`.
> The second command includes unstaged changes. If the Current state excerpts do
> not match the live code, stop and report before editing.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH (changes the wire format, conflict handling, and remote undo snapshots)
- **Depends on**: plans/007-stroke-coalescing.md, plans/014-reliable-room-outbox.md, plans/015-conflict-free-room-palette.md
- **Category**: perf / bug
- **Planned at**: commit `78aad52`, 2026-08-26

## Why this matters

The current room protocol sends a complete `baseProject` and complete `project`
for every edit, and the server broadcasts a complete project for every accepted
operation. Before stroke coalescing, a pointer drag can therefore produce many
large JSON messages and Durable Object history entries. Even after local stroke
coalescing, tilemap painting and rapid edits still pay the full-project cost.

This plan adds a bounded patch mode for same-shape pixel and tilemap edits. A
patch contains changed cells and color values, not the complete project. Structural
changes such as adding a sprite, changing dimensions, importing a project, or
transforming an entire sprite continue to use the existing snapshot mode. The
server still stores complete before/after snapshots for undo; only the transport
for high-frequency cell edits becomes compact.

## Current state

- `src/realtime/protocol.ts:63-71` defines every client operation as two full
  projects:
  ```ts
  export interface RoomOperationMessage {
    type: "operation";
    protocol: typeof ROOM_PROTOCOL_VERSION;
    operationId: string;
    baseSeq: number;
    baseProject: Project;
    project: Project;
    label: string;
  }
  ```
- `src/realtime/protocol.ts:237-314` contains pure snapshot merge logic. It can
  be extended with pure patch derivation/application helpers, but must remain free
  of DOM and zustand imports.
- `src/realtime/roomClient.ts:453-468` always serializes the full project pair.
  Plan 014 will add an in-memory outbox and stable operation IDs; this plan must
  preserve that retry behavior for both snapshot and patch payloads.
- `party/server.ts:265-305` validates full projects, calls
  `mergeProjectChanges` when `baseSeq` is stale, and stores complete snapshots in
  `StoredOperation`. `party/server.ts:380-395` currently broadcasts the complete
  `afterProject` as `project`.
- `party/server.ts:14-16` already caps JSON messages at 4,000,000 characters;
  patch mode needs a much smaller cell-count cap so one client cannot create an
  expensive validation/apply loop inside that byte limit.
- `src/store/projectStore.ts` represents pixels as palette indices and tilemap
  cells as sprite IDs. Room patches should use normalized hex colors for pixel
  edits, then resolve those colors by the identity policy from plan 015.
- Conventions: valid room projects are checked by `isProject`; invalid incoming
  data must result in a room error rather than a partial commit; full before/after
  snapshots remain the source for server undo/redo.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**:

- `src/realtime/protocol.ts` — patch types, safe patch derivation from a local
  before/after pair, patch validation/application, and operation message unions.
- `src/realtime/roomClient.ts` — choose patch mode for eligible changes, apply
  patch broadcasts, and retain plan 014's outbox/retry behavior.
- `party/server.ts` — validate/apply patch operations, persist full snapshots for
  history, and broadcast patches to ready clients.

**Out of scope**:

- Replacing the local project store or its indexed-pixel representation.
- Sending patches for sprite/frame structure changes, transforms, imports, or
  project resets; those remain snapshot operations.
- Removing full snapshots from Durable Object history or welcome messages.
- CRDTs, operational transforms, or offline persistence across a hard reload.
- Increasing the 64-color, 64×64, 32-frame, or 128-sprite project limits.

## Git workflow

- Branch: `advisor/016-bounded-room-operations`.
- Commit: `perf: send bounded pixel patches in shared rooms`.
- Do not push or open a PR unless explicitly instructed.

## Steps

### Step 1: Define an explicit patch wire format

In `src/realtime/protocol.ts`, add types equivalent to:

```ts
export interface RoomPixelPatch {
  spriteId: string;
  frameIndex: number;
  x: number;
  y: number;
  color: string | null; // normalized #rrggbb, or null for transparent
}

export interface RoomTilePatch {
  index: number;
  tileId: string | null;
}

export interface RoomPatch {
  name?: string;
  paletteAdds: string[];
  pixels: RoomPixelPatch[];
  tiles: RoomTilePatch[];
}
```

Add a discriminant such as `mode: "snapshot" | "patch"` to operation messages.
Keep snapshot fields required for `mode: "snapshot"`; patch operations carry a
`patch` instead. Update the server broadcast type so a patch broadcast carries a
patch and a snapshot broadcast carries a project. Keep the protocol version
compatible with existing snapshot messages if possible: an absent mode must be
treated as the legacy snapshot shape during the transition. If the type system
cannot express this safely without ambiguity, bump `ROOM_PROTOCOL_VERSION` and
update both client and server together.

The patch format must not carry palette indices for changed pixels. A changed
pixel's `color` is the after-project palette hex value or `null`; this avoids
recreating the concurrent palette collision fixed by plan 015.

Define constants for patch safety, including a maximum total changed pixel/tile
cell count of 16,384 and maximum string lengths consistent with `isProject`.

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Derive patches only for eligible local changes

Add a pure helper such as
`projectChangeToRoomPatch(before: Project, after: Project): RoomPatch | null`.
It must return `null` and force snapshot mode when any of these are true:

- sprite IDs/order, dimensions, kinds, frame counts, or frame IDs differ;
- a sprite/frame was added or removed;
- tilemap existence or dimensions changed;
- an existing palette slot was reordered/replaced rather than colors being added;
- any changed pixel cannot be translated to a valid after-project hex color;
- the patch would exceed the cell-count cap.

For eligible changes:

- include a changed project name in `name`;
- include only newly introduced palette colors in `paletteAdds`, preserving their
  first-seen order;
- emit one `RoomPixelPatch` for each changed pixel, using the after palette's
  normalized lowercase hex or `null`;
- emit one `RoomTilePatch` per changed tilemap cell, using its array index;
- deduplicate repeated coordinates so a single patch contains the final value
  once;
- return `null` for a no-op rather than sending an empty room operation.

Do not use `JSON.stringify` equality as the only eligibility test; inspect the
shape and diffs explicitly so a large unchanged project is not copied into a
patch accidentally.

**Verify**: `npm run typecheck` → exit 0; inspect the helper to confirm every
patch cell is bounded and carries a color value rather than a palette index.

### Step 3: Apply and validate patches purely

Add a pure helper such as
`applyRoomPatch(current: Project, patch: RoomPatch): Project | null`.
It must:

1. Validate patch count, string lengths, finite integer coordinates/indices, and
   palette hex values before cloning or mutating anything.
2. Clone the current project.
3. Resolve each `paletteAdds` color by lowercase hex identity; append missing
   colors without overwriting existing slots. If the palette would exceed 64,
   return `null`.
4. Resolve each pixel color by its hex identity in the cloned palette, write it
   only when the referenced sprite/frame exists and the coordinate is in bounds,
   and reject the whole patch if any target is missing or malformed.
5. Write tile patches only when the tilemap exists and each index is in range;
   reject the whole patch on any invalid index or unknown non-null tile ID.
6. Return the fully updated project only if `isProject(result)` is true.

There must be no partial application: a failed patch returns `null` and leaves
the caller's current project untouched. The server will answer with a room error
and a canonical snapshot when this happens.

**Verify**: `npm run typecheck` → exit 0; `rg -n "applyRoomPatch|paletteAdds|RoomPixelPatch" src/realtime/protocol.ts` shows the pure implementation.

### Step 4: Teach the browser client to send and receive both modes

In `src/realtime/roomClient.ts`, update operation serialization to:

- derive a patch from the outbox entry's `change`;
- send `mode: "patch"` plus the patch when derivation succeeds;
- otherwise send the existing full snapshot shape with `mode: "snapshot"`;
- keep the same operation ID on retries, regardless of mode;
- preserve `baseSeq` and `label` in both modes.

In `onOperation`, accept either a full `project` or a patch. For a patch, apply it
to the current local project with `applyRoomPatch`; if it returns `null`, do not
install a partial state. Set a visible room error and wait for the next canonical
snapshot/welcome. For the sender's own broadcast, use the patch only to update
the sequence/ack state; the sender already has the intended local project, but
verify the patch result in development logging if it is cheap. Preserve plan
014's in-flight acknowledgment and pending-change flush behavior.

**Verify**: `npm run typecheck` → exit 0; read the operation switch and confirm a
malformed patch cannot call `applyRoomProject` with unvalidated data.

### Step 5: Add server patch handling and history preservation

In `party/server.ts`:

- validate `mode`, operation ID, label, base sequence, and patch shape before
  applying it;
- for snapshot mode, preserve the existing validation and
  `mergeProjectChanges` behavior;
- for patch mode, call `applyRoomPatch(this.roomState.project, patch)`; if it
  returns `null`, send a room error containing the canonical project and seq, and
  do not increment history;
- build the same `StoredOperation` shape for either mode, storing complete
  `beforeProject` and `afterProject` snapshots;
- broadcast a patch operation for patch input and a full project for snapshot
  input. Include the operation summary fields and seq in both broadcasts;
- preserve repeated operation-id deduplication from the current server.

The room server must never trust a client-provided patch to bypass
`isProject(nextProject)`. Use one commit path so persistence rollback behavior
remains identical for both operation modes.

**Verify**: `npm run lint && npm run typecheck && npm run build` → all exit 0.

### Step 6: Review fallback and bandwidth behavior

Read the complete diff and confirm:

1. A pencil stroke after plan 007 becomes one bounded patch, not one patch per
   pointer event.
2. A tilemap drag becomes a bounded patch.
3. Adding a sprite, changing frame structure, importing, or transforming uses a
   full snapshot and still participates in undo/redo.
4. A patch over a stale `baseSeq` applies cell-wise to the current project.
5. A patch targeting a deleted/resized sprite is rejected atomically and returns
   a canonical snapshot error.
6. Two concurrent colors use hex identity and do not overwrite palette slots.
7. Reconnecting retries the same operation ID and mode, allowing server dedupe.
8. Welcome messages still contain a complete project for initial sync/recovery.

**Verify**: `git diff --check` → no output; all three gates exit 0.

## Test plan

Automated tests are deferred by the maintainer decision in `plans/README.md`.
When tests are introduced, prioritize pure tests for patch derivation and
application: shape fallback, coordinate bounds, palette-full rejection, tile ID
validation, stale cell-wise merge, and atomic failure. The browser room smoke
test should compare two clients while painting a long stroke and then perform a
structural add-sprite operation to verify both modes.

## Done criteria

- [ ] Snapshot operations remain supported and retain complete server history.
- [ ] Eligible pixel/tile changes use a bounded patch with no palette indices on
      the wire.
- [ ] Patch validation/application is atomic and calls `isProject` before commit.
- [ ] Server broadcasts patches for patch inputs and full projects for snapshot
      inputs.
- [ ] Repeated operation IDs remain idempotent in both modes.
- [ ] `npm run lint`, `npm run typecheck`, and `npm run build` exit 0.
- [ ] Only `src/realtime/protocol.ts`, `src/realtime/roomClient.ts`, and
      `party/server.ts` are modified by this plan.

## STOP conditions

- A deployed room client must interoperate with a protocol that cannot be
  versioned or safely treated as legacy snapshot mode; stop and report the
  required migration strategy.
- A valid local project can contain a palette index without a corresponding hex
  entry; stop and resolve that invariant before deriving patches.
- Applying a stale cell patch would overwrite a newer edit to the same cell with
  no deterministic last-writer rule; stop and document the chosen rule before
  continuing.
- Undo/redo cannot reconstruct complete before/after snapshots from a patch; stop
  rather than storing only the compact patch in history.
- The patch payload regularly exceeds the configured safety cap for ordinary
  strokes; stop and revisit stroke coalescing instead of raising the cap blindly.

## Maintenance notes

- New high-frequency cell-edit tools should produce store changes that the patch
  derivation helper can recognize; do not add a second ad hoc room message shape.
- Structural operations intentionally remain snapshot-based until a separate
  protocol design covers their conflict semantics.
- Keep the canonical full snapshot in welcome/error responses so a client can
  recover after a patch rejection or missed message.
