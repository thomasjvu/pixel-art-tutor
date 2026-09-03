import type { BlendMode, Frame, FrameTag, Layer, Project, Sprite, SpriteKind, TilemapData } from "../types";
import {
  MAX_DIMENSION,
  MAX_FRAMES_PER_SPRITE,
  MAX_ID_LENGTH,
  MAX_LAYERS_PER_SPRITE,
  MAX_PALETTE_COLORS,
  MAX_PROJECT_NAME_LENGTH,
  MAX_SPRITE_NAME_LENGTH,
  MAX_SPRITES,
  MAX_TOTAL_PIXEL_CELLS,
  projectPixelCells,
} from "../projectLimits";

const HEX_COLOR = /^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/;
const CANONICAL_HEX_COLOR = /^#[0-9a-f]{6}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeColor(value: unknown): string | null {
  if (typeof value !== "string" || !HEX_COLOR.test(value)) return null;
  const normalized = value.toLowerCase();
  if (normalized.length === 7) return normalized;
  return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
}

function sanitizeDimension(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(1, Math.min(MAX_DIMENSION, Math.round(value)));
}

function sanitizeKind(value: unknown): SpriteKind {
  if (value === "character" || value === "item" || value === "tile") return value;
  return "item";
}

function sanitizeBlendMode(value: unknown): BlendMode {
  if (value === "multiply" || value === "screen" || value === "overlay") return value;
  return "normal";
}

function sanitizeOpacity(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
}

function uniqueId(candidate: unknown, fallback: string, used: Set<string>): string {
  const preferred =
    typeof candidate === "string" && candidate.trim().length > 0 && candidate.length <= MAX_ID_LENGTH
      ? candidate
      : fallback;
  if (!used.has(preferred)) {
    used.add(preferred);
    return preferred;
  }
  for (let suffix = 1; suffix < 10_000; suffix++) {
    const next = `${fallback}-${suffix}`;
    if (!used.has(next) && next.length <= MAX_ID_LENGTH) {
      used.add(next);
      return next;
    }
  }
  return fallback;
}

function sanitizeFrames(
  rawFrames: unknown,
  fallbackId: string,
  width: number,
  height: number,
  paletteLength: number,
  usedFrameIds: Set<string>,
): Frame[] {
  if (!Array.isArray(rawFrames)) return [];
  const pixelCount = width * height;
  const frames: Frame[] = [];
  for (let index = 0; index < Math.min(rawFrames.length, MAX_FRAMES_PER_SPRITE); index++) {
    const rawFrame = rawFrames[index];
    if (!isRecord(rawFrame) || !Array.isArray(rawFrame.pixels)) continue;
    const sourcePixels = rawFrame.pixels;
    const pixels = Array.from({ length: pixelCount }, (_, pixelIndex) => {
      const value = sourcePixels[pixelIndex];
      const pixel = Number.isInteger(value) ? value : -1;
      return pixel >= -1 && pixel < paletteLength ? pixel : -1;
    });
    const linkId =
      typeof rawFrame.linkId === "string" &&
      rawFrame.linkId.trim().length > 0 &&
      rawFrame.linkId.length <= MAX_ID_LENGTH
        ? rawFrame.linkId.trim()
        : undefined;
    frames.push({
      id: uniqueId(rawFrame.id, `${fallbackId}-f${index}`, usedFrameIds),
      pixels,
      ...(linkId ? { linkId } : {}),
    });
  }
  return frames;
}

function sanitizeFrameTags(rawTags: unknown, frameCount: number, fallbackId: string): FrameTag[] {
  if (!Array.isArray(rawTags) || frameCount < 1) return [];
  const usedIds = new Set<string>();
  const tags: FrameTag[] = [];
  for (let index = 0; index < Math.min(rawTags.length, MAX_FRAMES_PER_SPRITE); index++) {
    const rawTag = rawTags[index];
    if (!isRecord(rawTag)) continue;
    const from = Number.isInteger(rawTag.from) ? Math.max(0, Math.min(frameCount - 1, rawTag.from as number)) : 0;
    const to = Number.isInteger(rawTag.to) ? Math.max(from, Math.min(frameCount - 1, rawTag.to as number)) : from;
    const name = typeof rawTag.name === "string" ? rawTag.name.trim().slice(0, MAX_SPRITE_NAME_LENGTH) : "";
    if (!name) continue;
    tags.push({
      id: uniqueId(rawTag.id, `${fallbackId}-tag${index}`, usedIds),
      name,
      from,
      to,
      color: sanitizeColor(rawTag.color) ?? "#f6c445",
    });
  }
  return tags;
}

