# Plan 007: One commit per stroke — coalesced history, robust pointers, fast tilemap redraw

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. Touch only the files
> listed as in scope. If any STOP condition occurs, stop and report. Do not
> improvise. Commit per the git workflow section. SKIP any instruction to update
> `plans/README.md` — your reviewer maintains the index.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches the hot write path shared by human UI and agent tools)
- **Depends on**: plans/001-git-init.md; plan 003 (gates) recommended
- **Category**: perf / bug
- **Planned at**: no VCS at planning time; base = plan 001's initial commit

## Why this matters

Every pointermove during a drag calls `drawLine`/`setColorAt`, and each of those
runs `commit()`: a full `cloneProject` (every sprite, every frame's pixels, the
tilemap) plus a push onto the 60-slot undo stack. A single stroke across a canvas
emits dozens of commits — one stroke exhausts undo, so Ctrl+Z can't reach the
pre-stroke state; GC churn causes frame drops; and the animation-playback interval
(deps include `sprite`, whose identity changes on every commit) is torn down and
recreated mid-drag. Separately, the pointer state machine uses React state for
`dragging` (stale on same-tick moves) and never handles `pointercancel`, so a
canceled touch leaves "stuck ink" that paints on plain hover. Finally, the tilemap
redraw does `project.sprites.find(...)` per cell — O(cells × sprites) per repaint,
repainting fully per painted cell during drags.

## Current state

- `src/store/projectStore.ts:106-115` — `commit` (inside the `create` closure):
  ```ts
  function commit(next: Project, extra?: Partial<ProjectState>) {
    const { project, past } = get();
    set({
      project: next,
      past: [...past.slice(-HISTORY_LIMIT), project],
      future: [],
      ...extra,
    });
    scheduleSave();
  }
  ```
- `src/components/CanvasStage.tsx:20` — `const [dragging, setDragging] = useState(false);`
  and `:22` — `const lastCell = useRef<[number, number] | null>(null);`
- `src/components/CanvasStage.tsx:24-31` — play interval:
  ```ts
  useEffect(() => {
    if (!playing || !sprite || sprite.frames.length < 2) return;
    const id = setInterval(() => {
      const st = useStore.getState();
      st.selectFrame((st.activeFrameIndex + 1) % (sprite.frames.length));
    }, 220);
    return () => clearInterval(id);
  }, [playing, sprite]);
  ```
- `src/components/CanvasStage.tsx` pointer handlers (around 143-190):
  `onPointerDown` sets `setDragging(true)` + `applyAt`; `onPointerMove` guards with
  `if (!dragging || !cell) return;` and calls `drawLine(...)` per segment;
  `onPointerUp` clears; there is **no** `onPointerCancel`.
- `src/components/TilemapPanel.tsx:33-66` — the draw effect loops all cells and for
  non-empty cells does `const sprite = project.sprites.find((sp) => sp.id === id);`;
  painting handlers (`onPointerDown`/`onPointerMove`) call `placeTile` per cell —
  one commit each (same history-burn problem; note it already uses a `painting`
  ref, not state).
- Store actions used during drags: `setColorAt`, `drawLine`, `floodFillAt`
  (CanvasStage); `placeTile` (TilemapPanel). All end in `commit`.
- Conventions: store actions are the only mutation path; `scheduleSave()` is the
  debounced localStorage write; `HISTORY_LIMIT = 60` lives at the top of
  `projectStore.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` (or `npx tsc -b --pretty false`) | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**:
- `src/store/projectStore.ts` (stroke coalescing in the `create` closure + new
  `beginStroke`/`endStroke` actions on the `ProjectState` interface)
- `src/components/CanvasStage.tsx` (pointer rework, interval deps)
- `src/components/TilemapPanel.tsx` (sprite Map lookup, begin/end stroke around
  paint drags)

**Out of scope**:
- `src/webmcp/registerTools.ts` — agent tools keep their current behavior (one
  tool call = one commit = one undo step). Do NOT route tools through
  begin/endStroke.
- Any redesign of `cloneProject` or history structure.

## Git workflow

- Branch: `advisor/007-stroke-coalescing`, branched on the approved head.
- One commit: `perf: coalesce drag strokes into one undo entry, harden pointer state, speed tilemap redraw`.

## Steps

### Step 1: Add stroke coalescing to the store

In `src/store/projectStore.ts`, inside the `create` closure (next to `commit`), add
a module-closure-local flag and two actions:

```ts
let strokeActive = false;
```

Change `commit` to skip history while a stroke is active:
```ts
function commit(next: Project, extra?: Partial<ProjectState>) {
  const { project, past } = get();
  if (strokeActive) {
    // history base was already pushed by beginStroke; intermediate
    // states are not recorded
    set({ project: next, ...extra });
    return;
  }
  set({
    project: next,
    past: [...past.slice(-HISTORY_LIMIT), project],
    future: [],
    ...extra,
  });
  scheduleSave();
}
```

Add to the `ProjectState` interface and implementation:
```ts
beginStroke(): void;
endStroke(): void;
```
```ts
beginStroke() {
  if (strokeActive) return;
  const { project, past } = get();
  strokeActive = true;
  set({ past: [...past.slice(-HISTORY_LIMIT), project], future: [] });
},

endStroke() {
  if (!strokeActive) return;
  strokeActive = false;
  scheduleSave();
},
```

