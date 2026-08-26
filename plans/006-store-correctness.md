# Plan 006: Store correctness batch — strict sprite targeting, rotate_90 corruption, dangling tile refs, deleteFrame hardening

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. Touch only the files
> listed as in scope. If any STOP condition occurs, stop and report. Do not
> improvise. Commit per the git workflow section. SKIP any instruction to update
> `plans/README.md` — your reviewer maintains the index.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-git-init.md; plan 003 (gates) recommended
- **Category**: bug
- **Planned at**: commit `78aad52`, 2026-08-26 (historical branch plan; reapply to the current checkout)

## Why this matters

Four independent store bugs, all reachable from the agent tool surface:
(1) `resolveTarget` falls back to `project.sprites[0]` when an agent supplies a
`spriteId` that doesn't exist — eight tools (`read_sprite`, `set_pixels`,
`fill_region`, `clear_frame`, `transform_sprite`, `replace_color`, `add_frame`,
`critique_artwork`) then silently read/edit the FIRST sprite and return success.
An agent hallucinating `"sprite-knight"` paints the user's Slime with `ok:true` —
the worst possible failure mode for an app whose pitch is "watch your agent edit
your canvas". (2) `rotate_90` on a multi-frame non-square sprite swaps
`target.width/height` after the first frame, so later frames rotate with the wrong
stride — silent pixel garbage on the most common character shapes (16×24), reported
as `ok:true`, persisted to localStorage. (3) `deleteSprite` leaves dangling sprite
ids in `tilemap.cells` — phantom map cells, `?` legend entries in `get_tilemap`,
dangling refs in exported JSON. (4) `deleteFrame` splices a raw unvalidated index
(`splice(-1)` deletes the LAST frame) and clamps the global `activeFrameIndex`
even when the deleted sprite isn't the active one.

## Current state

- `src/store/projectStore.ts:141-156` — `resolveTarget`:
  ```ts
  resolveTarget(spriteId, frameIndex) {
    const { project, activeSpriteId, activeFrameIndex } = get();
    const sprite = project.sprites.find((s) => s.id === spriteId) ?? project.sprites[0];
    if (!sprite) return { error: `sprite '${spriteId}' not found` };
    let fi: number;
    if (frameIndex === undefined) {
      fi = sprite.id === activeSpriteId ? activeFrameIndex : 0;
    } else {
      fi = frameIndex;
    }
    fi = Math.max(0, Math.min(fi, sprite.frames.length - 1));
    if (!sprite.frames[fi]) return { error: `sprite '${sprite.name}' has no frames` };
    return { sprite, frameIndex: fi };
  },
  ```
- `src/store/projectStore.ts:270-295` — `transform`, the rotate branch:
  ```ts
  else if (op === "rotate_90") {
    const r = rotate90(frame.pixels, target.width, target.height);
    frame.pixels = r.pixels;
    // rotation changes dimensions; keep all frames consistent by resizing whole sprite only when rotating all
    if (fis.length === target.frames.length) {
      target.width = r.w;
      target.height = r.h;
    } else {
      return "rotating a single frame would desync sprite dimensions; rotate all frames instead";
    }
  }
  ```
  with `fis` computed above as:
  ```ts
  const fis =
    opts.frameIndices && opts.frameIndices.length
      ? opts.frameIndices.filter((i) => target.frames[i])
      : target.frames.map((_, i) => i);
  ```
  (`[0, 0]` passes the `fis.length === frames.length` check and rotates frame 0
  twice.)
- `src/store/projectStore.ts:377-390` — `deleteSprite` filters sprites and resets
  selection but never touches `project.tilemap.cells` (cells store sprite ids —
  see `src/types.ts:23`).
- `src/store/projectStore.ts:410-424` — `deleteFrame`:
  ```ts
  deleteFrame(frameIndex, spriteId) {
    const t = get().resolveTarget(spriteId);
    if ("error" in t) return false;
    const { sprite } = t;
    if (sprite.frames.length <= 1) return false;
    const next = cloneProject(get().project);
    const target = next.sprites.find((s) => s.id === sprite.id)!;
    target.frames.splice(frameIndex, 1);
    commit(next, {
      activeFrameIndex: Math.min(get().activeFrameIndex, target.frames.length - 1),
    });
    return true;
  },
  ```
- Callers to keep working: `FramesPanel.tsx` calls `deleteFrame(i)` with valid
  indices; all eight tools call `resolveTarget(spriteId?, frameIndex?)`; UI
  components call `resolveTarget()` with NO arguments (must keep falling back to
  the active sprite).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` (or `npx tsc -b --pretty false`) | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**:
- `src/store/projectStore.ts` (all four fixes)

**Out of scope**:
- `src/webmcp/registerTools.ts` (tool-side code needs NO changes — the fix is
  entirely in `resolveTarget`/`transform`/`deleteSprite`/`deleteFrame`).
- Any component. Any engine file.

## Git workflow

- Branch: `advisor/006-store-correctness`, branched on the approved head.
- One commit: `fix: strict sprite targeting, rotate_90 multiframe, dangling tile refs, deleteFrame hardening`.

## Steps

### Step 1: `resolveTarget` — unknown explicit spriteId is an error

Change the sprite lookup to:
```ts
const sprite =
  spriteId === undefined
    ? project.sprites[0]
    : project.sprites.find((s) => s.id === spriteId);