function sanitizeLayer(
  raw: unknown,
  fallbackId: string,
  width: number,
  height: number,
  paletteLength: number,
  usedLayerIds: Set<string>,
  usedFrameIds: Set<string>,
): Layer | null {
  if (!isRecord(raw)) return null;
  const frames = sanitizeFrames(raw.frames, fallbackId, width, height, paletteLength, usedFrameIds);
  if (frames.length === 0) return null;
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, MAX_SPRITE_NAME_LENGTH) : "";
  return {
    id: uniqueId(raw.id, fallbackId, usedLayerIds),
    name: name || "Layer",
    visible: raw.visible !== false,
    locked: raw.locked === true,
    opacity: sanitizeOpacity(raw.opacity),
    blendMode: sanitizeBlendMode(raw.blendMode),
    frames,
  };
}

function sanitizeSprite(raw: unknown, paletteLength: number): Sprite | null {
  if (!isRecord(raw)) return null;

  const id = raw.id;
  if (typeof id !== "string" || id.trim().length === 0 || id.length > MAX_ID_LENGTH) return null;

  const width = sanitizeDimension(raw.width);
  const height = sanitizeDimension(raw.height);
  if (
    width === null ||
    height === null ||
    (!Array.isArray(raw.frames) && !Array.isArray(raw.layers))
  ) {
    return null;
  }

  const frameIds = new Set<string>();
  const rawHasLayers = Array.isArray(raw.layers) && raw.layers.length > 0;
  const legacyFrames = rawHasLayers
    ? []
    : sanitizeFrames(raw.frames, id, width, height, paletteLength, frameIds);
  const layerIds = new Set<string>();
  const layers: Layer[] = [];
  if (Array.isArray(raw.layers)) {
    for (let index = 0; index < Math.min(raw.layers.length, MAX_LAYERS_PER_SPRITE); index++) {
      const layer = sanitizeLayer(
        raw.layers[index],
        `${id}-layer${index}`,
        width,
        height,
        paletteLength,
        layerIds,
        frameIds,
      );
      if (layer) layers.push(layer);
    }
  }
  if (layers.length === 0) {
    const fallbackFrames =
      legacyFrames.length > 0
        ? legacyFrames
        : sanitizeFrames(raw.frames, id, width, height, paletteLength, frameIds);
    if (fallbackFrames.length === 0) return null;
    layers.push({
      id: uniqueId(`${id}-artwork`, `${id}-artwork`, layerIds),
      name: "Artwork",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      frames: fallbackFrames,
    });
  }
  if (layers.length === 0) return null;

  // `frames` remains a compatibility alias to the first layer. It is also
  // what older project readers and exporters use when they do not understand
  // the layer stack yet.
  const frames = layers[0]!.frames;

  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, MAX_SPRITE_NAME_LENGTH) : "";
  return {
    id,
    name: name || "Untitled",
    width,
    height,
    kind: sanitizeKind(raw.kind),
    frames,
    layers,
    frameTags: sanitizeFrameTags(raw.frameTags, frames.length, id),
  };
}

function sanitizeTilemap(raw: unknown, sprites: Sprite[]): TilemapData | null {
  if (raw === null || raw === undefined || !isRecord(raw)) return null;

  const { cols, rows, cells } = raw;
  if (
    typeof cols !== "number" ||
    !Number.isInteger(cols) ||
    cols < 2 ||
    cols > MAX_DIMENSION ||
    typeof rows !== "number" ||
    !Number.isInteger(rows) ||
    rows < 2 ||
    rows > MAX_DIMENSION ||
    !Array.isArray(cells) ||
    cells.length !== cols * rows
  ) {
    return null;
  }

  const tileIds = new Set(sprites.filter((sprite) => sprite.kind === "tile").map((sprite) => sprite.id));
  return {
    cols,
    rows,
    cells: cells.map((cell) =>
      typeof cell === "string" && cell.length <= MAX_ID_LENGTH && tileIds.has(cell) ? cell : null,
    ),
  };
}

export function sanitizeProject(raw: unknown): Project | null {
  if (
    !isRecord(raw) ||
    raw.schemaVersion !== 1 ||
    typeof raw.name !== "string" ||
    !Array.isArray(raw.palette) ||
    !Array.isArray(raw.sprites) ||
    raw.sprites.length === 0
  ) {
    return null;
  }

  const palette = raw.palette
    .slice(0, MAX_PALETTE_COLORS)
    .map(sanitizeColor)
    .filter((color): color is string => color !== null);
  if (palette.length === 0) return null;

  const paletteAlpha = Array.from({ length: palette.length }, (_, index) => {
    const value = Array.isArray(raw.paletteAlpha) ? raw.paletteAlpha[index] : 1;
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
  });

  const sprites: Sprite[] = [];
  const spriteIds = new Set<string>();
  for (const rawSprite of raw.sprites.slice(0, MAX_SPRITES)) {
    const sprite = sanitizeSprite(rawSprite, palette.length);
    if (!sprite || spriteIds.has(sprite.id)) continue;
    spriteIds.add(sprite.id);
    sprites.push(sprite);
  }
  if (sprites.length === 0 || projectPixelCells({ sprites }) > MAX_TOTAL_PIXEL_CELLS) return null;

  const name = raw.name.trim().slice(0, MAX_PROJECT_NAME_LENGTH);
  const project: Project = {
    schemaVersion: 1,
    name: name || "Untitled",
    palette,
    paletteAlpha,
    sprites,
    tilemap: sanitizeTilemap(raw.tilemap, sprites),
  };
  return isCanonicalProject(project) ? project : null;
}

