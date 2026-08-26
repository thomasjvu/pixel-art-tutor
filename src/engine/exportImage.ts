import type { Sprite } from "../types";
import { TRANSPARENT } from "../types";

export function renderSpriteToCanvas(
  sprite: Sprite,
  opts: { frameIndex?: number; allFrames?: boolean; scale?: number; palette?: string[] },
): HTMLCanvasElement {
  const scale = opts.scale ?? 1;
  const palette = opts.palette ?? [];
  const frames =
    opts.allFrames
      ? sprite.frames
      : [sprite.frames[opts.frameIndex ?? 0] ?? sprite.frames[0]];
  const cols = frames.length;
  const canvas = document.createElement("canvas");
  canvas.width = sprite.width * cols * scale;
  canvas.height = sprite.height * scale;
  const ctx = canvas.getContext("2d")!;
  frames.forEach((f, col) => {
    if (!f) return;
    for (let y = 0; y < sprite.height; y++)
      for (let x = 0; x < sprite.width; x++) {
        const p = f.pixels[y * sprite.width + x];
        if (p === TRANSPARENT || !palette[p]) continue;
        ctx.fillStyle = palette[p];
        ctx.fillRect((col * sprite.width + x) * scale, y * scale, scale, scale);
      }
  });
  return canvas;
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}

export function downloadText(text: string, filename: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
