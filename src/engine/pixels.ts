import { TRANSPARENT } from "../types";
import { luminance, normalizeHex } from "./color";

export function emptyPixels(w: number, h: number): number[] {
  return new Array(w * h).fill(TRANSPARENT);
}

export function inBounds(x: number, y: number, w: number, h: number): boolean {
  return x >= 0 && y >= 0 && x < w && y < h;
}

export function* bresenhamLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Generator<[number, number]> {
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    yield [x, y];
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

export function floodFill(
  pixels: number[],
  w: number,
  h: number,
  x: number,
  y: number,
  replacement: number,
): number[] {
  if (!inBounds(x, y, w, h)) return pixels;
  const target = pixels[y * w + x];
  if (target === replacement) return pixels;
  const out = pixels.slice();
  const stack: [number, number][] = [[x, y]];
  while (stack.length) {
    const [cx, cy] = stack.pop()!;
    if (!inBounds(cx, cy, w, h)) continue;
    const i = cy * w + cx;
    if (out[i] !== target) continue;
    out[i] = replacement;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return out;
}

export function flipH(pixels: number[], w: number, h: number): number[] {
  const out = pixels.slice();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) out[y * w + x] = pixels[y * w + (w - 1 - x)];
  return out;
}

export function flipV(pixels: number[], w: number, h: number): number[] {
  const out = pixels.slice();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) out[y * w + x] = pixels[(h - 1 - y) * w + x];
  return out;
}

/** rotate 90° clockwise; output is h x w */
export function rotate90(pixels: number[], w: number, h: number): { pixels: number[]; w: number; h: number } {
  const out = new Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) out[x * h + (h - 1 - y)] = pixels[y * w + x];
  return { pixels: out, w: h, h: w };
}

export function shiftWrap(pixels: number[], w: number, h: number, dx: number, dy: number): number[] {
  const out = new Array(w * h).fill(TRANSPARENT);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const nx = (((x + dx) % w) + w) % w;
      const ny = (((y + dy) % h) + h) % h;
      out[ny * w + nx] = pixels[y * w + x];
    }
  return out;
}

/** add outlineColor to every transparent pixel that touches non-transparent (4-dir) */
export function outline(pixels: number[], w: number, h: number, outlineColor: number): number[] {
  const out = pixels.slice();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (pixels[i] !== TRANSPARENT) continue;
      const neighbors = [
        x > 0 ? pixels[i - 1] : TRANSPARENT,
        x < w - 1 ? pixels[i + 1] : TRANSPARENT,
        y > 0 ? pixels[i - w] : TRANSPARENT,
        y < h - 1 ? pixels[i + w] : TRANSPARENT,
      ];
      if (neighbors.some((n) => n !== TRANSPARENT)) out[i] = outlineColor;
    }
  return out;
}

export function boundingBox(pixels: number[], w: number, h: number) {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (pixels[y * w + x] !== TRANSPARENT) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

/** frame -> rows of chars. '.' = transparent, else base36 palette index */
export function pixelsToRowsWithWidth(pixels: number[], w: number): string[] {
  const rows: string[] = [];
  for (let i = 0; i < pixels.length; i += w) {
    let row = "";
    for (let j = i; j < i + w; j++) {
      const p = pixels[j];
      row += p === TRANSPARENT ? "." : DIGITS[p] ?? "?";
    }
    rows.push(row);
  }
  return rows;
}

/** parse ASCII rows into pixels. unknown chars -> TRANSPARENT. autoAdd adds hex colors via callback and returns mapping */
export function rowsToPixels(
  rows: string[],
  palette: string[],
): { pixels: number[]; width: number; height: number; errors: string[] } {
  const errors: string[] = [];
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const pixels: number[] = [];
  for (let y = 0; y < height; y++) {
    const row = rows[y];
    if (row.length !== width) errors.push(`row ${y} has length ${row.length}, expected ${width}`);
    for (let x = 0; x < width; x++) {
      const ch = row[x];
      if (ch === "." || ch === " ") {
        pixels.push(TRANSPARENT);
        continue;
      }
      const idx = parseInt(ch, 36);
      if (Number.isNaN(idx)) {
        errors.push(`unknown char '${ch}' at ${x},${y}`);
        pixels.push(TRANSPARENT);
      } else pixels.push(idx);
    }
  }
  void palette;
  return { pixels, width, height, errors };
}

export function darkestIndex(palette: string[], used: Set<number>): number | null {
  let best: number | null = null;
  let bestLuma = Infinity;
  for (const i of used) {
    const l = luminance(normalizeHex(palette[i]) ?? "#000000");
    if (l < bestLuma) {
      bestLuma = l;
      best = i;
    }
  }
  return best;
}
