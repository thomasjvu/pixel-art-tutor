import { create } from "zustand";
import type { Frame, PixelChange, Project, Sprite, SpriteKind } from "../types";
import type { SelectionRect } from "./editorStore";
import { TRANSPARENT } from "../types";
import { normalizeHex, resolveColorInto } from "../engine/color";
import {
  bresenhamLine,
  clampRect,
  emptyPixels,
  floodFill,
  flipH,
  flipV,
  inBounds,
  outline as outlineOp,
  rotate90,
  shiftWrap,
} from "../engine/pixels";
import { blankProject, createStarterProject } from "../engine/seed";
import { sanitizeProject } from "../engine/validate";
import { createUniqueId } from "./projectIds";
import {
  MAX_DIMENSION,
  MAX_FRAMES_PER_SPRITE,
  MAX_PALETTE_COLORS,
  MAX_PROJECT_JSON_LENGTH,
  MAX_PROJECT_NAME_LENGTH,
  MAX_SPRITE_NAME_LENGTH,
  MAX_SPRITES,
  MAX_TOTAL_PIXEL_CELLS,
  projectPixelCells,
} from "../projectLimits";
import {
  mergeProjectChangeHints,
  MAX_PROJECT_CHANGE_HINT_CELLS,
  type ProjectChange,
  type ProjectChangeHint,
  type ProjectPixelHint,
  type ProjectTileHint,
} from "../realtime/projectEvents";

export type TransformOp =
  | "flip_h"
  | "flip_v"
  | "rotate_90"
  | "shift"
  | "outline";

const HISTORY_LIMIT = 60;
const STORAGE_KEY = "pixel-art-tutor.project.v1";
const STORAGE_RECOVERY_KEY = `${STORAGE_KEY}.recovery.v1`;
const PROJECT_SAVES_KEY = "pixel-art-tutor.saved-projects.v1";
const PALETTE_SAVES_KEY = "pixel-art-tutor.saved-palettes.v1";
const MAX_SAVE_NAME_LENGTH = 64;
const MAX_SAVED_PROJECTS = 24;
const MAX_SAVED_PALETTES = 24;
let storedRecoveryRaw: string | null = null;
export type StorageStatus = "not_saved" | "pending" | "saved" | "unavailable" | "too_large";
let initialStorageStatus: StorageStatus = "not_saved";

function cloneProject(p: Project): Project {
  return {
    ...p,
    palette: [...p.palette],
    sprites: p.sprites.map((s) => ({
      ...s,
      frames: s.frames.map((f) => ({ id: f.id, pixels: [...f.pixels] })),
    })),
    tilemap: p.tilemap ? { ...p.tilemap, cells: [...p.tilemap.cells] } : null,
  };
}

function cloneProjectFrame(p: Project, spriteId: string, frameIndex: number): Project {
  return {
    ...p,
    sprites: p.sprites.map((sprite) =>
      sprite.id !== spriteId
        ? sprite
        : {
            ...sprite,
            frames: sprite.frames.map((frame, index) =>
              index === frameIndex ? { ...frame, pixels: [...frame.pixels] } : frame,
            ),
          },
    ),
  };
}

function preserveRejectedStoredProject(raw: string): void {
  storedRecoveryRaw = raw.slice(0, MAX_PROJECT_JSON_LENGTH);
  try {
    localStorage.setItem(STORAGE_RECOVERY_KEY, storedRecoveryRaw);
  } catch {
    /* Keep the in-memory copy when storage is unavailable or full. */
  }
  console.warn(`Saved project data was not usable; a recovery copy is available as ${STORAGE_RECOVERY_KEY}.`);
}

function loadStored(): Project | null {
  try {
    storedRecoveryRaw = localStorage.getItem(STORAGE_RECOVERY_KEY);
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    if (raw.length > MAX_PROJECT_JSON_LENGTH) {
      preserveRejectedStoredProject(raw);
      initialStorageStatus = "unavailable";
      return null;
    }
    const project = sanitizeProject(JSON.parse(raw));
    if (!project) {
      preserveRejectedStoredProject(raw);
      initialStorageStatus = "unavailable";
    } else {
      initialStorageStatus = "saved";
    }
    return project;
  } catch {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) preserveRejectedStoredProject(raw);
    } catch {
      /* localStorage may be unavailable in a private or embedded browser */
    }
    initialStorageStatus = "unavailable";
    return null;
  }
}

export function storedProjectRecovery(): string | null {
  if (storedRecoveryRaw) return storedRecoveryRaw;
  try {
    storedRecoveryRaw = localStorage.getItem(STORAGE_RECOVERY_KEY);
  } catch {
    /* localStorage may be unavailable in a private or embedded browser */
  }
  return storedRecoveryRaw;
}

function clearStoredProjectRecovery(): void {
  storedRecoveryRaw = null;
  try {
    localStorage.removeItem(STORAGE_RECOVERY_KEY);
  } catch {
    /* localStorage may be unavailable in a private or embedded browser */
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

const projectListeners = new Set<(change: ProjectChange) => void>();

export function subscribeProjectChanges(listener: (change: ProjectChange) => void): () => void {
  projectListeners.add(listener);
  return () => projectListeners.delete(listener);
}

function notifyProjectChange(change: ProjectChange): void {
  for (const listener of projectListeners) listener(change);
}

function projectsEqual(a: Project, b: Project): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function safeDimension(value: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.min(MAX_DIMENSION, Math.round(value)))
    : fallback;
}

function isSpriteKind(value: unknown): value is SpriteKind {
  return value === "character" || value === "item" || value === "tile";
}

export interface SaveEntry {
  name: string;
  savedAt: number;
}

function cleanSaveName(name: unknown): string | null {
  const next = typeof name === "string" ? name.trim().slice(0, MAX_SAVE_NAME_LENGTH) : "";
  return next ? next : null;
}

function readSaveSlots(key: string): { name: string; savedAt: number; data: unknown }[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const slots: { name: string; savedAt: number; data: unknown }[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const { name, savedAt, data } = entry as Record<string, unknown>;
      if (typeof name !== "string" || !name.trim() || typeof savedAt !== "number" || data === undefined) continue;
      slots.push({ name: name.trim().slice(0, MAX_SAVE_NAME_LENGTH), savedAt, data });
    }
    return slots;
  } catch {
    return [];
  }
}

