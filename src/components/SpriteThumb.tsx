import { useEffect, useRef } from "react";
import type { Frame, Sprite } from "../types";
import { TRANSPARENT } from "../types";

export function SpriteThumb({
  sprite,
  frameIndex,
  palette,
  size = 48,
  frames,
}: {
  sprite: Sprite;
  frameIndex?: number;
  palette: string[];
  size?: number;
  frames?: Frame[];
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const sourceFrames = frames ?? sprite.frames;
    const frame = sourceFrames[frameIndex ?? 0] ?? sourceFrames[0];
    canvas.width = sprite.width;
    canvas.height = sprite.height;
    ctx.clearRect(0, 0, sprite.width, sprite.height);
    if (!frame) return;
    for (let y = 0; y < sprite.height; y++)
      for (let x = 0; x < sprite.width; x++) {
        const p = frame.pixels[y * sprite.width + x];
        if (p === TRANSPARENT || !palette[p]) continue;
        ctx.fillStyle = palette[p];
        ctx.fillRect(x, y, 1, 1);
      }
  }, [sprite, frameIndex, palette, frames]);

  return (
    <canvas
      ref={ref}
      className="thumb"
      style={{ width: size, height: size }}
      aria-label={`${sprite.name} preview`}
    />
  );
}
