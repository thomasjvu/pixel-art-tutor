# Plan 010: `ensure_tilemap` agent tool — agents can create the map themselves

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. Touch only the files
> listed as in scope. If any STOP condition occurs, stop and report. Do not
> improvise. Commit per the git workflow section. SKIP any instruction to update
> `plans/README.md` — your reviewer maintains the index.

## Status

- **Priority**: P2 (direction)
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001, 003; ideally after 005 (input hardening conventions)
- **Category**: direction
- **Planned at**: no VCS at planning time; base = plan 001's initial commit

## Why this matters

`get_tilemap` currently fails on blank projects with *"no tilemap exists yet; ask
the human to open the Map tab"* — the agent must stop and beg the human mid-session,
which reads as broken in a demo. Meanwhile the validated, clamped store action the
human button calls (`ensureTilemap(cols, rows)`) already exists. The README's
headline agent prompt — "Create a lava tile and paint a danger zone in the map" —
is unreachable on any project created via "New blank" until a human clicks first.
This closes the asymmetry with a thin additive tool.

## Current state

- `src/webmcp/registerTools.ts` — `get_tilemap`'s execute begins:
  ```ts
  const tm = st.project.tilemap;
  if (!tm) return { ok: false, error: "no tilemap exists yet; ask the human to open the Map tab" };
  ```
- `src/store/projectStore.ts` — `ensureTilemap(cols, rows)`: clamps 2–64, preserves
  overlapping cells on resize, commits once. Already on the `ProjectState` interface.
- Tool registration pattern (match exactly): the `tools` array in
  `registerTutorTools()`; each entry built with `defineTool<I>({ name, title,
  description, inputSchema, annotations?, execute })`. `log(tool, summary)` records
  agent activity. README's tool table (`README.md` "Tool catalog") lists 16
  imperative tools — a new tool means the count and table need updating.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` (or `npx tsc -b --pretty false`) | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**:
- `src/webmcp/registerTools.ts` (new tool + `get_tilemap` error copy)
- `README.md` (tool table: add row, update count 16 → 17 and any prose mention)

**Out of scope**:
- Auto-creating tilemaps inside `place_tile`/`fill_tiles` (explicit tool only).
- Any store change (`ensureTilemap` is reused as-is).
- `src/components/AgentPanel.tsx` example prompts (unchanged; they already assume
  this capability).

## Git workflow

- Branch: `advisor/010-ensure-tilemap-tool`, branched on the approved head.
- One commit: `feat: ensure_tilemap agent tool`.

## Steps

### Step 1: Register the tool

In the `tools` array, immediately after the `get_tilemap` entry, add:

```ts
defineTool<{ cols: number; rows: number }>({
  name: "ensure_tilemap",
  title: "Create or resize tilemap",
  description:
    "Create the project tilemap (or resize it, preserving overlapping cells) so tiles can be placed. Cols/rows are clamped to 2-64; default to 12x9 when unsure. No-ops with ok:true if the map already has these dimensions.",
  inputSchema: {
    type: "object",
    properties: {
      cols: { type: "number", description: "Map width in tiles (2-64)" },
      rows: { type: "number", description: "Map height in tiles (2-64)" },
    },
    required: ["cols", "rows"],
  },
  execute: ({ cols, rows }) => {
    const st = useStore.getState();
    const before = st.project.tilemap;
    st.ensureTilemap(Math.round(cols), Math.round(rows));
    const after = useStore.getState().project.tilemap;
    const created = !before && !!after;
    log("ensure_tilemap", created ? `created ${after?.cols}x${after?.rows}` : `ensured ${after?.cols}x${after?.rows}`);
    return {
      ok: true,
      created,
      size: after ? `${after.cols}x${after.rows}` : null,
      note: created ? "tilemap created" : "tilemap already existed or was resized",
    };
  },
}),
```

### Step 2: Update the `get_tilemap` error copy

Replace the error string with:
```ts
return { ok: false, error: "no tilemap exists yet; call ensure_tilemap first to create one" };
```

**Verify** (after Step 1): `npx tsc -b --pretty false` → exit 0.

### Step 3: Update README

In `README.md`'s "Tool catalog" table, add a row after `get_tilemap`:

```
| `ensure_tilemap` | write | Create/resize the tilemap (clamped 2–64) |
```

Update the count: the intro says "Tool catalog (16 tools)" — change to 17, and
update any other "16 tools" prose (grep for `16 tools` / `16 imperative`).

**Verify**: `grep -n "ensure_tilemap" README.md` → ≥ 1; `grep -cn "16 tools" README.md`
→ 0.

### Step 4: Gates

**Verify**: `npm run lint && npm run typecheck && npm run build` → all exit 0.

## Test plan

None — maintainer deferred tests. Reviewer will verify live via
`document.modelContext.executeTool` in a browser.

## Done criteria

- [ ] `grep -n "ensure_tilemap" src/webmcp/registerTools.ts` → tool name + log call
- [ ] `grep -n "ask the human to open the Map tab" src/webmcp/registerTools.ts` → 0 matches
- [ ] README table has the new row; counts updated to 17
- [ ] All gates exit 0; diff limited to `registerTools.ts` + `README.md`

## STOP conditions

- The `tools` array structure has drifted from the pattern shown (e.g. plan 011
  already landed different tool additions — then just match the CURRENT pattern).

## Maintenance notes

- Tool-count prose in README must be updated whenever a tool is added — consider
  dropping exact counts in favor of "16+" style if this churns again.
