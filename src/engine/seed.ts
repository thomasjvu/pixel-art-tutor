import type { Project, Sprite, SpriteKind } from "../types";
import { rowsToPixels } from "../engine/pixels";
import { DEFAULT_CHARACTER_FRAME_COUNT, MAX_DIMENSION, MAX_FRAMES_PER_SPRITE } from "../projectLimits";

export const DEFAULT_PALETTE = [
  "#1a1c2c", // 0 ink
  "#5d275d", // 1 plum
  "#b13e53", // 2 red
  "#ef7d57", // 3 orange
  "#ffcd75", // 4 sand
  "#a7f070", // 5 light green
  "#38b764", // 6 green
  "#257179", // 7 teal
  "#29366f", // 8 navy
  "#3b5dc9", // 9 blue
  "#41a6f6", // 10 sky
  "#73eff7", // 11 ice
  "#f4f4f4", // 12 white
  "#94b0c2", // 13 light gray
  "#566c86", // 14 gray
  "#333c57", // 15 slate
  "#17152f", // 16 deep violet
  "#76558f", // 17 lavender
  "#d9576b", // 18 rose
  "#f08a5d", // 19 coral
  "#ffd166", // 20 gold
  "#b8e986", // 21 pale green
  "#70c1b3", // 22 soft teal
  "#a8dadc", // 23 pale cyan
  "#e8c1c5", // 24 blush
];

const SLIME_FRAME_1 = [
  "................",
  "................",
  "................",
  "................",
  "......000000....",
  "....0066666600..",
  "...06566666660..",
  "..0666666666660.",
  "..0601266012660.",
  ".06601266012660.",
  ".06666666666660.",
  ".06660666606660.",
  ".06666000066660.",
  "..066666666660..",
  "...00066660000..",
  ".....000000.....",
];

const SLIME_FRAME_2 = [
  "................",
  "................",
  "................",
  "................",
  "................",
  ".....000000.....",
  "...0066666600...",
  "..06566666660...",
  ".06601266012660.",
  ".06601266012660.",
  ".06666666666660.",
  ".06606666606660.",
  ".06660666606660.",
  "..066600066660..",
  "...00666666000..",
  ".....000000.....",
];

const GRASS_TILE = [
  "5566666655666666",
  "6655666666655666",
  "6666556666666556",
  "6666665766666665",
  "6666666666676666",
  "5666676666666666",
  "6656666675666666",
  "6666756666665666",
  "5666666655666666",
  "6665566666667566",
  "6666665766666666",
  "6766666666556666",
  "6666665566666676",
  "5566666666766666",
  "6666756666666656",
  "6666666665566666",
];

const DIRT_TILE = [
  "3443433343443334",
  "4334443433344433",
  "3443334433433344",
  "4333443334433443",
  "3443433343433334",
  "4334434343344343",
  "3344333443333434",
  "4343334433443343",
  "3434443334333444",
  "4333343434434333",
  "3443433343334434",
  "4334443434343333",
  "3343334434433443",
  "4433443333334334",
  "3443334433433443",
  "4333443334433434",
];

function spriteFromRows(
  id: string,
  name: string,
  kind: Sprite["kind"],
  rows: string[],
): Sprite {
  const { pixels, width, height, errors } = rowsToPixels(rows);
  if (errors.length > 0) {
    throw new Error(`seed sprite '${name}' has malformed rows: ${errors.join("; ")}`);
  }
  return {
    id,
    name,
    width,
    height,
    kind,
    frames:
      kind === "character"
        ? Array.from({ length: DEFAULT_CHARACTER_FRAME_COUNT }, (_, index) => ({
            id: `${id}-f${index}`,
            pixels: pixels.map((p) => p),
          }))
        : [{ id: id + "-f0", pixels }],
  };
}

