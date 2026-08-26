# Plan 004: Validate untrusted project JSON at both ingest points + ErrorBoundary backstop

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. Touch only the files
> listed as in scope. If any STOP condition occurs, stop and report. Do not
> improvise. Commit per the git workflow section. SKIP any instruction to update
> `plans/README.md` — your reviewer maintains the index.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (over-strict validation could reject projects the old code tolerated —
  mitigated by the repair-first policy below)
- **Depends on**: plans/001-git-init.md (worktree base); plan 003 recommended (gates)
- **Category**: bug / security
- **Planned at**: commit `78aad52`, 2026-08-26 (historical branch plan; reapply to the current checkout)

## Why this matters

The app hydrates project data from localStorage at boot and imports project JSON
from uploaded files, but validates neither: `loadStored()` checks only
`schemaVersion === 1 && Array.isArray(sprites)`. A corrupted or hostile payload with
`{schemaVersion:1, sprites:[{id:"a"}]}` (missing `frames`) crashes `FramesPanel`
(`sprite.frames.map` on undefined) the moment React mounts. Because all five tab
panels stay mounted (inactive tabs are only CSS-hidden) and there is no error
boundary, this is a white screen — and since the poison stays in localStorage, every
reload white-screens again. The in-app reset/import UI never mounts, so there is no
recovery short of manually clearing site data.

## Current state

- `src/store/projectStore.ts:44-57` — the boot ingest:
  ```ts
  function loadStored(): Project | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Project;
      if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.sprites)) return null;
      return parsed;
    } catch {
      return null;
    }
  }
  ```
- `src/store/projectStore.ts:505-512` — the import ingest:
  ```ts
  loadProject(p) {
    if (p.schemaVersion !== 1 || !Array.isArray(p.sprites) || !p.sprites.length) return;
    commit(cloneProject(p), {
      activeSpriteId: p.sprites[0].id,
      activeFrameIndex: 0,
      selectedTileId: null,
    });
  },
  ```
  It silently no-ops on bad input — `src/components/SpritesPanel.tsx` (Import file
  input, onChange handler) only alerts on `JSON.parse` failure, so a schema-wrong
  file gives zero feedback.
- `src/store/projectStore.ts:526-531` — boot IIFE:
  ```ts
  (() => {
    const s = useStore.getState();
    if (!s.project.sprites.some((sp) => sp.id === s.activeSpriteId)) {
      useStore.setState({ activeSpriteId: s.project.sprites[0]?.id ?? "" });
    }
  })();
  ```
  (`.some((sp) => sp.id)` throws if a sprites entry is null — fixed for free once
  sanitize runs first.)
- `src/main.tsx` (whole file):
  ```tsx
  import { StrictMode } from "react";
  import { createRoot } from "react-dom/client";
  import "./index.css";
  import App from "./App.tsx";

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  ```
- `src/types.ts` — the target shapes: `Frame {id: string; pixels: number[]}`;
  `Sprite {id; name; width; height; kind: "character"|"item"|"tile"; frames: Frame[]}`;
  `TilemapData {cols; rows; cells: (string|null)[]}`; `Project {schemaVersion: 1;
  name; palette: string[]; sprites: Sprite[]; tilemap: TilemapData | null}`.
  `MAX_PALETTE` is 64 and sprite dims are clamped 1–64 elsewhere in the store.
