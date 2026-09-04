import type { Frame, Project, Sprite, TilemapData } from "../types";
import { isCanonicalProject } from "../engine/validate";
import { normalizeHex } from "../engine/color";
import type { ProjectChangeHint } from "./projectEvents";
import {
  MAX_DIMENSION,
  MAX_FRAMES_PER_SPRITE,
  MAX_ID_LENGTH,
  MAX_PALETTE_COLORS,
  MAX_PROJECT_NAME_LENGTH,
  MAX_SPRITE_NAME_LENGTH,
  MAX_SPRITES,
  MAX_TILEMAP_DIMENSION,
  MAX_TOTAL_PIXEL_CELLS,
} from "../projectLimits";

// Version 3 correlates room errors, adds snapshot requests, and removes the
// duplicated base project from structural operation payloads.
export const ROOM_PROTOCOL_VERSION = 3 as const;
export const MAX_ROOM_PATCH_CELLS = 16_384;

export type ActorKind = "human" | "agent";

export type PresenceStatus =
  | "idle"
  | "thinking"
  | "drawing"
  | "filling"
  | "transforming"
  | "reviewing"
  | "done";

export interface PixelPoint {
  x: number;
  y: number;
}

/** One painted cell streamed live while an action is in progress. */
export interface PreviewCell extends PixelPoint {
  color: string | null;
}

export interface RoomPresence {
  id: string;
  name: string;
  kind: ActorKind;
  color: string;
  status: PresenceStatus;
  tool: string;
  spriteId: string | null;
  frameIndex: number;
  cursor: PixelPoint | null;
  progress: number;
  message: string;
  updatedAt: number;
  /** Guided-tour step the peer is viewing, or null when not touring. */
  tutorialStep: number | null;
  /** Live paint preview (capped); the committed pixels follow as an edit. */
  preview: PreviewCell[];
}

/** Public, lightweight directory entry for a room with live collaborators. */
export interface ActiveRoomListing {
  roomId: string;
  projectName: string;
  participantCount: number;
  updatedAt: number;
}

export type RoomOperationKind = "edit" | "undo" | "redo";
/**
 * Request errors affect only the identified operation. Room errors make the
 * supplied canonical snapshot authoritative while clients rebase optimistic work.
 */
export type RoomErrorScope = "request" | "room";

export interface RoomOperationSummary {
  operationId: string;
  actorId: string;
  label: string;
  kind: RoomOperationKind;
  undoOf?: string;
  redoOf?: string;
}

export interface RoomHelloMessage {
  type: "hello";
  protocol: typeof ROOM_PROTOCOL_VERSION;
  clientId: string;
  name: string;
  kind: ActorKind;
  color: string;
  project: Project;
}

export interface RoomPresenceMessage {
  type: "presence";
  protocol: typeof ROOM_PROTOCOL_VERSION;
  presence: RoomPresence;
}

export interface RoomPixelPatch {
  spriteId: string;
  layerId?: string;
  frameIndex: number;
  x: number;
  y: number;
  color: string | null;
}

export interface RoomTilePatch {
  index: number;
  tileId: string | null;
}

export interface RoomPatch {
  name?: string;
  paletteAdds: string[];
  pixels: RoomPixelPatch[];
  tiles: RoomTilePatch[];
}

export interface RoomSnapshotOperationMessage {
  type: "operation";
  protocol: typeof ROOM_PROTOCOL_VERSION;
  mode: "snapshot";
  operationId: string;
  baseSeq: number;
  project: Project;
  label: string;
}

export interface RoomPatchOperationMessage {
  type: "operation";
  protocol: typeof ROOM_PROTOCOL_VERSION;
  mode: "patch";
  operationId: string;
  baseSeq: number;
  patch: RoomPatch;
  label: string;
}

export type RoomOperationMessage = RoomSnapshotOperationMessage | RoomPatchOperationMessage;

export interface RoomUndoMessage {
  type: "undo" | "redo";
  protocol: typeof ROOM_PROTOCOL_VERSION;
  operationId: string;
}

