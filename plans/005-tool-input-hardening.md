# Plan 005: Harden agent tool inputs — bounded fills, strict color coercion, no-throw backstop

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. Touch only the files
> listed as in scope. If any STOP condition occurs, stop and report. Do not
> improvise. Commit per the git workflow section. SKIP any instruction to update
> `plans/README.md` — your reviewer maintains the index.

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: plans/001-git-init.md; plan 003 (gates) recommended
- **Category**: security / bug
- **Planned at**: no VCS at planning time; base = plan 001's initial commit

## Why this matters

WebMCP tools receive arbitrary JSON from agents — schema declarations are advisory,
not enforced at every host. Three concrete hazards: (1) `fill_region` /
`fill_tiles` iterate `y..y+h × x..x+w` with the bounds check *inside* the loop, so
`fill_region {width:1e7, height:1e7}` schedules ~10¹⁴ no-op iterations — one
ordinary agent mistake (screen coords instead of canvas coords) hard-freezes the
human's tab with no recovery. (2) Numeric color inputs are persisted without
integer/range checks, so out-of-range indices are stored, never render, and confuse
everyone. (3) Out-of-schema types (object/boolean `color`) reach
`normalizeHex(...).trim()` and throw a raw `TypeError` out of `execute`, breaking
the app's documented contract that tools return `{ok:false, error}` rather than
throwing.

## Current state

- `src/store/projectStore.ts` — `fillRegion` (around line 220-240):
  ```ts
  let count = 0;
  for (const idx of fis) {
    const frame = target.frames[idx];
    if (!frame) continue;
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++)
        if (inBounds(xx, yy, target.width, target.height)) {
          frame.pixels[yy * target.width + xx] = colorIdx;
          count++;
        }
  }
  ```
  and `fillTiles` (around line 465-480) has the same loop shape over
  `tm.cols`/`tm.rows`.
- `src/store/projectStore.ts` — `applyPixelChanges` (around line 180-218):
  ```ts
  let colorIdx: number;
  if (ch.color === null || ch.color === "transparent") colorIdx = TRANSPARENT;
  else if (typeof ch.color === "number") colorIdx = ch.color;
  else {
    const hex = normalizeHex(ch.color);
    if (!hex) continue;
    ...
  }
  ```
  No integer check, no `0 <= idx < palette.length` bound. A truthy non-string
  `ch.color` (object/boolean) reaches `normalizeHex` → `src/engine/color.ts:2`
  `input.trim()` → TypeError.
- `src/webmcp/registerTools.ts:33-48` — the `defineTool` wrapper:
  ```ts
  function defineTool<I extends Record<string, unknown>>(def: ToolDef<I>): WebMCP.ModelContextTool {
    return {
      name: def.name,
      title: def.title,
      description: def.description,
      inputSchema: def.inputSchema,
      annotations: def.annotations,
      execute: (input) => def.execute(input as I),
    };
  }
  ```
  A throw inside any `execute` propagates to the host as a rejected promise.
- `src/webmcp/registerTools.ts` — `replace_color`'s local `resolve()` (~line 336)
  returns `{ index: c }` for any number; `transform_sprite`'s `dx/dy` round but
  don't reject `NaN` (`Math.round(NaN)` is `NaN`, which flows into `shiftWrap`).
