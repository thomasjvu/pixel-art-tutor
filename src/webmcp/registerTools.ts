import { useStore } from "../store/projectStore";
import { useUi } from "../store/uiStore";
import type { PixelChange } from "../types";
import { TRANSPARENT } from "../types";
import { normalizeHex } from "../engine/color";
import { critiqueSprite } from "../engine/critique";
import { pixelsToRowsWithWidth } from "../engine/pixels";

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

function log(tool: string, summary: string) {
  useUi.getState().pushLog({ tool, summary, source: "agent" });
}

function target(spriteId?: string, frameIndex?: number) {
  return useStore.getState().resolveTarget(spriteId, frameIndex);
}

type TargetedInput = {
  spriteId?: string;
  frameIndex?: number;
};

interface ToolDef<I extends Record<string, unknown>> {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations?: { readOnlyHint?: boolean };
  execute: (input: I) => WebMCP.MaybePromise<unknown>;
}

function defineTool<I extends Record<string, unknown>>(def: ToolDef<I>): WebMCP.ModelContextTool {
  return {
    name: def.name,
    title: def.title,
    description: def.description,
    inputSchema: def.inputSchema,
    annotations: def.annotations,
    execute: (input) => def.execute(input as I),
  };
}

const colorSchemaProp = {
  description:
    "Color to paint. Use a palette index (number), a hex string like '#38b764' (auto-added to the palette), 'transparent', or null to erase.",
  anyOf: [{ type: "number" }, { type: "string" }, { type: "null" }],
} as const;

