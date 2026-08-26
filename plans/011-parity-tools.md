# Plan 011: Agent parity tools — `flood_fill`, `delete_frame`, `rename_sprite`

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. Touch only the files
> listed as in scope. If any STOP condition occurs, stop and report. Do not
> improvise. Commit per the git workflow section. SKIP any instruction to update
> `plans/README.md` — your reviewer maintains the index.

## Status

- **Priority**: P2 (direction)
- **Effort**: S
- **Risk**: LOW (`flood_fill`), MED-low (`delete_frame` — destructive, guarded by a
  `confirm` flag)
- **Depends on**: plans/001, 003, 005 (hardening conventions); plan 008 if landed
  (color helper) — otherwise follow 005's inline-resolution pattern
- **Category**: direction
- **Planned at**: no VCS at planning time; base = plan 001's initial commit

## Why this matters

Two surface asymmetries cost real demo quality. (1) Humans have a flood-fill bucket
but agents don't: an agent told "fill the background" must emit pixels one by one
against `set_pixels`' 4096-item cap — slow and token-expensive, while the engine
function (`floodFill` in `src/engine/pixels.ts:40-62`) already exists. (2) Agents
can CREATE frames and sprites but never delete or rename a mistake — a mis-called
`add_frame` permanently clutters the animation strip with no self-service recovery.
Humans have all three operations in the UI (`FramesPanel` delete, `SpritesPanel`
rename). Closing parity gaps is direct "WebMCP Leverage" score material.

## Current state

- `src/store/projectStore.ts` — `floodFillAt(x, y, colorIdx)` resolves the ACTIVE
  target only (no spriteId/frameIndex params) and commits. `deleteFrame(frameIndex,
  spriteId?)` returns `boolean` (false on last-frame or bad target; hardened by
  plan 006 to validate the index). `renameSprite(id, name)` returns void, silently
  no-ops on empty names or unknown ids.
- `src/engine/pixels.ts` — `floodFill(pixels, w, h, x, y, replacement)` pure
  function; `inBounds` helper.
- Tool conventions: `defineTool<I>` entries in the `tools` array;
  `target(spriteId?, frameIndex?)` helper resolves or returns `{error}`; `log(tool,
  summary)` for the activity feed; destructive-ish tools should require explicit
  confirmation in their schema (established here for the first time — keep it
  minimal: a boolean `confirm` property, required).