function createWorldFrame(animationFrame: number): number[] {
  const width = 256;
  const height = 256;
  const pixels = new Array(width * height).fill(8);

  function set(x: number, y: number, color: number): void {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    pixels[y * width + x] = color;
  }

  function rect(x: number, y: number, w: number, h: number, color: number): void {
    for (let yy = Math.max(0, y); yy < Math.min(height, y + h); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(width, x + w); xx++) set(xx, yy, color);
    }
  }

  function line(x0: number, y0: number, x1: number, y1: number, color: number): void {
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    while (true) {
      set(x, y, color);
      if (x === x1 && y === y1) return;
      const twice = 2 * error;
      if (twice >= dy) {
        error += dy;
        x += sx;
      }
      if (twice <= dx) {
        error += dx;
        y += sy;
      }
    }
  }

  function ellipse(cx: number, cy: number, rx: number, ry: number, color: number): void {
    for (let y = cy - ry; y <= cy + ry; y++) {
      for (let x = cx - rx; x <= cx + rx; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) set(x, y, color);
      }
    }
  }

  function mountain(center: number, peak: number, base: number, halfWidth: number, color: number): void {
    for (let x = center - halfWidth; x <= center + halfWidth; x++) {
      const top = peak + Math.floor((Math.abs(x - center) * (base - peak)) / halfWidth);
      rect(x, top, 1, base - top + 1, color);
    }
  }

  // Layered evening sky, deliberately built from broad pixel bands.
  rect(0, 0, width, 38, 16);
  rect(0, 38, width, 42, 8);
  rect(0, 80, width, 38, 9);
  rect(0, 118, width, 37, 10);
  rect(0, 155, width, 22, 11);
  rect(0, 0, width, 5, 0);

  // Stars and a crescent moon.
  const stars = [
    [18, 28, 1], [45, 52, 2], [77, 23, 1], [113, 62, 2], [148, 31, 1],
    [176, 72, 1], [221, 24, 2], [241, 91, 1], [28, 105, 1], [132, 96, 1],
  ];
  for (const [x, y, size] of stars) {
    rect(x - size, y, size * 2 + 1, 1, 12);
    rect(x, y - size, 1, size * 2 + 1, 12);
  }
  ellipse(194, 51, 22, 22, 20);
  ellipse(205, 43, 21, 21, 8);
  rect(185, 27, 3, 3, 12);

  // Small clouds soften the sky without obscuring the stars.
  rect(15, 92, 48, 7, 11);
  rect(24, 87, 28, 12, 11);
  rect(35, 83, 13, 16, 11);
  rect(204, 111, 36, 6, 11);
  rect(213, 106, 20, 11, 11);

  // Distant and near mountain silhouettes.
  mountain(54, 94, 178, 72, 8);
  mountain(174, 105, 178, 92, 8);
  mountain(12, 124, 180, 54, 15);
  mountain(111, 115, 180, 78, 15);
  mountain(224, 123, 180, 62, 15);
  line(0, 176, width, 176, 7);
  line(0, 179, width, 179, 22);

  // Meadow base and a winding stream.
  rect(0, 180, width, 76, 6);
  rect(0, 181, width, 5, 5);
  for (let y = 186; y < height; y += 9) {
    for (let x = (y * 13) % 17; x < width; x += 31) set(x, y, 7);
  }
  for (let y = 184; y < height; y++) {
    const center = 209 + Math.floor(Math.sin(y / 28) * 28);
    const halfWidth = 14 + Math.floor((y - 184) / 15);
    rect(center - halfWidth, y, halfWidth * 2, 1, 10);
    if (y % 7 === 0) line(center - halfWidth + 6, y, center + halfWidth - 8, y, 11);
  }

  // A small lavender cottage.
  rect(79, 143, 83, 48, 0);
  rect(83, 139, 75, 51, 17);
  rect(88, 145, 65, 39, 24);
  mountain(120, 117, 145, 52, 1);
  mountain(120, 122, 143, 47, 2);
  rect(114, 157, 20, 27, 1);
  rect(118, 160, 12, 24, 3);
  rect(95, 153, 16, 13, 8);
  rect(99, 156, 8, 7, 23);
  rect(137, 153, 11, 13, 8);
  rect(139, 156, 7, 7, 23);
  rect(123, 173, 3, 3, 20);
  rect(145, 129, 7, 14, 1);
  rect(144, 126, 9, 4, 0);
  line(83, 141, 157, 141, 12);
  line(84, 145, 155, 145, 18);

  // Tree on the right bank.
  rect(203, 143, 14, 48, 1);
  rect(208, 142, 8, 49, 3);
  ellipse(205, 126, 26, 27, 7);
  ellipse(189, 137, 22, 22, 6);
  ellipse(219, 139, 23, 25, 6);
  ellipse(206, 113, 18, 21, 5);
  rect(199, 108, 14, 6, 5);
  rect(187, 132, 6, 4, 22);
  rect(221, 126, 7, 4, 22);

  // Foreground path, flowers, and a flickering camp lantern.
  for (let y = 213; y < 256; y++) {
    const center = 92 + Math.floor(Math.sin(y / 17) * 22);
    const halfWidth = Math.max(9, 28 - Math.floor((y - 213) / 3));
    rect(center - halfWidth, y, halfWidth * 2, 1, 20);
    if (y % 8 === 0) rect(center - halfWidth + 5, y, 3, 1, 4);
  }
  for (const [x, y] of [[31, 210], [53, 226], [229, 213], [174, 231], [67, 198]]) {
    rect(x, y, 2, 8, 1);
    rect(x - 3, y - 2, 8, 4, 24);
    rect(x - 1, y - 5, 4, 10, 18);
    set(x, y - 6, 20);
  }
  rect(41, 188, 10, 16, 1);
  rect(39, 186, 14, 3, 0);
  rect(44, 191, 4, 8, animationFrame % 2 === 0 ? 20 : 19);
  rect(42, 199, 8, 2, 13);
  rect(35, 204, 22, 3, 1);

  // A few animated fireflies give the default four-frame scene a pulse.
  const fireflies = animationFrame % 2 === 0 ? [[73, 183], [164, 203], [234, 184]] : [[80, 188], [157, 198], [226, 190]];
  for (const [x, y] of fireflies) {
    set(x, y, 20);
    set(x + 1, y, 12);
  }

  return pixels;
}