export interface RoomSnapshotRequestMessage {
  type: "snapshot_request";
  protocol: typeof ROOM_PROTOCOL_VERSION;
  lastSeq: number;
}

export type RoomClientMessage =
  | RoomHelloMessage
  | RoomPresenceMessage
  | RoomOperationMessage
  | RoomUndoMessage
  | RoomSnapshotRequestMessage;

export interface RoomWelcomeMessage {
  type: "welcome";
  protocol: typeof ROOM_PROTOCOL_VERSION;
  roomId: string;
  seq: number;
  project: Project | null;
  peers: RoomPresence[];
  latestOperation: RoomOperationSummary | null;
}

export interface RoomPresenceStateMessage {
  type: "presence_state";
  protocol: typeof ROOM_PROTOCOL_VERSION;
  peers: RoomPresence[];
}

export interface RoomSnapshotOperationBroadcast extends RoomOperationSummary {
  type: "operation";
  protocol: typeof ROOM_PROTOCOL_VERSION;
  mode?: "snapshot";
  seq: number;
  project: Project;
}

export interface RoomPatchOperationBroadcast extends RoomOperationSummary {
  type: "operation";
  protocol: typeof ROOM_PROTOCOL_VERSION;
  mode: "patch";
  seq: number;
  patch: RoomPatch;
}

export type RoomOperationBroadcast = RoomSnapshotOperationBroadcast | RoomPatchOperationBroadcast;

export interface RoomErrorMessage {
  type: "room_error";
  protocol: typeof ROOM_PROTOCOL_VERSION;
  scope?: RoomErrorScope;
  operationId?: string;
  message: string;
  project?: Project;
  seq?: number;
}

export type RoomServerMessage =
  | RoomWelcomeMessage
  | RoomPresenceMessage
  | RoomPresenceStateMessage
  | RoomOperationBroadcast
  | RoomErrorMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isActiveRoomListing(value: unknown): value is ActiveRoomListing {
  return (
    isRecord(value) &&
    typeof value.roomId === "string" &&
    value.roomId.length > 0 &&
    value.roomId.length <= 48 &&
    typeof value.projectName === "string" &&
    value.projectName.length > 0 &&
    value.projectName.length <= 64 &&
    typeof value.participantCount === "number" &&
    Number.isInteger(value.participantCount) &&
    value.participantCount > 0 &&
    value.participantCount <= 16 &&
    typeof value.updatedAt === "number" &&
    Number.isFinite(value.updatedAt)
  );
}

function isPresence(value: unknown): value is RoomPresence {
  if (!isRecord(value)) return false;
  const cursor = value.cursor;
  const validCursor =
    cursor === null ||
    (isRecord(cursor) && Number.isInteger(cursor.x) && Number.isInteger(cursor.y));
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    value.id.length <= MAX_ID_LENGTH &&
    typeof value.name === "string" &&
    value.name.length <= 32 &&
    typeof value.kind === "string" &&
    (value.kind === "human" || value.kind === "agent") &&
    typeof value.color === "string" &&
    /^#[0-9a-f]{6}$/i.test(value.color) &&
    typeof value.status === "string" &&
    ["idle", "thinking", "drawing", "filling", "transforming", "reviewing", "done"].includes(value.status) &&
    typeof value.tool === "string" &&
    value.tool.length <= 32 &&
    (value.spriteId === null || (typeof value.spriteId === "string" && value.spriteId.length <= MAX_ID_LENGTH)) &&
    Number.isInteger(value.frameIndex) &&
    (value.frameIndex as number) >= 0 &&
    (value.frameIndex as number) <= 31 &&
    validCursor &&
    typeof value.progress === "number" &&
    Number.isFinite(value.progress) &&
    value.progress >= 0 &&
    value.progress <= 1 &&
    typeof value.message === "string" &&
    value.message.length <= 96 &&
    typeof value.updatedAt === "number" &&
    Number.isFinite(value.updatedAt)
  );
}

