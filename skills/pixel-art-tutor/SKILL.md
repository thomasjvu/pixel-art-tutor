# Pixel Art Tutor — agent skill

A WebMCP pixel-art studio where humans and AI agents co-edit one canvas in
real time. 43 imperative tools (`src/webmcp/registerTools.ts`) + 1
declarative form tool (`request_new_sprite` in `SpritesPanel.tsx`).
Fresh starts open a blank 256×256 canvas; the starter world lives under
File > Open starter world.

## Shared-state rule

The app is local-only unless a room is configured and joined. `SOLO STUDIO` in the header
means the current browser profile is editing its own localStorage; another browser or agent
session will not see those edits. Before promising live visibility, confirm the header shows
`N IN ROOM` and the Room panel lists the other participant.

## Starting the app

```bash
npm run dev        # http://localhost:3000 (standalone editor)
```

For synchronous co-editing (human sees your cursor + edits live):

```bash
npm run room:dev                                             # room server on :1999
VITE_PARTYKIT_HOST=http://127.0.0.1:1999 npm run dev -- --host 127.0.0.1
```

Both commands must stay running. Start/restart Vite after setting `VITE_PARTYKIT_HOST` because
Vite injects that value at startup. Then create/join a room in the Room panel and share the
exact `?room=<id>` URL (including the same app origin) with the human.
The Room panel also refreshes an **Active rooms** directory so collaborators can see live rooms and
join with one click; it lists metadata only and requires the configured room worker.
`RoomBridge.tsx` broadcasts your selected companion's presence (cursor, progress,
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

Room checklist before editing:

- `room:dev` is running and the Vite process has `VITE_PARTYKIT_HOST` set.
- Both participants opened the same `?room=<id>` link.
- The header says `N IN ROOM`, and Room lists the other participant.
- The agent has checked **I'm an agent (selected companion)**; the human can check
  **Follow selected companion's view** to follow active sprite/frame work.

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
   tilemap. Ground every session here, then check the room status before making
   any claim about what the human can see.
2. `read_sprite` to see art: ASCII `rows` + `legend` (`.` = transparent,
   other chars index into the 64-symbol palette alphabet).
3. Paint with `set_pixels` (batch up to 4096/ call), `fill_region` for base
   shapes, `flood_fill` for bucket fills. Colors accept palette index, hex
   (auto-added to palette, index returned), `'transparent'`, or `null`.
   Every mutating tool writes through the same store as the human UI. `set_pixels`
   applies every valid requested cell in order, one cell at a time, with roughly
   90ms between room-visible updates. `fill_region` and `flood_fill` perform
   their actual fill operation; `clear_frame` and transforms perform their
   actual clear/transform operation. The complete pixel gesture remains one
   room operation and one undo entry, while its preview streams through
   presence. Use a fill/line-like tool for bulk shapes and `set_pixels` for
   pixel-level drawing. `set_active_sprite` points the human's view at your work.
   The editor also has local project document tabs; only the active tab is room-synced.
   The timeline's Artwork layer can be locked, which blocks both canvas edits and the
   agent's paint/fill/clear/transform tools until it is unlocked. Zoom is an integer
   pixels-per-cell scale and oversized canvases scroll within the stage.
4. `critique_artwork` before/after edits for structured tutor feedback
   (score, color discipline, contrast, outline, symmetry + tips).
5. Animate: `add_frame` (duplicates a frame), `transform_sprite` with
   `frameIndices` (e.g. `shift` `dy:-1` on one frame = bounce/hover).
   The timeline also supports layer create/duplicate/reorder/lock/visibility, cel
   duplication/reorder/linking, and frame tags. WebMCP exposes `add_layer`,
   `duplicate_layer`, `move_layer`, `set_layer_properties`, `link_frame`, and
   `unlink_frame`; `get_project_state` returns layer metadata, frame link ids, and tags.
   Playback is controlled by forward/reverse/ping-pong mode, FPS, and an optional tag range.