function writeSaveSlots(key: string, slots: { name: string; savedAt: number; data: unknown }[]): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(slots));
    return true;
  } catch {
    return false;
  }
}

function readPaletteSlots(): { name: string; savedAt: number; colors: string[] }[] {
  const slots: { name: string; savedAt: number; colors: string[] }[] = [];
  for (const slot of readSaveSlots(PALETTE_SAVES_KEY)) {
    if (!Array.isArray(slot.data)) continue;
    const colors: string[] = [];
    for (const hex of slot.data) {
      const normalized = normalizeHex(hex);
      if (normalized && !colors.includes(normalized)) colors.push(normalized);
    }
    if (colors.length > 0) slots.push({ name: slot.name, savedAt: slot.savedAt, colors });
  }
  return slots;
}

export interface ResolveTarget {
  sprite: Sprite;
  frameIndex: number;
}

function cellHint(
  pixels: ProjectPixelHint[] = [],
  tiles: ProjectTileHint[] = [],
): ProjectChangeHint {
  if (pixels.length + tiles.length > MAX_PROJECT_CHANGE_HINT_CELLS) {
    return { kind: "unknown" };
  }
  return { kind: "cells", pixels, tiles };
}

interface ProjectState {
  project: Project;
  activeSpriteId: string;
  activeFrameIndex: number;
  selectedTileId: string | null;
  past: Project[];
  future: Project[];
  storageRecovery: boolean;
  storageStatus: StorageStatus;
  storageError: string | null;
  lastSavedAt: number | null;

  activeSprite(): Sprite;
  resolveTarget(spriteId?: string, frameIndex?: number): ResolveTarget | { error: string };

  setColorAt(x: number, y: number, colorIdx: number): void;
  drawLine(from: [number, number], to: [number, number], colorIdx: number): void;
  applyPixelChanges(changes: PixelChange[], spriteId?: string, frameIndex?: number, allFrames?: boolean): { applied: number; addedColors: number[] };
  fillRegion(x: number, y: number, w: number, h: number, color: number | string | null, spriteId?: string, frameIndex?: number, allFrames?: boolean): number | { error: string };
  floodFillAt(
    x: number,
    y: number,
    color: number | string | null,
    spriteId?: string,
    frameIndex?: number,
  ): void | { error: string };
  clearFrame(spriteId?: string, frameIndex?: number): void;
  movePixels(rect: SelectionRect, dx: number, dy: number): number;
  transform(op: TransformOp, opts: { dx?: number; dy?: number; color?: number | string | null; frameIndices?: number[]; spriteId?: string }): string | null;
  replaceColor(from: number | string | null, to: number | string | null, spriteId?: string): number | { error: string };

  beginStroke(): void;
  endStroke(label?: string): void;
  interruptStroke(): void;

  addPaletteColor(hex: string): { index: number } | { error: string };
  setActiveSprite(spriteId: string, frameIndex?: number): boolean;
  addSprite(opts: { name: string; width: number; height: number; kind: SpriteKind; copyFromId?: string }): string | null;
  deleteSprite(id: string): void;
  renameSprite(id: string, name: string): void;
  renameProject(name: string): void;
  importRasterSprite(opts: {
    name: string;
    width: number;
    height: number;
    frames: Array<Array<string | null>>;
    kind?: SpriteKind;
  }): string | null;
  addFrame(spriteId?: string, copyFrameIndex?: number): number;
  deleteFrame(frameIndex: number, spriteId?: string): boolean;
  selectFrame(index: number): void;

  ensureTilemap(cols: number, rows: number): void;
  placeTile(x: number, y: number, spriteId: string | null): boolean;
  fillTiles(x: number, y: number, w: number, h: number, spriteId: string | null): number;

  undo(): void;
  redo(): void;
  loadProject(p: unknown): { ok: true } | { ok: false; error: string };
  listProjectSaves(): SaveEntry[];
  saveProjectAs(name?: string): { ok: true; name: string } | { ok: false; error: string };
  openProjectSave(name: string): { ok: true } | { ok: false; error: string };
  deleteProjectSave(name: string): boolean;
  listPaletteSaves(): SaveEntry[];
  savePaletteAs(name?: string): { ok: true; name: string } | { ok: false; error: string };
  applyPaletteSave(name: string): { ok: true; added: number } | { ok: false; error: string };
  deletePaletteSave(name: string): boolean;
  applyRoomProject(p: Project): boolean;
  dismissStorageRecovery(): void;
  resetProject(kind: "starter" | "blank"): void;
  exportProject(): string;
}