function isOperationSummary(value: unknown): value is RoomOperationSummary {
  if (!isRecord(value)) return false;
  return (
    typeof value.operationId === "string" &&
    value.operationId.length > 0 &&
    value.operationId.length <= MAX_ID_LENGTH &&
    typeof value.actorId === "string" &&
    value.actorId.length > 0 &&
    value.actorId.length <= MAX_ID_LENGTH &&
    typeof value.label === "string" &&
    value.label.length > 0 &&
    value.label.length <= 80 &&
    (value.kind === "edit" || value.kind === "undo" || value.kind === "redo") &&
    (value.undoOf === undefined || typeof value.undoOf === "string") &&
    (value.redoOf === undefined || typeof value.redoOf === "string")
  );
}

function isCanonicalHex(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/.test(value);
}

function isRoomPixelPatch(value: unknown): value is RoomPixelPatch {
  if (!isRecord(value) || Array.isArray(value)) return false;
  return (
    typeof value.spriteId === "string" &&
    value.spriteId.length > 0 &&
    value.spriteId.length <= MAX_ID_LENGTH &&
    (value.layerId === undefined ||
      (typeof value.layerId === "string" && value.layerId.length > 0 && value.layerId.length <= MAX_ID_LENGTH)) &&
    typeof value.frameIndex === "number" &&
    Number.isInteger(value.frameIndex) &&
    value.frameIndex >= 0 &&
    value.frameIndex < MAX_FRAMES_PER_SPRITE &&
    typeof value.x === "number" &&
    Number.isInteger(value.x) &&
    value.x >= 0 &&
    value.x < MAX_DIMENSION &&
    typeof value.y === "number" &&
    Number.isInteger(value.y) &&
    value.y >= 0 &&
    value.y < MAX_DIMENSION &&
    (value.color === null || isCanonicalHex(value.color))
  );
}

function isRoomTilePatch(value: unknown): value is RoomTilePatch {
  if (!isRecord(value) || Array.isArray(value)) return false;
  return (
    typeof value.index === "number" &&
    Number.isInteger(value.index) &&
    value.index >= 0 &&
    value.index < MAX_TILEMAP_DIMENSION * MAX_TILEMAP_DIMENSION &&
    (value.tileId === null ||
      (typeof value.tileId === "string" && value.tileId.length > 0 && value.tileId.length <= MAX_ID_LENGTH))
  );
}

export function isRoomPatch(value: unknown): value is RoomPatch {
  if (!isRecord(value) || Array.isArray(value)) return false;
  return (
    (value.name === undefined ||
      (typeof value.name === "string" &&
        value.name.length > 0 &&
        value.name === value.name.trim() &&
        value.name.length <= MAX_PROJECT_NAME_LENGTH)) &&
    Array.isArray(value.paletteAdds) &&
    value.paletteAdds.length <= MAX_PALETTE_COLORS &&
    value.paletteAdds.every(isCanonicalHex) &&
    Array.isArray(value.pixels) &&
    Array.isArray(value.tiles) &&
    value.pixels.length + value.tiles.length <= MAX_ROOM_PATCH_CELLS &&
    value.pixels.every(isRoomPixelPatch) &&
    value.tiles.every(isRoomTilePatch)
  );
}

export function isProject(value: unknown): value is Project {
  return isCanonicalProject(value);
}

