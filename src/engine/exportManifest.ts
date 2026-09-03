import { spriteLayers, type Project, type Sprite } from "../types";
import { spriteFileStem } from "./exportImage";

export interface GamePackSpriteFile {
  sprite: Sprite;
  stem: string;
}

function uniqueStem(base: string, used: Set<string>, nextSuffix: Map<string, number>): string {
  let suffix = nextSuffix.get(base) ?? 0;
  let candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
  while (used.has(candidate)) {
    suffix++;
    candidate = `${base}-${suffix + 1}`;
  }
  nextSuffix.set(base, suffix + 1);
  used.add(candidate);
  return candidate;
}

/** Resolve deterministic, collision-safe filenames for every project sprite. */
export function gamePackSpriteFiles(project: Project): GamePackSpriteFile[] {
  const used = new Set<string>();
  const nextSuffix = new Map<string, number>();
  return project.sprites.map((sprite) => ({
    sprite,
    stem: uniqueStem(spriteFileStem(sprite.name), used, nextSuffix),
  }));
}

function normalizedFps(fps: number): number {
  return Math.max(1, Math.min(30, Math.round(Number.isFinite(fps) ? fps : 8)));
}

/** Build the stable, engine-neutral manifest downloaded with a project game pack. */
export function buildGamePackManifest(project: Project, fps: number): string {
  const files = gamePackSpriteFiles(project);
  const spriteById = new Map(project.sprites.map((sprite) => [sprite.id, sprite]));
  const tilemap = project.tilemap
    ? {
        cols: project.tilemap.cols,
        rows: project.tilemap.rows,
        cells: project.tilemap.cells.map((tileId, index) => {
          if (!tileId) return null;
          const sprite = spriteById.get(tileId);
          return {
            index,
            x: index % project.tilemap!.cols,
            y: Math.floor(index / project.tilemap!.cols),
            tileId,
            spriteId: sprite?.id ?? null,
            spriteName: sprite?.name ?? null,
          };
        }),
      }
    : null;

  return JSON.stringify(
    {
      format: "pixel-art-tutor/game-pack",
      version: 1,
      project: { name: project.name, palette: [...project.palette] },
      fps: normalizedFps(fps),
      sprites: files.map(({ sprite, stem }) => ({
        id: sprite.id,
        name: sprite.name,
        kind: sprite.kind,
        width: sprite.width,
        height: sprite.height,
        texture: `${stem}-sheet.png`,
        frames: sprite.frames.map((frame, index) => ({
          id: frame.id,
          index,
          name: `${stem}-frame-${index + 1}`,
          rect: { x: index * sprite.width, y: 0, width: sprite.width, height: sprite.height },
        })),
        tags: sprite.frameTags ?? [],
        layers: spriteLayers(sprite).map((layer) => ({
          id: layer.id,
          name: layer.name,
          visible: layer.visible,
          opacity: layer.opacity,
          blendMode: layer.blendMode,
          frames: layer.frames.map((frame, index) => ({ id: frame.id, index, linked: Boolean(frame.linkId) })),
        })),
      })),
      tilemap,
    },
    null,
    2,
  );
}
