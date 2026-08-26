# AGENTS.md

## What this is

A WebMCP pixel-art studio: humans and AI agents co-edit one canvas in real time.
The agent surface is 21 tools registered in `src/webmcp/registerTools.ts`, plus
1 declarative form tool in `src/components/SpritesPanel.tsx`.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start Vite dev server |
| `npm run lint` | Lint with oxlint |
| `npm run typecheck` | Typecheck via `tsc -b` (project references) |
| `npm run build` | Typecheck + vite production build |

Run lint + typecheck + build before declaring any change done.

## Architecture map

- `src/engine/` — pure pixel/color/critique logic (no DOM, no store imports).
- `src/store/` — zustand stores: `projectStore` is the single source of truth
  for project data; `editorStore`/`uiStore` hold UI state.
- `src/webmcp/registerTools.ts` — the 21 agent tools. Single file by design;
  it is the app's showcase.
- `src/components/` — React UI.

Rules:

- UI components must mutate project data only through `useStore` actions
  (never edit `project` state directly).
- Agent tools must go through the same store actions so edits are undoable
  and visible.

## Settled decisions (do not relitigate in drive-by edits)

- Tools return `{ok:false, error}` objects instead of throwing.
- Pixel data is ASCII rows of base-36 palette indices for agent token economy.
- Project persists to localStorage key `pixel-art-tutor.project.v1`.
- Undo history is in-memory only.
- Tool registrations are tied to an AbortController so React unmount unregisters.

## Gotchas

- `document.modelContext` may be undefined (browsers without WebMCP).
- Tool registration is aborted on React unmount (StrictMode remounts are
  expected and handled).
- localStorage hydration must stay defensive.
