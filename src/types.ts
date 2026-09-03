export const TRANSPARENT = -1;

export interface Frame {
  id: string;
  /** palette index per cell, TRANSPARENT (-1) = empty. length = width * height */
  pixels: number[];
  /** Cels with the same link id share edits, like Aseprite linked cels. */
  linkId?: string;
}

export type SpriteKind = "character" | "item" | "tile";

export type BlendMode = "normal" | "multiply" | "screen" | "overlay";
export type PlaybackMode = "forward" | "reverse" | "ping_pong";

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  /** 0..1, kept on the layer so translucent paint can be composed. */
  opacity: number;
  blendMode: BlendMode;
  frames: Frame[];
}

export interface FrameTag {
  id: string;
  name: string;
  from: number;
  to: number;
  color: string;
}

export interface Sprite {
  id: string;
  name: string;
  width: number;
  height: number;
  kind: SpriteKind;
  /**
   * The original single-layer frame list. It remains as an alias to the first
   * layer for old files, exporters, and integrations that only know frames.
   */
  frames: Frame[];
  /** Optional for old project files; sanitized projects always materialize it. */
  layers?: Layer[];
  frameTags?: FrameTag[];
}

/** Read-only compatibility helper for projects written before layers existed. */
export function spriteLayers(sprite: Sprite): Layer[] {
  if (sprite.layers && sprite.layers.length > 0) return sprite.layers;
  return [{
    id: `${sprite.id}-artwork`,
    name: "Artwork",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    frames: sprite.frames,
  }];
}

export interface TilemapData {
  cols: number;
  rows: number;
  /** sprite id per cell, null = empty */
  cells: (string | null)[];
}

export interface Project {
  schemaVersion: 1;
  name: string;
  palette: string[];
  /** Optional for older files; entries are normalized to 0..1 when loaded. */
  paletteAlpha?: number[];
  sprites: Sprite[];
  tilemap: TilemapData | null;
}

export interface PixelChange {
  x: number;
  y: number;
  color: number | string | null;
}

export interface CritiqueFinding {
  severity: "info" | "warn" | "error";
  title: string;
  detail: string;
  tip: string;
}

export interface CritiqueReport {
  spriteId: string;
  spriteName: string;
  score: number;
  stats: Record<string, number | string>;
  findings: CritiqueFinding[];
}
