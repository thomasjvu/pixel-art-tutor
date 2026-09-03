# Pixel Art Tutor — agent skill

A WebMCP pixel-art studio where humans and AI agents co-edit one canvas in
real time. 30 imperative tools (`src/webmcp/registerTools.ts`) + 1
declarative form tool (`request_new_sprite` in `SpritesPanel.tsx`).
Fresh starts open a blank 64×64 canvas; the starter world lives under
File > Open starter world.

## Starting the app

```bash
npm run dev        # http://localhost:3000 (standalone editor)
```

For synchronous co-editing (human sees your cursor + edits live):

```bash
npm run room:dev                                             # room server on :1999
VITE_PARTY_HOST=http://127.0.0.1:1999 npm run dev -- --host 127.0.0.1
```

Then create/join a room in the Room panel and share the `?room=<id>` URL.
`RoomBridge.tsx` broadcasts your Pixel Bot presence (cursor, progress,
status message) to every peer; `CanvasStage.tsx` renders it. With follow
mode on (Room panel, default), peers' editors jump to the sprite/frame you
are working on, so humans watch you draw instead of finding it later.
Joining a room replaces the joiner's local view with the room snapshot, so
late joiners still see everything you made. The Room panel lists everyone
present with HUMAN/AGENT badges, live status, current tool and message;
the Agent tab keeps a persistent activity feed of remote agent calls.

Without a room, each browser has its own `localStorage`
(`pixel-art-tutor.project.v1`) — your edits stay in your window. To hand a
project to a human outside a room, use `export_project` and have them import
the JSON (Sprites panel > Project file > Import) or open a `#p=…` permalink.

## Calling the tools (important calling convention)

`document.modelContext.executeTool` takes the tool dictionary object and a
**JSON string** — not a JS object — and resolves with a **JSON string**:

```js
const tools = await document.modelContext.getTools();
const call = async (name, input) => {
  const tool = tools.find((t) => t.name === name);
  const raw = await document.modelContext.executeTool(tool, JSON.stringify(input ?? {}));
  try { return JSON.parse(raw); } catch { return raw; }
};

const state = await call("get_project_state", {});
```

Passing a plain object as the second argument fails with
`Failed to parse input arguments`. (The bundled `webmcp-types` definitions
only declare `registerTool`/`getTools`; `executeTool` exists at runtime in
WebMCP-enabled Chromium.) Tools return `{ ok: false, error }` on failure
instead of throwing — read `error` and self-correct.

Access paths: in-page JS (as above), ChatGPT's in-app browser, Chrome with
`chrome://flags/#enable-webmcp-testing`, or the Model Context Tool Inspector
extension for manual calls.

## Workflow

1. `get_project_state` first — palette indices, sprites, active sprite/frame,
   tilemap. Ground every session here.
2. `read_sprite` to see art: ASCII `rows` + `legend` (`.` = transparent,
   other chars index into the 64-symbol palette alphabet).
3. Paint with `set_pixels` (batch up to 4096/ call), `fill_region` for base
   shapes, `flood_fill` for bucket fills. Colors accept palette index, hex
   (auto-added to palette, index returned), `'transparent'`, or `null`.
   Every mutating tool writes through the same store as the human UI, so
   edits are instantly visible, animated via the Pixel Bot cursor, undoable,
   and autosaved. Paints animate in ~160 steps (small ones pixel by pixel)
   and the growing preview streams to the room with presence, so watchers
   see each pixel land before the commit. `set_active_sprite` points the
   human's view at your work.
4. `critique_artwork` before/after edits for structured tutor feedback
   (score, color discipline, contrast, outline, symmetry + tips).
5. Animate: `add_frame` (duplicates a frame), `transform_sprite` with
   `frameIndices` (e.g. `shift` `dy:-1` on one frame = bounce/hover).
6. Tiles: `add_sprite` with `kind:"tile"`, `ensure_tilemap`, `place_tile` /
   `fill_tiles`, `get_tilemap` to read the map as ASCII.
7. Fresh starts and guides: `new_canvas` (needs `confirm:true`) resets to a
   blank 64×64 canvas for everyone in the room; `start_tutorial` /
   `tutorial_goto` drive the shared guided-tour overlay step by step — pair
   each step with a live demo, ending in a first project together.
   `end_tutorial` closes your overlay when done (following humans dismiss
   their own copy; dismissed steps never reopen).
8. Named library: `rename_project` titles the piece (e.g.
   `guided-tutorial-01`, or ask the human); `save_project` snapshots it to
   the on-device library and `open_project` (needs `confirm:true`) restores
   one — both undoable and room-synced. `save_palette` / `apply_palette`
   do the same for color palettes; apply merges (existing indices never
   move). `get_project_state` lists all saved names for discovery.
7. Manage: `rename_sprite`, `add_palette_color`, `replace_color`,
   `clear_frame`, `delete_frame` (needs `confirm:true`, refuses the last
   frame), `export_project` / `import_project`.

## Gotchas

- New character sprites start with **2 frames** (second one empty). After
  `add_sprite`, check frame fill with `read_sprite` per frame; delete the
  empty one before `add_frame`, or your animation will blink empty.
- Pixel data is ASCII rows over a 64-symbol alphabet; first 36 symbols keep
  base-36 compatibility (`src/engine/pixels.ts`).
- Project JSON limit 4,000,000 chars; share-link hash limit 180,000
  (`src/projectLimits.ts`).
- Tool registrations are tied to an `AbortController` — React StrictMode
  remounts re-register; a missing `document.modelContext` means the browser
  has no WebMCP (UI shows `unsupported`, app still works standalone).
- Room presence is display state, not auth; room links are bearer links.
  Tick “I'm an agent (Pixel Bot)” in the Room panel so the room always shows
  your AGENT tag, even while idle (otherwise you look HUMAN between calls).
  Rate limits: 16 connections/room, 30 edits + 120 presence msgs per 10s
  per connection.
