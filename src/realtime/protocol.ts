import type { Frame, Project, Sprite, TilemapData } from "../types";

export const ROOM_PROTOCOL_VERSION = 1 as const;

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
}

export type RoomOperationKind = "edit" | "undo" | "redo";

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

export interface RoomOperationMessage {
  type: "operation";
  protocol: typeof ROOM_PROTOCOL_VERSION;
  operationId: string;
  baseSeq: number;
  baseProject: Project;
  project: Project;
  label: string;
}

export interface RoomUndoMessage {
  type: "undo" | "redo";
  protocol: typeof ROOM_PROTOCOL_VERSION;
  operationId: string;
}

export type RoomClientMessage =
  | RoomHelloMessage
  | RoomPresenceMessage
  | RoomOperationMessage
  | RoomUndoMessage;

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

export interface RoomOperationBroadcast extends RoomOperationSummary {
  type: "operation";
  protocol: typeof ROOM_PROTOCOL_VERSION;
  seq: number;
  project: Project;
}

export interface RoomErrorMessage {
  type: "room_error";
  protocol: typeof ROOM_PROTOCOL_VERSION;
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

function isPixel(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= -1 && value <= 63;
}

function isFrame(value: unknown, pixelCount: number): value is Frame {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    Array.isArray(value.pixels) &&
    value.pixels.length === pixelCount &&
    value.pixels.every(isPixel)
  );
}

function isSprite(value: unknown): value is Sprite {
  if (!isRecord(value)) return false;
  const width = value.width;
  const height = value.height;
  if (
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.name !== "string" ||
    value.name.length > 128 ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    (width as number) < 1 ||
    (width as number) > 64 ||
    (height as number) < 1 ||
    (height as number) > 64 ||
    !["character", "item", "tile"].includes(String(value.kind)) ||
    !Array.isArray(value.frames) ||
    value.frames.length < 1 ||
    value.frames.length > 32
  ) {
    return false;
  }
  return value.frames.every((frame) => isFrame(frame, (width as number) * (height as number)));
}

function isTilemap(value: unknown): value is TilemapData | null {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  const cols = value.cols;
  const rows = value.rows;
  return (
    Number.isInteger(cols) &&
    Number.isInteger(rows) &&
    (cols as number) >= 2 &&
    (cols as number) <= 64 &&
    (rows as number) >= 2 &&
    (rows as number) <= 64 &&
    Array.isArray(value.cells) &&
    value.cells.length === (cols as number) * (rows as number) &&
    value.cells.every((cell) => cell === null || (typeof cell === "string" && cell.length <= 128))
  );
}

export function isProject(value: unknown): value is Project {
  if (!isRecord(value)) return false;
  return (
    value.schemaVersion === 1 &&
    typeof value.name === "string" &&
    value.name.length <= 128 &&
    Array.isArray(value.palette) &&
    value.palette.length <= 64 &&
    value.palette.every((color) => typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)) &&
    Array.isArray(value.sprites) &&
    value.sprites.length >= 1 &&
    value.sprites.length <= 128 &&
    value.sprites.every(isSprite) &&
    isTilemap(value.tilemap)
  );
}

export function cloneProject(project: Project): Project {
  return {
    schemaVersion: 1,
    name: project.name,
    palette: [...project.palette],
    sprites: project.sprites.map((sprite) => ({
      ...sprite,
      frames: sprite.frames.map((frame) => ({ id: frame.id, pixels: [...frame.pixels] })),
    })),
    tilemap: project.tilemap
      ? { ...project.tilemap, cells: [...project.tilemap.cells] }
      : null,
  };
}

function cloneSprite(sprite: Sprite): Sprite {
  return {
    ...sprite,
    frames: sprite.frames.map((frame) => ({ id: frame.id, pixels: [...frame.pixels] })),
  };
}

function cloneTilemap(tilemap: TilemapData): TilemapData {
  return { ...tilemap, cells: [...tilemap.cells] };
}

function sameFrameShape(a: Frame[], b: Frame[]): boolean {
  return a.length === b.length && a.every((frame, index) => frame.id === b[index]?.id);
}

/**
 * Merge an edit created from an older room snapshot into the current room.
 * Pixel edits are merged cell-by-cell, so two people painting different pixels
 * do not overwrite one another merely because their messages crossed in flight.
 */
export function mergeProjectChanges(current: Project, before: Project, after: Project): Project {
  const next = cloneProject(current);

  if (before.name !== after.name) next.name = after.name;

  for (let index = 0; index < after.palette.length; index++) {
    if (before.palette[index] !== after.palette[index]) {
      next.palette[index] = after.palette[index]!;
    }
  }

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
      if (!currentSprite) next.sprites.push(cloneSprite(sprite));
      continue;
    }
    if (!currentSprite) {
      next.sprites.push(cloneSprite(sprite));
      continue;
    }

    if (
      beforeSprite.width !== sprite.width ||
      beforeSprite.height !== sprite.height ||
      beforeSprite.kind !== sprite.kind ||
      !sameFrameShape(beforeSprite.frames, sprite.frames)
    ) {
      const index = next.sprites.findIndex((candidate) => candidate.id === sprite.id);
      if (index >= 0) next.sprites[index] = cloneSprite(sprite);
      continue;
    }

    if (beforeSprite.name !== sprite.name) currentSprite.name = sprite.name;
    for (let frameIndex = 0; frameIndex < sprite.frames.length; frameIndex++) {
      const beforeFrame = beforeSprite.frames[frameIndex]!;
      const afterFrame = sprite.frames[frameIndex]!;
      const currentFrame = currentSprite.frames[frameIndex]!;
      for (let pixelIndex = 0; pixelIndex < afterFrame.pixels.length; pixelIndex++) {
        if (beforeFrame.pixels[pixelIndex] !== afterFrame.pixels[pixelIndex]) {
          currentFrame.pixels[pixelIndex] = afterFrame.pixels[pixelIndex]!;
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
  return raw as unknown as RoomServerMessage;
}
