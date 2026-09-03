import { useStore } from "../store/projectStore";
import { useEditor } from "../store/editorStore";
import { useUi } from "../store/uiStore";
import type { PixelChange } from "../types";
import { spriteLayers, TRANSPARENT } from "../types";
import { normalizeHex, resolveColorInto } from "../engine/color";
import { critiqueSprite } from "../engine/critique";
import { clampTutorialStep, TUTORIAL_STEPS } from "../engine/tutorial";
import { PIXEL_SYMBOLS, pixelsToRowsWithWidth } from "../engine/pixels";
import {
  animateAgentPixels,
  beginAgentAction,
  finishAgentAction,
  showAgentAction,
} from "../realtime/agentAnimation";
import { MAX_PROJECT_JSON_LENGTH, MAX_PROJECT_NAME_LENGTH, MAX_SPRITE_NAME_LENGTH } from "../projectLimits";

function log(tool: string, summary: string) {
  useUi.getState().pushLog({ tool, summary, source: "agent" });
}

function target(spriteId?: string, frameIndex?: number, layerId?: string) {
  const store = useStore.getState();
  const activeSprite = store.activeSprite();
  const targetSprite = spriteId
    ? store.project.sprites.find((sprite) => sprite.id === spriteId)
    : activeSprite;
  const activeLayerId =
    activeSprite && targetSprite?.id === activeSprite.id ? useEditor.getState().activeLayerId : null;
  const selectedLayer = layerId ?? (
    activeLayerId && targetSprite && spriteLayers(targetSprite).some((layer) => layer.id === activeLayerId)
      ? activeLayerId
      : undefined
  );
  return store.resolveTarget(spriteId, frameIndex, selectedLayer);
}

function interruptHumanStroke(): void {
  useStore.getState().interruptStroke();
}

function layerLockError(layerId?: string, spriteId?: string): string | null {
  const store = useStore.getState();
  const sprite = spriteId ? store.project.sprites.find((entry) => entry.id === spriteId) : store.activeSprite();
  const layer = sprite ? spriteLayers(sprite).find((entry) => entry.id === layerId) ?? (layerId ? null : spriteLayers(sprite)[0]) : null;
  if (layer?.locked) return `'${layer.name}' layer is locked`;
  return useEditor.getState().layerLocked && !layerId ? "artwork layer is locked" : null;
}

function previewColor(color: PixelChange["color"], palette: string[]): string | null | undefined {
  if (color === null || color === "transparent" || color === TRANSPARENT) return null;
  if (typeof color === "number") return palette[Math.round(color)];
  return normalizeHex(color) ?? undefined;
}

function previewCells(
  changes: PixelChange[],
  width: number,
  height: number,
  palette: string[],
) {
  return changes
    .filter((change) => change.x >= 0 && change.y >= 0 && change.x < width && change.y < height)
    .flatMap((change) => {
      const color = previewColor(change.color, palette);
      return color === undefined ? [] : [{ x: change.x, y: change.y, color }];
    });
}

function paintColorError(color: PixelChange["color"]): string | null {
  // resolveColorInto may append a new hex to the supplied project, so use a
  // palette-only probe and leave the real project untouched until the stroke.
  const probe = { palette: [...useStore.getState().project.palette] };
  const result = resolveColorInto(color, probe);
  return "error" in result ? result.error : null;
}

async function applyAnimatedPaint(
  actionId: string,
  cells: ReturnType<typeof previewCells>,
  spriteId: string,
  frameIndex: number,
  allFrames: boolean,
  layerId: string | undefined,
): Promise<{ applied: number; addedColors: number[] }> {
  interruptHumanStroke();
  useStore.getState().beginStroke();
  let applied = 0;
  const addedColors = new Set<number>();
  try {
    await animateAgentPixels(actionId, cells, {
      onChunk: (chunk) => {
        const result = useStore.getState().applyPixelChanges(chunk, spriteId, frameIndex, allFrames, layerId);
        applied += result.applied;
        for (const index of result.addedColors) addedColors.add(index);
      },
    });
  } finally {
    // One room operation and one undo entry represent the complete animated
    // gesture, even though the canvas was updated in every visible step.
    useStore.getState().endStroke("Agent paint");
  }
  return { applied, addedColors: [...addedColors] };
}

