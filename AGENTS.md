# AGENTS.md

## What this is

A WebMCP pixel-art studio: humans and AI agents can co-edit one canvas in real time.
The agent surface is a set of imperative tools registered in `src/webmcp/registerTools.ts`,
plus 1 declarative form tool in `src/components/SpritesPanel.tsx`.

Important: two windows on the same localhost URL are not automatically in the same
workspace. Without a connected room, each browser profile has its own localStorage project.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start Vite dev server |
| `npm run room:dev` | Start the local PartyServer room worker on port 1999 |
| `./start.sh` | Start Vite and the local room worker together with sync enabled |
| `./start.sh --solo` | Start Vite without room synchronization |
| `VITE_PARTYKIT_HOST=http://127.0.0.1:1999 npm run dev -- --host 127.0.0.1` | Start Vite with room sync enabled |
| `npm run deploy` | Build and deploy the Vite app plus PartyServer Worker to Cloudflare and the configured custom domain |
| `npm run lint` | Lint with oxlint |
| `npm run typecheck` | Typecheck via `tsc -b` and the worker project |
| `npm run build` | Typecheck + vite production build |

Run lint + typecheck + build before declaring any change done.

## Architecture map

- `src/engine/` — pure pixel/color/critique logic (no DOM, no store imports).
- `src/store/` — zustand stores: `projectStore` is the single source of truth
  for project data; `editorStore`/`uiStore` hold UI state.
- `src/webmcp/registerTools.ts` — the 43 imperative agent tools. Single file by design;
  it is the app's showcase.
- `src/pets/` — the optional Codex-pet host bridge, local companion catalog, and selection types.
- `src/realtime/` — optional PartySocket room sync, snapshots, edit history, presence, and the active-room directory client.
- `partykit/server.ts` — room Durable Object plus the lightweight active-room directory.
- `src/components/` — React UI.

Rules:

- UI components must mutate project data only through `useStore` actions
  (never edit `project` state directly).
- Agent tools must go through the same store actions so edits are undoable
  and visible.

## Shared-room contract

Use a room whenever a human should see an agent's edits live:

1. Run `npm run room:dev` and keep it running.
2. Start or restart Vite with `VITE_PARTYKIT_HOST=http://127.0.0.1:1999`.
3. Have both windows open the same app origin and the same `?room=<id>` URL.
   Create a room in the Room panel, then use **Share link** for the other participant. The
   Room panel's **Active rooms** list shows rooms with live collaborators and joins one click.
4. Confirm the header says `N IN ROOM` and the Room panel lists the other peer as present.
   `SOLO STUDIO` means edits are local to that browser and are not visible elsewhere.
5. The agent should enable **I'm an agent (selected companion)**; the human should enable
   **Follow selected companion's view** when they want the canvas to follow agent actions.

If a room cannot be used, hand off with `export_project` / `import_project` or a `#p=...`
share permalink. Do not claim a local-only mutation is visible to another window.

## WebMCP test contract

In WebMCP-enabled Chromium, `getTools()` returns registered tool dictionaries and the
runtime `executeTool` method expects a JSON string, not a JavaScript object. It resolves
with a JSON string:

```js
const tools = await document.modelContext.getTools();
const tool = tools.find((t) => t.name === "get_project_state");
const raw = await document.modelContext.executeTool(tool, JSON.stringify({}));
const state = JSON.parse(raw);
```

Call `get_project_state` first, then verify room connectivity before mutating. Tool failures
are structured `{ ok: false, error }` results and should be handled without assuming a write
occurred.

## Codex pet contract

Codex pets are optional presentation state, not project data. The app listens for the namespaced
`pixel-art-tutor:codex-pet` / `codex:pet` browser events and matching `postMessage` responses, and
also checks `window.__CODEX_PET__`, `window.__CODEX_PETS__.selected`, `window.codex.pet`, and
`window.openai.pet` when available. A host payload is normalized before display and is persisted
locally as the selected companion; no payload means the Agent tab offers local companions or
**No pet**. Do not claim that a Codex pet was auto-loaded unless the UI says **Loaded from Codex**.
The guided tutorial speaker and idle AGENT room presence use the selected companion's name.
The app also vendors the eight real Codex sprite sheets in `public/codex-pets/` and defaults to the
`codex` sheet; these are labeled **Built-in Codex pet** because an arbitrary browser app cannot read
the user's private desktop/CLI pet selection. `VITE_CODEX_PET` selects one of those bundled ids at
build time. Keep host-provided payloads and local fallback selection visibly distinct.

## Agent paint and canvas contract

- `CanvasStage` chooses one integer display cell size for both the canvas backing store and
  its CSS box. Never reintroduce unconstrained aspect-ratio scaling: neighboring 256×256 grid
  cells must have identical dimensions. The footer reports the active `px / cell` scale.