6. Colors and editor modes: palette entries preserve alpha and can be copied, pasted, reordered,
   and resized visually in the palette panel. WebMCP exposes `set_palette_alpha` and
   `move_palette_color`. The canvas offers pixel-perfect stroke, shading
   ink, onion red/blue mode, dither brush, and 3×3 tiled preview. Layer opacity and
   normal/multiply/screen/overlay blend modes are editable in the timeline. `transform_sprite`
   also accepts `rotate` for nearest-neighbor RotSprite-style rotation without resampling the
   sprite dimensions.
   The pixel grid and onion skin start off by default and can be enabled from the editor
   controls when they are useful as references.
   Tool and editor-mode hotkeys are configurable in Edit > Preferences and persist locally.
   The defaults are B/E/G/I/V for the core tools plus Shift+G/O/P/S/T/D for grid, onion,
   pixel-perfect, shading, tiled preview, and dither brush. The timeline is intentionally tall
   enough to keep about two layer rows visible; collapsed toolbar/inspector rails return their
   space to the center canvas.
   The Agent tab checks for a host-provided Codex pet and labels it **Loaded from Codex** when one
   arrives through the app's namespaced browser bridge. Without a host payload, choose one of the
   eight bundled Codex sprite-sheet companions (default: Codex) or **No pet** locally; the selected
   companion speaks the guided tutorial and supplies the agent's display name in room presence.
7. Tiles: `add_sprite` with `kind:"tile"`, `ensure_tilemap`, `place_tile` /
   `fill_tiles`, `get_tilemap` to read the map as ASCII.
8. Fresh starts and guides: `new_canvas` (needs `confirm:true`) resets to a
   blank 256×256 canvas with four empty animation frames by default for everyone
   in a connected room; pass `frameCount` to choose another count. In solo mode
   it only resets the current browser. The default is a 256×256 logical grid at
   1px per cell; zoom remains editable. `start_tutorial` /
   `tutorial_goto` drive the shared guided-tour overlay step by step — pair
   each step with a live demo, ending in a first project together.
   `end_tutorial` closes your overlay when done (following humans dismiss
   their own copy; dismissed steps never reopen).
9. Named library: `rename_project` titles the piece (e.g.
   `guided-tutorial-01`, or ask the human); `save_project` snapshots it to
   the current browser's on-device library and `open_project` (needs
   `confirm:true`) restores one. The named library itself is not room-synced;
   the resulting project change is synced when connected. `save_palette` is
   also local; `apply_palette` merges (existing indices never move).
   `get_project_state` lists saved names from the current browser profile.
10. Manage: `rename_sprite`, `add_palette_color`, `replace_color`,
   `clear_frame`, `delete_frame` (needs `confirm:true`, refuses the last
   frame), `export_project` / `import_project`.

The File menu accepts one or multiple raster images as sprite cels. Share > Share project creates
a project permalink with native device sharing and handoffs for X, Reddit, Threads, Instagram,
WhatsApp, and email; Instagram uses copy/native sharing because it has no web composer. The Export menu can produce individual PNG frames, an animated GIF, a texture atlas + JSON,
engine packs, and the project JSON used by external asset-pipeline scripts. Data recovery is
available from the status bar when local storage rejects a project; actual Aseprite CLI
conversion remains an external pipeline concern.

## Gotchas

- New character sprites start with **4 frames** (all empty). Pass an explicit
  `frameCount` when a different animation length is intended; items and tiles
  default to one frame. After `add_sprite`, check frame fill with `read_sprite`
  per frame so the agent can make each cel intentional.
- Pixel data is ASCII rows over a 64-symbol alphabet; first 36 symbols keep
  base-36 compatibility (`src/engine/pixels.ts`).
- Project JSON limit 4,000,000 chars; compact 256×256 share-link hash limit 2,200,000
  (`src/projectLimits.ts`).
- Tool registrations are tied to an `AbortController` — React StrictMode
  remounts re-register; a missing `document.modelContext` means the browser
  has no WebMCP (UI shows `unsupported`, app still works standalone).
- Room presence is display state, not auth; room links are bearer links.
- The Active rooms directory is advisory: it lists only rooms with live connections and never
  contains project pixels. It may be briefly stale while a room's activity lease expires.
  Tick “I'm an agent (your companion)” in the Room panel so the room always shows
  the selected companion's AGENT tag, even while idle (otherwise you look HUMAN between calls).
- `SOLO STUDIO` means no live peer can see the current edits. Use the room
  checklist above or export/import the project before reporting success.
  Rate limits: 16 connections/room, 30 edits + 120 presence msgs per 10s
  per connection.
