# Plan 008: Consolidate color resolution into one helper; make palette-add atomic with its operation

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. Touch only the files
> listed as in scope. If any STOP condition occurs, stop and report. Do not
> improvise. Commit per the git workflow section. SKIP any instruction to update
> `plans/README.md` — your reviewer maintains the index.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (changes signatures of three store actions; callers must be updated
  in the same commit)
- **Depends on**: plans/005-tool-input-hardening.md (builds on its range-check
  semantics); plans/001, 003
- **Category**: tech-debt
- **Planned at**: no VCS at planning time; base = plan 001's initial commit

## Why this matters

The "resolve a color input (palette index | hex | 'transparent' | null) into a
palette index, auto-adding new hex colors" policy is implemented five times:
`registerTools.ts` fill_region (~214-228), transform_sprite outline (~292-307),
replace_color local `resolve()` (~336-345), `projectStore.ts` `applyPixelChanges`
inline (~192-207), and a simplified variant in `PalettePanel.tsx` (~15-20). They
have already drifted: `applyPixelChanges` silently DROPS new colors when the
palette is full while tool paths surface `{ok:false,error}`; `fill_region` rounds
numeric indices while `applyPixelChanges` does not. Any policy change must now be
replicated in lockstep across the app's showcase file. Additionally, when a tool
auto-adds a color, `addPaletteColor` commits separately from the operation that
needed it — one logical edit costs two undo steps, and if the follow-up operation
applies nothing (rect misses the canvas), the palette entry is committed alone as
an orphan mutation.

## Current state

- The five sites listed above (read them all before starting).
- `src/store/projectStore.ts` — `addPaletteColor` (~325-335) validates hex, dedupes,
  caps at `MAX_PALETTE = 64`, and **commits**. `fillRegion(x, y, w, h, colorIdx,
  spriteId?, frameIndex?, allFrames?)` takes a resolved numeric index and is called
  ONLY by the `fill_region` tool (verify with grep). `replaceColor(fromIdx, toIdx,
  spriteId?)` is called by the `replace_color` tool AND `PalettePanel.tsx`'s remap
  button (with numeric indices). `transform(op, opts)` reads `opts.colorIdx`.
- `src/engine/color.ts` — currently only `normalizeHex`, `hexToRgb`, `luminance`.
  Pure module, right home for the new helper. `TRANSPARENT = -1` lives in
  `src/types.ts` (engine files already import from `../types` — see `pixels.ts`).
- After plan 005, `applyPixelChanges` range-checks numeric colors inline and
  `defineTool` has a try/catch backstop.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` (or `npx tsc -b --pretty false`) | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**:
- `src/engine/color.ts` (add `resolveColorInto`)
- `src/store/projectStore.ts` (`applyPixelChanges` delegates; `fillRegion`,
  `transform` opts, `replaceColor` accept unresolved color and resolve into the
  clone — single commit per operation; interface updated accordingly)
- `src/webmcp/registerTools.ts` (fill_region, transform_sprite, replace_color drop
  their local resolution blocks and pass color through)
- `src/components/PalettePanel.tsx` ONLY if required to satisfy the compiler (its
  numeric `replaceColor` call should remain valid untouched)

**Out of scope**:
- `PalettePanel.tsx`'s Add button and the `add_palette_color` tool keep using
  `addPaletteColor` (a standalone palette addition is a legitimate single commit).
- Any behavior change for valid inputs (results must be identical; only error
  paths and commit counts change).

## Git workflow

- Branch: `advisor/008-color-consolidation`, branched on the approved head.
- One commit: `refactor: single color-resolution helper, atomic palette adds in tool ops`.

## Steps

### Step 1: Add the pure helper

In `src/engine/color.ts` (import `TRANSPARENT` from `../types`):

```ts
const MAX_PALETTE = 64;