- Conventions: pure helpers live in `src/engine/` (see `pixels.ts`, `color.ts`);
  errors are `{ok:false, error}` objects (README "Design notes"); match the
  existing `normalizeHex` style (return `null` on bad input).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` (or `npx tsc -b --pretty false`) | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**:
- `src/engine/color.ts` (harden `normalizeHex` against non-strings)
- `src/engine/pixels.ts` (add `clampRect` helper)
- `src/store/projectStore.ts` (bounded loops in `fillRegion`/`fillTiles`; strict
  numeric color handling in `applyPixelChanges`)
- `src/webmcp/registerTools.ts` (`defineTool` try/catch backstop; integer/range
  checks in `replace_color` and `transform_sprite`)

**Out of scope**:
- Consolidating the five hex→palette resolution sites into one helper (plan 008
  does that; do NOT pre-refactor it here beyond what each step requires).
- Any schema JSON changes beyond adding `minimum`/`maximum` documentation fields
  (optional, Step 4).
- Adding tests (maintainer deferred).

## Git workflow

- Branch: `advisor/005-tool-input-hardening`, branched on the approved head.
- One commit: `fix: bound fill loops, coerce tool color inputs, no-throw tool wrapper`.

## Steps

### Step 1: `normalizeHex` rejects non-strings

In `src/engine/color.ts`, first line of `normalizeHex`:
```ts
if (typeof input !== "string") return null;
```

**Verify**: `npx tsc -b --pretty false` → exit 0 (callers pass `string` today, so
no caller breaks).

### Step 2: Add `clampRect` to `src/engine/pixels.ts`

Export:
```ts
export function clampRect(
  x: number, y: number, w: number, h: number, boundW: number, boundH: number,
): { x: number; y: number; w: number; h: number } | null {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(boundW, Math.ceil(x + w));
  const y1 = Math.min(boundH, Math.ceil(y + h));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
```

**Verify**: `npx tsc -b --pretty false` → exit 0.

### Step 3: Bound the fill loops

In `src/store/projectStore.ts`:
- `fillRegion`: after resolving the target, compute
  `const r = clampRect(x, y, w, h, target.width, target.height); if (!r) return 0;`
  then loop `for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++)`
  writing directly (keep the `inBounds` call or drop it — the rect is already
  clamped; keep it if you prefer minimal diff).
- `fillTiles`: same pattern against `tm.cols`/`tm.rows`; return 0 when `clampRect`
  returns null.

**Verify**: `npx tsc -b --pretty false` → exit 0; `npm run build` → exit 0.

### Step 4: Strict numeric color handling in `applyPixelChanges`

In the color resolution block, replace the number branch with:
```ts
else if (typeof ch.color === "number") {
  if (!Number.isInteger(ch.color) || ch.color < -1 || ch.color >= next.palette.length) continue;
  colorIdx = ch.color;
}
```
(`-1` is TRANSPARENT and stays legal.) The string branch already handles bad hex
via `normalizeHex` returning `null` after Step 1 — objects/booleans now return
`null` instead of throwing, hit `continue`, and count as skipped.

**Verify**: `npx tsc -b --pretty false` → exit 0.

### Step 5: No-throw backstop in `defineTool` + integer checks in two tools

In `src/webmcp/registerTools.ts`:
- Wrap the dispatch:
  ```ts
  execute: async (input) => {
    try {
      return await def.execute(input as I);
    } catch (e) {
      console.error(`[tool ${def.name}] threw`, e);
      return { ok: false, error: e instanceof Error ? e.message : "internal tool error" };
    }
  },
  ```
- `replace_color`'s `resolve()`: for the number branch return
  `{ error: "color index out of range" }` when
  `!Number.isInteger(c) || c < -1 || c >= st.project.palette.length`.
- `transform_sprite`: before calling `st.transform`, if `op === "shift"` and
  `dx`/`dy` were provided but are not finite numbers, return
  `{ ok: false, error: "dx/dy must be finite numbers" }`.
- Optional documentation only: add `"minimum": -64, "maximum": 128` to the
  `width`/`height`/`x`/`y` schema props of `fill_region` and `fill_tiles`.

**Verify**: `npm run lint && npm run typecheck && npm run build` → all exit 0.

## Test plan

Deferred by maintainer decision. Future high-value targets: `clampRect` edge cases,
`applyPixelChanges` rejection paths, `defineTool` catch behavior.

## Done criteria

- [ ] `grep -n "clampRect" src/engine/pixels.ts src/store/projectStore.ts` → helper
      + 2 call sites
- [ ] `grep -n "typeof input !== \"string\"" src/engine/color.ts` → 1 match
- [ ] `grep -n "Number.isInteger" src/store/projectStore.ts src/webmcp/registerTools.ts`
      → ≥ 2 matches
- [ ] `grep -n "catch (e)" src/webmcp/registerTools.ts` → the defineTool wrapper
- [ ] All gates exit 0; `git diff --stat` shows only the four in-scope files

## STOP conditions

- Clamping changes results for any EXISTING human-UI caller of `fillRegion`/
  `fillTiles` (check callers: CanvasStage/TilemapPanel pass in-bounds rects; if you
  find a caller relying on out-of-bounds behavior, STOP).
- The `defineTool` catch changes any tool's return type in a way TypeScript flags
  across files you may not touch — report rather than widening scope.

## Maintenance notes

- Plan 008 will consolidate the five color-resolution copies; keep Step 4's range
  check semantics identical to what you write here so consolidation is mechanical.
- If a future tool needs partial-success semantics (some pixels applied, some
  skipped), extend `applyPixelChanges`'s return with a `skipped` count rather than
  silently `continue`-ing.