- `set_pixels` applies every valid requested cell, in order, one cell at a time through the
  normal `useStore` action before updating agent presence. The full gesture is one in-memory
  undo entry and one room operation, so local rendering, remote preview, and the eventual
  canonical commit stay aligned.
- `fill_region` and `flood_fill` use their actual fill actions; `clear_frame` and structural
  tools use their actual clear/transform actions. They do not pretend to be pencil strokes.
- The pixel rhythm is intentionally observable (about 90ms between room-visible updates).
  Reduced-motion users receive one immediate batch. Agents should use fill/line-like tools
  for bulk shapes and `set_pixels` for pixel-level drawing.

## Editor document contract

- Project tabs are local document tabs backed by `useWorkspace`; the active tab is the
  project currently held by `useStore` and is the only document sent through room sync.
- Every sprite is normalized to a persisted layer stack. Layers carry visibility, lock,
  opacity, blend mode, and their own ordered cel list. The first layer remains the
  compatibility `sprite.frames` alias for older tools and exports.
- Timeline rows support create, duplicate, delete, rename, reorder, visibility, lock, cel
  duplication/reorder, linked cels, and animation tags. A linked cel shares subsequent pixel
  edits with its linked group; unlink it before editing independently.
- The selected layer's lock control blocks human canvas edits, selection transforms, and agent
  paint/fill/clear/transform tools until it is unlocked. Layer metadata and cel/tag structure
  are room-safe project operations and are undoable.
- Tags define inclusive frame ranges. Preview supports forward, reverse, and ping-pong playback
  with adjustable FPS; onion skin supports tint and red/blue reference modes.
- Palette entries retain alpha, can be reordered without changing the artwork's colors, and the
  UI supports palette grid sizing, copy/paste, drag/drop, and explicit palette management. The
  current palette may be blank (all opaque pixels are cleared when it is replaced), and saved
  palettes can be blank, used as a replacement/remap, or merged non-destructively. Tiled preview,
  shading ink, and pixel-perfect stroke, dither brush, and RotSprite-style nearest-neighbor
  rotation are editor modes/tools, not changes to the project schema.
- Agents can use `set_palette_alpha` and `move_palette_color` for the same palette operations;
  palette reordering remaps stored indices so pixels keep their visible colors.
- Canvas zoom is an integer pixels-per-cell scale from 1 to 16. The canvas backing store and
  CSS box use the same scale; oversized views scroll inside the stage.
- The pixel grid and onion skin are off by default so a new canvas starts clean; both remain
  available from the toolbar, View menu, timeline, and editor tools.
- Tool and editor-mode shortcuts are editable in Edit > Preferences and persist per browser.
  Defaults are B/E/G/I/V for pencil, eraser, fill, picker, and select; Shift+G/O/P/S/T/D
  toggle grid, onion skin, pixel-perfect stroke, shading ink, tiled preview, and dither brush.
- The timeline reserves 330px on desktop (370px on compact layouts) so roughly two layer rows
  remain visible. Hiding the toolbar or inspector collapses that rail to a 26px reveal tab and
  gives its saved space back to the center editor.
- The inspector opens on the Room panel by default so collaborative room presence and agent status
  are visible immediately; users can switch panels from the native-feeling panel picker.

The File menu imports one or multiple raster images as sprite cels. Share > Share project creates
a lightweight project permalink and offers the device share sheet plus X, Reddit, Threads,
Instagram-friendly copy, WhatsApp, and email handoffs; nothing is posted automatically. The Export menu includes current-frame PNG, horizontal sheet, PNG frame sequence, animated GIF,
texture atlas + JSON, Godot, Unity, and whole-project pack paths. Local autosave keeps a
recoverable copy when a stored project is rejected; the browser app does not pretend to be an
Aseprite CLI.

## Settled decisions (do not relitigate in drive-by edits)

- Tools return `{ok:false, error}` objects instead of throwing.
- Pixel data is ASCII rows using a compact 64-symbol palette alphabet; the first 36 symbols preserve base-36 compatibility.
- Project persists to localStorage key `pixel-art-tutor.project.v1`.
- Connected rooms persist the canonical project snapshot and recent room history on the room server;
  named project/palette libraries remain local to each browser profile.
- Undo history is in-memory only.
- Tool registrations are tied to an AbortController so React unmount unregisters.

## Gotchas

- `document.modelContext` may be undefined (browsers without WebMCP).
- Tool registration is aborted on React unmount (StrictMode remounts are
  expected and handled).
- localStorage hydration must stay defensive (see plan 004's validator once it lands).
- `SOLO STUDIO` is expected without a `?room=` URL and a configured room host; it means
  local-only state, not a failed WebMCP registration.
- Room presence is collaborative display state, not authentication. Room URLs are bearer links.
- Active rooms are an advisory directory of live connections; it exposes room metadata and never
  exposes project pixels. A room disappears after everyone leaves or its short activity lease expires.
- Room sync is optional in standalone development; `npm run dev` by itself does not connect
  to the room worker.