**Verify**: `npx tsc -b --pretty false` → exit 0.

### Step 2: Rework CanvasStage pointers around begin/endStroke + a dragging ref

In `src/components/CanvasStage.tsx`:
- Replace `const [dragging, setDragging] = useState(false);` with
  `const dragging = useRef(false);`
- `onPointerDown`: replace `setDragging(true)` with
  `dragging.current = true; useStore.getState().beginStroke();` (keep
  `lastCell.current = cell;` and `applyAt(cell, erase)`; note `applyAt` for the
  fill/picker tools should NOT be wrapped in a stroke — see below).
- `onPointerMove`: change the guard to
  ```ts
  if (!dragging.current || !cell) return;
  if (e.buttons === 0) { // canceled pointer: stop painting
    dragging.current = false;
    useStore.getState().endStroke();
    return;
  }
  ```
  (keep the rest: the fill/picker tools return early; pencil/eraser drawLine).
- `onPointerUp`: replace `setDragging(false)` with
  ```ts
  dragging.current = false;
  lastCell.current = null;
  useStore.getState().endStroke();
  ```
- Add a new handler next to `onPointerUp`:
  ```ts
  onPointerCancel={() => {
    dragging.current = false;
    lastCell.current = null;
    useStore.getState().endStroke();
  }}
  ```
- The fill tool fires only in `applyAt` on pointerdown (a single commit). To keep
  fill as ONE normal history entry, make `onPointerDown` call `beginStroke()` ONLY
  for pencil/eraser:
  ```ts
  if (tool === "pencil" || tool === "eraser") useStore.getState().beginStroke();
  ```
  and set `dragging.current = true` unconditionally (fill/picker don't paint on
  move anyway; endStroke is a no-op if beginStroke never ran).
- Play interval: change deps to `[playing, sprite?.id]` and read the length inside
  the tick:
  ```ts
  const id = setInterval(() => {
    const st = useStore.getState();
    const len = st.activeSprite()?.frames.length ?? 0;
    if (len < 2) return;
    st.selectFrame((st.activeFrameIndex + 1) % len);
  }, 220);
  ```
  (the `if (!playing || !sprite || sprite.frames.length < 2) return;` guard above
  it can stay as-is).

**Verify**: `npx tsc -b --pretty false` → exit 0.

### Step 3: TilemapPanel — Map lookup + coalesced paint drags

In `src/components/TilemapPanel.tsx`:
- At the top of the draw effect body, add
  `const spriteById = new Map(project.sprites.map((sp) => [sp.id, sp]));`
  and replace the per-cell `project.sprites.find((sp) => sp.id === id)` with
  `const sprite = spriteById.get(id);`
- Wrap paint drags: in `onPointerDown` after computing `painting.current`, add
  `useStore.getState().beginStroke();` (only when a paint/erase will actually
  happen — i.e. after the cell check passes); in `onPointerUp` and add
  `onPointerCancel` (mirroring the existing pointerup) call
  `useStore.getState().endStroke();`. Keep the existing `painting` ref semantics.

**Verify**: `npm run lint && npm run typecheck && npm run build` → all exit 0.

### Step 4: Static behavior audit (no test runner — read the diff)

Re-read your diff and confirm each of these holds (state each in NOTES):
1. Single click with pencil = exactly ONE new history entry (beginStroke pushed the
   base; the click's commit skipped history; endStroke saved).
2. A 30-segment drag = exactly ONE new history entry.
3. Fill tool = exactly ONE history entry (normal commit path, no beginStroke).
4. Agent tool calls (not touched here) still produce one entry each.
5. Undo after a stroke restores the pre-stroke canvas; redo re-applies it.
6. `endStroke` without a preceding `beginStroke` is a safe no-op.

**Verify**: `git diff` read in full; gates re-run → exit 0.

## Test plan

Deferred by maintainer decision. Future targets: history-entry-count assertions
around simulated drags; pointercancel resets.

## Done criteria

- [ ] `grep -n "beginStroke\|endStroke" src/store/projectStore.ts` → interface +
      implementation + flag handling
- [ ] `grep -n "onPointerCancel" src/components/CanvasStage.tsx src/components/TilemapPanel.tsx`
      → 2 matches
- [ ] `grep -n "useState(false)" src/components/CanvasStage.tsx` → 0 matches
      (dragging is a ref now)
- [ ] `grep -n "spriteById" src/components/TilemapPanel.tsx` → ≥ 2 matches
- [ ] All gates exit 0; diff limited to the three in-scope files

## STOP conditions

- You find that `commit`'s `extra` parameter carries `past`/`future` keys from any
  caller (it doesn't today — verify with `grep -n "commit(next, {" src/store/projectStore.ts`;
  if a caller passes history fields, STOP — coalescing would corrupt history).
- Undo/redo semantics would change for agent tools or single clicks (audit Step 4
  items 3-5; if any fails structurally, STOP).

## Maintenance notes

- Any NEW drag-painting surface (e.g. a line/rect tool) must use the
  beginStroke/…/endStroke pattern — one history entry per gesture.
- `strokeActive` intentionally does not survive page unload; a mid-stroke refresh
  just loses the in-progress stroke (same as today).
