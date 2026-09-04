# 🎨 Pixel Art Tutor

**A WebMCP-powered pixel art studio where humans and AI agents co-create sprites, characters, animations, and tilemaps — together, in the same canvas.**

Built for [The WebMCP Challenge](https://webmcp.devpost.com/).

## Why this is a strong WebMCP fit

A pixel art editor is essentially invisible to AI agents: the artwork lives inside a `<canvas>`
element that DOM-scraping agents cannot read or meaningfully manipulate. Without WebMCP, an agent
can only *guess* at what's on screen. With WebMCP, the app exposes its full creative surface as
structured tools — so a person can sketch while their agent critiques, paints, animates, and
teaches, with every change appearing live on both sides.

This is genuine human-agent collaboration: shared state, shared tools, one canvas.

## What humans and agents can do together

- **Tutoring loop**: ask your agent to `critique_artwork` — the app's built-in analysis engine
  scores color discipline, value contrast, outline strength, noise, centering, symmetry and
  animation readiness, then returns structured findings with concrete tips the agent can teach from.
- **Co-creation**: the agent reads the sprite as ASCII rows (`read_sprite`), paints pixels
  (`set_pixels`, `fill_region`), applies transforms (`transform_sprite`: flips, rotate, shift,
  outline), remaps colors, and manages animation frames — while you keep drawing beside it.
  Humans get a Select tool (V): marquee, drag to move, arrows nudge, Delete clears, Esc drops.
- **Human-in-the-loop forms**: the "New sprite" form is also a **declarative WebMCP tool**
  (`request_new_sprite`). An agent can prefill it; you keep the final click. Both WebMCP APIs,
  one app.
- **World building**: agents create tiles (`add_sprite` with kind `tile`), read the map as ASCII
  (`get_tilemap`), and paint regions (`place_tile`, `fill_tiles`) while you paint manually.
- **Studio workflow**: a persistent cel timeline keeps animation frames, onion skin, playback FPS,
  and frame stepping one click away while the inspector keeps sprites, palette, map, tutor, and
  agent windows together.
- **Game-engine handoff**: import PNG/WebP/JPEG art as a palette-backed sprite, export native PNGs
  or horizontal sheets, and download ready-to-drop Godot `.tres` or Unity `.meta` integration files
  alongside the sheet.
- **Live rooms**: open the Room panel to create a shareable room. People see each other's pixel
  cursors, and the selected companion's animated drawing cursor follows WebMCP actions in real time.
  Tick “Follow your companion's view” and your editor jumps to whatever the agent is drawing.
- Share links (`#p=…` permalinks) let anyone open a co-created project with one click.

## The WebMCP implementation

All tools are registered with the imperative API on boot:

```ts
await document.modelContext.registerTool({
  name: "set_pixels",
  description: "Paint specific pixels on a sprite frame…",
  inputSchema: { /* JSON Schema */ },
  execute: async (input) => { /* mutate shared store; return structured result */ },
});
```

### Tool catalog (43 imperative tools)

| Tool | Kind | What it does |
| --- | --- | --- |
| `get_project_state` | read-only | Palette, sprites, active view, tilemap overview |
| `read_sprite` | read-only | Frame as ASCII art rows + color legend |
| `critique_artwork` | read-only | Tutor engine: score, stats, findings, tips |
| `get_tilemap` | read-only | Map grid as ASCII + tile legend |
| `ensure_tilemap` | write | Create/resize the tilemap (clamped 2–64) |
| `export_project` | read-only | Full project JSON |
| `new_canvas` | write | Fresh blank 256×256 logical canvas with 4 empty frames by default (with confirmation) |
| `rename_project` | write | Rename the project |
| `save_project` | write | Save named project to the library |
| `open_project` | write | Open a saved project (with confirmation) |
| `save_palette` | write | Save named palette to the library |
| `apply_palette` | write | Merge a saved palette (non-destructive) |
| `start_tutorial` | write | Open the shared guided-tour overlay at a step |
| `tutorial_goto` | write | Jump the shared guided tour to a step |
| `end_tutorial` | write | Close the guided-tour overlay |
| `import_project` | write | Replace the current project from JSON |
| `set_pixels` | write | Batch pixel painting (hex / palette index / transparent) |
| `fill_region` | write | Rectangle fill |
| `flood_fill` | write | Bucket-fill a connected region |
| `clear_frame` | write | Empty a frame |
| `transform_sprite` | write | flip_h / flip_v / rotate_90 / shift / outline |
| `replace_color` | write | Global palette remap |
| `add_palette_color` | write | Extend shared palette |
| `set_palette_alpha` | write | Set one palette entry's alpha |
| `move_palette_color` | write | Reorder a palette entry while preserving artwork |
| `set_active_sprite` | write | Point the human's editor at a sprite |
| `add_frame` | write | Duplicate frame for animation |
| `delete_frame` | write | Delete an animation frame (with confirmation) |
| `link_frame` | write | Link a cel to another frame's edit group |
| `unlink_frame` | write | Make a linked cel independent |
| `add_layer` | write | Add a layer to the active sprite |
| `duplicate_layer` | write | Duplicate a layer and its cels |
| `delete_layer` | write | Delete a layer |
| `move_layer` | write | Reorder a layer |
| `set_layer_properties` | write | Set layer name, visibility, lock, opacity, or blend mode |
| `set_animation_preview` | write | Set playback mode, FPS, tag, and play state |
| `set_canvas_options` | write | Set zoom and canvas drawing/view modes |
| `add_frame_tag` | write | Tag an inclusive animation range |
| `delete_frame_tag` | write | Delete an animation tag |
| `rename_sprite` | write | Rename an existing sprite |
| `add_sprite` | write | New character/item/tile; characters default to 4 frames |
| `place_tile` | write | Paint one map cell |
| `fill_tiles` | write | Paint a map region |

Plus one **declarative API** tool: `<form toolname="request_new_sprite">` in the Sprites tab.

## Codex pet companions

The app treats a pet as the friendly voice for the guided tour and agent activity. It includes the
actual eight-pet Codex sprite-sheet set used by the local Codex interface under
`public/codex-pets/`, defaults to **Codex**, and lets people choose another bundled pet from the
Agent tab. The selection is stored per browser profile; choosing **No pet** keeps the guide neutral.
Set `VITE_CODEX_PET` to a bundled id when a build should start with a different pet.

The official Codex pets documentation currently describes pet selection in the ChatGPT desktop app
and Codex CLI, not a public browser API. Custom pets created in the desktop app are local rather
than automatically synced to an arbitrary web app. Pixel Art Tutor therefore exposes a conservative
adapter for hosts that choose to provide a pet: inject `window.__CODEX_PET__`, dispatch a `codex:pet`
or `pixel-art-tutor:codex-pet` event, or answer the `pixel-art-tutor:request-codex-pet` postMessage.
The payload only needs a `name`; optional `id`, `description`, `accent`, `variant`, and `imageUrl`
customize the companion. A host-provided payload is marked **Loaded from Codex**; otherwise the
bundled sheets are honestly labeled **Built-in Codex pet**.

Design notes:

- Every mutating tool writes through the same store as the human UI → agent edits are instantly
  visible, undoable, and autosaved.
- Colors are accepted as hex strings *or* palette indices; unknown hex colors are auto-added to the
  shared palette (returned to the agent with its new index).
- Read tools return compact ASCII grids + legends instead of raw arrays, keeping agent token usage low.
- Tools return `{ ok: false, error }` objects rather than throwing, so agents can self-correct.
- Registrations are tied to an `AbortController`; React unmount cleanly unregisters every tool.
- New character sprites and blank canvases use four animation frames unless an explicit
  `frameCount` is supplied. Items and tiles remain one frame by default.
- The default canvas is a real 256×256 logical pixel grid shown at 1px per cell; zoom remains editable.

## Running it

```bash
npm install
./start.sh        # editor + local room worker, http://127.0.0.1:3000
# ./start.sh --solo  # editor only, no room synchronization
```

`start.sh` owns both local processes and stops them together with Ctrl-C. Use
`VITE_PARTYKIT_HOST` to point the editor at a deployed PartyKit room worker
instead of the local one. Existing setups using `VITE_PARTY_HOST` remain
supported as a legacy alias.

The app is fully functional standalone. To give an agent access:

- **ChatGPT**: open the deployed URL in ChatGPT's in-app browser (WebMCP supported out of the box).
  If the host provides a Codex pet payload, the Agent tab and guided tour adopt it automatically;
  otherwise choose a local companion there.
- **Chrome**: enable `chrome://flags/#enable-webmcp-testing`, relaunch, open the app.
- Optionally install the [Model Context Tool Inspector](https://chromewebstore.google.com/detail/model-context-tool-inspec/gbpdfapgefenggkahomfgkhfehlcenpd)
  extension to call tools by hand.

For a judge-facing smoke test, call `get_project_state` first, then `read_sprite`,
then one safe tool such as `set_canvas_options`. The runtime tool call takes a JSON
string: `document.modelContext.executeTool(tool, JSON.stringify(input))`. The demo
does not require a login; a production submission must still provide its exact live
URL and room test instructions in Devpost.

### Shared rooms

The app still works as a local-only editor. For live rooms, run the Vite app and the Cloudflare
Durable Object room server in separate terminals:

```bash
npm run room:dev                                             # http://127.0.0.1:1999
VITE_PARTYKIT_HOST=http://127.0.0.1:1999 npm run dev -- --host 127.0.0.1
```

Open the Vite URL, choose **Room**, create a room, and share its URL. The Room panel also shows an
**Active rooms** list for one-click joining of rooms that currently have collaborators. The server stores the latest
project snapshot and recent edit history, broadcasts presence over WebSockets, merges non-conflicting
pixel edits, and only allows a collaborator to undo their latest room operation. Deploy the room
worker with `npm run room:deploy`, then set `VITE_PARTYKIT_HOST` to its HTTPS host for production.

Shared rooms are prototype bearer-link rooms: anyone who has a room URL can see and edit that room.
Display names and colors are presence labels, not verified identity, and there is no authentication or
authorization in this demo. Use them with trusted collaborators only; production deployments should
add server-side authentication and room authorization before private or sensitive artwork is shared.
New rooms use high-entropy Web Crypto IDs when the browser provides Web Crypto; local/demo runtimes
without it fall back to time/random IDs and must not treat those links as private. Existing short room
links remain valid. The worker limits each room to 16 connections, each connection to 30 edit/undo/redo
messages per 10 seconds and
120 presence messages per 10 seconds, and each message to 4,000,000 characters. These are abuse
guardrails, not access control. To restrict browser origins, set the worker variable
`ROOM_ALLOWED_ORIGIN` to the exact deployed app origin; local WebSocket development does not require
that variable, but a local HTTP origin can be configured explicitly when needed.

### Game-engine handoff

The **Entire game pack** action in the Export menu downloads a versioned
`<project-stem>.pixel-pack.json` manifest and one horizontal `<sprite-stem>-sheet.png` per sprite.
Each sheet contains one native-size frame after another; the manifest includes the palette, FPS,
frame rectangles, sprite IDs, and tilemap cells. Duplicate sprite names receive deterministic filename
suffixes so sheets do not overwrite one another. The manifest is engine-neutral: place generated
Godot sheets beside the optional `.tres` output in `res://art/`, or keep Unity metadata beside its
matching PNG. It does not create a complete Godot project, Unity scene, or Animator.

### Example prompts to try

- *"Read my slime sprite and critique it, then fix the issues you find."*
- *"Draw a 16×16 knight character with a helmet and sword."*
- *"Add an idle bounce animation to the active sprite."*
- *"Create a lava tile and paint a danger zone into the map."*

## Tech

React 19 · Vite · TypeScript · zustand · PartySocket · PartyServer · Cloudflare Durable Objects.
Local projects are persisted to `localStorage`; shared rooms persist their canonical snapshot and
recent history in the room server. Typed against the official
[`webmcp-types`](https://www.npmjs.com/package/webmcp-types) package.
Studio UI icons use the locally bundled [Streamline Pixel collection](https://icon-sets.iconify.design/streamline-pixel/)
from Iconify, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## License

[MIT](./LICENSE)