if (!sprite) return { error: `sprite '${spriteId}' not found` };
```
Wait — careful: the no-argument UI path must resolve to the ACTIVE sprite, not
`sprites[0]`. Preserve existing semantics exactly:
```ts
const sprite = spriteId
  ? project.sprites.find((s) => s.id === spriteId)
  : (project.sprites.find((s) => s.id === activeSpriteId) ?? project.sprites[0]);
if (!sprite) return { error: `sprite '${spriteId ?? "(none)"}' not found` };
```
This keeps: no `spriteId` → active sprite (unchanged); valid `spriteId` → that
sprite (unchanged); unknown `spriteId` → error (the fix).

**Verify**: `npx tsc -b --pretty false` → exit 0. `grep -n "resolveTarget()" src/components/*.tsx`
→ confirm all UI callers pass no arguments (they do today; if any passes an id,
STOP and report — that flow now errors on unknown ids).

### Step 2: `transform` rotate_90 — compute dims once, rotate all frames with the original stride

Restructure: before the per-frame loop, if `op === "rotate_90"`, verify the frame
set is all frames (after dedupe) and compute the new dims from the ORIGINAL
width/height:

```ts
const fis = ... // as today, but dedupe:
const fis = opts.frameIndices && opts.frameIndices.length
  ? [...new Set(opts.frameIndices)].filter((i) => target.frames[i])
  : target.frames.map((_, i) => i);

if (op === "rotate_90" && fis.length !== target.frames.length) {
  return "rotating a single frame would desync sprite dimensions; rotate all frames instead";
}
for (const fi of fis) {
  const frame: Frame = target.frames[fi];
  if (op === "flip_h") { ... as today ... }
  else if (op === "flip_v") { ... as today ... }
  else if (op === "rotate_90") {
    const r = rotate90(frame.pixels, target.width, target.height);
    frame.pixels = r.pixels;
    // width/height are the same for every iteration here (original stride);
    // assign AFTER the loop:
  }
  else if (op === "shift") { ... as today ... }
  else if (op === "outline") { ... as today ... }
}
if (op === "rotate_90") {
  const r = rotate90(new Array(0), target.width, target.height); // NO — see below
}
```
Do NOT do the dummy-call shown above. Concretely: capture
`const newW = target.height; const newH = target.width;` before the loop, use
`rotate90(frame.pixels, target.width, target.height)` inside the loop (target
width/height untouched during the loop), and after the loop set
`target.width = newW; target.height = newH;`. The early return for partial frame
sets moves BEFORE the loop (shown above). Keep the error string identical.

**Verify**: `npx tsc -b --pretty false` → exit 0. Sanity-read the final loop: no
`target.width`/`target.height` assignment happens inside the loop.

### Step 3: `deleteSprite` — null out dangling tilemap cells

Inside `deleteSprite`, after `next.sprites = next.sprites.filter((s) => s.id !== id);`
add:
```ts
if (next.tilemap) {
  next.tilemap.cells = next.tilemap.cells.map((c) => (c === id ? null : c));
}
```

**Verify**: `npx tsc -b --pretty false` → exit 0.

### Step 4: `deleteFrame` — validate the index, scope the clamp

Rewrite to use `resolveTarget`'s already-clamped frame resolution and only touch
`activeFrameIndex` when the deleted sprite is the active one:
```ts
deleteFrame(frameIndex, spriteId) {
  const t = get().resolveTarget(spriteId, frameIndex);
  if ("error" in t) return false;
  const { sprite, frameIndex: fi } = t;
  if (sprite.frames.length <= 1) return false;
  const next = cloneProject(get().project);
  const target = next.sprites.find((s) => s.id === sprite.id)!;
  target.frames.splice(fi, 1);
  const extra: Partial<ProjectState> = {};
  if (sprite.id === get().activeSpriteId) {
    extra.activeFrameIndex = Math.min(get().activeFrameIndex, target.frames.length - 1);
  }
  commit(next, extra);
  return true;
},
```

**Verify**: `npm run lint && npm run typecheck && npm run build` → all exit 0.

## Test plan

Deferred by maintainer decision. Future targets: rotate a 16×24 two-frame sprite →
both frames are 24×16 valid grids; `resolveTarget("nope")` errors; deleting a
placed tile nulls its cells.

## Done criteria

- [ ] `grep -n "?? project.sprites\[0\]" src/store/projectStore.ts` → 0 matches in
      `resolveTarget` (the `?? sprites[0]` remains ONLY inside the no-spriteId branch)
- [ ] `grep -n "new Set(opts.frameIndices)" src/store/projectStore.ts` → 1 match
- [ ] `grep -n "cells.map((c) => (c === id ? null : c))" src/store/projectStore.ts` → 1 match
- [ ] `grep -n "splice(fi, 1)" src/store/projectStore.ts` → 1 match
- [ ] All gates exit 0; `git diff --stat` shows only `src/store/projectStore.ts`

## STOP conditions

- Any UI component or tool breaks compilation because it depended on the lenient
  `resolveTarget` fallback (that caller must be reviewed, not silently fixed).
- The rotate restructure would change behavior for SQUARE single-frame sprites
  (it must not — those were correct before).

## Maintenance notes

- If a future tool wants "create or update by id" semantics, do it explicitly in
  that tool — never reintroduce a silent fallback in `resolveTarget`.
- `rotate_90` on sprites with per-frame size divergence is impossible by
  construction (frames share sprite dims) — keep that invariant.