function hasProjectShell(project: Project): boolean {
  if (
    project.schemaVersion !== 1 ||
    typeof project.name !== "string" ||
    project.name.trim().length === 0 ||
    project.name !== project.name.trim() ||
    project.name.length > MAX_PROJECT_NAME_LENGTH ||
    !Array.isArray(project.palette) ||
    project.palette.length < 1 ||
    project.palette.length > MAX_PALETTE_COLORS ||
    !project.palette.every(isCanonicalHex) ||
    !Array.isArray(project.sprites) ||
    project.sprites.length < 1 ||
    project.sprites.length > MAX_SPRITES
  ) {
    return false;
  }

  const spriteIds = new Set<string>();
  let totalPixelCells = 0;
  for (const sprite of project.sprites) {
    if (
      typeof sprite.id !== "string" ||
      sprite.id.trim().length === 0 ||
      sprite.id !== sprite.id.trim() ||
      sprite.id.length > MAX_ID_LENGTH ||
      spriteIds.has(sprite.id) ||
      typeof sprite.name !== "string" ||
      sprite.name.trim().length === 0 ||
      sprite.name !== sprite.name.trim() ||
      sprite.name.length > MAX_SPRITE_NAME_LENGTH ||
      (sprite.kind !== "character" && sprite.kind !== "item" && sprite.kind !== "tile") ||
      !Number.isInteger(sprite.width) ||
      sprite.width < 1 ||
      sprite.width > MAX_DIMENSION ||
      !Number.isInteger(sprite.height) ||
      sprite.height < 1 ||
      sprite.height > MAX_DIMENSION ||
      !Array.isArray(sprite.frames) ||
      sprite.frames.length < 1 ||
      sprite.frames.length > MAX_FRAMES_PER_SPRITE
    ) {
      return false;
    }
    spriteIds.add(sprite.id);
    totalPixelCells += sprite.width * sprite.height * sprite.frames.length;
    if (totalPixelCells > MAX_TOTAL_PIXEL_CELLS) return false;

    const frameIds = new Set<string>();
    for (const frame of sprite.frames) {
      if (
        typeof frame.id !== "string" ||
        frame.id.trim().length === 0 ||
        frame.id !== frame.id.trim() ||
        frame.id.length > MAX_ID_LENGTH ||
        frameIds.has(frame.id) ||
        !Array.isArray(frame.pixels) ||
        frame.pixels.length !== sprite.width * sprite.height
      ) {
        return false;
      }
      frameIds.add(frame.id);
    }
  }

  if (project.tilemap === null) return true;
  if (
    !isRecord(project.tilemap) ||
    !Number.isInteger(project.tilemap.cols) ||
    project.tilemap.cols < 2 ||
    project.tilemap.cols > MAX_TILEMAP_DIMENSION ||
    !Number.isInteger(project.tilemap.rows) ||
    project.tilemap.rows < 2 ||
    project.tilemap.rows > MAX_TILEMAP_DIMENSION ||
    !Array.isArray(project.tilemap.cells) ||
    project.tilemap.cells.length !== project.tilemap.cols * project.tilemap.rows
  ) {
    return false;
  }
  const tileIds = new Set(project.sprites.filter((sprite) => sprite.kind === "tile").map((sprite) => sprite.id));
  return project.tilemap.cells.every(
    (cell) => cell === null || (typeof cell === "string" && cell.length <= MAX_ID_LENGTH && tileIds.has(cell)),
  );
}

export function cloneProject(project: Project): Project {
  return {
    schemaVersion: 1,
    name: project.name,
    palette: [...project.palette],
    paletteAlpha: project.paletteAlpha ? [...project.paletteAlpha] : undefined,
    sprites: project.sprites.map((sprite) => ({
      ...sprite,
      frames: sprite.frames.map((frame) => ({
        id: frame.id,
        pixels: [...frame.pixels],
        ...(frame.linkId ? { linkId: frame.linkId } : {}),
      })),
      layers: sprite.layers?.map((layer) => ({
        ...layer,
        frames: layer.frames.map((frame) => ({
          id: frame.id,
          pixels: [...frame.pixels],
          ...(frame.linkId ? { linkId: frame.linkId } : {}),
        })),
      })),
      frameTags: sprite.frameTags?.map((tag) => ({ ...tag })),
    })),
    tilemap: project.tilemap
      ? { ...project.tilemap, cells: [...project.tilemap.cells] }
      : null,
  };
}

function cloneTilemap(tilemap: TilemapData): TilemapData {
  return { ...tilemap, cells: [...tilemap.cells] };
}

function sameFrameShape(a: Frame[], b: Frame[]): boolean {
  return a.length === b.length && a.every((frame, index) => frame.id === b[index]?.id);
}

type PaletteIndexMap = Array<number | null>;

function colorKey(color: string): string {
  return color.toLowerCase();
}