type TargetedInput = {
  spriteId?: string;
  frameIndex?: number;
  layerId?: string;
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
          palette: s.project.palette.map((hex, i) => ({ index: i, hex, alpha: s.project.paletteAlpha?.[i] ?? 1 })),
          sprites: s.project.sprites.map((sp) => ({
            id: sp.id,
            name: sp.name,
            kind: sp.kind,
            size: `${sp.width}x${sp.height}`,
            frames: sp.frames.length,
            layers: spriteLayers(sp).map((layer) => ({
              id: layer.id,
              name: layer.name,
              visible: layer.visible,
              locked: layer.locked,
              opacity: layer.opacity,
              blendMode: layer.blendMode,
              frames: layer.frames.length,
              frameLinks: layer.frames.map((frame) => frame.linkId ?? null),
            })),
            tags: sp.frameTags ?? [],
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
          savedProjects: s.listProjectSaves(),
          savedPalettes: s.listPaletteSaves(),
        };
      },
    }),

    defineTool<TargetedInput>({
      name: "read_sprite",
      title: "Read sprite pixels",
      description:
        "Read one frame of a sprite as ASCII art rows plus a color legend, so you can see exactly what the human is drawing. '.' = transparent; other characters use the 64-symbol palette alphabet returned in the legend.",
      inputSchema: {
        type: "object",
        properties: {
          spriteId: { type: "string", description: "Sprite id. Defaults to the active sprite." },
          frameIndex: { type: "number", description: "Zero-based frame index." },
          layerId: { type: "string", description: "Layer id. Defaults to the first layer." },
        },
      },
      annotations: { readOnlyHint: true },
      execute: ({ spriteId, frameIndex, layerId }) => {
        const t = target(spriteId, frameIndex, layerId);
        if ("error" in t) return { ok: false, error: t.error };
        const { sprite, layer, frameIndex: fi } = t;
        const frame = layer.frames[fi]!;
        const rows = pixelsToRowsWithWidth(frame.pixels, sprite.width);
        const used = [...new Set(frame.pixels)]
          .filter((p) => p !== TRANSPARENT)
          .sort((a, b) => a - b);
        log("read_sprite", `${sprite.name} frame ${fi}`);
        return {
          ok: true,
          sprite: { id: sprite.id, name: sprite.name, width: sprite.width, height: sprite.height },
          frameIndex: fi,
          linked: Boolean(frame.linkId),
          linkId: frame.linkId ?? null,
          legend: used.map((i) => ({
            char: PIXEL_SYMBOLS[i] ?? "?",
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
      layerId?: string;
    }>({
      name: "set_pixels",
      title: "Set pixels",
      description:
        "Paint specific pixels on a sprite frame. Each valid requested pixel is applied in order, one cell at a time on the page. Use fill_region or flood_fill for bulk areas.",
      inputSchema: {
        type: "object",
        properties: {
          pixels: {
            type: "array",
            maxItems: 4096,
            description: "List of pixel changes, applied one cell at a time, e.g. [{\"x\":3,\"y\":4,\"color\":\"#38b764\"}]",
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
          layerId: { type: "string", description: "Layer id. Defaults to the first layer." },
        },
        required: ["pixels"],
      },
      execute: async ({ pixels, spriteId, frameIndex, allFrames, layerId }) => {
        const t = target(spriteId, frameIndex, layerId);
        if ("error" in t) return { ok: false, error: t.error };
        const lockError = layerLockError(t.layer.id, t.sprite.id);
        if (lockError) return { ok: false, error: lockError };
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
        const paint = await applyAnimatedPaint(
          actionId,
          previewCells(changes, t.sprite.width, t.sprite.height, useStore.getState().project.palette),
          t.sprite.id,
          t.frameIndex,
          !!allFrames,
          t.layer.id,
        );
        finishAgentAction(actionId, paint.applied > 0 ? `Painted ${paint.applied} pixel${paint.applied === 1 ? "" : "s"}` : "No pixels changed");
        log("set_pixels", `${paint.applied} px on ${t.sprite.name}`);
        if (paint.applied === 0) return { ok: false, error: "no pixels were changed" };
        return {
          ok: true,
          applied: paint.applied,
          addedPaletteColors: paint.addedColors.map((i) => ({
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
      layerId?: string;
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
          layerId: { type: "string" },
        },
        required: ["x", "y", "width", "height", "color"],
      },
      execute: async ({ x, y, width, height, color, spriteId, frameIndex, allFrames, layerId }) => {
        const t = target(spriteId, frameIndex, layerId);
        if ("error" in t) return { ok: false, error: t.error };
        const lockError = layerLockError(t.layer.id, t.sprite.id);
        if (lockError) return { ok: false, error: lockError };
        const rx = Math.round(x);
        const ry = Math.round(y);
        const rw = Math.round(width);
        const rh = Math.round(height);
        const left = Math.max(0, rx);
        const top = Math.max(0, ry);
        const right = Math.min(t.sprite.width, rx + Math.max(0, rw));
        const bottom = Math.min(t.sprite.height, ry + Math.max(0, rh));
        const colorError = paintColorError(color);
        if (colorError) return { ok: false, error: colorError };
        const actionId = beginAgentAction({
          tool: "fill_region",
          spriteId: t.sprite.id,
          frameIndex: t.frameIndex,
          message: `Filling ${Math.max(0, right - left) * Math.max(0, bottom - top)} pixels on ${t.sprite.name}`,
        });
        await showAgentAction(actionId, {
          x: Math.max(0, Math.min(t.sprite.width - 1, Math.floor((left + right - 1) / 2))),
          y: Math.max(0, Math.min(t.sprite.height - 1, Math.floor((top + bottom - 1) / 2))),
        });
        interruptHumanStroke();
        const result = useStore
          .getState()
          .fillRegion(rx, ry, rw, rh, color, t.sprite.id, t.frameIndex, !!allFrames, t.layer.id);
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

    defineTool<{
      x: number;
      y: number;
      color: number | string | null;
      spriteId?: string;
      frameIndex?: number;
      layerId?: string;
    }>({
      name: "flood_fill",
      title: "Flood fill region",
      description:
        "Bucket-fill: starting at x,y, replace all connected pixels of the same color with the new color (transparent counts as a color). Fails clearly if the start pixel is out of bounds.",
      inputSchema: {
        type: "object",
        properties: {
          x: { type: "number" },
          y: { type: "number" },
          color: colorSchemaProp,
          spriteId: { type: "string" },
          frameIndex: { type: "number" },
          layerId: { type: "string" },
        },
        required: ["x", "y", "color"],
      },
      execute: async ({ x, y, color, spriteId, frameIndex, layerId }) => {
        const t = target(spriteId, frameIndex, layerId);
        if ("error" in t) return { ok: false, error: t.error };
        const lockError = layerLockError(t.layer.id, t.sprite.id);
        if (lockError) return { ok: false, error: lockError };
        const sx = Math.round(x);
        const sy = Math.round(y);
        if (sx < 0 || sy < 0 || sx >= t.sprite.width || sy >= t.sprite.height)
          return {
            ok: false,
            error: `start pixel (${sx},${sy}) is outside the ${t.sprite.width}x${t.sprite.height} canvas`,
          };
        const actionId = beginAgentAction({
          tool: "flood_fill",
          spriteId: t.sprite.id,
          frameIndex: t.frameIndex,
          message: `Bucket-filling ${t.sprite.name} from (${sx},${sy})`,
          status: "filling",
        });
        await showAgentAction(actionId, { x: sx, y: sy });
        interruptHumanStroke();
        const result = useStore.getState().floodFillAt(sx, sy, color, t.sprite.id, t.frameIndex, t.layer.id);
        if (result && "error" in result) {
          finishAgentAction(actionId, result.error);
          return { ok: false, error: result.error };
        }
        finishAgentAction(actionId, "Bucket fill complete");
        log("flood_fill", `${t.sprite.name} @ ${sx},${sy}`);
        return { ok: true };
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
          layerId: { type: "string" },
        },
      },
      execute: async ({ spriteId, frameIndex, layerId }) => {
        const t = target(spriteId, frameIndex, layerId);
        if ("error" in t) return { ok: false, error: t.error };
        const lockError = layerLockError(t.layer.id, t.sprite.id);
        if (lockError) return { ok: false, error: lockError };
        const actionId = beginAgentAction({
          tool: "clear_frame",
          spriteId: t.sprite.id,
          frameIndex: t.frameIndex,
          message: `Clearing ${t.sprite.name} frame ${t.frameIndex + 1}`,
        });
        await showAgentAction(actionId, {
          x: Math.floor(t.sprite.width / 2),
          y: Math.floor(t.sprite.height / 2),
        });
        interruptHumanStroke();
        useStore.getState().clearFrame(t.sprite.id, t.frameIndex, t.layer.id);
        finishAgentAction(actionId, "Frame cleared");
        log("clear_frame", `${t.sprite.name} frame ${t.frameIndex}`);
        return { ok: true };
      },
    }),

    defineTool<{
      op: "flip_h" | "flip_v" | "rotate_90" | "rotate" | "shift" | "outline";
      dx?: number;
      dy?: number;
      angle?: number;
      color?: number | string | null;
      frameIndices?: number[];
      spriteId?: string;
      layerId?: string;
    }>({
      name: "transform_sprite",
      title: "Transform sprite",
      description:
        "Apply a geometric transform to a sprite. Ops: flip_h, flip_v, rotate_90 (clockwise), rotate (RotSprite-style nearest-neighbor angle in degrees), shift (wrap-around move by dx/dy), outline (adds outlineColor around silhouettes). Applies to all frames unless frameIndices given.",
      inputSchema: {
        type: "object",
        properties: {
          op: { type: "string", enum: ["flip_h", "flip_v", "rotate_90", "rotate", "shift", "outline"] },
          dx: { type: "number", description: "shift only: horizontal offset" },
          dy: { type: "number", description: "shift only: vertical offset" },
          angle: { type: "number", description: "rotate only: clockwise angle in degrees; keeps the sprite dimensions" },
          color: { ...colorSchemaProp, description: "outline only: outline color (defaults to palette index 0)" },
          frameIndices: { type: "array", items: { type: "number" }, description: "Which frames; omit for all." },
          spriteId: { type: "string" },
          layerId: { type: "string" },
        },
        required: ["op"],
      },
      execute: async ({ op, dx, dy, angle, color, frameIndices, spriteId, layerId }) => {
        const st = useStore.getState();
        if (
          op === "shift" &&
          ((dx !== undefined && (typeof dx !== "number" || !Number.isFinite(dx))) ||
            (dy !== undefined && (typeof dy !== "number" || !Number.isFinite(dy))))
        ) {
          return { ok: false, error: "dx/dy must be finite numbers" };
        }
        if (op === "rotate" && (angle !== undefined && (typeof angle !== "number" || !Number.isFinite(angle)))) {
          return { ok: false, error: "angle must be a finite number" };
        }
        const resolved = target(spriteId, undefined, layerId);
        if ("error" in resolved) return { ok: false, error: resolved.error };
        const lockError = layerLockError(resolved.layer.id, resolved.sprite.id);
        if (lockError) return { ok: false, error: lockError };
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
        interruptHumanStroke();
        const err = st.transform(op, {
          dx: typeof dx === "number" ? Math.round(dx) : undefined,
          dy: typeof dy === "number" ? Math.round(dy) : undefined,
          angle: typeof angle === "number" ? angle : undefined,
          color,
          frameIndices: Array.isArray(frameIndices) ? frameIndices : undefined,
          spriteId,
          layerId,
        });
        finishAgentAction(actionId, err ? `Could not apply ${op.replaceAll("_", " ")}` : `${op.replaceAll("_", " ")} complete`);
        log("transform_sprite", `${op}${err ? " failed" : ""}`);
        return err ? { ok: false, error: err } : { ok: true };
      },
    }),

    defineTool<{ from: number | string | null; to: number | string | null; spriteId?: string; layerId?: string }>({
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
          layerId: { type: "string", description: "Scope to one layer; omit for all layers." },
        },
        required: ["from", "to"],
      },
      execute: async ({ from, to, spriteId, layerId }) => {
        const st = useStore.getState();
        const resolved = target(spriteId, undefined, layerId);
        if ("error" in resolved) return { ok: false, error: resolved.error };
        const lockError = layerLockError(resolved.layer.id, resolved.sprite.id);
        if (lockError) return { ok: false, error: lockError };
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
        interruptHumanStroke();
        const result = st.replaceColor(from, to, spriteId, layerId);
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
        interruptHumanStroke();
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

    defineTool<{ index: number; alpha: number }>({
      name: "set_palette_alpha",
      title: "Set palette alpha",
      description: "Set the selected palette entry's opacity from 0 to 1 without changing its color index.",
      inputSchema: {
        type: "object",
        properties: { index: { type: "number" }, alpha: { type: "number", minimum: 0, maximum: 1 } },
        required: ["index", "alpha"],
      },
      execute: ({ index, alpha }) => {
        const ok = useStore.getState().setPaletteAlpha(Math.round(index), alpha);
        log("set_palette_alpha", ok ? `palette ${Math.round(index)}` : "invalid palette entry");
        return ok ? { ok: true, index: Math.round(index), alpha: Math.max(0, Math.min(1, alpha)) } : { ok: false, error: "palette index not found" };
      },
    }),

    defineTool<{ fromIndex: number; toIndex: number }>({
      name: "move_palette_color",
      title: "Move palette color",
      description: "Reorder a palette entry while remapping all pixel indices so the artwork keeps its appearance.",
      inputSchema: {
        type: "object",
        properties: { fromIndex: { type: "number" }, toIndex: { type: "number" } },
        required: ["fromIndex", "toIndex"],
      },
      execute: ({ fromIndex, toIndex }) => {
        const from = Math.round(fromIndex);
        const to = Math.round(toIndex);
        const ok = useStore.getState().movePaletteColor(from, to);
        if (ok && useEditor.getState().colorIdx === from) useEditor.getState().setColor(to);
        log("move_palette_color", ok ? `${from} → ${to}` : "invalid palette move");
        return ok ? { ok: true, fromIndex: from, toIndex: to } : { ok: false, error: "palette indices are invalid or identical" };
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

    defineTool<{ spriteId?: string; copyFrameIndex?: number; layerId?: string }>({
      name: "add_frame",
      title: "Add animation frame",
      description:
        "Add a new animation frame to a character sprite, copying an existing frame by default so it can be nudged into the next pose.",
      inputSchema: {
        type: "object",
        properties: {
          spriteId: { type: "string" },
          copyFrameIndex: { type: "number", description: "Frame to duplicate. Defaults to the last frame." },
          layerId: { type: "string", description: "Layer id. Defaults to the selected layer." },
        },
      },
      execute: async ({ spriteId, copyFrameIndex, layerId }) => {
        const resolved = target(spriteId, undefined, layerId);
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
        interruptHumanStroke();
        const idx = useStore.getState().addFrame(spriteId, copyFrameIndex, resolved.layer.id);
        if (idx < 0) {
          finishAgentAction(actionId, "Could not add frame");
          return { ok: false, error: "could not add frame" };
        }
        finishAgentAction(actionId, `Added frame ${idx + 1}`);
        log("add_frame", `frame ${idx}`);
        return { ok: true, newIndex: idx };
      },
    }),

    defineTool<{ frameIndex: number; spriteId?: string; layerId?: string; confirm: boolean }>({
      name: "delete_frame",
      title: "Delete animation frame",
      description:
        "Delete one animation frame from a sprite. Requires confirm:true. Refuses to delete a sprite's last remaining frame.",
      inputSchema: {
        type: "object",
        properties: {
          frameIndex: { type: "number", description: "Zero-based frame to delete" },
          spriteId: { type: "string" },
          layerId: { type: "string", description: "Layer id. Defaults to the selected layer." },
          confirm: { type: "boolean", description: "Must be true to perform the deletion" },
        },
        required: ["frameIndex", "confirm"],
      },
      execute: ({ frameIndex, spriteId, layerId, confirm }) => {
        if (confirm !== true) return { ok: false, error: "deletion requires confirm:true" };
        const t = target(spriteId, frameIndex, layerId);
        if ("error" in t) return { ok: false, error: t.error };
        interruptHumanStroke();
        const ok = useStore.getState().deleteFrame(frameIndex, t.sprite.id, t.layer.id);
        log("delete_frame", ok ? `${t.sprite.name} frame ${frameIndex}` : `refused (${t.sprite.name})`);
        return ok
          ? { ok: true }
          : { ok: false, error: "cannot delete the sprite's last remaining frame" };
      },
    }),

    defineTool<{ frameIndex: number; targetIndex: number; spriteId?: string; layerId?: string }>({
      name: "link_frame",
      title: "Link animation cels",
      description: "Link two cels on one layer so future pixel edits stay synchronized across both frames.",
      inputSchema: {
        type: "object",
        properties: {
          frameIndex: { type: "number", description: "Zero-based cel to link" },
          targetIndex: { type: "number", description: "Zero-based cel to link it with" },
          spriteId: { type: "string" },
          layerId: { type: "string", description: "Layer id. Defaults to the selected layer." },
        },
        required: ["frameIndex", "targetIndex"],
      },
      execute: ({ frameIndex, targetIndex, spriteId, layerId }) => {
        const t = target(spriteId, frameIndex, layerId);
        if ("error" in t) return { ok: false, error: t.error };
        const ok = useStore.getState().linkFrame(frameIndex, Math.round(targetIndex), t.sprite.id, t.layer.id);
        log("link_frame", ok ? `${t.sprite.name} ${frameIndex} ↔ ${targetIndex}` : "invalid cel pair");
        return ok ? { ok: true } : { ok: false, error: "both cels must exist and be different" };
      },
    }),

    defineTool<{ frameIndex: number; spriteId?: string; layerId?: string }>({
      name: "unlink_frame",
      title: "Unlink animation cel",
      description: "Detach one cel from its linked group so it can be edited independently.",
      inputSchema: {
        type: "object",
        properties: {
          frameIndex: { type: "number" },
          spriteId: { type: "string" },
          layerId: { type: "string", description: "Layer id. Defaults to the selected layer." },
        },
        required: ["frameIndex"],
      },
      execute: ({ frameIndex, spriteId, layerId }) => {
        const t = target(spriteId, frameIndex, layerId);
        if ("error" in t) return { ok: false, error: t.error };
        const ok = useStore.getState().unlinkFrame(frameIndex, t.sprite.id, t.layer.id);
        log("unlink_frame", ok ? `${t.sprite.name} frame ${frameIndex}` : "cel was not linked");
        return ok ? { ok: true } : { ok: false, error: "cel is not linked" };
      },
    }),

    defineTool<{ spriteId?: string; name?: string; aboveLayerId?: string }>({
      name: "add_layer",
      title: "Create layer",
      description: "Create an empty animation layer above the selected layer. It starts with matching cels so it can be painted immediately.",
      inputSchema: {
        type: "object",
        properties: {
          spriteId: { type: "string", description: "Sprite id; defaults to the active sprite." },
          name: { type: "string", description: "Layer name; defaults to Layer." },
          aboveLayerId: { type: "string", description: "Insert above this layer; defaults to the top." },
        },
      },
      execute: ({ spriteId, name, aboveLayerId }) => {
        const id = useStore.getState().addLayer(spriteId, name, aboveLayerId);
        if (!id) return { ok: false, error: "could not create layer (capacity or sprite error)" };
        useEditor.getState().setActiveLayerId(id);
        log("add_layer", `${name?.trim() || "Layer"} created`);
        return { ok: true, layerId: id };
      },
    }),

    defineTool<{ layerId: string; spriteId?: string }>({
      name: "duplicate_layer",
      title: "Duplicate layer",
      description: "Copy a layer, including every cel, and place the copy directly above it.",
      inputSchema: {
        type: "object",
        properties: {
          layerId: { type: "string" },
          spriteId: { type: "string" },
        },
        required: ["layerId"],
      },
      execute: ({ layerId, spriteId }) => {
        const id = useStore.getState().duplicateLayer(layerId, spriteId);
        if (!id) return { ok: false, error: "could not duplicate layer" };
        useEditor.getState().setActiveLayerId(id);
        log("duplicate_layer", layerId);
        return { ok: true, layerId: id };
      },
    }),

    defineTool<{ layerId: string; spriteId?: string; confirm: boolean }>({
      name: "delete_layer",
      title: "Delete layer",
      description: "Delete a layer after explicit confirmation. A sprite must keep at least one layer.",
      inputSchema: {
        type: "object",
        properties: { layerId: { type: "string" }, spriteId: { type: "string" }, confirm: { type: "boolean" } },
        required: ["layerId", "confirm"],
      },
      execute: ({ layerId, spriteId, confirm }) => {
        if (confirm !== true) return { ok: false, error: "deletion requires confirm:true" };
        const ok = useStore.getState().deleteLayer(layerId, spriteId);
        if (!ok) return { ok: false, error: "cannot delete the layer (it may be the last layer)" };
        const active = useStore.getState().activeSprite();
        useEditor.getState().setActiveLayerId(active?.layers?.[0]?.id ?? null);
        log("delete_layer", layerId);
        return { ok: true };
      },
    }),

    defineTool<{ layerId: string; direction: -1 | 1; spriteId?: string }>({
      name: "move_layer",
      title: "Move layer",
      description: "Move a layer one slot up or down in the stack. Direction 1 moves toward the top.",
      inputSchema: {
        type: "object",
        properties: { layerId: { type: "string" }, direction: { type: "number", enum: [-1, 1] }, spriteId: { type: "string" } },
        required: ["layerId", "direction"],
      },
      execute: ({ layerId, direction, spriteId }) => {
        if (direction !== -1 && direction !== 1) return { ok: false, error: "direction must be -1 or 1" };
        const ok = useStore.getState().moveLayer(layerId, direction, spriteId);
        log("move_layer", ok ? `${layerId} ${direction > 0 ? "up" : "down"}` : "edge of stack");
        return ok ? { ok: true } : { ok: false, error: "layer is already at that edge" };
      },
    }),

    defineTool<{
      layerId: string;
      spriteId?: string;
      name?: string;
      visible?: boolean;
      locked?: boolean;
      opacity?: number;
      blendMode?: "normal" | "multiply" | "screen" | "overlay";
    }>({
      name: "set_layer_properties",
      title: "Set layer properties",
      description: "Update a layer name, visibility, lock, opacity, or blend mode.",
      inputSchema: {
        type: "object",
        properties: {
          layerId: { type: "string" },
          spriteId: { type: "string" },
          name: { type: "string" },
          visible: { type: "boolean" },
          locked: { type: "boolean" },
          opacity: { type: "number", minimum: 0, maximum: 1 },
          blendMode: { type: "string", enum: ["normal", "multiply", "screen", "overlay"] },
        },
        required: ["layerId"],
      },
      execute: ({ layerId, spriteId, name, visible, locked, opacity, blendMode }) => {
        const store = useStore.getState();
        let changed = false;
        if (name !== undefined) changed = store.renameLayer(layerId, name, spriteId) || changed;
        if (visible !== undefined) changed = store.setLayerVisibility(layerId, visible, spriteId) || changed;
        if (locked !== undefined) changed = store.setLayerLocked(layerId, locked, spriteId) || changed;
        if (opacity !== undefined) changed = store.setLayerOpacity(layerId, opacity, spriteId) || changed;
        if (blendMode !== undefined) changed = store.setLayerBlendMode(layerId, blendMode, spriteId) || changed;
        if (!changed) return { ok: false, error: "layer not found or no valid property was supplied" };
        log("set_layer_properties", layerId);
        return { ok: true, layerId };
      },
    }),

    defineTool<{
      mode?: "forward" | "reverse" | "ping_pong";
      tagId?: string | null;
      fps?: number;
      playing?: boolean;
      onion?: boolean;
      onionMode?: "tint" | "red_blue";
    }>({
      name: "set_animation_preview",
      title: "Set animation preview",
      description: "Control playback mode, tagged range, speed, and onion-skin display without changing sprite pixels.",
      inputSchema: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["forward", "reverse", "ping_pong"] },
          tagId: { anyOf: [{ type: "string" }, { type: "null" }] },
          fps: { type: "number", minimum: 1, maximum: 30 },
          playing: { type: "boolean" },
          onion: { type: "boolean" },
          onionMode: { type: "string", enum: ["tint", "red_blue"] },
        },
      },
      execute: ({ mode, tagId, fps, playing, onion, onionMode }) => {
        const editor = useEditor.getState();
        const sprite = useStore.getState().activeSprite();
        if (tagId !== undefined && tagId !== null && !sprite?.frameTags?.some((tag) => tag.id === tagId)) {
          return { ok: false, error: `animation tag '${tagId}' not found on the active sprite` };
        }
        if (mode !== undefined) editor.setPlaybackMode(mode);
        if (tagId !== undefined) editor.setPlaybackTagId(tagId);
        if (fps !== undefined) editor.setFps(fps);
        if (playing !== undefined) editor.setPlaying(playing);
        if (onion !== undefined) {
          if (useEditor.getState().onion !== onion) editor.toggleOnion();
        }
        if (onionMode !== undefined) editor.setOnionMode(onionMode);
        log("set_animation_preview", mode ?? "preview updated");
        return {
          ok: true,
          mode: useEditor.getState().playbackMode,
          tagId: useEditor.getState().playbackTagId,
          fps: useEditor.getState().fps,
          playing: useEditor.getState().playing,
          onion: useEditor.getState().onion,
          onionMode: useEditor.getState().onionMode,
        };
      },
    }),

    defineTool<{
      zoom?: number;
      showGrid?: boolean;
      pixelPerfect?: boolean;
      shadingMode?: boolean;
      tiledMode?: boolean;
      brushMode?: "solid" | "checker" | "dots";
    }>({
      name: "set_canvas_options",
      title: "Set canvas options",
      description: "Set zoom, grid, pixel-perfect stroke, shading ink, tiled preview, and dither brush options.",
      inputSchema: {
        type: "object",
        properties: {
          zoom: { type: "number", minimum: 1, maximum: 48 },
          showGrid: { type: "boolean" },
          pixelPerfect: { type: "boolean" },
          shadingMode: { type: "boolean" },
          tiledMode: { type: "boolean" },
          brushMode: { type: "string", enum: ["solid", "checker", "dots"] },
        },
      },
      execute: ({ zoom, showGrid, pixelPerfect, shadingMode, tiledMode, brushMode }) => {
        const editor = useEditor.getState();
        if (zoom !== undefined) editor.setZoom(zoom);
        if (showGrid !== undefined) editor.setShowGrid(showGrid);
        if (pixelPerfect !== undefined) editor.setPixelPerfect(pixelPerfect);
        if (shadingMode !== undefined) editor.setShadingMode(shadingMode);
        if (tiledMode !== undefined) editor.setTiledMode(tiledMode);
        if (brushMode !== undefined) editor.setBrushMode(brushMode);
        log("set_canvas_options", "canvas view updated");
        const current = useEditor.getState();
        return {
          ok: true,
          zoom: current.zoom,
          showGrid: current.showGrid,
          pixelPerfect: current.pixelPerfect,
          shadingMode: current.shadingMode,
          tiledMode: current.tiledMode,
          brushMode: current.brushMode,
        };
      },
    }),

    defineTool<{ spriteId?: string; name: string; from?: number; to?: number; color?: string }>({
      name: "add_frame_tag",
      title: "Tag animation frames",
      description: "Create a named animation section over a range of frames, such as idle or walk.",
      inputSchema: {
        type: "object",
        properties: { spriteId: { type: "string" }, name: { type: "string" }, from: { type: "number" }, to: { type: "number" }, color: { type: "string" } },
        required: ["name"],
      },
      execute: ({ spriteId, name, from, to, color }) => {
        const id = useStore.getState().addFrameTag({ name, from, to, color }, spriteId);
        if (!id) return { ok: false, error: "could not create frame tag" };
        log("add_frame_tag", name);
        return { ok: true, tagId: id };
      },
    }),

    defineTool<{ tagId: string; spriteId?: string; confirm: boolean }>({
      name: "delete_frame_tag",
      title: "Delete frame tag",
      description: "Delete a named animation section after explicit confirmation.",
      inputSchema: {
        type: "object",
        properties: { tagId: { type: "string" }, spriteId: { type: "string" }, confirm: { type: "boolean" } },
        required: ["tagId", "confirm"],
      },
      execute: ({ tagId, spriteId, confirm }) => {
        if (confirm !== true) return { ok: false, error: "deletion requires confirm:true" };
        const ok = useStore.getState().deleteFrameTag(tagId, spriteId);
        if (!ok) return { ok: false, error: "frame tag not found" };
        log("delete_frame_tag", tagId);
        return { ok: true };
      },
    }),

    defineTool<{ spriteId: string; name: string }>({
      name: "rename_sprite",
      title: "Rename sprite",
      description: "Rename an existing sprite (e.g. after giving an untitled sprite an identity).",
      inputSchema: {
        type: "object",
        properties: {
          spriteId: { type: "string" },
          name: { type: "string", maxLength: MAX_SPRITE_NAME_LENGTH, description: "New name (non-empty)" },
        },
        required: ["spriteId", "name"],
      },
      execute: ({ spriteId, name }) => {
        const t = target(spriteId);
        if ("error" in t) return { ok: false, error: t.error };
        const nextName = typeof name === "string" ? name.trim().slice(0, MAX_SPRITE_NAME_LENGTH) : "";
        if (!nextName)
          return { ok: false, error: "name must be a non-empty string" };
        interruptHumanStroke();
        useStore.getState().renameSprite(t.sprite.id, nextName);
        log("rename_sprite", `${t.sprite.name} -> ${nextName}`);
        return { ok: true, spriteId: t.sprite.id, name: nextName };
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
          name: { type: "string", maxLength: MAX_SPRITE_NAME_LENGTH },
          width: { type: "number", description: "1-64, typically 16, 32 or 64" },
          height: { type: "number", description: "1-64, typically 16, 32 or 64" },
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
        interruptHumanStroke();
        const id = useStore.getState().addSprite({ name, width, height, kind, copyFromId });
        if (!id) {
          finishAgentAction(actionId, "Project capacity reached");
          log("add_sprite", "rejected: project capacity reached");
          return { ok: false, error: "project capacity reached (sprite, frame, or pixel limit)" };
        }
        finishAgentAction(actionId, `Created ${name || "new sprite"}`);
        log("add_sprite", `${name} (${kind})`);
        return { ok: true, spriteId: id };
      },
    }),

    defineTool({
      name: "get_tilemap",
      title: "Read tilemap",
      description:
        "Read the tilemap grid as ASCII rows where each token maps to a tileset sprite via the returned legend. Maps with more than 64 tiles use two-character tokens and return tokenWidth: 2.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => {
        const st = useStore.getState();
        const tm = st.project.tilemap;
        if (!tm) return { ok: false, error: "no tilemap exists yet; call ensure_tilemap first to create one" };
        const tiles = st.project.sprites.filter((sp) => sp.kind === "tile");
        const tokenWidth = tiles.length > PIXEL_SYMBOLS.length ? 2 : 1;
        const tokenFor = (index: number): string =>
          tokenWidth === 1
            ? PIXEL_SYMBOLS[(index + 10) % PIXEL_SYMBOLS.length]!
            : `${PIXEL_SYMBOLS[Math.floor(index / PIXEL_SYMBOLS.length)]!}${PIXEL_SYMBOLS[index % PIXEL_SYMBOLS.length]!}`;
        const charFor = new Map<string, string>();
        tiles.forEach((t, i) => charFor.set(t.id, tokenFor(i)));
        const transparentChar = tokenWidth === 1 ? "." : "..";
        const rowsAscii: string[] = [];
        for (let y = 0; y < tm.rows; y++) {
          let row = "";
          for (let x = 0; x < tm.cols; x++) {
            const id = tm.cells[y * tm.cols + x];
            row += id ? charFor.get(id) ?? "??" : transparentChar;
          }
          rowsAscii.push(row);
        }
        log("get_tilemap", `${tm.cols}x${tm.rows} map`);
        return {
          ok: true,
          cols: tm.cols,
          rows: tm.rows,
          tokenWidth,
          transparentChar,
          legend: tiles.map((t) => ({ char: charFor.get(t.id) ?? "??", id: t.id, name: t.name })),
          rows_ascii: rowsAscii,
        };
      },
    }),

    defineTool<{ cols: number; rows: number }>({
      name: "ensure_tilemap",
      title: "Create or resize tilemap",
      description:
        "Create the project tilemap (or resize it, preserving overlapping cells) so tiles can be placed. Cols/rows are clamped to 2-64; default to 12x9 when unsure. No-ops with ok:true if the map already has these dimensions.",
      inputSchema: {
        type: "object",
        properties: {
          cols: { type: "number", description: "Map width in tiles (2-64)" },
          rows: { type: "number", description: "Map height in tiles (2-64)" },
        },
        required: ["cols", "rows"],
      },
      execute: ({ cols, rows }) => {
        const st = useStore.getState();
        const before = st.project.tilemap;
        interruptHumanStroke();
        st.ensureTilemap(Math.round(cols), Math.round(rows));
        const after = useStore.getState().project.tilemap;
        const created = !before && !!after;
        log("ensure_tilemap", created ? `created ${after?.cols}x${after?.rows}` : `ensured ${after?.cols}x${after?.rows}`);
        return {
          ok: true,
          created,
          size: after ? `${after.cols}x${after.rows}` : null,
          note: created ? "tilemap created" : "tilemap already existed or was resized",
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
        interruptHumanStroke();
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
        interruptHumanStroke();
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
        "Serialize the entire project (palette, sprites, frames, tilemap) as JSON that can be re-imported via the import_project tool, the Sprites > Project file > Import button, or a share permalink.",
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

    defineTool<{ json: string }>({
      name: "import_project",
      title: "Import project JSON",
      description:
        "Replace the current project with one previously exported via export_project (or a project file). The JSON is sanitized and validated; the human sees the imported project immediately.",
      inputSchema: {
        type: "object",
        properties: {
          json: { type: "string", description: "Full project JSON string" },
        },
        required: ["json"],
      },
      execute: ({ json }) => {
        if (typeof json !== "string" || json.length > MAX_PROJECT_JSON_LENGTH) {
          return { ok: false, error: `json exceeds the ${MAX_PROJECT_JSON_LENGTH.toLocaleString()} character limit` };
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(json);
        } catch {
          return { ok: false, error: "json is not parseable JSON" };
        }
        interruptHumanStroke();
        const result = useStore.getState().loadProject(parsed);
        log("import_project", result.ok ? "imported" : "rejected");
        return result.ok
          ? { ok: true }
          : { ok: false, error: result.error };
      },
    }),
    defineTool<{ confirm: boolean }>({
      name: "new_canvas",
      title: "New blank canvas",
      description:
        "Replace the current project with a fresh blank 64x64 canvas (one empty character sprite, default palette, no tilemap). Requires confirm:true. The human sees the blank canvas immediately; use this to start a new drawing together.",
      inputSchema: {
        type: "object",
        properties: {
          confirm: { type: "boolean", description: "Must be true to clear the current project" },
        },
        required: ["confirm"],
      },
      execute: async ({ confirm }) => {
        if (confirm !== true) return { ok: false, error: "starting a new canvas requires confirm:true" };
        const actionId = beginAgentAction({
          tool: "new_canvas",
          spriteId: null,
          frameIndex: 0,
          message: "Starting a fresh blank canvas",
          status: "thinking",
        });
        await showAgentAction(actionId);
        interruptHumanStroke();
        useStore.getState().resetProject("blank");
        const after = useStore.getState().activeSprite();
        finishAgentAction(actionId, after ? `Fresh ${after.width}x${after.height} canvas ready` : "Fresh canvas ready");
        log("new_canvas", "started blank canvas");
        return { ok: true, spriteId: after?.id ?? null, size: after ? `${after.width}x${after.height}` : null };
      },
    }),

    defineTool<{ step?: number }>({
      name: "start_tutorial",
      title: "Start guided tutorial",
      description:
        "Open the step-by-step guided tour overlay (shared with the room, so following humans see the same step) and jump to a step. Use it to walk the human through the whole app, then guide them to a first project together with your drawing tools.",
      inputSchema: {
        type: "object",
        properties: {
          step: { type: "number", description: "Zero-based step index. Defaults to 0 (the beginning)." },
        },
      },
      execute: async ({ step }) => {
        const at = clampTutorialStep(step ?? 0);
        const actionId = beginAgentAction({
          tool: "start_tutorial",
          spriteId: null,
          frameIndex: 0,
          message: `Guiding the tour: step ${at + 1} of ${TUTORIAL_STEPS.length}`,
          status: "thinking",
        });
        await showAgentAction(actionId);
        useUi.getState().openTutorial(at);
        finishAgentAction(actionId, `Tutorial open at step ${at + 1}`);
        log("start_tutorial", `step ${at + 1}/${TUTORIAL_STEPS.length}`);
        return {
          ok: true,
          step: at,
          totalSteps: TUTORIAL_STEPS.length,
          title: TUTORIAL_STEPS[at].title,
          body: TUTORIAL_STEPS[at].body,
        };
      },
    }),

    defineTool<{ step: number }>({
      name: "tutorial_goto",
      title: "Go to tutorial step",
      description:
        "Jump the shared guided-tour overlay to a given step (0-based). Pair each step with a live demo using your drawing tools.",
      inputSchema: {
        type: "object",
        properties: {
          step: { type: "number", description: "Zero-based step index" },
        },
        required: ["step"],
      },
      execute: async ({ step }) => {
        const at = clampTutorialStep(step);
        const actionId = beginAgentAction({
          tool: "tutorial_goto",
          spriteId: null,
          frameIndex: 0,
          message: `Guiding the tour: step ${at + 1} of ${TUTORIAL_STEPS.length}`,
          status: "thinking",
        });
        await showAgentAction(actionId);
        useUi.getState().setTutorialStep(at);
        finishAgentAction(actionId, `Tutorial at step ${at + 1}`);
        log("tutorial_goto", `step ${at + 1}/${TUTORIAL_STEPS.length}`);
        return {
          ok: true,
          step: at,
          totalSteps: TUTORIAL_STEPS.length,
          title: TUTORIAL_STEPS[at].title,
          body: TUTORIAL_STEPS[at].body,
        };
      },
    }),

    defineTool({
      name: "end_tutorial",
      title: "End guided tutorial",
      description:
        "Close the shared guided-tour overlay on this window (following humans keep their own copy until they close it). Call it when the tour is done so it never pops back up.",
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        const actionId = beginAgentAction({
          tool: "end_tutorial",
          spriteId: null,
          frameIndex: 0,
          message: "Wrapping up the tour",
          status: "thinking",
        });
        await showAgentAction(actionId);
        useUi.getState().closeTutorial();
        finishAgentAction(actionId, "Tutorial closed");
        log("end_tutorial", "closed");
        return { ok: true };
      },
    }),

    defineTool<{ name: string }>({
      name: "rename_project",
      title: "Rename project",
      description:
        "Rename the current project (e.g. 'guided-tutorial-01' when starting a tutorial piece). The human sees the new title immediately.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", maxLength: MAX_PROJECT_NAME_LENGTH, description: "New project name (non-empty)" },
        },
        required: ["name"],
      },
      execute: ({ name }) => {
        const nextName = typeof name === "string" ? name.trim().slice(0, MAX_PROJECT_NAME_LENGTH) : "";
        if (!nextName) return { ok: false, error: "name must be a non-empty string" };
        interruptHumanStroke();
        useStore.getState().renameProject(nextName);
        log("rename_project", nextName);
        return { ok: true, name: nextName };
      },
    }),

    defineTool<{ name?: string }>({
      name: "save_project",      title: "Save named project",
      description:
        "Save the current project into the on-device library under a name (defaults to the project name), so it can be reopened later with open_project. Saved names are listed in get_project_state.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Slot name, e.g. 'guided-tutorial-01'. Defaults to the project name." },
        },
      },
      execute: ({ name }) => {
        interruptHumanStroke();
        const result = useStore.getState().saveProjectAs(name);
        log("save_project", result.ok ? `saved '${result.name}'` : "save failed");
        return result.ok
          ? { ok: true, name: result.name, savedProjects: useStore.getState().listProjectSaves() }
          : { ok: false, error: result.error };
      },
    }),

    defineTool<{ name: string; confirm: boolean }>({
      name: "open_project",
      title: "Open saved project",
      description:
        "Replace the current project with a saved one from the on-device library. Requires confirm:true. The human sees the opened project immediately.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Saved project name" },
          confirm: { type: "boolean", description: "Must be true to replace the current project" },
        },
        required: ["name", "confirm"],
      },
      execute: ({ name, confirm }) => {
        if (confirm !== true) return { ok: false, error: "opening a saved project requires confirm:true" };
        interruptHumanStroke();
        const result = useStore.getState().openProjectSave(name);
        log("open_project", result.ok ? `opened '${name}'` : "open failed");
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      },
    }),

    defineTool<{ name?: string }>({
      name: "save_palette",
      title: "Save named palette",
      description:
        "Save the current shared palette into the on-device library under a name, so it can be merged into any project later with apply_palette. Saved names are listed in get_project_state.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Slot name. Defaults to '<project> palette'." },
        },
      },
      execute: ({ name }) => {
        interruptHumanStroke();
        const result = useStore.getState().savePaletteAs(name);
        log("save_palette", result.ok ? `saved '${result.name}'` : "save failed");
        return result.ok
          ? { ok: true, name: result.name, savedPalettes: useStore.getState().listPaletteSaves() }
          : { ok: false, error: result.error };
      },
    }),

    defineTool<{ name: string }>({
      name: "apply_palette",
      title: "Apply saved palette",
      description:
        "Merge a saved palette into the current project: missing colors are appended (up to 64), existing indices never move so artwork is untouched. Reports how many colors were added.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Saved palette name" },
        },
        required: ["name"],
      },
      execute: ({ name }) => {
        interruptHumanStroke();
        const result = useStore.getState().applyPaletteSave(name);
        log("apply_palette", result.ok ? `added ${result.added} colors` : "apply failed");
        return result.ok ? { ok: true, added: result.added } : { ok: false, error: result.error };
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
