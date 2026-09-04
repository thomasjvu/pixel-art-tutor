import type { Project } from "./types";

export const MAX_PALETTE_COLORS = 64;
export const MAX_SPRITES = 128;
export const MAX_FRAMES_PER_SPRITE = 32;
export const DEFAULT_CHARACTER_FRAME_COUNT = 4;
/** Default logical width and height for a new blank canvas. */
export const DEFAULT_CANVAS_SIZE = 64;
export const MAX_LAYERS_PER_SPRITE = 32;
/** Maximum width/height for a sprite or canvas in logical pixels. */
export const MAX_DIMENSION = 256;
/** Tilemaps retain their compact 64×64 map limit independently of sprites. */
export const MAX_TILEMAP_DIMENSION = 64;
export const MAX_PROJECT_NAME_LENGTH = 128;
export const MAX_SPRITE_NAME_LENGTH = 128;
export const MAX_ID_LENGTH = 128;
export const MAX_PROJECT_JSON_LENGTH = 4_000_000;
/** Compact 256×256 projects need a larger but still bounded URL snapshot. */
export const MAX_SHARE_HASH_LENGTH = 2_200_000;
export const MAX_TOTAL_PIXEL_CELLS = 1_000_000;

export function projectPixelCells(project: Pick<Project, "sprites">): number {
  return project.sprites.reduce(
    (total, sprite) =>
      total +
      sprite.width *
        sprite.height *
        (sprite.layers?.length
          ? sprite.layers.reduce((layerTotal, layer) => layerTotal + layer.frames.length, 0)
          : sprite.frames.length),
    0,
  );
}