function mergePaletteByIdentity(
  currentPalette: string[],
  incomingPalette: string[],
): { palette: string[]; indexMap: PaletteIndexMap } {
  const palette = [...currentPalette];
  const byColor = new Map(palette.map((color, index) => [colorKey(color), index]));
  const indexMap: PaletteIndexMap = [];
  for (const incoming of incomingPalette) {
    const normalized = normalizeHex(incoming);
    if (!normalized) {
      indexMap.push(null);
      continue;
    }
    const key = colorKey(normalized);
    const existing = byColor.get(key);
    if (existing !== undefined) {
      indexMap.push(existing);
    } else if (palette.length < MAX_PALETTE_COLORS) {
      const index = palette.length;
      palette.push(normalized);
      byColor.set(key, index);
      indexMap.push(index);
    } else {
      indexMap.push(null);
    }
  }
  return { palette, indexMap };
}

function remapPixel(pixel: number, indexMap: PaletteIndexMap): number | null {
  if (pixel === -1) return -1;
  if (!Number.isInteger(pixel) || pixel < 0 || pixel >= indexMap.length) return null;
  return indexMap[pixel] ?? null;
}

function cloneSpriteWithPalette(sprite: Sprite, indexMap: PaletteIndexMap): Sprite | null {
  const frames: Frame[] = [];
  for (const frame of sprite.frames) {
    const pixels: number[] = [];
    for (const pixel of frame.pixels) {
      const mapped = remapPixel(pixel, indexMap);
      if (mapped === null) return null;
      pixels.push(mapped);
    }
    frames.push({ id: frame.id, pixels, ...(frame.linkId ? { linkId: frame.linkId } : {}) });
  }
  const layers: Sprite["layers"] = [];
  for (const layer of sprite.layers ?? []) {
    const layerFrames: Frame[] = [];
    for (const frame of layer.frames) {
      const pixels: number[] = [];
      for (const pixel of frame.pixels) {
        const mapped = remapPixel(pixel, indexMap);
        if (mapped === null) return null;
        pixels.push(mapped);
      }
      layerFrames.push({ id: frame.id, pixels, ...(frame.linkId ? { linkId: frame.linkId } : {}) });
    }
    layers.push({ ...layer, frames: layerFrames });
  }
  return { ...sprite, frames, layers, frameTags: sprite.frameTags?.map((tag) => ({ ...tag })) };
}

function sameSpriteShape(a: Sprite, b: Sprite): boolean {
  if (a.layers || b.layers || a.frameTags || b.frameTags) return false;
  return (
    a.id === b.id &&
    a.width === b.width &&
    a.height === b.height &&
    a.kind === b.kind &&
    sameFrameShape(a.frames, b.frames)
  );
}

function palettePrefixIsStable(before: Project, after: Project): boolean {
  if (after.palette.length < before.palette.length) return false;
  return before.palette.every((color, index) => colorKey(color) === colorKey(after.palette[index]!));
}

function patchColorForPixel(pixel: number, palette: string[]): string | null | undefined {
  if (pixel === -1) return null;
  const color = palette[pixel];
  const normalized = typeof color === "string" ? normalizeHex(color) : null;
  return normalized ?? undefined;
}

