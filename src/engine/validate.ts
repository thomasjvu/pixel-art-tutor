import type { Project, Sprite, SpriteKind, TilemapData } from "../types";

const MAX_PALETTE = 64;
const HEX_COLOR = /^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeColor(value: unknown): string | null {
  if (typeof value !== "string" || !HEX_COLOR.test(value)) return null;
  if (value.length === 7) return value;
  return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
}

function sanitizeDimension(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(1, Math.min(64, Math.round(value)));
}

function sanitizeKind(value: unknown): SpriteKind {
  if (value === "character" || value === "item" || value === "tile") return value;
  return "item";
}

function sanitizeSprite(raw: unknown, paletteLength: number): Sprite | null {
  if (!isRecord(raw)) return null;

  const id = raw.id;
  if (typeof id !== "string" || id.length === 0) return null;

  const width = sanitizeDimension(raw.width);
  const height = sanitizeDimension(raw.height);
  if (width === null || height === null || !Array.isArray(raw.frames) || raw.frames.length === 0) {
    return null;
  }

  const pixelCount = width * height;
  const frames = [];
  for (let index = 0; index < raw.frames.length; index++) {
    const rawFrame = raw.frames[index];
    if (!isRecord(rawFrame) || !Array.isArray(rawFrame.pixels)) continue;
    const sourcePixels = rawFrame.pixels;

    const pixels = Array.from({ length: pixelCount }, (_, pixelIndex) => {
      const value = sourcePixels[pixelIndex];
      const pixel = Number.isInteger(value) ? value : -1;
      return pixel >= -1 && pixel < paletteLength ? pixel : -1;
    });

    frames.push({
      id: typeof rawFrame.id === "string" ? rawFrame.id : `${id}-f${index}`,
      pixels,
    });
  }

  if (frames.length === 0) return null;

  return {
    id,
    name: typeof raw.name === "string" && raw.name.length > 0 ? raw.name : "Untitled",
    width,
    height,
    kind: sanitizeKind(raw.kind),
    frames,
  };
}

function sanitizeTilemap(raw: unknown, sprites: Sprite[]): TilemapData | null {
  if (raw === null || raw === undefined || !isRecord(raw)) return null;

  const { cols, rows, cells } = raw;
  if (
    typeof cols !== "number" ||
    !Number.isInteger(cols) ||
    cols < 2 ||
    cols > 64 ||
    typeof rows !== "number" ||
    !Number.isInteger(rows) ||
    rows < 2 ||
    rows > 64 ||
    !Array.isArray(cells) ||
    cells.length !== cols * rows
  ) {
    return null;
  }

  const spriteIds = new Set(sprites.map((sprite) => sprite.id));
  return {
    cols,
    rows,
    cells: cells.map((cell) =>
      typeof cell === "string" && spriteIds.has(cell) ? cell : null,
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
    .map(sanitizeColor)
    .filter((color): color is string => color !== null)
    .slice(0, MAX_PALETTE);
  if (palette.length === 0) return null;

  const sprites = raw.sprites
    .map((sprite) => sanitizeSprite(sprite, palette.length))
    .filter((sprite): sprite is Sprite => sprite !== null);
  if (sprites.length === 0) return null;

  return {
    schemaVersion: 1,
    name: raw.name.length > 0 ? raw.name : "Untitled",
    palette,
    sprites,
    tilemap: sanitizeTilemap(raw.tilemap, sprites),
  };
}
