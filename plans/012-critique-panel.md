# Plan 012: Human-visible Critique panel — the tutor works without an agent connected

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. Touch only the files
> listed as in scope. If any STOP condition occurs, stop and report. Do not
> improvise. Commit per the git workflow section. SKIP any instruction to update
> `plans/README.md` — your reviewer maintains the index.

## Status

- **Priority**: P2 (direction)
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: plans/001, 003
- **Category**: direction
- **Planned at**: no VCS at planning time; base = plan 001's initial commit

## Why this matters

`critiqueSprite` — the engine that scores artwork and produces teaching findings —
is imported exactly once in the codebase: by the `critique_artwork` AGENT tool. A
human's first session with no agent connected (most judges' first five minutes)
never sees the "tutor" do anything; the app's differentiator is invisible without
an agent. A Critique tab makes the concept self-demonstrating, gives the demo video
a narration-free money shot, and reuses work that already exists.

## Current state

- `src/engine/critique.ts` — `critiqueSprite(sprite, palette): CritiqueReport` with
  `{ spriteId, spriteName, score, stats: Record<string, number|string>, findings:
  CritiqueFinding[] }`; `CritiqueFinding = { severity: "info"|"warn"|"error";
  title; detail; tip }`. Pure function.
- `src/App.tsx` — tab system:
  ```ts
  const TABS: { id: Tab; label: string }[] = [
    { id: "palette", label: "Palette" },
    { id: "frames", label: "Frames" },
    { id: "sprites", label: "Sprites" },
    { id: "map", label: "Map" },
    { id: "agent", label: "Agent" },
  ];
  ```
  with a `type Tab = ...` union and per-tab `<div className={tab === "x" ? "tab-body" : "tab-body hidden"}>`
  blocks. All panels stay mounted.
- `src/store/uiStore.ts` — `useUi.getState().pushLog({ tool, summary, source })`
  where `source: "agent" | "app"` — the "app" source exists but is unused so far;
  use it here.
- `src/store/projectStore.ts` — `useStore((s) => s.activeSprite())` selector
  pattern; palette at `s.project.palette`.
- Styling: `src/index.css` uses small utility classes (`.panel`, `.hint`,
  `.mcp-chip`, `.log-list`); dark theme with CSS vars (`--accent-2` green,
  `--warn` sand, `--danger` red).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` (or `npx tsc -b --pretty false`) | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Build | `npm run build` | exit 0 |
| Dev smoke | `npm run dev` then `curl -s http://localhost:5173 | grep -o "<title>[^<]*"` | title renders; kill server after |

## Scope

**In scope**:
- `src/components/CritiquePanel.tsx` (create)
- `src/App.tsx` (new tab entry + tab body)
- `src/index.css` (a few classes for score/severity styling)

**Out of scope**:
- `src/webmcp/registerTools.ts` (the agent tool stays as-is; both call the same
  engine function).
- Any engine/store change.

## Git workflow

- Branch: `advisor/012-critique-panel`, branched on the approved head.
- One commit: `feat: human-facing Critique tab using the tutor engine`.

## Steps

### Step 1: Create `src/components/CritiquePanel.tsx`

A function component that:
- Reads `const sprite = useStore((s) => s.activeSprite());` and
  `const palette = useStore((s) => s.project.palette);`
- Holds `const [report, setReport] = useState<CritiqueReport | null>(null);` and
  re-computes when the active sprite id changes via `useEffect` calling
  `critiqueSprite(sprite, palette)` (import from `../engine/critique`; import the
  `CritiqueReport` type from `../types` — check where `CritiqueReport` is defined;
  it is exported from `src/types.ts`).
- On each run, also `useUi.getState().pushLog({ tool: "critique_artwork", summary:
  `${sprite.name}: ${report.score}/100`, source: "app" });` — wrap in a guard so a
  sprite change doesn't spam the log more than once per sprite id (keep a
  `lastLoggedRef`).
- Renders: sprite name + big score (e.g. `Score 87 / 100`), the `stats` object as
  a definition list, then `findings` as cards: severity badge (error → red,
  warn → sand, info → muted), bold `title`, `detail` paragraph, and
  `Tip: {tip}` line. Empty canvas (score 0) renders the same card list naturally.
- Match existing component style: `export function CritiquePanel()`, `.panel`
  wrapper, `.hint` for footnotes. Add a footnote: "The same analysis your agent
  gets via the critique_artwork tool."

### Step 2: Wire the tab

In `src/App.tsx`: add `| "critique"` to the `Tab` union; insert
`{ id: "critique", label: "Critique" }` into `TABS` between `map` and `agent`;
add the tab body div:
```tsx
<div className={tab === "critique" ? "tab-body" : "tab-body hidden"}>
  <CritiquePanel />
</div>
```
and the import.

**Verify**: `npx tsc -b --pretty false` → exit 0.

### Step 3: Styling

In `src/index.css`, add (matching the existing var-based style):
```css
.critique-score {
  font-size: 22px;
  font-weight: 700;
}

.critique-card {
  border: 1px solid var(--border);
  border-left-width: 3px;
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}

.critique-card.sev-error { border-left-color: var(--danger); }
.critique-card.sev-warn { border-left-color: var(--warn); }
.critique-card.sev-info { border-left-color: var(--border-2); }

.critique-tip {
  color: var(--text-dim);
}
```
Use `sev-${finding.severity}` as the class modifier.

**Verify**: `npm run build` → exit 0.

### Step 4: Smoke

`npm run dev & sleep 3 && curl -s http://localhost:5173 | grep -c root` → non-zero;
then `pkill -f vite || true`.

**Verify**: dev server boots without errors in the log.

## Test plan

None — maintainer deferred tests. Reviewer will eyeball the tab live (starter
Slime should score ~100 with 3 info findings; a blank new sprite scores 0 with the
empty-canvas error finding).

## Done criteria

- [ ] `CritiquePanel` exists and is reachable from a 6th tab labeled "Critique"
- [ ] `grep -n "critiqueSprite" src/components/CritiquePanel.tsx` → 1+ match
- [ ] `grep -n '"critique"' src/App.tsx` → tab entry + body
- [ ] Gates exit 0; diff limited to the three in-scope files

## STOP conditions

- `CritiqueReport`/`CritiqueFinding` types are not exported from `src/types.ts`
  (they are today — if that changed, export them rather than duplicating; STOP if
  the engine signature changed).

## Maintenance notes

- If `critiqueSprite` gains async work later, the panel and the tool both need the
  same loading treatment.
- Keep the panel's log source "app" so demo videos can distinguish human-triggered
  critiques from agent ones in the activity feed.