/** Derive a bounded, palette-identity-safe patch for a local project change. */
export function projectChangeToRoomPatch(
  before: Project,
  after: Project,
  hint?: ProjectChangeHint,
): RoomPatch | null {
  const canUseHint = hint?.kind === "cells" || hint?.kind === "palette";
  if (
    canUseHint
      ? !hasProjectShell(before) || !hasProjectShell(after)
      : !isProject(before) || !isProject(after)
  ) {
    return null;
  }
  if (before.sprites.length !== after.sprites.length || !palettePrefixIsStable(before, after)) return null;
  if (
    (before.tilemap === null) !== (after.tilemap === null) ||
    (before.tilemap && after.tilemap &&
      (before.tilemap.cols !== after.tilemap.cols || before.tilemap.rows !== after.tilemap.rows))
  ) {
    return null;
  }
  for (let index = 0; index < before.sprites.length; index++) {
    if (
      !sameSpriteShape(before.sprites[index]!, after.sprites[index]!) ||
      before.sprites[index]!.name !== after.sprites[index]!.name
    ) {
      return null;
    }
  }

  const knownColors = new Set(before.palette.map(colorKey));
  const paletteAdds: string[] = [];
  for (const color of after.palette.slice(before.palette.length)) {
    const normalized = normalizeHex(color);
    if (!normalized) return null;
    const key = colorKey(normalized);
    if (!knownColors.has(key)) {
      paletteAdds.push(normalized);
      knownColors.add(key);
    }
  }

  const pixels: RoomPixelPatch[] = [];
  const tiles: RoomTilePatch[] = [];
  if (hint?.kind === "cells") {
    const seenPixels = new Set<string>();
    for (const cell of hint.pixels) {
      const key = JSON.stringify([cell.spriteId, cell.frameIndex, cell.x, cell.y]);
      if (seenPixels.has(key)) continue;
      seenPixels.add(key);
      const beforeSprite = before.sprites.find((sprite) => sprite.id === cell.spriteId);
      const afterSprite = after.sprites.find((sprite) => sprite.id === cell.spriteId);
      const beforeFrame = beforeSprite?.frames[cell.frameIndex];
      const afterFrame = afterSprite?.frames[cell.frameIndex];
      if (
        !beforeSprite ||
        !afterSprite ||
        !beforeFrame ||
        !afterFrame ||
        cell.x < 0 ||
        cell.y < 0 ||
        cell.x >= afterSprite.width ||
        cell.y >= afterSprite.height
      ) {
        return null;
      }
      const pixelIndex = cell.y * afterSprite.width + cell.x;
      if (beforeFrame.pixels[pixelIndex] === afterFrame.pixels[pixelIndex]) continue;
      const color = patchColorForPixel(afterFrame.pixels[pixelIndex]!, after.palette);
      if (color === undefined) return null;
      pixels.push({
        spriteId: afterSprite.id,
        frameIndex: cell.frameIndex,
        x: cell.x,
        y: cell.y,
        color,
      });
      if (pixels.length > MAX_ROOM_PATCH_CELLS) return null;
    }

    if (hint.tiles.length > 0) {
      if (!before.tilemap || !after.tilemap) return null;
      const seenTiles = new Set<number>();
      for (const cell of hint.tiles) {
        if (seenTiles.has(cell.index)) continue;
        seenTiles.add(cell.index);
        if (cell.index < 0 || cell.index >= after.tilemap.cells.length) return null;
        if (before.tilemap.cells[cell.index] === after.tilemap.cells[cell.index]) continue;
        tiles.push({ index: cell.index, tileId: after.tilemap.cells[cell.index] ?? null });
        if (pixels.length + tiles.length > MAX_ROOM_PATCH_CELLS) return null;
      }
    }
  } else if (!hint || hint.kind === "unknown") {
    for (let spriteIndex = 0; spriteIndex < after.sprites.length; spriteIndex++) {
      const beforeSprite = before.sprites[spriteIndex]!;
      const afterSprite = after.sprites[spriteIndex]!;
      for (let frameIndex = 0; frameIndex < afterSprite.frames.length; frameIndex++) {
        const beforeFrame = beforeSprite.frames[frameIndex]!;
        const afterFrame = afterSprite.frames[frameIndex]!;
        for (let pixelIndex = 0; pixelIndex < afterFrame.pixels.length; pixelIndex++) {
          if (beforeFrame.pixels[pixelIndex] === afterFrame.pixels[pixelIndex]) continue;
          const color = patchColorForPixel(afterFrame.pixels[pixelIndex]!, after.palette);
          if (color === undefined) return null;
          pixels.push({
            spriteId: afterSprite.id,
            frameIndex,
            x: pixelIndex % afterSprite.width,
            y: Math.floor(pixelIndex / afterSprite.width),
            color,
          });
          if (pixels.length > MAX_ROOM_PATCH_CELLS) return null;
        }
      }
    }

    if (before.tilemap && after.tilemap) {
      for (let index = 0; index < after.tilemap.cells.length; index++) {
        if (before.tilemap.cells[index] === after.tilemap.cells[index]) continue;
        tiles.push({ index, tileId: after.tilemap.cells[index] ?? null });
        if (pixels.length + tiles.length > MAX_ROOM_PATCH_CELLS) return null;
      }
    }
  }

  const patch: RoomPatch = {
    ...(before.name !== after.name ? { name: after.name } : {}),
    paletteAdds,
    pixels,
    tiles,
  };
  return patch.name !== undefined || paletteAdds.length > 0 || pixels.length > 0 || tiles.length > 0
    ? patch
    : null;
}

