import type { Project } from "../types";

export type ProjectChangeSource = "local" | "remote" | "undo" | "redo";

export interface ProjectPixelHint {
  spriteId: string;
  layerId?: string;
  frameIndex: number;
  x: number;
  y: number;
}

export interface ProjectTileHint {
  index: number;
}

export const MAX_PROJECT_CHANGE_HINT_CELLS = 16_384;

export type ProjectChangeHint =
  | {
      kind: "cells";
      pixels: ProjectPixelHint[];
      tiles: ProjectTileHint[];
    }
  | { kind: "palette" }
  | { kind: "unknown" };

export function mergeProjectChangeHints(
  first: ProjectChangeHint | undefined,
  second: ProjectChangeHint | undefined,
): ProjectChangeHint {
  if (!first || !second || first.kind === "unknown" || second.kind === "unknown") {
    return { kind: "unknown" };
  }
  if (first.kind === "palette" && second.kind === "palette") {
    return { kind: "palette" };
  }
  const pixels = new Map<string, ProjectPixelHint>();
  const tiles = new Map<number, ProjectTileHint>();
  for (const hint of [first, second]) {
    if (hint.kind === "cells") {
      for (const pixel of hint.pixels) {
        pixels.set(
          JSON.stringify([pixel.spriteId, pixel.layerId ?? "", pixel.frameIndex, pixel.x, pixel.y]),
          pixel,
        );
      }
      for (const tile of hint.tiles) tiles.set(tile.index, tile);
    }
  }
  if (pixels.size + tiles.size > MAX_PROJECT_CHANGE_HINT_CELLS) {
    return { kind: "unknown" };
  }
  return {
    kind: "cells",
    pixels: [...pixels.values()],
    tiles: [...tiles.values()],
  };
}

export interface ProjectChange {
  project: Project;
  previousProject: Project;
  source: ProjectChangeSource;
  label: string;
  hint?: ProjectChangeHint;
}
