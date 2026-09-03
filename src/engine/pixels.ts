import { TRANSPARENT } from "../types";

export function emptyPixels(w: number, h: number): number[] {
  return new Array(w * h).fill(TRANSPARENT);
}

export function inBounds(x: number, y: number, w: number, h: number): boolean {
  return x >= 0 && y >= 0 && x < w && y < h;
}

export function clampRect(
  x: number,
  y: number,
  w: number,
  h: number,
  boundW: number,
  boundH: number,
): { x: number; y: number; w: number; h: number } | null {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(boundW, Math.ceil(x + w));
  const y1 = Math.min(boundH, Math.ceil(y + h));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
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

/**
 * A small pixel-art cleanup pass for freehand joins. Bresenham already gives
 * the correct raster line; this removes a one-cell corner when two neighbors
 * are diagonally adjacent, which prevents the isolated stair-step that
 * appears when a human changes direction between pointer events.
 */
export function pixelPerfectLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Array<[number, number]> {
  const points = [...bresenhamLine(x0, y0, x1, y1)];
  if (points.length < 3) return points;
  return points.filter((_, index) => {
    if (index === 0 || index === points.length - 1) return true;
    const previous = points[index - 1]!;
    const following = points[index + 1]!;
    return Math.abs(previous[0] - following[0]) !== 1 || Math.abs(previous[1] - following[1]) !== 1;
  });
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

/** Rotate in place around the sprite center with nearest-neighbor sampling. */
export function rotateNearest(pixels: number[], w: number, h: number, degrees: number): number[] {
  const out = new Array<number>(w * h).fill(TRANSPARENT);
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const sourceX = Math.round(cos * dx + sin * dy + cx);
      const sourceY = Math.round(-sin * dx + cos * dy + cy);
      if (inBounds(sourceX, sourceY, w, h)) out[y * w + x] = pixels[sourceY * w + sourceX]!;
    }
  }
  return out;
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

/** One printable symbol per palette index. The first 36 symbols preserve the original base-36 format. */
export const PIXEL_SYMBOLS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_";

/** frame -> rows of chars. '.' = transparent, else a symbol for the palette index */
export function pixelsToRowsWithWidth(pixels: number[], w: number): string[] {
  const rows: string[] = [];
  for (let i = 0; i < pixels.length; i += w) {
    let row = "";
    for (let j = i; j < i + w; j++) {
      const p = pixels[j];
      row += p === TRANSPARENT ? "." : PIXEL_SYMBOLS[p] ?? "?";
    }
    rows.push(row);
  }
  return rows;
}

/** Parse ASCII rows into pixels. Unknown chars become transparent and are reported as errors. */
export function rowsToPixels(
  rows: string[],
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
      const idx = PIXEL_SYMBOLS.indexOf(ch);
      if (idx < 0) {
        errors.push(`unknown char '${ch}' at ${x},${y}`);
        pixels.push(TRANSPARENT);
      } else pixels.push(idx);
    }
  }
  return { pixels, width, height, errors };
}
