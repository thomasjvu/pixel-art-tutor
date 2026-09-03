import type { Project } from "./types";

export const MAX_PALETTE_COLORS = 64;
export const MAX_SPRITES = 128;
export const MAX_FRAMES_PER_SPRITE = 32;
export const MAX_DIMENSION = 64;
export const MAX_PROJECT_NAME_LENGTH = 128;
export const MAX_SPRITE_NAME_LENGTH = 128;
export const MAX_ID_LENGTH = 128;
export const MAX_PROJECT_JSON_LENGTH = 4_000_000;
export const MAX_SHARE_HASH_LENGTH = 180_000;
export const MAX_TOTAL_PIXEL_CELLS = 1_000_000;

export function projectPixelCells(project: Pick<Project, "sprites">): number {
  return project.sprites.reduce(
    (total, sprite) => total + sprite.width * sprite.height * sprite.frames.length,
    0,
  );
}
