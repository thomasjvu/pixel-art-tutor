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
- **Human-in-the-loop forms**: the "New sprite" form is also a **declarative WebMCP tool**
  (`request_new_sprite`). An agent can prefill it; you keep the final click. Both WebMCP APIs,
  one app.
- **World building**: agents create tiles (`add_sprite` with kind `tile`), read the map as ASCII
  (`get_tilemap`), and paint regions (`place_tile`, `fill_tiles`) while you paint manually.

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

### Tool catalog (16 tools)

| Tool | Kind | What it does |
| --- | --- | --- |
| `get_project_state` | read-only | Palette, sprites, active view, tilemap overview |
| `read_sprite` | read-only | Frame as ASCII art rows + color legend |
| `critique_artwork` | read-only | Tutor engine: score, stats, findings, tips |
| `get_tilemap` | read-only | Map grid as ASCII + tile legend |
| `export_project` | read-only | Full project JSON |
| `set_pixels` | write | Batch pixel painting (hex / palette index / transparent) |
| `fill_region` | write | Rectangle fill |
| `clear_frame` | write | Empty a frame |
| `transform_sprite` | write | flip_h / flip_v / rotate_90 / shift / outline |
| `replace_color` | write | Global palette remap |
| `add_palette_color` | write | Extend shared palette |
| `set_active_sprite` | write | Point the human's editor at a sprite |
| `add_frame` | write | Duplicate frame for animation |
| `add_sprite` | write | New character/item/tile |
| `place_tile` | write | Paint one map cell |
| `fill_tiles` | write | Paint a map region |

Plus one **declarative API** tool: `<form toolname="request_new_sprite">` in the Sprites tab.

Design notes:

- Every mutating tool writes through the same store as the human UI → agent edits are instantly
  visible, undoable, and autosaved.
- Colors are accepted as hex strings *or* palette indices; unknown hex colors are auto-added to the
  shared palette (returned to the agent with its new index).
- Read tools return compact ASCII grids + legends instead of raw arrays, keeping agent token usage low.
- Tools return `{ ok: false, error }` objects rather than throwing, so agents can self-correct.
- Registrations are tied to an `AbortController`; React unmount cleanly unregisters every tool.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
```

The app is fully functional standalone. To give an agent access:

- **ChatGPT**: open the deployed URL in ChatGPT's in-app browser (WebMCP supported out of the box).
- **Chrome**: enable `chrome://flags/#enable-webmcp-testing`, relaunch, open the app.
- Optionally install the [Model Context Tool Inspector](https://chromewebstore.google.com/detail/model-context-tool-inspec/gbpdfapgefenggkahomfgkhfehlcenpd)
  extension to call tools by hand.

### Example prompts to try

- *"Read my slime sprite and critique it, then fix the issues you find."*
- *"Draw a 16×16 knight character with a helmet and sword."*
- *"Add an idle bounce animation to the active sprite."*
- *"Create a lava tile and paint a danger zone into the map."*

## Tech

React 19 · Vite · TypeScript · zustand · zero backend — all state is client-side, persisted to
`localStorage`. Typed against the official [`webmcp-types`](https://www.npmjs.com/package/webmcp-types)
package.

## License

[MIT](./LICENSE)