- README tool table: count is 16 (or 17 if plan 010 landed first) — update to match
  reality after this plan (19 or 20).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` (or `npx tsc -b --pretty false`) | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**:
- `src/store/projectStore.ts` (generalize `floodFillAt` with optional
  spriteId/frameIndex; color accepted as `number | string | null` resolved on the
  clone IF plan 008 landed — otherwise numeric only, matching its current signature
  style)
- `src/webmcp/registerTools.ts` (three new tools)
- `README.md` (table rows + count)

**Out of scope**:
- `delete_sprite` tool (deleting whole sprites from an agent is higher-risk and
  NOT requested — do not add it).
- Any UI change.

## Git workflow

- Branch: `advisor/011-parity-tools`, branched on the approved head.
- One commit: `feat: flood_fill, delete_frame, rename_sprite agent tools`.

## Steps

### Step 1: Generalize `floodFillAt` in the store

Change the signature to
`floodFillAt(x, y, colorIdx, spriteId?, frameIndex?)` and replace its
`get().resolveTarget()` call with `get().resolveTarget(spriteId, frameIndex)`.
Everything else stays. (UI caller `CanvasStage.tsx` passes two args — unchanged.)

If plan 008 has landed, instead accept `color: number | string | null` and use
`resolveColorInto` on the clone (mirroring `fillRegion`'s post-008 shape). If NOT,
keep `colorIdx: number` and have the TOOL do the 005-style inline resolution
(number → integer/range check; hex → `addPaletteColor` before calling — matching
`fill_region`'s current shape).

**Verify**: `npx tsc -b --pretty false` → exit 0.

### Step 2: Add the three tools

Append to the `tools` array (match current entry style exactly; place `flood_fill`
after `fill_region`, and the other two after `add_frame`):

`flood_fill` —
```ts
defineTool<{
  x: number; y: number;
  color: number | string | null;
  spriteId?: string; frameIndex?: number;
}>({
  name: "flood_fill",
  title: "Flood fill region",
  description:
    "Bucket-fill: starting at x,y, replace all connected pixels of the same color with the new color (transparent counts as a color). Fails clearly if the start pixel is out of bounds.",
  inputSchema: {
    type: "object",
    properties: {
      x: { type: "number" },
      y: { type: "number" },
      color: colorSchemaProp,
      spriteId: { type: "string" },
      frameIndex: { type: "number" },
    },
    required: ["x", "y", "color"],
  },
  execute: ({ x, y, color, spriteId, frameIndex }) => {
    const t = target(spriteId, frameIndex);
    if ("error" in t) return { ok: false, error: t.error };
    const sx = Math.round(x); const sy = Math.round(y);
    if (sx < 0 || sy < 0 || sx >= t.sprite.width || sy >= t.sprite.height)
      return { ok: false, error: `start pixel (${sx},${sy}) is outside the ${t.sprite.width}x${t.sprite.height} canvas` };
    // resolve color exactly like fill_region does in the current code
    // (post-008: pass through to the store; pre-008: inline resolution)
    ...call useStore.getState().floodFillAt(sx, sy, <resolved>, t.sprite.id, t.frameIndex);
    log("flood_fill", `${t.sprite.name} @ ${sx},${sy}`);
    return { ok: true };
  },
}),
```

`delete_frame` —
```ts
defineTool<{ frameIndex: number; spriteId?: string; confirm: boolean }>({
  name: "delete_frame",
  title: "Delete animation frame",
  description:
    "Delete one animation frame from a sprite. Requires confirm:true. Refuses to delete a sprite's last remaining frame.",
  inputSchema: {
    type: "object",
    properties: {
      frameIndex: { type: "number", description: "Zero-based frame to delete" },
      spriteId: { type: "string" },
      confirm: { type: "boolean", description: "Must be true to perform the deletion" },
    },
    required: ["frameIndex", "confirm"],
  },
  execute: ({ frameIndex, spriteId, confirm }) => {
    if (confirm !== true) return { ok: false, error: "deletion requires confirm:true" };
    const t = target(spriteId, frameIndex);
    if ("error" in t) return { ok: false, error: t.error };
    const ok = useStore.getState().deleteFrame(frameIndex, t.sprite.id);
    log("delete_frame", ok ? `${t.sprite.name} frame ${frameIndex}` : `refused (${t.sprite.name})`);
    return ok
      ? { ok: true }
      : { ok: false, error: "cannot delete the sprite's last remaining frame" };
  },
}),
```

`rename_sprite` —
```ts
defineTool<{ spriteId: string; name: string }>({
  name: "rename_sprite",
  title: "Rename sprite",
  description: "Rename an existing sprite (e.g. after giving an untitled sprite an identity).",
  inputSchema: {
    type: "object",
    properties: {
      spriteId: { type: "string" },
      name: { type: "string", description: "New name (non-empty)" },
    },
    required: ["spriteId", "name"],
  },
  execute: ({ spriteId, name }) => {
    const t = target(spriteId);
    if ("error" in t) return { ok: false, error: t.error };
    if (typeof name !== "string" || !name.trim())
      return { ok: false, error: "name must be a non-empty string" };
    useStore.getState().renameSprite(t.sprite.id, name.trim());
    log("rename_sprite", `${t.sprite.name} -> ${name.trim()}`);
    return { ok: true, spriteId: t.sprite.id, name: name.trim() };
  },
}),
```
(Adjust `defineTool` generic objects to the exact current call style in the file.)

### Step 3: README

Add three rows to the tool table (`flood_fill` after `fill_region`; `delete_frame`
and `rename_sprite` near `add_frame`) and bump the count (16 → 19, or from whatever
plan 010 left).

**Verify**: `npm run lint && npm run typecheck && npm run build` → all exit 0.

## Test plan

None — maintainer deferred tests. Reviewer verifies live via `executeTool`:
flood_fill on the slime background, delete_frame refusal without confirm, rename.

## Done criteria

- [ ] `grep -n "flood_fill\|delete_frame\|rename_sprite" src/webmcp/registerTools.ts`
      → 3 tools registered (name + log lines)
- [ ] `grep -n "spriteId?, frameIndex?" src/store/projectStore.ts` → generalized
      `floodFillAt`
- [ ] `delete_frame` requires `confirm` (`grep -n "confirm !== true" src/webmcp/registerTools.ts`)
- [ ] README rows + count updated
- [ ] All gates exit 0; diff limited to store + tools + README

## STOP conditions

- `deleteFrame`'s post-006 semantics differ from what this plan assumes (boolean
  return, index validation) — re-check and adapt the mapping, STOP if it returns
  something else entirely.
- The tools array pattern has drifted (match current style; STOP only if entries
  are no longer `defineTool`-based).

## Maintenance notes

- If a `delete_sprite` tool is ever requested, reuse the `confirm` pattern and
  consider blocking when the tilemap still references the sprite.
- `flood_fill`'s bounds rejection (vs clamping) is deliberate: a fill outside the
  canvas is always an agent mistake worth surfacing.
