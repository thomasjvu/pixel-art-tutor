# Plan 015: Merge concurrent room palettes by color identity

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report — do
> not improvise. Modify only the files in Scope. Update this plan's status row in
> `plans/README.md` when complete unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 78aad52..HEAD -- src/realtime/protocol.ts src/store/projectStore.ts partykit/server.ts` and
> `git diff --stat 78aad52 -- src/realtime/protocol.ts src/store/projectStore.ts partykit/server.ts`.
> The second command includes unstaged changes. If the Current state excerpts do
> not match the live code, stop and report before editing.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: HIGH (changes the conflict-resolution semantics for indexed pixel data)
- **Depends on**: plans/005-tool-input-hardening.md, plans/008-color-consolidation.md, plans/014-reliable-room-outbox.md
- **Category**: bug / security
- **Planned at**: commit `78aad52`, 2026-08-26

## Why this matters

Project pixels store palette indices rather than color values. The current room
merge logic merges palette entries by numeric index, while local palette additions
append at the end. If two collaborators add different colors concurrently, both
projects add a color at the same index. Whichever operation is merged last
overwrites that slot, so pixels painted by the other collaborator silently change
color. This is a data-corruption bug in the central collaboration path.

The fix is to treat normalized hex colors as the merge identity, append missing
colors without overwriting existing slots, and remap every incoming changed pixel
through the resulting color map. Indexed storage can remain unchanged; only the
room merge boundary needs identity-aware translation.

## Current state

- `src/realtime/protocol.ts:237-246` currently merges palette entries by index:
  ```ts
  export function mergeProjectChanges(current: Project, before: Project, after: Project): Project {
    const next = cloneProject(current);

    if (before.name !== after.name) next.name = after.name;

    for (let index = 0; index < after.palette.length; index++) {
      if (before.palette[index] !== after.palette[index]) {
        next.palette[index] = after.palette[index]!;
      }
    }
  ```
- `src/realtime/protocol.ts:256-289` applies changed `afterFrame.pixels` values
  directly as numeric indices and clones an entire changed-shape sprite without
  translating its indices.
- `src/store/projectStore.ts:350-361` appends a new normalized color:
  ```ts
  const existing = project.palette.indexOf(normalized);
  if (existing >= 0) return { index: existing };
  if (project.palette.length >= MAX_PALETTE)
    return { error: `palette is full (${MAX_PALETTE} colors max)` };
  const next = cloneProject(project);
  next.palette.push(normalized);
  commit(next);
  return { index: next.palette.length - 1 };
  ```
- `src/realtime/roomClient.ts:460-468` sends both `baseProject` and `project` to
  the server. The server invokes `mergeProjectChanges` when `baseSeq` is stale.
- Project validation accepts uppercase hex strings (`isProject` at
  `src/realtime/protocol.ts:185-200`), while normal UI/tool additions are
  normalized lowercase. The merge identity must therefore compare lowercase
  forms without changing the stored value of existing canonical projects.
- Conventions: `src/realtime/protocol.ts` is pure data/merge logic and must not
  import the zustand store or DOM APIs; the server stores complete before/after
  snapshots for undo; `isProject(nextProject)` must remain true after every
  merge.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**:

- `src/realtime/protocol.ts` — identity-aware palette merge and pixel-index
  remapping in `mergeProjectChanges`.

**Out of scope**:

- Replacing indexed pixels with per-pixel hex strings in the stored `Project`
  type.
- Changing `addPaletteColor`'s standalone local behavior.
- Changing the server's history format or undo rules.
- Automatically compacting/removing unused palette entries.
- Introducing a CRDT or changing structural conflict policy for sprites, frames,
  or tilemaps.

## Git workflow

- Branch: `advisor/015-conflict-free-room-palette`.
- Commit: `fix: merge room palette additions by color identity`.
- Do not push or open a PR unless explicitly instructed.

## Steps

### Step 1: Define the merge mapping policy

Add a private pure helper in `src/realtime/protocol.ts` (or an adjacent pure
module if the file's organization requires it) that receives the canonical
current palette and the incoming `after.palette`. It must return:

- a cloned/updated palette with no more than 64 entries;
- a map from every incoming `after.palette` index to the resulting current index;
- a set/list of incoming color indices that could not be represented because the
  64-color capacity is already exhausted.

Use lowercase hex strings as identity keys. For each incoming color, find the
first matching color already in the current palette; otherwise append it if the
palette has capacity. Never overwrite an existing current palette slot merely
because the incoming color occupied that numeric index. Do not create duplicate
entries for the same color.

The normal case where both collaborators append different colors must produce a
palette containing both colors at distinct indices. The normal case where both
append the same color must produce one color and map both incoming indices to it.

If the union exceeds 64 colors, preserve the current canonical palette and mark
unrepresentable incoming colors. Do not substitute a different color and do not
write an out-of-range index. This is an explicit, safe loss policy for an
unrepresentable edit; the caller will skip only affected incoming pixel writes.

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Remap changed pixel values by incoming color

Refactor `mergeProjectChanges` to build the mapping before applying palette or
sprite changes. For every incoming pixel index `p`:

- `p === TRANSPARENT` remains `TRANSPARENT`;
- if `p` is a valid incoming palette index, write the mapped current index;
- if `p` is marked unrepresentable or invalid, leave the current pixel unchanged
  and do not write an invalid index.

Apply this translation in both paths:

1. Same-shape frame merges, where only cells differing between `before` and
   `after` are copied.
2. Structural sprite replacement, where the current code clones the entire
   incoming sprite because dimensions, kind, or frame IDs changed. Every cloned
   frame must be translated through the same map. If a structural replacement
   contains an unrepresentable color, keep the current sprite rather than
   installing a partially invalid sprite; the merge must remain a valid project.

Palette-only additions must still merge even when no pixels reference the new
   color. Name and existing structural conflict behavior must remain unchanged.

**Verify**: `npm run typecheck` → exit 0; inspect all assignments to
`currentFrame.pixels` and all calls to `cloneSprite` in the merge function to
confirm incoming numeric indices are never copied without translation.

### Step 3: Preserve project validity and deterministic ordering

After constructing the merged result, verify that:

- palette entries remain valid hex strings and the palette length is ≤64;
- every frame pixel is `-1` or an index in the resulting palette;
- sprite/frame/tilemap structural rules remain those accepted by `isProject`;
- missing colors are appended in the order they first appear in the incoming
  palette, making merges deterministic for the same current/after pair.

Do not call `isProject` as a repair function or import the store into the protocol
module. The server already calls `isProject(nextProject)` after the merge; keep
that guard intact.

**Verify**: `npm run lint && npm run typecheck && npm run build` → all exit 0.

### Step 4: Review concurrency scenarios

Read the final diff and trace these cases:

1. Base palette `[red]`; collaborator A appends `blue`; collaborator B appends
   `yellow`; both sets of pixels retain their intended colors after either arrival
   order.
2. Both collaborators append the same hex color; only one palette entry exists.
3. A current palette already contains an incoming color at a different index;
   changed pixels use the existing current index.
4. The current palette is full and an incoming edit needs a new color; no existing
   color is overwritten and no invalid index is installed.
5. An incoming sprite replacement uses the incoming palette's indices; the cloned
   frames display the correct colors in the current palette.
6. A local single-user operation still uses the original palette ordering.

**Verify**: `git diff --check` → no output; all gates exit 0.

## Test plan

Automated tests are deferred by the maintainer decision in `plans/README.md`.
When tests are introduced, make `mergeProjectChanges` the primary pure-function
target. Add cases for the six scenarios in Step 4, including swapped palette
indices and a full palette. The two-browser room smoke test should have both
clients add a distinct color at nearly the same time.

## Done criteria

- [ ] `mergeProjectChanges` never assigns `next.palette[index] = ...` solely
      because an incoming color changed at that numeric index.
- [ ] Incoming changed pixel indices are translated through color identity in
      both same-shape and structural-replacement paths.
- [ ] Concurrent appended colors survive at distinct palette indices.
- [ ] A full palette never causes an existing color to be overwritten.
- [ ] `isProject(mergeProjectChanges(current, before, after))` remains true for
      every valid input pair in the documented policy.
- [ ] `npm run lint`, `npm run typecheck`, and `npm run build` exit 0.
- [ ] Only `src/realtime/protocol.ts` is modified by this plan.

## STOP conditions

- The current product has begun supporting palette deletion or arbitrary
  replacement of existing palette slots; stop and redesign the conflict policy
  instead of treating those operations as appends.
- The `Project` model permits invalid palette indices in valid projects; stop and
  report the invariant mismatch before adding a remapper.
- Correctly merging a structural operation requires changing the server history
  or client protocol; stop and split that protocol work into a separate plan.
- The 64-color cap cannot be preserved without silently changing an existing
  color; stop and report the capacity conflict rather than inventing a fallback.

## Maintenance notes

- Any future palette operation must define its merge identity. Do not reintroduce
  index-only merging for a new append, delete, reorder, or replace feature.
- If the editor later supports palette reordering, stable color IDs should be
  added to the project schema rather than extending this heuristic.
- Plan 016 may send colors directly in compact room patches; it must reuse this
  same lowercase-hex identity and full-palette policy.