/** Apply a room patch atomically to a canonical project. */
export function applyRoomPatch(current: Project, patch: RoomPatch): Project | null {
  if (!isProject(current) || !isRoomPatch(patch)) return null;
  const next = cloneProject(current);
  if (patch.name !== undefined) next.name = patch.name;

  const paletteByColor = new Map(next.palette.map((color, index) => [colorKey(color), index]));
  for (const color of patch.paletteAdds) {
    const normalized = normalizeHex(color);
    if (!normalized) return null;
    const key = colorKey(normalized);
    if (paletteByColor.has(key)) continue;
    if (next.palette.length >= MAX_PALETTE_COLORS) return null;
    paletteByColor.set(key, next.palette.length);
    next.palette.push(normalized);
  }

  const sprites = new Map(next.sprites.map((sprite) => [sprite.id, sprite]));
  for (const pixel of patch.pixels) {
    const sprite = sprites.get(pixel.spriteId);
    const frame = sprite?.frames[pixel.frameIndex];
    if (!sprite || !frame || pixel.x >= sprite.width || pixel.y >= sprite.height) return null;
    const colorIndex = pixel.color === null ? -1 : paletteByColor.get(colorKey(pixel.color));
    if (colorIndex === undefined) return null;
    frame.pixels[pixel.y * sprite.width + pixel.x] = colorIndex;
  }

  if (patch.tiles.length > 0) {
    if (!next.tilemap) return null;
    const tileIds = new Set(next.sprites.filter((sprite) => sprite.kind === "tile").map((sprite) => sprite.id));
    for (const tile of patch.tiles) {
      if (tile.index >= next.tilemap.cells.length || (tile.tileId !== null && !tileIds.has(tile.tileId))) return null;
      next.tilemap.cells[tile.index] = tile.tileId;
    }
  }
  return isProject(next) ? next : null;
}

/**
 * Merge an edit created from an older room snapshot into the current room.
 * Pixel edits are merged cell-by-cell, so two people painting different pixels
 * do not overwrite one another merely because their messages crossed in flight.
 */