function isCanonicalSprite(value: unknown, paletteLength: number): value is Sprite {
  if (!isRecord(value)) return false;
  const width = value.width;
  const height = value.height;
  if (
    typeof value.id !== "string" ||
    value.id.trim().length === 0 ||
    value.id !== value.id.trim() ||
    value.id.length > MAX_ID_LENGTH ||
    typeof value.name !== "string" ||
    value.name.trim().length === 0 ||
    value.name !== value.name.trim() ||
    value.name.length > MAX_SPRITE_NAME_LENGTH ||
    (value.kind !== "character" && value.kind !== "item" && value.kind !== "tile") ||
    !Array.isArray(value.frames)
  ) {
    return false;
  }
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    width > MAX_DIMENSION ||
    height < 1 ||
    height > MAX_DIMENSION ||
    value.frames.length < 1 ||
    value.frames.length > MAX_FRAMES_PER_SPRITE
  ) {
    return false;
  }

  const frameIds = new Set<string>();
  const validFrames = value.frames.every((frame) => {
    if (
      !isRecord(frame) ||
      typeof frame.id !== "string" ||
      frame.id.trim().length === 0 ||
      frame.id !== frame.id.trim() ||
      frame.id.length > MAX_ID_LENGTH
    ) {
      return false;
    }
    if (frameIds.has(frame.id) || !Array.isArray(frame.pixels) || frame.pixels.length !== width * height) {
      return false;
    }
    frameIds.add(frame.id);
    if (
      frame.linkId !== undefined &&
      (typeof frame.linkId !== "string" ||
        frame.linkId.trim().length === 0 ||
        frame.linkId !== frame.linkId.trim() ||
        frame.linkId.length > MAX_ID_LENGTH)
    ) {
      return false;
    }
    return frame.pixels.every(
      (pixel) => typeof pixel === "number" && Number.isInteger(pixel) && pixel >= -1 && pixel < paletteLength,
    );
  });
  if (!validFrames) return false;

  if (value.layers !== undefined) {
    if (!Array.isArray(value.layers) || value.layers.length < 1 || value.layers.length > MAX_LAYERS_PER_SPRITE) {
      return false;
    }
    const layerIds = new Set<string>();
    const layeredFrameIds = new Set<string>();
    for (const layer of value.layers) {
      if (
        !isRecord(layer) ||
        typeof layer.id !== "string" ||
        layer.id.trim().length === 0 ||
        layer.id !== layer.id.trim() ||
        layer.id.length > MAX_ID_LENGTH ||
        layerIds.has(layer.id) ||
        typeof layer.name !== "string" ||
        layer.name.trim().length === 0 ||
        layer.name !== layer.name.trim() ||
        layer.name.length > MAX_SPRITE_NAME_LENGTH ||
        typeof layer.visible !== "boolean" ||
        typeof layer.locked !== "boolean" ||
        typeof layer.opacity !== "number" ||
        !Number.isFinite(layer.opacity) ||
        layer.opacity < 0 ||
        layer.opacity > 1 ||
        (layer.blendMode !== "normal" &&
          layer.blendMode !== "multiply" &&
          layer.blendMode !== "screen" &&
          layer.blendMode !== "overlay") ||
        !Array.isArray(layer.frames) ||
        layer.frames.length < 1 ||
        layer.frames.length > MAX_FRAMES_PER_SPRITE
      ) {
        return false;
      }
      layerIds.add(layer.id);
      for (const frame of layer.frames) {
        if (
          !isRecord(frame) ||
          typeof frame.id !== "string" ||
          frame.id.trim().length === 0 ||
          frame.id !== frame.id.trim() ||
          frame.id.length > MAX_ID_LENGTH ||
          layeredFrameIds.has(frame.id) ||
          !Array.isArray(frame.pixels) ||
          frame.pixels.length !== width * height ||
          !frame.pixels.every(
            (pixel) => typeof pixel === "number" && Number.isInteger(pixel) && pixel >= -1 && pixel < paletteLength,
          )
        ) {
          return false;
        }
        if (
          frame.linkId !== undefined &&
          (typeof frame.linkId !== "string" ||
            frame.linkId.trim().length === 0 ||
            frame.linkId !== frame.linkId.trim() ||
            frame.linkId.length > MAX_ID_LENGTH)
        ) {
          return false;
        }
        layeredFrameIds.add(frame.id);
      }
    }
    if (
      value.layers[0] === undefined ||
      !Array.isArray(value.layers[0].frames) ||
      !sameFrameIdentity(value.frames, value.layers[0].frames)
    ) {
      return false;
    }
  }

  if (value.frameTags !== undefined) {
    if (!Array.isArray(value.frameTags) || value.frameTags.length > MAX_FRAMES_PER_SPRITE) return false;
    const tagIds = new Set<string>();
    for (const tag of value.frameTags) {
      const tagFrom = typeof tag.from === "number" ? tag.from : NaN;
      const tagTo = typeof tag.to === "number" ? tag.to : NaN;
      if (
        !isRecord(tag) ||
        typeof tag.id !== "string" ||
        tag.id.trim().length === 0 ||
        tag.id !== tag.id.trim() ||
        tag.id.length > MAX_ID_LENGTH ||
        tagIds.has(tag.id) ||
        typeof tag.name !== "string" ||
        tag.name.trim().length === 0 ||
        tag.name.length > MAX_SPRITE_NAME_LENGTH ||
        !Number.isInteger(tagFrom) ||
        !Number.isInteger(tagTo) ||
        tagFrom < 0 ||
        tagFrom >= value.frames.length ||
        tagTo < tagFrom ||
        tagTo >= value.frames.length ||
        typeof tag.color !== "string" ||
        !CANONICAL_HEX_COLOR.test(tag.color)
      ) {
        return false;
      }
      tagIds.add(tag.id);
    }
  }
  return true;
}