export function createStarterProject(): Project {
  const f0 = rowsToPixels(SLIME_FRAME_1);
  if (f0.errors.length > 0) {
    throw new Error(`seed sprite 'Slime' has malformed rows: ${f0.errors.join("; ")}`);
  }
  const f1 = rowsToPixels(SLIME_FRAME_2);
  if (f1.errors.length > 0) {
    throw new Error(`seed sprite 'Slime' has malformed rows: ${f1.errors.join("; ")}`);
  }
  const world: Sprite = {
    id: "sprite-world",
    name: "Moonlit Meadow",
    width: 256,
    height: 256,
    kind: "character",
    frames: Array.from({ length: DEFAULT_CHARACTER_FRAME_COUNT }, (_, index) => ({
      id: `sprite-world-f${index}`,
      pixels: createWorldFrame(index),
    })),
  };

  const slime: Sprite = {
    id: "sprite-slime",
    name: "Slime",
    width: f0.width,
    height: f0.height,
    kind: "character",
    frames: [
      { id: "sprite-slime-f0", pixels: f0.pixels },
      { id: "sprite-slime-f1", pixels: f1.pixels },
      { id: "sprite-slime-f2", pixels: f0.pixels.map((p) => p) },
      { id: "sprite-slime-f3", pixels: f1.pixels.map((p) => p) },
    ],
  };

  const grass = spriteFromRows("tile-grass", "Grass", "tile", GRASS_TILE);
  const dirt = spriteFromRows("tile-dirt", "Dirt", "tile", DIRT_TILE);

  const cols = 16;
  const rowsN = 12;
  const cells: (string | null)[] = [];
  for (let y = 0; y < rowsN; y++)
    for (let x = 0; x < cols; x++) {
      const border = x === 0 || y === 0 || x === cols - 1 || y === rowsN - 1 || (x + y) % 7 === 0;
      cells.push(border ? grass.id : dirt.id);
    }

  return {
    schemaVersion: 1,
    name: "Moonlit Meadow",
    palette: [...DEFAULT_PALETTE],
    sprites: [world, slime, grass, dirt],
    tilemap: { cols, rows: rowsN, cells },
  };
}

export const BLANK_CANVAS_SIZE = MAX_DIMENSION;

export interface BlankProjectOptions {
  width?: number;
  height?: number;
  frameCount?: number;
  kind?: SpriteKind;
}

function boundedDimension(value: number | undefined, fallback: number): number {
  return Number.isFinite(value)
    ? Math.max(1, Math.min(MAX_DIMENSION, Math.round(value!)))
    : fallback;
}

export function blankProject(frameCount?: number, width?: number, height?: number): Project;
export function blankProject(options?: BlankProjectOptions): Project;
export function blankProject(
  frameCountOrOptions: number | BlankProjectOptions = DEFAULT_CHARACTER_FRAME_COUNT,
  legacyWidth = BLANK_CANVAS_SIZE,
  legacyHeight = BLANK_CANVAS_SIZE,
): Project {
  const options = typeof frameCountOrOptions === "number"
    ? { frameCount: frameCountOrOptions, width: legacyWidth, height: legacyHeight }
    : frameCountOrOptions;
  const width = boundedDimension(options.width, BLANK_CANVAS_SIZE);
  const height = boundedDimension(options.height, BLANK_CANVAS_SIZE);
  const count = Number.isFinite(options.frameCount)
    ? Math.max(1, Math.min(MAX_FRAMES_PER_SPRITE, Math.round(options.frameCount!)))
    : DEFAULT_CHARACTER_FRAME_COUNT;
  const canvas: Sprite = {
    id: "sprite-canvas",
    name: "Canvas",
    width,
    height,
    kind: options.kind ?? "character",
    frames: Array.from({ length: count }, (_, index) => ({
      id: `sprite-canvas-f${index}`,
      pixels: new Array(width * height).fill(-1),
    })),
  };
  return {
    schemaVersion: 1,
    name: "Untitled",
    palette: [...DEFAULT_PALETTE],
    sprites: [canvas],
    tilemap: null,
  };
}
