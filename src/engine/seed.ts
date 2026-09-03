import type { Project, Sprite } from "../types";
import { rowsToPixels } from "../engine/pixels";

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
        ? [
            { id: id + "-f0", pixels },
            { id: id + "-f1", pixels: pixels.map((p) => p) },
          ]
        : [{ id: id + "-f0", pixels }],
  };
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
  const slime: Sprite = {
    id: "sprite-slime",
    name: "Slime",
    width: f0.width,
    height: f0.height,
    kind: "character",
    frames: [
      { id: "sprite-slime-f0", pixels: f0.pixels },
      { id: "sprite-slime-f1", pixels: f1.pixels },
    ],
  };

  const grass = spriteFromRows("tile-grass", "Grass", "tile", GRASS_TILE);
  const dirt = spriteFromRows("tile-dirt", "Dirt", "tile", DIRT_TILE);

  const cols = 12;
  const rowsN = 9;
  const cells: (string | null)[] = [];
  for (let y = 0; y < rowsN; y++)
    for (let x = 0; x < cols; x++) {
      const border = x === 0 || y === 0 || x === cols - 1 || y === rowsN - 1 || (x + y) % 7 === 0;
      cells.push(border ? grass.id : dirt.id);
    }

  return {
    schemaVersion: 1,
    name: "My Pixel World",
    palette: [...DEFAULT_PALETTE],
    sprites: [slime, grass, dirt],
    tilemap: { cols, rows: rowsN, cells },
  };
}

export const BLANK_CANVAS_SIZE = 64;

export function blankProject(): Project {
  const size = BLANK_CANVAS_SIZE;
  const canvas: Sprite = {
    id: "sprite-canvas",
    name: "Canvas",
    width: size,
    height: size,
    kind: "character",
    frames: [
      { id: "sprite-canvas-f0", pixels: new Array(size * size).fill(-1) },
      { id: "sprite-canvas-f1", pixels: new Array(size * size).fill(-1) },
    ],
  };
  return {
    schemaVersion: 1,
    name: "Untitled",
    palette: [...DEFAULT_PALETTE],
    sprites: [canvas],
    tilemap: null,
  };
}