export function resolveColorInto(
  color: number | string | null | undefined,
  project: { palette: string[] },
): { index: number } | { error: string } {
  if (color === null || color === undefined || color === "transparent")
    return { index: TRANSPARENT };
  if (typeof color === "number") {
    if (!Number.isInteger(color) || color < -1 || color >= project.palette.length)
      return { error: `color index ${color} is out of range (palette has ${project.palette.length} entries)` };
    return { index: color };
  }
  if (typeof color !== "string")
    return { error: "color must be a palette index, hex string, 'transparent', or null" };
  const hex = normalizeHex(color);
  if (!hex) return { error: `'${color}' is not a valid hex color` };
  const existing = project.palette.indexOf(hex);
  if (existing >= 0) return { index: existing };
  if (project.palette.length >= MAX_PALETTE)
    return { error: `palette is full (${MAX_PALETTE} colors max)` };
  project.palette.push(hex);
  return { index: project.palette.length - 1 };
}
```

Note it MUTATES `project.palette` when auto-adding — callers pass the cloned
project so the mutation lands inside their single commit. Document that in a
one-line comment (repo style allows brief comments; match `pixels.ts`).

**Verify**: `npx tsc -b --pretty false` → exit 0.

### Step 2: Store actions resolve color on the clone

In `src/store/projectStore.ts`:

- `applyPixelChanges`: replace the inline resolution block with
  ```ts
  const resolved = resolveColorInto(ch.color ?? null, next);
  if ("error" in resolved) continue; // skipped; counted via `applied` staying low
  const colorIdx = resolved.index;
  ```
  (keep the rest of the loop; `next` is the clone — palette growth lands in the
  single commit).
- `fillRegion`: change the parameter to `color: number | string | null` and, after
  target resolution and BEFORE the loops, do
  ```ts
  const resolved = resolveColorInto(color, next);
  if ("error" in resolved) return resolved.error; // see return-type change below
  const colorIdx = resolved.index;
  ```
  Change the return type to `number | { error: string }` (error object when the
  color is invalid, count otherwise). Update the `ProjectState` interface.
- `transform`: change `opts.colorIdx` to `opts.color?: number | string | null`;
  in the `outline` branch resolve into `next` inside the loop-guard style used by
  other branches — resolve ONCE before the loop:
  ```ts
  let colorIdx = 0;
  if (op === "outline") {
    const resolved = resolveColorInto(opts.color ?? null, next);
    if ("error" in resolved) return resolved.error;
    colorIdx = resolved.index;
  }
  ```
  (note: default when color is null/undefined becomes TRANSPARENT `-1` via the
  helper — previously outline defaulted to `0`. Preserve the OLD default by
  passing `opts.color ?? 0` when `op === "outline"`. Verify against the old code:
  `const c = opts.colorIdx ?? 0;` — yes, default 0.)
- `replaceColor`: change to `replaceColor(from: number | string | null, to: number | string | null, spriteId?)`;
  resolve both into `next` before the pixel loops; on either error return
  `{ error: string }`, else return the count — new return type
  `number | { error: string }`. Update the interface.

**Verify**: `npx tsc -b --pretty false` → exit 0 (registerTools will fail until
Step 3 — expected mid-step).

### Step 3: Tools pass color through

In `src/webmcp/registerTools.ts`:
- `fill_region`: delete the local `colorIdx` resolution block; call
  `const result = useStore.getState().fillRegion(..., color, ...)`; then
  `return typeof result === "number" ? { ok: result > 0, filledPixels: result } : { ok: false, error: result.error };`
- `transform_sprite`: delete the outline color pre-resolution block; pass
  `color` straight into `st.transform({... color, ...})`. `st.transform` returns
  an error string already — unchanged handling.
- `replace_color`: delete the local `resolve()` function; call
  `const result = st.replaceColor(from, to, spriteId);` and map
  `typeof result === "number" ? { ok: true, replacedPixels: result } : { ok: false, error: result.error }`.
  (The `from`/`to` schema props already use `colorSchemaProp`.)

**Verify**: `npm run lint && npm run typecheck && npm run build` → all exit 0.

### Step 4: Drift audit

`grep -n "normalizeHex" src/webmcp/registerTools.ts src/store/projectStore.ts src/components/PalettePanel.tsx`
— after this plan, `normalizeHex` should appear in `registerTools.ts` only inside
`add_palette_color`'s return value (`hex: normalizeHex(hex)`) and nowhere as a
color-resolution entry point in the store (the helper owns it). `PalettePanel`'s
Add button keeps `normalizeHex` for its local validity check — acceptable; note
any remaining site in NOTES.

**Verify**: gates re-run → exit 0.

## Test plan

Deferred by maintainer decision. Future targets: `resolveColorInto` (auto-add,
full-palette, range rejection), atomicity (fill_region with a new hex = ONE undo
step).

## Done criteria

- [ ] `grep -c "resolveColorInto" src/engine/color.ts src/store/projectStore.ts src/webmcp/registerTools.ts`
      → helper + store call sites + zero local resolution duplicates
- [ ] `grep -n "addPaletteColor" src/webmcp/registerTools.ts` → only in the
      `add_palette_color` tool
- [ ] All gates exit 0
- [ ] `git diff --stat` shows only the three primary in-scope files (± PalettePanel
      if the compiler required it)

## STOP conditions

- Any caller of `fillRegion`/`replaceColor` besides the ones listed (grep first;
  an unexpected caller changes the blast radius).
- You cannot preserve the outline default of palette index 0 without contortion.

## Maintenance notes

- New tools that accept colors MUST accept the raw union and delegate to
  `resolveColorInto` via a store action — never resolve+commit in the tool layer.
- `MAX_PALETTE` now lives in two places (store constant + helper constant). If it
  ever changes, change both (or move the constant to `types.ts` — left out of this
  plan to keep the diff small).