function sameFrameIdentity(a: Frame[], b: Frame[]): boolean {
  return a.length === b.length && a.every((frame, index) => frame.id === b[index]?.id);
}

function isCanonicalTilemap(value: unknown, tileIds: Set<string>): value is TilemapData | null {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  const cols = value.cols;
  const rows = value.rows;
  const cells = value.cells;
  if (!Array.isArray(cells)) return false;
  return (
    typeof cols === "number" &&
    typeof rows === "number" &&
    Number.isInteger(cols) &&
    Number.isInteger(rows) &&
    cols >= 2 &&
    cols <= MAX_DIMENSION &&
    rows >= 2 &&
    rows <= MAX_DIMENSION &&
    cells.length === cols * rows &&
    cells.every(
      (cell) => cell === null || (typeof cell === "string" && cell.length <= MAX_ID_LENGTH && tileIds.has(cell)),
    )
  );
}

/** True only for a project safe to persist or broadcast without rewriting it. */
export function isCanonicalProject(value: unknown): value is Project {
  if (!isRecord(value)) return false;
  const palette = value.palette;
  const sprites = value.sprites;
  if (
    value.schemaVersion !== 1 ||
    typeof value.name !== "string" ||
    value.name.trim().length === 0 ||
    value.name !== value.name.trim() ||
    value.name.length > MAX_PROJECT_NAME_LENGTH ||
    !Array.isArray(palette) ||
    !Array.isArray(sprites)
  ) {
    return false;
  }
  if (
    palette.length < 1 ||
    palette.length > MAX_PALETTE_COLORS ||
    !palette.every((color) => typeof color === "string" && CANONICAL_HEX_COLOR.test(color)) ||
    sprites.length < 1 ||
    sprites.length > MAX_SPRITES
  ) {
    return false;
  }
  if (
    value.paletteAlpha !== undefined &&
    (!Array.isArray(value.paletteAlpha) ||
      value.paletteAlpha.length !== palette.length ||
      !value.paletteAlpha.every(
        (alpha) => typeof alpha === "number" && Number.isFinite(alpha) && alpha >= 0 && alpha <= 1,
      ))
  ) {
    return false;
  }

  const spriteIds = new Set<string>();
  if (
    !sprites.every((sprite) => {
      if (!isCanonicalSprite(sprite, palette.length) || spriteIds.has(sprite.id)) return false;
      spriteIds.add(sprite.id);
      return true;
    })
  ) {
    return false;
  }

  if (projectPixelCells({ sprites: sprites as Sprite[] }) > MAX_TOTAL_PIXEL_CELLS) return false;
  const tileIds = new Set(
    (sprites as Sprite[]).filter((sprite) => sprite.kind === "tile").map((sprite) => sprite.id),
  );
  return isCanonicalTilemap(value.tilemap, tileIds);
}