export const useStore = create<ProjectState>()((set, get) => {
  let strokeActive = false;
  let strokeBaseProject: Project | null = null;
  let strokeHint: ProjectChangeHint = cellHint();

  function finishStroke(label = "Paint stroke") {
    if (!strokeActive) return;
    strokeActive = false;
    const previousProject = strokeBaseProject;
    strokeBaseProject = null;
    const hint = strokeHint;
    strokeHint = cellHint();
    const project = get().project;
    if (!previousProject || projectsEqual(previousProject, project)) return;
    const { past } = get();
    set({ past: [...past.slice(-HISTORY_LIMIT), previousProject], future: [] });
    scheduleSave();
    notifyProjectChange({ project, previousProject, source: "local", label, hint });
  }

  function cancelStroke() {
    if (!strokeActive) return;
    strokeActive = false;
    const previousProject = strokeBaseProject;
    strokeBaseProject = null;
    strokeHint = cellHint();
    if (previousProject) set({ project: previousProject });
  }

  /** commit: push current project into history and install next */
  function commit(
    next: Project,
    extra?: Partial<ProjectState>,
    source: ProjectChange["source"] = "local",
    label = "Edit",
    hint: ProjectChangeHint = { kind: "unknown" },
  ) {
    const { project, past } = get();
    if (strokeActive) {
      // History and room notification are finalized once at endStroke. Avoid
      // serializing the full project for every pointermove in the stroke.
      strokeHint = mergeProjectChangeHints(strokeHint, hint);
      set({ project: next, ...extra });
      return;
    }
    if (projectsEqual(project, next)) {
      if (extra) set(extra);
      return;
    }
    set({
      project: next,
      past: [...past.slice(-HISTORY_LIMIT), project],
      future: [],
      ...extra,
    });
    scheduleSave();
    notifyProjectChange({ project: next, previousProject: project, source, label, hint });
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    set({ storageStatus: "pending", storageError: null });
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try {
        const serialized = JSON.stringify(get().project);
        if (serialized.length > MAX_PROJECT_JSON_LENGTH) {
          set({
            storageStatus: "too_large",
            storageError:
              "This project is larger than the " +
              MAX_PROJECT_JSON_LENGTH.toLocaleString() +
              " character local save limit.",
          });
          return;
        }
        localStorage.setItem(STORAGE_KEY, serialized);
        set({ storageStatus: "saved", storageError: null, lastSavedAt: Date.now() });
      } catch {
        set({
          storageStatus: "unavailable",
          storageError: "Local storage is unavailable or full.",
        });
      }
    }, 400);
  }

  return {
    project: loadStored() ?? blankProject(),
    activeSpriteId: "",
    activeFrameIndex: 0,
    selectedTileId: null,
    past: [],
    future: [],
    storageRecovery: Boolean(storedRecoveryRaw),
    storageStatus: initialStorageStatus,
    storageError: null,
    lastSavedAt: initialStorageStatus === "saved" ? Date.now() : null,

    beginStroke() {
      if (strokeActive) return;
      const { project } = get();
      strokeBaseProject = project;
      strokeHint = cellHint();
      strokeActive = true;
    },

    endStroke(label = "Paint stroke") {
      finishStroke(label);
    },

    interruptStroke() {
      finishStroke();
    },

    activeSprite() {
      const { project, activeSpriteId } = get();
      return project.sprites.find((s) => s.id === activeSpriteId) ?? project.sprites[0];
    },

    resolveTarget(spriteId, frameIndex) {
      const { project, activeSpriteId, activeFrameIndex } = get();
      const sprite =
        spriteId === undefined
          ? (project.sprites.find((s) => s.id === activeSpriteId) ?? project.sprites[0])
          : project.sprites.find((s) => s.id === spriteId);
      if (!sprite) return { error: `sprite '${spriteId ?? "(none)"}' not found` };
      let fi: number;
      if (frameIndex === undefined) {
        fi = sprite.id === activeSpriteId ? activeFrameIndex : 0;
      } else {
        if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= sprite.frames.length) {
          return {
            error: `frame index ${frameIndex} is out of range for '${sprite.name}' (0-${sprite.frames.length - 1})`,
          };
        }
        fi = frameIndex;
      }
      fi = Math.max(0, Math.min(fi, sprite.frames.length - 1));
      if (!sprite.frames[fi]) return { error: `sprite '${sprite.name}' has no frames` };
      return { sprite, frameIndex: fi };
    },

    setColorAt(x, y, colorIdx) {
      const t = get().resolveTarget();
      if ("error" in t) return;
      const { sprite, frameIndex } = t;
      if (!inBounds(x, y, sprite.width, sprite.height)) return;
      const next = cloneProjectFrame(get().project, sprite.id, frameIndex);
      const frame = next.sprites.find((s) => s.id === sprite.id)!.frames[frameIndex];
      if (frame.pixels[y * sprite.width + x] === colorIdx) return;
      frame.pixels[y * sprite.width + x] = colorIdx;
      commit(next, undefined, "local", "Edit", cellHint([{ spriteId: sprite.id, frameIndex, x, y }]));
    },

    drawLine(from, to, colorIdx) {
      const t = get().resolveTarget();
      if ("error" in t) return;
      const { sprite, frameIndex } = t;
      const next = cloneProjectFrame(get().project, sprite.id, frameIndex);
      const frame = next.sprites.find((s) => s.id === sprite.id)!.frames[frameIndex];
      const pixels: ProjectPixelHint[] = [];
      for (const [x, y] of bresenhamLine(from[0], from[1], to[0], to[1])) {
        if (inBounds(x, y, sprite.width, sprite.height)) {
          if (frame.pixels[y * sprite.width + x] !== colorIdx) {
            pixels.push({ spriteId: sprite.id, frameIndex, x, y });
          }
          frame.pixels[y * sprite.width + x] = colorIdx;
        }
      }
      if (pixels.length > 0) commit(next, undefined, "local", "Edit", cellHint(pixels));
    },

    applyPixelChanges(changes, spriteId, frameIndex, allFrames) {
      const t = get().resolveTarget(spriteId, frameIndex);
      if ("error" in t)
        return { applied: 0, addedColors: [] };
      const { sprite, frameIndex: fi } = t;
      const next = cloneProject(get().project);
      const target = next.sprites.find((s) => s.id === sprite.id)!;
      let applied = 0;
      const addedColors: number[] = [];
      const changedPixels: ProjectPixelHint[] = [];
      const frameIdxs = allFrames
        ? target.frames.map((_, i) => i)
        : [fi];
      for (const ch of changes) {
        const paletteLength = next.palette.length;
        const resolved = resolveColorInto(ch.color ?? null, next);
        if ("error" in resolved) continue;
        const colorIdx = resolved.index;
        if (next.palette.length > paletteLength) addedColors.push(colorIdx);
        for (const fi of frameIdxs) {
          const frame = target.frames[fi];
          if (!frame) continue;
          if (!inBounds(ch.x, ch.y, target.width, target.height)) continue;
          const pixelIndex = ch.y * target.width + ch.x;
          if (frame.pixels[pixelIndex] === colorIdx) continue;
          frame.pixels[pixelIndex] = colorIdx;
          changedPixels.push({
            spriteId: sprite.id,
            frameIndex: fi,
            x: ch.x,
            y: ch.y,
          });
          applied++;
        }
      }
      if (applied > 0) commit(next, undefined, "local", "Edit", cellHint(changedPixels));
      return { applied, addedColors };
    },

    fillRegion(x, y, w, h, color, spriteId, frameIndex, allFrames) {
      const t = get().resolveTarget(spriteId, frameIndex);
      if ("error" in t) return 0;
      const { sprite, frameIndex: fi } = t;
      const next = cloneProject(get().project);
      const target = next.sprites.find((s) => s.id === sprite.id)!;
      const r = clampRect(x, y, w, h, target.width, target.height);
      if (!r) return 0;
      const resolved = resolveColorInto(color, next);
      if ("error" in resolved) return { error: resolved.error };
      const colorIdx = resolved.index;
      const fis = allFrames ? target.frames.map((_, i) => i) : [fi];
      let count = 0;
      const changedPixels: ProjectPixelHint[] = [];
      for (const idx of fis) {
        const frame = target.frames[idx];
        if (!frame) continue;
        for (let yy = r.y; yy < r.y + r.h; yy++)
          for (let xx = r.x; xx < r.x + r.w; xx++) {
            const pixelIndex = yy * target.width + xx;
            if (frame.pixels[pixelIndex] === colorIdx) continue;
            frame.pixels[pixelIndex] = colorIdx;
            changedPixels.push({
              spriteId: sprite.id,
              frameIndex: idx,
              x: xx,
              y: yy,
            });
            count++;
          }
      }
      if (count > 0) commit(next, undefined, "local", "Edit", cellHint(changedPixels));
      return count;
    },

    floodFillAt(x, y, color, spriteId, frameIndex) {
      const t = get().resolveTarget(spriteId, frameIndex);
      if ("error" in t) return;
      const { sprite, frameIndex: fi } = t;
      const next = cloneProject(get().project);
      const frame = next.sprites.find((s) => s.id === sprite.id)!.frames[fi];
      const previousFrame = sprite.frames[fi]!;
      const resolved = resolveColorInto(color, next);
      if ("error" in resolved) return { error: resolved.error };
      frame.pixels = floodFill(frame.pixels, sprite.width, sprite.height, x, y, resolved.index);
      const changedPixels: ProjectPixelHint[] = [];
      for (let index = 0; index < frame.pixels.length; index++) {
        if (previousFrame.pixels[index] === frame.pixels[index]) continue;
        changedPixels.push({
          spriteId: sprite.id,
          frameIndex: fi,
          x: index % sprite.width,
          y: Math.floor(index / sprite.width),
        });
      }
      if (changedPixels.length > 0) {
        commit(next, undefined, "local", "Edit", cellHint(changedPixels));
      }
    },

    clearFrame(spriteId, frameIndex) {
      const t = get().resolveTarget(spriteId, frameIndex);
      if ("error" in t) return;
      const { sprite, frameIndex: fi } = t;
      const next = cloneProject(get().project);
      const target = next.sprites.find((s) => s.id === sprite.id)!;
      const previousFrame = sprite.frames[fi]!;
      target.frames[fi].pixels = emptyPixels(target.width, target.height);
      const changedPixels: ProjectPixelHint[] = [];
      for (let index = 0; index < previousFrame.pixels.length; index++) {
        if (previousFrame.pixels[index] === TRANSPARENT) continue;
        changedPixels.push({
          spriteId: sprite.id,
          frameIndex: fi,
          x: index % sprite.width,
          y: Math.floor(index / sprite.width),
        });
      }
      if (changedPixels.length > 0) {
        commit(next, undefined, "local", "Edit", cellHint(changedPixels));
      }
    },

    movePixels(rect, dx, dy) {
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 0;
      const ox = Math.round(dx);
      const oy = Math.round(dy);
      if (ox === 0 && oy === 0) return 0;
      const { project } = get();
      const sprite = project.sprites.find((s) => s.id === rect.spriteId);
      const frame = sprite?.frames[rect.frameIndex];
      if (!sprite || !frame) return 0;
      const sx0 = Math.max(0, Math.round(rect.x));
      const sy0 = Math.max(0, Math.round(rect.y));
      const sx1 = Math.min(sprite.width, Math.round(rect.x + rect.width));
      const sy1 = Math.min(sprite.height, Math.round(rect.y + rect.height));
      if (sx1 <= sx0 || sy1 <= sy0) return 0;
      const next = cloneProject(project);
      const target = next.sprites.find((s) => s.id === sprite.id)!;
      const pixels = target.frames[rect.frameIndex]!.pixels;
      const w = sx1 - sx0;
      const h = sy1 - sy0;
      const buffer = new Array<number>(w * h);
      const changedPixels: ProjectPixelHint[] = [];
      for (let y = sy0; y < sy1; y++)
        for (let x = sx0; x < sx1; x++) {
          const index = y * sprite.width + x;
          buffer[(y - sy0) * w + (x - sx0)] = pixels[index];
          if (pixels[index] !== TRANSPARENT) {
            pixels[index] = TRANSPARENT;
            changedPixels.push({ spriteId: sprite.id, frameIndex: rect.frameIndex, x, y });
          }
        }
      let moved = 0;
      for (let y = sy0; y < sy1; y++)
        for (let x = sx0; x < sx1; x++) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= sprite.width || ny >= sprite.height) continue;
          pixels[ny * sprite.width + nx] = buffer[(y - sy0) * w + (x - sx0)];
          changedPixels.push({ spriteId: sprite.id, frameIndex: rect.frameIndex, x: nx, y: ny });
          moved++;
        }
      if (changedPixels.length > 0) {
        commit(next, undefined, "local", "Move selection", cellHint(changedPixels));
      }
      return moved;
    },

    transform(op, opts) {
      const t = get().resolveTarget(opts.spriteId);
      if ("error" in t) return t.error;
      const { sprite } = t;
      const next = cloneProject(get().project);
      const target = next.sprites.find((s) => s.id === sprite.id)!;
      let fis: number[];
      if (opts.frameIndices && opts.frameIndices.length) {
        fis = [...new Set(opts.frameIndices)];
        const invalid = fis.find(
          (index) => !Number.isInteger(index) || index < 0 || index >= target.frames.length,
        );
        if (invalid !== undefined) return `frame index ${invalid} is out of range for '${target.name}'`;
      } else {
        fis = target.frames.map((_, i) => i);
      }
      const newW = target.height;
      const newH = target.width;

      if (op === "rotate_90" && fis.length !== target.frames.length) {
        return "rotating a single frame would desync sprite dimensions; rotate all frames instead";
      }

      let colorIdx = 0;
      if (op === "outline") {
        const resolved = resolveColorInto(opts.color ?? 0, next);
        if ("error" in resolved) return resolved.error;
        colorIdx = resolved.index;
      }

      for (const fi of fis) {
        const frame: Frame = target.frames[fi];
        if (op === "flip_h") frame.pixels = flipH(frame.pixels, target.width, target.height);
        else if (op === "flip_v") frame.pixels = flipV(frame.pixels, target.width, target.height);
        else if (op === "rotate_90") {
          const r = rotate90(frame.pixels, target.width, target.height);
          frame.pixels = r.pixels;
        } else if (op === "shift") {
          frame.pixels = shiftWrap(
            frame.pixels,
            target.width,
            target.height,
            opts.dx ?? 0,
            opts.dy ?? 0,
          );
        } else if (op === "outline") {
          frame.pixels = outlineOp(frame.pixels, target.width, target.height, colorIdx);
        }
      }
      if (op === "rotate_90") {
        target.width = newW;
        target.height = newH;
      }
      commit(next);
      return null;
    },

    replaceColor(from, to, spriteId) {
      const { project } = get();
      const target = spriteId ? project.sprites.find((s) => s.id === spriteId) : null;
      const sprites = target ? [target] : project.sprites;
      const next = cloneProject(project);
      const fromResolved = resolveColorInto(from, next);
      if ("error" in fromResolved) return { error: fromResolved.error };
      const toResolved = resolveColorInto(to, next);
      if ("error" in toResolved) return { error: toResolved.error };
      const fromIdx = fromResolved.index;
      const toIdx = toResolved.index;
      let count = 0;
      for (const sp of sprites) {
        const nsp = next.sprites.find((s) => s.id === sp.id)!;
        for (const f of nsp.frames)
          for (let i = 0; i < f.pixels.length; i++)
            if (f.pixels[i] === fromIdx) {
              f.pixels[i] = toIdx;
              count++;
            }
      }
      if (count > 0) commit(next);
      return count;
    },

    addPaletteColor(hex) {
      const normalized = normalizeHex(hex);
      if (!normalized) return { error: `'${hex}' is not a valid hex color like #38b764` };
      const { project } = get();
      const existing = project.palette.indexOf(normalized);
      if (existing >= 0) return { index: existing };
      if (project.palette.length >= MAX_PALETTE_COLORS)
        return { error: `palette is full (${MAX_PALETTE_COLORS} colors max)` };
      const next = cloneProject(project);
      next.palette.push(normalized);
      commit(next, undefined, "local", "Edit", { kind: "palette" });
      return { index: next.palette.length - 1 };
    },

    setActiveSprite(spriteId, frameIndex) {
      const { project } = get();
      const idx = project.sprites.findIndex((s) => s.id === spriteId);
      if (idx < 0) return false;
      const sprite = project.sprites[idx];
      const fi = frameIndex !== undefined ? Math.max(0, Math.min(frameIndex, sprite.frames.length - 1)) : 0;
      set({ activeSpriteId: sprite.id, activeFrameIndex: fi });
      return true;
    },

    addSprite(opts) {
      const project = get().project;
      if (project.sprites.length >= MAX_SPRITES) return null;
      const kind = isSpriteKind(opts.kind) ? opts.kind : "item";
      const w = safeDimension(opts.width, 16);
      const h = safeDimension(opts.height, 16);
      let pixels = emptyPixels(w, h);
      let frameCount = kind === "character" ? 2 : 1;
      if (opts.copyFromId) {
        const src = project.sprites.find((s) => s.id === opts.copyFromId);
        if (src && src.width === w && src.height === h) {
          pixels = [...src.frames[0].pixels];
          frameCount = src.frames.length;
        }
      }
      if (projectPixelCells(project) + w * h * frameCount > MAX_TOTAL_PIXEL_CELLS) return null;
      const next = cloneProject(project);
      const usedSpriteIds = new Set(project.sprites.map((sprite) => sprite.id));
      const usedFrameIds = new Set(
        project.sprites.flatMap((sprite) => sprite.frames.map((frame) => frame.id)),
      );
      let id: string;
      let frameIds: string[];
      try {
        id = createUniqueId("sprite", usedSpriteIds);
        usedSpriteIds.add(id);
        frameIds = Array.from({ length: frameCount }, () => {
          const frameId = createUniqueId("frame", usedFrameIds);
          usedFrameIds.add(frameId);
          return frameId;
        });
      } catch {
        return null;
      }
      const sprite: Sprite = {
        id,
        name: (typeof opts.name === "string" ? opts.name.trim() : "").slice(0, MAX_SPRITE_NAME_LENGTH) || "Untitled",
        width: w,
        height: h,
        kind,
        frames: frameIds.map((frameId, i) => ({
          id: frameId,
          pixels: i === 0 ? pixels : [...pixels],
        })),
      };
      next.sprites.push(sprite);
      commit(next, { activeSpriteId: id, activeFrameIndex: 0 });
      return id;
    },

    deleteSprite(id) {
      const { project } = get();
      if (project.sprites.length <= 1) return;
      const next = cloneProject(project);
      next.sprites = next.sprites.filter((s) => s.id !== id);
      if (next.tilemap) {
        next.tilemap.cells = next.tilemap.cells.map((c) => (c === id ? null : c));
      }
      const extra: Partial<ProjectState> = {};
      if (get().activeSpriteId === id) extra.activeSpriteId = next.sprites[0].id;
      if (get().selectedTileId === id) extra.selectedTileId = null;
      commit(next, extra);
    },

    renameSprite(id, name) {
      const next = cloneProject(get().project);
      const sp = next.sprites.find((s) => s.id === id);
      const trimmed = typeof name === "string" ? name.trim().slice(0, MAX_SPRITE_NAME_LENGTH) : "";
      if (!sp || !trimmed) return;
      if (sp.name === trimmed) return;
      sp.name = trimmed;
      commit(next);
    },

    renameProject(name) {
      const trimmed = name.trim();
      if (!trimmed || trimmed === get().project.name) return;
      const next = cloneProject(get().project);
      next.name = trimmed.slice(0, MAX_PROJECT_NAME_LENGTH);
      commit(next);
    },

    importRasterSprite(opts) {
      const project = get().project;
      if (project.sprites.length >= MAX_SPRITES) return null;
      const width = safeDimension(opts.width, 16);
      const height = safeDimension(opts.height, 16);
      const sourceFrames = Array.isArray(opts.frames) ? opts.frames.slice(0, MAX_FRAMES_PER_SPRITE) : [];
      const frameCount = Math.max(1, sourceFrames.length);
      if (projectPixelCells(project) + width * height * frameCount > MAX_TOTAL_PIXEL_CELLS) return null;
      const next = cloneProject(project);
      const usedSpriteIds = new Set(project.sprites.map((sprite) => sprite.id));
      const usedFrameIds = new Set(
        project.sprites.flatMap((sprite) => sprite.frames.map((frame) => frame.id)),
      );
      let id: string;
      let frameIds: string[];
      try {
        id = createUniqueId("sprite", usedSpriteIds);
        usedSpriteIds.add(id);
        frameIds = Array.from({ length: frameCount }, () => {
          const frameId = createUniqueId("frame", usedFrameIds);
          usedFrameIds.add(frameId);
          return frameId;
        });
      } catch {
        return null;
      }
      const frames = sourceFrames.map((source, index) => {
        const pixels = new Array<number>(width * height).fill(TRANSPARENT);
        const sourcePixels = Array.isArray(source) ? source : [];
        for (let i = 0; i < pixels.length; i++) {
          const value = sourcePixels[i];
          if (!value) continue;
          const hex = normalizeHex(value);
          if (!hex) continue;
          let paletteIndex = next.palette.indexOf(hex);
          if (paletteIndex < 0) {
            if (next.palette.length >= MAX_PALETTE_COLORS) continue;
            paletteIndex = next.palette.length;
            next.palette.push(hex);
          }
          pixels[i] = paletteIndex;
        }
        return { id: frameIds[index]!, pixels };
      });
      const safeFrames =
        frames.length > 0
          ? frames
          : [{ id: frameIds[0]!, pixels: emptyPixels(width, height) }];
      next.sprites.push({
        id,
        name: (typeof opts.name === "string" ? opts.name.trim() : "").slice(0, MAX_SPRITE_NAME_LENGTH) || "Imported sprite",
        width,
        height,
        kind: isSpriteKind(opts.kind) ? opts.kind : "item",
        frames: safeFrames,
      });
      commit(next, { activeSpriteId: id, activeFrameIndex: 0 });
      return id;
    },

    addFrame(spriteId, copyFrameIndex) {
      const t = get().resolveTarget(spriteId);
      if ("error" in t) return -1;
      const { sprite } = t;
      if (sprite.frames.length >= MAX_FRAMES_PER_SPRITE) return -1;
      if (projectPixelCells(get().project) + sprite.width * sprite.height > MAX_TOTAL_PIXEL_CELLS) return -1;
      const next = cloneProject(get().project);
      const target = next.sprites.find((s) => s.id === sprite.id)!;
      const srcIdx = copyFrameIndex ?? target.frames.length - 1;
      if (
        !Number.isInteger(srcIdx) ||
        srcIdx < 0 ||
        srcIdx >= target.frames.length
      ) {
        return -1;
      }
      const src = target.frames[Math.max(0, Math.min(srcIdx, target.frames.length - 1))];
      const usedFrameIds = new Set(
        get().project.sprites.flatMap((entry) => entry.frames.map((frame) => frame.id)),
      );
      let id: string;
      try {
        id = createUniqueId("frame", usedFrameIds);
      } catch {
        return -1;
      }
      target.frames.push({ id, pixels: src ? [...src.pixels] : emptyPixels(target.width, target.height) });
      commit(next, { activeFrameIndex: target.frames.length - 1 });
      return target.frames.length - 1;
    },

    deleteFrame(frameIndex, spriteId) {
      const t = get().resolveTarget(spriteId, frameIndex);
      if ("error" in t) return false;
      const { sprite, frameIndex: fi } = t;
      if (sprite.frames.length <= 1) return false;
      const next = cloneProject(get().project);
      const target = next.sprites.find((s) => s.id === sprite.id)!;
      target.frames.splice(fi, 1);
      const extra: Partial<ProjectState> = {};
      if (sprite.id === get().activeSpriteId) {
        extra.activeFrameIndex = Math.min(get().activeFrameIndex, target.frames.length - 1);
      }
      commit(next, extra);
      return true;
    },

    selectFrame(index) {
      set({ activeFrameIndex: index });
    },

    ensureTilemap(cols, rows) {
      const { project } = get();
      const c = Math.max(2, Math.min(MAX_DIMENSION, safeDimension(cols, 12)));
      const r = Math.max(2, Math.min(MAX_DIMENSION, safeDimension(rows, 9)));
      const next = cloneProject(project);
      if (
        next.tilemap &&
        next.tilemap.cols === c &&
        next.tilemap.rows === r
      ) {
        return;
      }
      const old = next.tilemap;
      const cells: (string | null)[] = new Array(c * r).fill(null);
      if (old) {
        for (let y = 0; y < Math.min(r, old.rows); y++)
          for (let x = 0; x < Math.min(c, old.cols); x++)
            cells[y * c + x] = old.cells[y * old.cols + x] ?? null;
      }
      next.tilemap = { cols: c, rows: r, cells };
      commit(next);
    },

    placeTile(x, y, spriteId) {
      const { project } = get();
      const tm = project.tilemap;
      if (!tm || !inBounds(x, y, tm.cols, tm.rows)) return false;
      if (spriteId !== null && !project.sprites.some((s) => s.id === spriteId && s.kind === "tile")) return false;
      const cellIndex = y * tm.cols + x;
      if (tm.cells[cellIndex] === spriteId) return true;
      const next = cloneProject(project);
      next.tilemap!.cells[cellIndex] = spriteId;
      commit(next, undefined, "local", "Edit", cellHint([], [{ index: cellIndex }]));
      return true;
    },

    fillTiles(x, y, w, h, spriteId) {
      const { project } = get();
      const tm = project.tilemap;
      if (!tm) return 0;
      if (spriteId !== null && !project.sprites.some((s) => s.id === spriteId && s.kind === "tile")) return 0;
      const r = clampRect(x, y, w, h, tm.cols, tm.rows);
      if (!r) return 0;
      const next = cloneProject(project);
      let count = 0;
      const changedTiles: ProjectTileHint[] = [];
      for (let yy = r.y; yy < r.y + r.h; yy++)
        for (let xx = r.x; xx < r.x + r.w; xx++) {
          const cellIndex = yy * tm.cols + xx;
          if (next.tilemap!.cells[cellIndex] === spriteId) continue;
          next.tilemap!.cells[cellIndex] = spriteId;
          changedTiles.push({ index: cellIndex });
          count++;
        }
      if (count) commit(next, undefined, "local", "Edit", cellHint([], changedTiles));
      return count;
    },

    undo() {
      finishStroke();
      const { past, project, future } = get();
      if (!past.length) return;
      const prev = past[past.length - 1];
      set({
        project: prev,
        past: past.slice(0, -1),
        future: [project, ...future].slice(0, HISTORY_LIMIT),
      });
      scheduleSave();
      notifyProjectChange({ project: prev, previousProject: project, source: "undo", label: "Undo" });
      const sp = prev.sprites.find((s) => s.id === get().activeSpriteId) ?? prev.sprites[0];
      if (sp) set({ activeSpriteId: sp.id, activeFrameIndex: Math.min(get().activeFrameIndex, sp.frames.length - 1) });
    },

    redo() {
      finishStroke();
      const { past, project, future } = get();
      if (!future.length) return;
      const nxt = future[0];
      set({
        project: nxt,
        past: [...past.slice(-HISTORY_LIMIT), project],
        future: future.slice(1),
      });
      scheduleSave();
      notifyProjectChange({ project: nxt, previousProject: project, source: "redo", label: "Redo" });
    },

    loadProject(p) {
      const sanitized = sanitizeProject(p);
      if (!sanitized) {
        return {
          ok: false,
          error: "not a valid project file (expected schemaVersion 1 with sprites)",
        };
      }
      finishStroke();
      commit(sanitized, {
        activeSpriteId: sanitized.sprites[0].id,
        activeFrameIndex: 0,
        selectedTileId: null,
      });
      return { ok: true };
    },

    listProjectSaves() {
      return readSaveSlots(PROJECT_SAVES_KEY).map(({ name, savedAt }) => ({ name, savedAt }));
    },

    saveProjectAs(name) {
      const clean = cleanSaveName(name) ?? get().project.name.trim().slice(0, MAX_SAVE_NAME_LENGTH) ?? "Untitled";
      if (!clean) return { ok: false, error: "name must be a non-empty string" };
      const slots = readSaveSlots(PROJECT_SAVES_KEY).filter((slot) => slot.name !== clean);
      if (slots.length >= MAX_SAVED_PROJECTS) {
        return { ok: false, error: `project library is full (${MAX_SAVED_PROJECTS} saves max)` };
      }
      slots.unshift({ name: clean, savedAt: Date.now(), data: cloneProject(get().project) });
      if (!writeSaveSlots(PROJECT_SAVES_KEY, slots)) {
        return { ok: false, error: "local storage is unavailable or full" };
      }
      return { ok: true, name: clean };
    },

    openProjectSave(name) {
      const clean = cleanSaveName(name);
      if (!clean) return { ok: false, error: "name must be a non-empty string" };
      const slot = readSaveSlots(PROJECT_SAVES_KEY).find((s) => s.name === clean);
      if (!slot) return { ok: false, error: `no saved project named '${clean}'` };
      return get().loadProject(slot.data);
    },

    deleteProjectSave(name) {
      const clean = cleanSaveName(name);
      if (!clean) return false;
      const slots = readSaveSlots(PROJECT_SAVES_KEY);
      const next = slots.filter((slot) => slot.name !== clean);
      if (next.length === slots.length) return false;
      return writeSaveSlots(PROJECT_SAVES_KEY, next);
    },

    listPaletteSaves() {
      return readPaletteSlots().map(({ name, savedAt }) => ({ name, savedAt }));
    },

    savePaletteAs(name) {
      const clean =
        cleanSaveName(name) ?? `${get().project.name.trim().slice(0, MAX_SAVE_NAME_LENGTH) || "Untitled"} palette`;
      if (!clean) return { ok: false, error: "name must be a non-empty string" };
      const slots = readSaveSlots(PALETTE_SAVES_KEY).filter((slot) => slot.name !== clean);
      if (slots.length >= MAX_SAVED_PALETTES) {
        return { ok: false, error: `palette library is full (${MAX_SAVED_PALETTES} saves max)` };
      }
      slots.unshift({ name: clean, savedAt: Date.now(), data: [...get().project.palette] });
      if (!writeSaveSlots(PALETTE_SAVES_KEY, slots)) {
        return { ok: false, error: "local storage is unavailable or full" };
      }
      return { ok: true, name: clean };
    },

    applyPaletteSave(name) {
      const clean = cleanSaveName(name);
      if (!clean) return { ok: false, error: "name must be a non-empty string" };
      const slot = readPaletteSlots().find((s) => s.name === clean);
      if (!slot) return { ok: false, error: `no saved palette named '${clean}'` };
      const next = cloneProject(get().project);
      let added = 0;
      for (const hex of slot.colors) {
        if (next.palette.includes(hex)) continue;
        if (next.palette.length >= MAX_PALETTE_COLORS) break;
        next.palette.push(hex);
        added++;
      }
      // Merge-only: existing indices never move, so artwork is untouched.
      if (added > 0) commit(next, undefined, "local", "Apply palette", { kind: "palette" });
      return { ok: true, added };
    },

    deletePaletteSave(name) {
      const clean = cleanSaveName(name);
      if (!clean) return false;
      const slots = readSaveSlots(PALETTE_SAVES_KEY);
      const next = slots.filter((slot) => slot.name !== clean);
      if (next.length === slots.length) return false;
      return writeSaveSlots(PALETTE_SAVES_KEY, next);
    },

    applyRoomProject(p) {
      const sanitized = sanitizeProject(p);
      if (!sanitized) return false;
      // The room snapshot is authoritative. Discard an unfinished local gesture
      // instead of notifying it while RoomClient is applying the remote state.
      cancelStroke();
      const previousProject = get().project;
      const project = sanitized;
      const active = project.sprites.find((sprite) => sprite.id === get().activeSpriteId) ?? project.sprites[0];
      set({
        project,
        past: [],
        future: [],
        activeSpriteId: active.id,
        activeFrameIndex: Math.min(get().activeFrameIndex, active.frames.length - 1),
        selectedTileId:
          get().selectedTileId && project.sprites.some((sprite) => sprite.id === get().selectedTileId && sprite.kind === "tile")
            ? get().selectedTileId
            : null,
      });
      scheduleSave();
      notifyProjectChange({ project, previousProject, source: "remote", label: "Room update" });
      return true;
    },

    dismissStorageRecovery() {
      clearStoredProjectRecovery();
      set({ storageRecovery: false });
    },

    resetProject(kind) {
      finishStroke();
      const p = kind === "starter" ? createStarterProject() : blankProject();
      commit(p, { activeSpriteId: p.sprites[0].id, activeFrameIndex: 0, selectedTileId: null });
    },

    exportProject() {
      return JSON.stringify(get().project, null, 2);
    },
  };
});

// initialize selection to first sprite on boot
(() => {
  const s = useStore.getState();
  if (!s.project.sprites.some((sp) => sp.id === s.activeSpriteId)) {
    useStore.setState({ activeSpriteId: s.project.sprites[0]?.id ?? "" });
  }
})();