export function mergeProjectChanges(current: Project, before: Project, after: Project): Project {
  const paletteMerge = mergePaletteByIdentity(current.palette, after.palette);
  const next = cloneProject(current);
  next.palette = paletteMerge.palette;

  if (before.name !== after.name) next.name = after.name;

  const beforeSprites = new Map(before.sprites.map((sprite) => [sprite.id, sprite]));
  const afterSprites = new Map(after.sprites.map((sprite) => [sprite.id, sprite]));
  const currentSprites = new Map(next.sprites.map((sprite) => [sprite.id, sprite]));

  next.sprites = next.sprites.filter(
    (sprite) => !(beforeSprites.has(sprite.id) && !afterSprites.has(sprite.id)),
  );

  for (const sprite of after.sprites) {
    const beforeSprite = beforeSprites.get(sprite.id);
    const currentSprite = currentSprites.get(sprite.id);
    if (!beforeSprite) {
      if (!currentSprite) {
        const translated = cloneSpriteWithPalette(sprite, paletteMerge.indexMap);
        if (translated) next.sprites.push(translated);
      }
      continue;
    }
    if (!currentSprite) {
      const translated = cloneSpriteWithPalette(sprite, paletteMerge.indexMap);
      if (translated) next.sprites.push(translated);
      continue;
    }

    if (
      beforeSprite.width !== sprite.width ||
      beforeSprite.height !== sprite.height ||
      beforeSprite.kind !== sprite.kind ||
      !sameFrameShape(beforeSprite.frames, sprite.frames)
    ) {
      const index = next.sprites.findIndex((candidate) => candidate.id === sprite.id);
      const translated = cloneSpriteWithPalette(sprite, paletteMerge.indexMap);
      if (index >= 0 && translated) next.sprites[index] = translated;
      continue;
    }

    if (beforeSprite.name !== sprite.name) currentSprite.name = sprite.name;
    for (let frameIndex = 0; frameIndex < sprite.frames.length; frameIndex++) {
      const beforeFrame = beforeSprite.frames[frameIndex]!;
      const afterFrame = sprite.frames[frameIndex]!;
      const currentFrame = currentSprite.frames[frameIndex]!;
      for (let pixelIndex = 0; pixelIndex < afterFrame.pixels.length; pixelIndex++) {
        if (beforeFrame.pixels[pixelIndex] !== afterFrame.pixels[pixelIndex]) {
          const mapped = remapPixel(afterFrame.pixels[pixelIndex]!, paletteMerge.indexMap);
          if (mapped !== null) currentFrame.pixels[pixelIndex] = mapped;
        }
      }
    }
  }

  const beforeTilemap = before.tilemap;
  const afterTilemap = after.tilemap;
  if (beforeTilemap === null && afterTilemap !== null) {
    if (next.tilemap === null) next.tilemap = cloneTilemap(afterTilemap);
  } else if (beforeTilemap !== null && afterTilemap === null) {
    next.tilemap = null;
  } else if (beforeTilemap !== null && afterTilemap !== null) {
    if (
      beforeTilemap.cols !== afterTilemap.cols ||
      beforeTilemap.rows !== afterTilemap.rows
    ) {
      next.tilemap = cloneTilemap(afterTilemap);
    } else if (next.tilemap !== null) {
      for (let index = 0; index < afterTilemap.cells.length; index++) {
        if (beforeTilemap.cells[index] !== afterTilemap.cells[index]) {
          next.tilemap.cells[index] = afterTilemap.cells[index] ?? null;
        }
      }
    }
  }

  return next;
}

export function parseRoomMessage(raw: unknown): RoomServerMessage | null {
  if (!isRecord(raw) || raw.protocol !== ROOM_PROTOCOL_VERSION || typeof raw.type !== "string") {
    return null;
  }
  switch (raw.type) {
    case "welcome":
      return typeof raw.roomId === "string" &&
        Number.isInteger(raw.seq) &&
        (raw.project === null || isProject(raw.project)) &&
        Array.isArray(raw.peers) &&
        raw.peers.every(isPresence) &&
        (raw.latestOperation === null || isOperationSummary(raw.latestOperation))
        ? (raw as unknown as RoomWelcomeMessage)
        : null;
    case "presence":
      return isPresence(raw.presence) ? (raw as unknown as RoomPresenceMessage) : null;
    case "presence_state":
      return Array.isArray(raw.peers) && raw.peers.every(isPresence)
        ? (raw as unknown as RoomPresenceStateMessage)
        : null;
    case "operation":
      if (!Number.isInteger(raw.seq) || !isOperationSummary(raw)) return null;
      if (raw.mode === "patch") {
        return isRoomPatch(raw.patch) ? (raw as unknown as RoomPatchOperationBroadcast) : null;
      }
      return (raw.mode === undefined || raw.mode === "snapshot") && isProject(raw.project)
        ? (raw as unknown as RoomSnapshotOperationBroadcast)
        : null;
    case "room_error":
      return typeof raw.message === "string" &&
        (raw.scope === undefined || raw.scope === "request" || raw.scope === "room") &&
        (raw.operationId === undefined ||
          (typeof raw.operationId === "string" &&
            raw.operationId.length > 0 &&
            raw.operationId.length <= MAX_ID_LENGTH)) &&
        (raw.project === undefined || isProject(raw.project)) &&
        (raw.seq === undefined || Number.isInteger(raw.seq))
        ? (raw as unknown as RoomErrorMessage)
        : null;
    default:
      return null;
  }
}
