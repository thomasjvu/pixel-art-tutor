export const TRANSPARENT = -1;

export interface Frame {
  id: string;
  /** palette index per cell, TRANSPARENT (-1) = empty. length = width * height */
  pixels: number[];
}

export type SpriteKind = "character" | "item" | "tile";

export interface Sprite {
  id: string;
  name: string;
  width: number;
  height: number;
  kind: SpriteKind;
  frames: Frame[];
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
