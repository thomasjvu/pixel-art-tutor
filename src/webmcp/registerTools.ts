import { useStore } from "../store/projectStore";
import { useUi } from "../store/uiStore";
import type { PixelChange } from "../types";
import { TRANSPARENT } from "../types";
import { normalizeHex } from "../engine/color";
import { critiqueSprite } from "../engine/critique";
import { pixelsToRowsWithWidth } from "../engine/pixels";
import { animateAgentPixels, beginAgentAction, finishAgentAction, showAgentAction } from "../realtime/agentAnimation";

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

function log(tool: string, summary: string) {
  useUi.getState().pushLog({ tool, summary, source: "agent" });
}

function target(spriteId?: string, frameIndex?: number) {
  return useStore.getState().resolveTarget(spriteId, frameIndex);
}

function previewColor(color: PixelChange["color"], palette: string[]): string | null {
  if (color === null || color === "transparent") return null;
  if (typeof color === "number") return palette[Math.round(color)] ?? null;
  return normalizeHex(color);
}

function previewCells(
  changes: PixelChange[],
  width: number,
  height: number,
  palette: string[],
) {
  return changes
    .filter((change) => change.x >= 0 && change.y >= 0 && change.x < width && change.y < height)
    .map((change) => ({
      x: change.x,
      y: change.y,
      color: previewColor(change.color, palette),
    }));
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
    execute: async (input) => {
      try {
        return await def.execute(input as I);
      } catch (e) {
        console.error(`[tool ${def.name}] threw`, e);
        return { ok: false, error: e instanceof Error ? e.message : "internal tool error" };
      }
    },
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
      execute: async ({ pixels, spriteId, frameIndex, allFrames }) => {
        const t = target(spriteId, frameIndex);
        if ("error" in t) return { ok: false, error: t.error };
        const changes: PixelChange[] = pixels.slice(0, 4096).map((p) => ({
          x: Math.round(p.x),
          y: Math.round(p.y),
          color: p.color ?? null,
        }));
        const actionId = beginAgentAction({
          tool: "set_pixels",
          spriteId: t.sprite.id,
          frameIndex: t.frameIndex,
          message: `Painting ${changes.length} pixel${changes.length === 1 ? "" : "s"} on ${t.sprite.name}`,
        });
        await animateAgentPixels(
          actionId,
          previewCells(changes, t.sprite.width, t.sprite.height, useStore.getState().project.palette),
        );
        const res = useStore.getState().applyPixelChanges(changes, t.sprite.id, t.frameIndex, !!allFrames);
        finishAgentAction(actionId, res.applied > 0 ? `Painted ${res.applied} pixel${res.applied === 1 ? "" : "s"}` : "No pixels changed");
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
          x: { type: "number", minimum: -64, maximum: 128 },
          y: { type: "number", minimum: -64, maximum: 128 },
          width: { type: "number", minimum: -64, maximum: 128 },
          height: { type: "number", minimum: -64, maximum: 128 },
          color: colorSchemaProp,
          spriteId: { type: "string" },
          frameIndex: { type: "number" },
          allFrames: { type: "boolean" },
        },
        required: ["x", "y", "width", "height", "color"],
      },
      execute: async ({ x, y, width, height, color, spriteId, frameIndex, allFrames }) => {
        const t = target(spriteId, frameIndex);
        if ("error" in t) return { ok: false, error: t.error };
        const rx = Math.round(x);
        const ry = Math.round(y);
        const rw = Math.round(width);
        const rh = Math.round(height);
        const changes: PixelChange[] = [];
        const left = Math.max(0, rx);
        const top = Math.max(0, ry);
        const right = Math.min(t.sprite.width, rx + Math.max(0, rw));
        const bottom = Math.min(t.sprite.height, ry + Math.max(0, rh));
        for (let yy = top; yy < bottom; yy++)
          for (let xx = left; xx < right; xx++) changes.push({ x: xx, y: yy, color });
        const actionId = beginAgentAction({
          tool: "fill_region",
          spriteId: t.sprite.id,
          frameIndex: t.frameIndex,
          message: `Filling ${changes.length} pixels on ${t.sprite.name}`,
        });
        await animateAgentPixels(
          actionId,
          previewCells(changes, t.sprite.width, t.sprite.height, useStore.getState().project.palette),
        );
        const result = useStore
          .getState()
          .fillRegion(
            rx,
            ry,
            rw,
            rh,
            color,
            t.sprite.id,
            t.frameIndex,
            !!allFrames,
          );
        if (typeof result !== "number") {
          finishAgentAction(actionId, result.error);
          log("fill_region", `failed on ${t.sprite.name}`);
          return { ok: false, error: result.error };
        }
        finishAgentAction(actionId, result > 0 ? `Filled ${result} pixels` : "Nothing to fill");
        log("fill_region", `${result} px on ${t.sprite.name}`);
        return { ok: result > 0, filledPixels: result };
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
      execute: async ({ spriteId, frameIndex }) => {
        const t = target(spriteId, frameIndex);
        if ("error" in t) return { ok: false, error: t.error };
        const changes: PixelChange[] = [];
        for (let y = 0; y < t.sprite.height; y++)
          for (let x = 0; x < t.sprite.width; x++) changes.push({ x, y, color: null });
        const actionId = beginAgentAction({
          tool: "clear_frame",
          spriteId: t.sprite.id,
          frameIndex: t.frameIndex,
          message: `Clearing ${t.sprite.name} frame ${t.frameIndex + 1}`,
        });
        await animateAgentPixels(
          actionId,
          previewCells(changes, t.sprite.width, t.sprite.height, useStore.getState().project.palette),
        );
        useStore.getState().clearFrame(t.sprite.id, t.frameIndex);
        finishAgentAction(actionId, "Frame cleared");
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
      execute: async ({ op, dx, dy, color, frameIndices, spriteId }) => {
        const st = useStore.getState();
        if (
          op === "shift" &&
          ((dx !== undefined && (typeof dx !== "number" || !Number.isFinite(dx))) ||
            (dy !== undefined && (typeof dy !== "number" || !Number.isFinite(dy))))
        ) {
          return { ok: false, error: "dx/dy must be finite numbers" };
        }
        const resolved = target(spriteId);
        if ("error" in resolved) return { ok: false, error: resolved.error };
        const actionId = beginAgentAction({
          tool: "transform_sprite",
          spriteId: resolved.sprite.id,
          frameIndex: resolved.frameIndex,
          message: `Applying ${op.replaceAll("_", " ")} to ${resolved.sprite.name}`,
          status: "transforming",
        });
        await showAgentAction(actionId, {
          x: Math.floor(resolved.sprite.width / 2),
          y: Math.floor(resolved.sprite.height / 2),
        });
        const err = st.transform(op, {
          dx: typeof dx === "number" ? Math.round(dx) : undefined,
          dy: typeof dy === "number" ? Math.round(dy) : undefined,
          color,
          frameIndices: Array.isArray(frameIndices) ? frameIndices : undefined,
          spriteId,
        });
        finishAgentAction(actionId, err ? `Could not apply ${op.replaceAll("_", " ")}` : `${op.replaceAll("_", " ")} complete`);
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
      execute: async ({ from, to, spriteId }) => {
        const st = useStore.getState();
        const resolved = target(spriteId);
        if ("error" in resolved) return { ok: false, error: resolved.error };
        const actionId = beginAgentAction({
          tool: "replace_color",
          spriteId: resolved.sprite.id,
          frameIndex: resolved.frameIndex,
          message: `Remapping colors in ${spriteId ? resolved.sprite.name : "the project"}`,
          status: "transforming",
        });
        await showAgentAction(actionId, {
          x: Math.floor(resolved.sprite.width / 2),
          y: Math.floor(resolved.sprite.height / 2),
        });
        const result = st.replaceColor(from, to, spriteId);
        if (typeof result !== "number") {
          finishAgentAction(actionId, result.error);
          log("replace_color", "failed to remap colors");
          return { ok: false, error: result.error };
        }
        finishAgentAction(actionId, `Remapped ${result} pixel${result === 1 ? "" : "s"}`);
        log("replace_color", `${result} px remapped`);
        return { ok: true, replacedPixels: result };
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
      execute: async ({ hex }) => {
        const active = useStore.getState().activeSprite();
        const actionId = beginAgentAction({
          tool: "add_palette_color",
          spriteId: active?.id ?? null,
          frameIndex: 0,
          message: `Adding ${hex} to the palette`,
          status: "thinking",
        });
        await showAgentAction(actionId, active ? { x: 0, y: 0 } : null);
        const r = useStore.getState().addPaletteColor(hex);
        if ("error" in r) {
          finishAgentAction(actionId, r.error);
          return { ok: false, error: r.error };
        }
        finishAgentAction(actionId, `Added palette color ${r.index}`);
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
      execute: async ({ spriteId, frameIndex }) => {
        const resolved = target(spriteId, frameIndex);
        if ("error" in resolved) return { ok: false, error: resolved.error };
        const actionId = beginAgentAction({
          tool: "set_active_sprite",
          spriteId: resolved.sprite.id,
          frameIndex: resolved.frameIndex,
          message: `Showing ${resolved.sprite.name}`,
          status: "thinking",
        });
        await showAgentAction(actionId, {
          x: Math.floor(resolved.sprite.width / 2),
          y: Math.floor(resolved.sprite.height / 2),
        });
        const ok = useStore.getState().setActiveSprite(spriteId ?? "", frameIndex);
        finishAgentAction(actionId, ok ? `Showing ${resolved.sprite.name}` : `${spriteId} not found`);
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
      execute: async ({ spriteId, copyFrameIndex }) => {
        const resolved = target(spriteId);
        if ("error" in resolved) return { ok: false, error: resolved.error };
        const actionId = beginAgentAction({
          tool: "add_frame",
          spriteId: resolved.sprite.id,
          frameIndex: resolved.frameIndex,
          message: `Duplicating a frame on ${resolved.sprite.name}`,
          status: "drawing",
        });
        await showAgentAction(actionId, {
          x: Math.floor(resolved.sprite.width / 2),
          y: Math.floor(resolved.sprite.height / 2),
        });
        const idx = useStore.getState().addFrame(spriteId, copyFrameIndex);
        if (idx < 0) {
          finishAgentAction(actionId, "Could not add frame");
          return { ok: false, error: "could not add frame" };
        }
        finishAgentAction(actionId, `Added frame ${idx + 1}`);
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
      execute: async ({ name, width, height, kind, copyFromId }) => {
        const actionId = beginAgentAction({
          tool: "add_sprite",
          spriteId: null,
          frameIndex: 0,
          message: `Creating ${name || "a new sprite"}`,
          status: "thinking",
        });
        await showAgentAction(actionId);
        const id = useStore.getState().addSprite({ name, width, height, kind, copyFromId });
        finishAgentAction(actionId, `Created ${name || "new sprite"}`);
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
      execute: async ({ x, y, tileId }) => {
        const id = !tileId || tileId === "empty" ? null : tileId;
        const actionId = beginAgentAction({
          tool: "place_tile",
          spriteId: null,
          frameIndex: 0,
          message: `Placing a tile at ${Math.round(x)}, ${Math.round(y)}`,
          status: "drawing",
        });
        await showAgentAction(actionId);
        const ok = useStore.getState().placeTile(Math.round(x), Math.round(y), id);
        finishAgentAction(actionId, ok ? "Tile placed" : "Could not place tile");
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
          x: { type: "number", minimum: -64, maximum: 128 },
          y: { type: "number", minimum: -64, maximum: 128 },
          width: { type: "number", minimum: -64, maximum: 128 },
          height: { type: "number", minimum: -64, maximum: 128 },
          tileId: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
        required: ["x", "y", "width", "height"],
      },
      execute: async ({ x, y, width, height, tileId }) => {
        const id = !tileId || tileId === "empty" ? null : tileId;
        const actionId = beginAgentAction({
          tool: "fill_tiles",
          spriteId: null,
          frameIndex: 0,
          message: `Filling a map region`,
          status: "filling",
        });
        await showAgentAction(actionId);
        const n = useStore
          .getState()
          .fillTiles(Math.round(x), Math.round(y), Math.round(width), Math.round(height), id);
        finishAgentAction(actionId, n > 0 ? `Filled ${n} map cells` : "Nothing to fill");
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
      execute: async ({ spriteId }) => {
        const st = useStore.getState();
        const t = st.resolveTarget(spriteId);
        if ("error" in t) return { ok: false, error: t.error };
        const actionId = beginAgentAction({
          tool: "critique_artwork",
          spriteId: t.sprite.id,
          frameIndex: t.frameIndex,
          message: `Looking closely at ${t.sprite.name}`,
          status: "reviewing",
        });
        await showAgentAction(actionId, {
          x: Math.floor(t.sprite.width / 2),
          y: Math.floor(t.sprite.height / 2),
        });
        const report = critiqueSprite(t.sprite, st.project.palette);
        finishAgentAction(actionId, `Score ${report.score}/100`);
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