- Conventions: `src/engine/` holds pure logic with no DOM/store imports — the
  validator belongs there. Error style for ingest: return `null` / error string,
  never throw (matches `loadStored`).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` (or `npx tsc -b --pretty false` if 003 not landed) | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**:
- `src/engine/validate.ts` (create — pure sanitizer)
- `src/store/projectStore.ts` (use sanitizer in `loadStored` and `loadProject`;
  change `loadProject` return to a result object)
- `src/components/SpritesPanel.tsx` (surface `loadProject` errors via `alert`)
- `src/App.tsx` (wrap app in an ErrorBoundary)
- `src/components/ErrorBoundary.tsx` (create — class component, the one idiomatic
  React error-boundary form)

**Out of scope**:
- Any WebMCP tool input validation (separate plan 005).
- Changing the `Project` schema/version, the localStorage key, or any renderer.
- Adding tests (maintainer deferred).

## Git workflow

- Branch: `advisor/004-sanitize-project-json`, branched on the approved head.
- One commit: `fix: sanitize untrusted project JSON and add ErrorBoundary backstop`.

## Steps

### Step 1: Create `src/engine/validate.ts` with `sanitizeProject`

Export `sanitizeProject(raw: unknown): Project | null`. Policy: **repair when cheap,
drop broken sprites, reject only when the skeleton is unusable**. Requirements:

1. Reject (return `null`) unless `raw` is an object with `schemaVersion === 1`,
   `name` a string (default `"Untitled"` if empty), `palette` an array, `sprites`
   a non-empty array.
2. Palette: keep only entries where `typeof e === "string"` and
   `/^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/.test(e)` (normalize 3-digit to 6-digit by
   expansion), cap at 64 entries; if fewer than 1 valid color remains, reject.
3. Per sprite: must be an object with string `id` (non-empty), string `name`
   (default `"Untitled"`), `kind` one of the three literals (default `"item"`),
   `width`/`height` finite numbers clamped to 1–64, `frames` a non-empty array.
   Drop the sprite if any of those fail.
4. Per frame: object with `pixels` array. Repair pixels to exactly
   `width * height` entries: pad with `-1` (transparent) or truncate; coerce each
   entry with `Number.isInteger(p) ? p : -1`, then clamp to the range
   `[-1, palette.length - 1]` (out-of-range indices become `-1`). Frame `id`: keep
   if string, else synthesize `${spriteId}-f${index}`.
5. Tilemap: if `tilemap` is null/undefined → `null`. Else require integer
   `cols`/`rows` in 2–64 and `cells` array of length `cols*rows`; map each cell to
   the sprite id string if that id exists in the sanitized sprite list, else
   `null`. Drop the tilemap (set `null`) if cols/rows/cells are malformed.
6. Return `{ schemaVersion: 1, name, palette, sprites, tilemap }`. If `sprites`
   ended up empty after filtering, reject (`null`).

Style: pure functions, no imports except `types` — match `src/engine/pixels.ts`'s
plain-function style.

**Verify**: `npx tsc -b --pretty false` → exit 0.

### Step 2: Wire the sanitizer into both ingest points

In `src/store/projectStore.ts`:
- `loadStored()`: replace the shallow check with
  `const parsed = sanitizeProject(JSON.parse(raw)); return parsed;`
  (keep the try/catch).
- `loadProject(p)`: change signature usage to
  ```ts
  loadProject(p: unknown): { ok: true } | { ok: false; error: string } {
    const sanitized = sanitizeProject(p);
    if (!sanitized) return { ok: false, error: "not a valid project file (expected schemaVersion 1 with sprites)" };
    commit(sanitized, { activeSpriteId: sanitized.sprites[0].id, activeFrameIndex: 0, selectedTileId: null });
    return { ok: true };
  },
  ```
  Update the `ProjectState` interface's `loadProject` declaration to match.

**Verify**: `npx tsc -b --pretty false` → exit 0 (this will fail until Step 3 fixes
the caller — that's expected mid-step).

### Step 3: Surface import errors in the UI

In `src/components/SpritesPanel.tsx`, the Import input's `onChange` currently does:
```ts
file.text().then((t) => {
  try {
    useStore.getState().loadProject(JSON.parse(t));
  } catch {
    alert("That doesn't look like a valid project file.");
  }
});
```
Change to:
```ts
file.text().then((t) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(t);
  } catch {
    alert("That doesn't look like a valid project file.");
    return;
  }
  const result = useStore.getState().loadProject(parsed);
  if (!result.ok) alert(`Could not import project: ${result.error}`);
});
```

**Verify**: `npx tsc -b --pretty false` → exit 0.

### Step 4: Add the ErrorBoundary backstop

Create `src/components/ErrorBoundary.tsx` — a minimal class component:
```tsx
import { Component, type ReactNode } from "react";

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: "monospace" }}>
          <h2>Something broke while rendering.</h2>
          <p>{this.state.error.message}</p>
          <button onClick={() => {
            localStorage.removeItem("pixel-art-tutor.project.v1");
            location.reload();
          }}>
            Reset project and reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```
Wrap in `src/main.tsx`: `<StrictMode><ErrorBoundary><App /></ErrorBoundary></StrictMode>`.

**Verify**: `npm run build` → exit 0.

### Step 5: Manual smoke of the sanitizer path (no test runner — do it in the browser)

Run `npm run dev` in the worktree, then with any HTTP client or browser tooling
available, or via `node` one-liner against built output is NOT required — instead
do this static check: `grep -n "sanitizeProject" src/store/projectStore.ts` shows
both ingest points call it. Then confirm the dev server boots:
`npm run dev & sleep 3 && curl -s http://localhost:5173 | grep -o "<title>[^<]*" | head -1`
→ includes `Pixel Art Tutor`. Kill the dev server afterwards.

**Verify**: title check passes; no orphaned vite process
(`pkill -f "vite" || true` at the end).

## Test plan

Deferred by maintainer decision. Note for the future: `sanitizeProject` is pure and
is the single highest-value future unit-test target (repair policy, clamping, sprite
filtering).

## Done criteria

- [ ] `grep -n "sanitizeProject" src/store/projectStore.ts` → 2 call sites
- [ ] `grep -n "schemaVersion !== 1" src/store/projectStore.ts` → 0 matches (shallow
      checks are gone)
- [ ] `loadProject` returns a result object; `SpritesPanel.tsx` handles `!result.ok`
- [ ] `src/components/ErrorBoundary.tsx` exists; `main.tsx` wraps `<App />`
- [ ] `npm run lint`, `npm run typecheck` (or `npx tsc -b`), `npm run build` all exit 0
- [ ] `git diff --stat` vs base shows only the five in-scope files

## STOP conditions

- The sanitizer would reject the CURRENT starter project (it must accept it —
  mentally trace `createStarterProject()` output through every rule in Step 1
  before finishing; if you find a rule that rejects it, fix the rule, and if the
  two conflict irreconcilably, STOP).
- Any renderer or tool file needs changes to keep compiling (that means the
  sanitizer's output shape drifted from `Project` — do not patch renderers; report).
- A gate fails twice after a reasonable fix attempt.

## Maintenance notes

- Any new ingest path (URL import, clipboard paste, plan 013's permalink) MUST call
  `sanitizeProject` — it is the single trust boundary for project data.
- The ErrorBoundary is a backstop, not a strategy: if it ever fires, that's a bug
  the sanitizer should have prevented.