export function registerTutorTools(): AbortController {
  const controller = new AbortController();
  const signal = controller.signal;

  const tools: WebMCP.ModelContextTool[] = [
    defineTool({
      name: "get_project_state",
      title: "Get project state",
      description:
        "Overview of the whole pixel art project: palette with indices, all sprites (ids, names, sizes, kinds, frame counts), which sprite/frame is on the human's screen, and tilemap info. Call this first to ground yourself.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => {
        const s = useStore.getState();
        const active = s.activeSprite();
        log("get_project_state", "read project overview");
        return {
          projectName: s.project.name,
          palette: s.project.palette.map((hex, i) => ({ index: i, hex })),
          sprites: s.project.sprites.map((sp) => ({
            id: sp.id,
            name: sp.name,
            kind: sp.kind,
            size: `${sp.width}x${sp.height}`,
            frames: sp.frames.length,
            isActive: sp.id === active?.id,
          })),
          activeSpriteId: active?.id ?? null,
          activeFrameIndex: s.activeFrameIndex,
          tilemap: s.project.tilemap
            ? {
                size: `${s.project.tilemap.cols}x${s.project.tilemap.rows}`,
                tilesInTileset: s.project.sprites
                  .filter((sp) => sp.kind === "tile")
                  .map((sp) => ({ id: sp.id, name: sp.name })),
              }
            : null,
        };
      },
    }),

    defineTool<TargetedInput>({
      name: "read_sprite",
      title: "Read sprite pixels",
      description:
        "Read one frame of a sprite as ASCII art rows plus a color legend, so you can see exactly what the human is drawing. '.' = transparent; other characters are base-36 palette indices.",
      inputSchema: {
        type: "object",
        properties: {
          spriteId: { type: "string", description: "Sprite id. Defaults to the active sprite." },
          frameIndex: { type: "number", description: "Zero-based frame index." },
        },
      },
      annotations: { readOnlyHint: true },
      execute: ({ spriteId, frameIndex }) => {
        const t = target(spriteId, frameIndex);
        if ("error" in t) return { ok: false, error: t.error };
        const { sprite, frameIndex: fi } = t;
        const frame = sprite.frames[fi]!;
        const rows = pixelsToRowsWithWidth(frame.pixels, sprite.width);
        const used = [...new Set(frame.pixels)]
          .filter((p) => p !== TRANSPARENT)
          .sort((a, b) => a - b);
        log("read_sprite", `${sprite.name} frame ${fi}`);
        return {
          ok: true,
          sprite: { id: sprite.id, name: sprite.name, width: sprite.width, height: sprite.height },
          frameIndex: fi,
          legend: used.map((i) => ({
            char: DIGITS[i] ?? "?",
            index: i,
            hex: useStore.getState().project.palette[i],
          })),
          transparentChar: ".",
          rows,
        };
      },
    }),

    defineTool<{
      pixels: { x: number; y: number; color: number | string | null }[];
      spriteId?: string;
      frameIndex?: number;
      allFrames?: boolean;
    }>({
      name: "set_pixels",
      title: "Set pixels",
      description:
        "Paint specific pixels on a sprite frame. The human sees your changes appear live on their canvas. Batch as many pixels as possible per call.",
      inputSchema: {
        type: "object",
        properties: {
          pixels: {
            type: "array",
            maxItems: 4096,
            description: "List of pixel changes, e.g. [{\"x\":3,\"y\":4,\"color\":\"#38b764\"}]",
            items: {
              type: "object",
              properties: {
                x: { type: "number" },
                y: { type: "number" },
                color: colorSchemaProp,
              },
              required: ["x", "y", "color"],
            },
          },
          spriteId: { type: "string", description: "Defaults to the active sprite." },
          frameIndex: { type: "number", description: "Defaults to the active frame." },
          allFrames: { type: "boolean", description: "Apply the same change to every frame." },
        },
        required: ["pixels"],
      },
      execute: ({ pixels, spriteId, frameIndex, allFrames }) => {
        const t = target(spriteId, frameIndex);
        if ("error" in t) return { ok: false, error: t.error };
        const changes: PixelChange[] = pixels.slice(0, 4096).map((p) => ({
          x: Math.round(p.x),
          y: Math.round(p.y),
          color: p.color ?? null,
        }));
        const res = useStore.getState().applyPixelChanges(changes, t.sprite.id, t.frameIndex, !!allFrames);
        log("set_pixels", `${res.applied} px on ${t.sprite.name}`);
        return {
          ok: res.applied > 0,
          applied: res.applied,
          addedPaletteColors: res.addedColors.map((i) => ({
            index: i,
            hex: useStore.getState().project.palette[i],
          })),
        };
      },
    }),

    defineTool<{
      x: number;
      y: number;
      width: number;
      height: number;
      color: number | string | null;
      spriteId?: string;
      frameIndex?: number;
      allFrames?: boolean;
    }>({
      name: "fill_region",
      title: "Fill rectangle region",
      description:
        "Fill a rectangular region of a sprite frame with one color. Great for blocking in base shapes quickly.",
      inputSchema: {
        type: "object",
        properties: {
          x: { type: "number" },
          y: { type: "number" },
          width: { type: "number" },
          height: { type: "number" },
          color: colorSchemaProp,
          spriteId: { type: "string" },
          frameIndex: { type: "number" },
          allFrames: { type: "boolean" },
        },
        required: ["x", "y", "width", "height", "color"],
      },
      execute: ({ x, y, width, height, color, spriteId, frameIndex, allFrames }) => {
        const t = target(spriteId, frameIndex);
        if ("error" in t) return { ok: false, error: t.error };
        let colorIdx: number;
        if (color === null || color === "transparent") colorIdx = TRANSPARENT;
        else if (typeof color === "number") colorIdx = Math.round(color);
        else {
          const hex = normalizeHex(color);
          if (!hex) return { ok: false, error: `invalid color '${color}'` };
          const st = useStore.getState();
          const existing = st.project.palette.indexOf(hex);
          if (existing >= 0) colorIdx = existing;
          else {
            const added = st.addPaletteColor(hex);
            if ("error" in added) return { ok: false, error: added.error };
            colorIdx = added.index;
          }
        }
        const n = useStore
          .getState()
          .fillRegion(
            Math.round(x),
            Math.round(y),
            Math.round(width),
            Math.round(height),
            colorIdx,
            t.sprite.id,
            t.frameIndex,
            !!allFrames,
          );
        log("fill_region", `${n} px on ${t.sprite.name}`);
        return { ok: n > 0, filledPixels: n };
      },
    }),

    defineTool<TargetedInput>({
      name: "clear_frame",
      title: "Clear frame",
      description: "Erase every pixel of one sprite frame, making it fully transparent.",
      inputSchema: {
        type: "object",
        properties: {
          spriteId: { type: "string" },
          frameIndex: { type: "number" },
        },
      },
      execute: ({ spriteId, frameIndex }) => {
        const t = target(spriteId, frameIndex);
        if ("error" in t) return { ok: false, error: t.error };
        useStore.getState().clearFrame(t.sprite.id, t.frameIndex);
        log("clear_frame", `${t.sprite.name} frame ${t.frameIndex}`);
        return { ok: true };
      },
    }),

    defineTool<{
      op: "flip_h" | "flip_v" | "rotate_90" | "shift" | "outline";
      dx?: number;
      dy?: number;
      color?: number | string | null;
      frameIndices?: number[];
      spriteId?: string;
    }>({
      name: "transform_sprite",
      title: "Transform sprite",
      description:
        "Apply a geometric transform to a sprite. Ops: flip_h, flip_v, rotate_90 (clockwise), shift (wrap-around move by dx/dy), outline (adds outlineColor around silhouettes). Applies to all frames unless frameIndices given.",
      inputSchema: {
        type: "object",
        properties: {
          op: { type: "string", enum: ["flip_h", "flip_v", "rotate_90", "shift", "outline"] },
          dx: { type: "number", description: "shift only: horizontal offset" },
          dy: { type: "number", description: "shift only: vertical offset" },
          color: { ...colorSchemaProp, description: "outline only: outline color (defaults to palette index 0)" },
          frameIndices: { type: "array", items: { type: "number" }, description: "Which frames; omit for all." },
          spriteId: { type: "string" },
        },
        required: ["op"],
      },
      execute: ({ op, dx, dy, color, frameIndices, spriteId }) => {
        const st = useStore.getState();
        let colorIdx: number | undefined;
        if (op === "outline") {
          if (typeof color === "number") colorIdx = Math.round(color);
          else if (color === null || color === "transparent") colorIdx = 0;
          else if (typeof color === "string") {
            const hex = normalizeHex(color);
            if (!hex) return { ok: false, error: `invalid color '${color}'` };
            const found = st.project.palette.indexOf(hex);
            if (found >= 0) colorIdx = found;
            else {
              const r = st.addPaletteColor(hex);
              if ("error" in r) return { ok: false, error: r.error };
              colorIdx = r.index;
            }
          }
        }
        const err = st.transform(op, {
          dx: typeof dx === "number" ? Math.round(dx) : undefined,
          dy: typeof dy === "number" ? Math.round(dy) : undefined,
          colorIdx,
          frameIndices: Array.isArray(frameIndices) ? frameIndices : undefined,
          spriteId,
        });
        log("transform_sprite", `${op}${err ? " failed" : ""}`);
        return err ? { ok: false, error: err } : { ok: true };
      },
    }),

    defineTool<{ from: number | string | null; to: number | string | null; spriteId?: string }>({
      name: "replace_color",
      title: "Replace color everywhere",
      description:
        "Swap every occurrence of one palette color for another across a sprite (or the whole project if no spriteId). Accepts palette indices or hex strings.",
      inputSchema: {
        type: "object",
        properties: {
          from: { ...colorSchemaProp, description: "Color to replace." },
          to: { ...colorSchemaProp, description: "Replacement color ('transparent'/null erases)." },
          spriteId: { type: "string", description: "Scope to one sprite; omit for all sprites." },
        },
        required: ["from", "to"],
      },
      execute: ({ from, to, spriteId }) => {
        const st = useStore.getState();
        function resolve(c: number | string | null): { index: number } | { error: string } {
          if (c === null || c === "transparent") return { index: TRANSPARENT };
          if (typeof c === "number") return { index: c };
          const hex = normalizeHex(c);
          if (!hex) return { error: `invalid color '${c}'` };
          const found = st.project.palette.indexOf(hex);
          if (found >= 0) return { index: found };
          const r = st.addPaletteColor(hex);
          return "error" in r ? { error: r.error } : { index: r.index };
        }
        const fromR = resolve(from);
        if ("error" in fromR) return { ok: false, error: `from: ${fromR.error}` };
        const toR = resolve(to);
        if ("error" in toR) return { ok: false, error: `to: ${toR.error}` };
        const n = st.replaceColor(fromR.index, toR.index, spriteId);
        log("replace_color", `${n} px remapped`);
        return { ok: true, replacedPixels: n };
      },
    }),

    defineTool<{ hex: string }>({
      name: "add_palette_color",
      title: "Add palette color",
      description: "Add a new hex color to the shared project palette and get its index back.",
      inputSchema: {
        type: "object",
        properties: { hex: { type: "string", description: "e.g. '#ffcd75'" } },
        required: ["hex"],
      },
      execute: ({ hex }) => {
        const r = useStore.getState().addPaletteColor(hex);
        if ("error" in r) return { ok: false, error: r.error };
        log("add_palette_color", hex);
        return { ok: true, index: r.index, hex: normalizeHex(hex) };
      },
    }),

    defineTool<TargetedInput>({
      name: "set_active_sprite",
      title: "Point human at a sprite",
      description:
        "Switch the human's editor view to a given sprite (and optionally frame). Use this to show them something you made or want them to review.",
      inputSchema: {
        type: "object",
        properties: {
          spriteId: { type: "string" },
          frameIndex: { type: "number" },
        },
        required: ["spriteId"],
      },
      execute: ({ spriteId, frameIndex }) => {
        const ok = useStore.getState().setActiveSprite(spriteId ?? "", frameIndex);
        log("set_active_sprite", ok ? `${spriteId}` : `${spriteId} not found`);
        return ok ? { ok: true } : { ok: false, error: `sprite '${spriteId}' not found` };
      },
    }),

    defineTool<{ spriteId?: string; copyFrameIndex?: number }>({
      name: "add_frame",
      title: "Add animation frame",
      description:
        "Add a new animation frame to a character sprite, copying an existing frame by default so it can be nudged into the next pose.",
      inputSchema: {
        type: "object",
        properties: {
          spriteId: { type: "string" },
          copyFrameIndex: { type: "number", description: "Frame to duplicate. Defaults to the last frame." },
        },
      },
      execute: ({ spriteId, copyFrameIndex }) => {
        const idx = useStore.getState().addFrame(spriteId, copyFrameIndex);
        if (idx < 0) return { ok: false, error: "could not add frame" };
        log("add_frame", `frame ${idx}`);
        return { ok: true, newIndex: idx };
      },
    }),

    defineTool<{
      name: string;
      width: number;
      height: number;
      kind: "character" | "item" | "tile";
      copyFromId?: string;
    }>({
      name: "add_sprite",
      title: "Create sprite",
      description:
        "Create a new empty sprite (character, item, or tile for the tileset). It becomes the active sprite so the human sees it immediately. Optionally copy dimensions/content from an existing sprite.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          width: { type: "number", description: "1-64, typically 16 or 32" },
          height: { type: "number", description: "1-64, typically 16 or 32" },
          kind: {
            type: "string",
            enum: ["character", "item", "tile"],
            description: "'tile' adds it to the tileset for map painting.",
          },
          copyFromId: { type: "string", description: "Clone pixels from this sprite id if sizes match." },
        },
        required: ["name", "width", "height", "kind"],
      },
      execute: ({ name, width, height, kind, copyFromId }) => {
        const id = useStore.getState().addSprite({ name, width, height, kind, copyFromId });
        log("add_sprite", `${name} (${kind})`);
        return { ok: true, spriteId: id };
      },
    }),

    defineTool({
      name: "get_tilemap",
      title: "Read tilemap",
      description:
        "Read the tilemap grid as ASCII rows where each character maps to a tileset sprite via the returned legend.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => {
        const st = useStore.getState();
        const tm = st.project.tilemap;
        if (!tm) return { ok: false, error: "no tilemap exists yet; ask the human to open the Map tab" };
        const tiles = st.project.sprites.filter((sp) => sp.kind === "tile");
        const charFor = new Map<string, string>();
        tiles.forEach((t, i) => charFor.set(t.id, DIGITS[(i + 10) % 36]!));
        const rowsAscii: string[] = [];
        for (let y = 0; y < tm.rows; y++) {
          let row = "";
          for (let x = 0; x < tm.cols; x++) {
            const id = tm.cells[y * tm.cols + x];
            row += id ? charFor.get(id) ?? "?" : ".";
          }
          rowsAscii.push(row);
        }
        log("get_tilemap", `${tm.cols}x${tm.rows} map`);
        return {
          ok: true,
          cols: tm.cols,
          rows: tm.rows,
          transparentChar: ".",
          legend: tiles.map((t) => ({ char: charFor.get(t.id), id: t.id, name: t.name })),
          rows_ascii: rowsAscii,
        };
      },
    }),

    defineTool<{ x: number; y: number; tileId?: string | null }>({
      name: "place_tile",
      title: "Place tile on map",
      description: "Put one tileset sprite at a map coordinate. Pass tileId=null or 'empty' to clear the cell.",
      inputSchema: {
        type: "object",
        properties: {
          x: { type: "number" },
          y: { type: "number" },
          tileId: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
        required: ["x", "y"],
      },
      execute: ({ x, y, tileId }) => {
        const id = !tileId || tileId === "empty" ? null : tileId;
        const ok = useStore.getState().placeTile(Math.round(x), Math.round(y), id);
        log("place_tile", ok ? `(${x},${y})` : `failed (${x},${y})`);
        return ok ? { ok: true } : { ok: false, error: "out of bounds, no tilemap, or unknown tileId" };
      },
    }),

    defineTool<{ x: number; y: number; width: number; height: number; tileId?: string | null }>({
      name: "fill_tiles",
      title: "Fill map region with tile",
      description:
        "Fill a rectangular region of the tilemap with one tileset sprite. Pass tileId=null or 'empty' to clear the area.",
      inputSchema: {
        type: "object",
        properties: {
          x: { type: "number" },
          y: { type: "number" },
          width: { type: "number" },
          height: { type: "number" },
          tileId: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
        required: ["x", "y", "width", "height"],
      },
      execute: ({ x, y, width, height, tileId }) => {
        const id = !tileId || tileId === "empty" ? null : tileId;
        const n = useStore
          .getState()
          .fillTiles(Math.round(x), Math.round(y), Math.round(width), Math.round(height), id);
        log("fill_tiles", `${n} cells`);
        return n > 0 ? { ok: true, cells: n } : { ok: false, error: "nothing filled (no tilemap or bad args)" };
      },
    }),

    defineTool<TargetedInput>({
      name: "critique_artwork",
      title: "Critique artwork",
      description:
        "Run the built-in pixel-art tutor analysis on a sprite: color discipline, value contrast, outline strength, noise, centering, symmetry, animation readiness. Returns a score, stats and findings with concrete tips. Use it to give the human structured feedback before/after you edit.",
      inputSchema: {
        type: "object",
        properties: { spriteId: { type: "string", description: "Defaults to the active sprite." } },
      },
      annotations: { readOnlyHint: true },
      execute: ({ spriteId }) => {
        const st = useStore.getState();
        const t = st.resolveTarget(spriteId);
        if ("error" in t) return { ok: false, error: t.error };
        const report = critiqueSprite(t.sprite, st.project.palette);
        log("critique_artwork", `${t.sprite.name}: ${report.score}/100`);
        return { ok: true, report };
      },
    }),

    defineTool({
      name: "export_project",
      title: "Export project JSON",
      description:
        "Serialize the entire project (palette, sprites, frames, tilemap) as JSON that can be re-imported via Sprites > Project file > Import, or saved by the user.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => {
        const st = useStore.getState();
        log("export_project", "serialized project");
        return {
          ok: true,
          filename: `${st.project.name.replace(/\W+/g, "-").toLowerCase()}.pixeltutor.json`,
          json: st.exportProject(),
        };
      },
    }),
  ];

  void (async () => {
    const ui = useUi.getState();
    const mc = document.modelContext;
    if (!mc) {
      ui.setMcp("unsupported");
      return;
    }
    ui.setMcp("registering");
    try {
      await Promise.all(tools.map((t) => mc.registerTool(t, { signal })));
      if (signal.aborted) return;
      ui.setMcp("ready");
      const registered = await mc.getTools();
      if (signal.aborted) return;
      ui.setTools(
        registered
          .filter((t) => t.origin === location.origin)
          .map((t) => ({ name: t.name, description: t.description })),
      );
    } catch (e) {
      if (signal.aborted) return; // superseded by a newer mount (React StrictMode remount)
      console.error("[webmcp] registration failed", e);
      ui.setMcp("error", e instanceof Error ? e.message : "registerTool failed");
      ui.setTools(tools.map((t) => ({ name: t.name, description: t.description })));
    }
  })();

  return controller;
}
