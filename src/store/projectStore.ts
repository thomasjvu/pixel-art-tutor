import { create } from "zustand";
import type { Frame, PixelChange, Project, Sprite, SpriteKind } from "../types";
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
import type { ProjectChange } from "../realtime/projectEvents";

export type TransformOp =
  | "flip_h"
  | "flip_v"
  | "rotate_90"
  | "shift"
  | "outline";

const MAX_PALETTE = 64;
const HISTORY_LIMIT = 60;
const STORAGE_KEY = "pixel-art-tutor.project.v1";

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

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

function loadStored(): Project | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return sanitizeProject(JSON.parse(raw));
  } catch {
    return null;
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

export interface ResolveTarget {
  sprite: Sprite;
  frameIndex: number;
}

interface ProjectState {
  project: Project;
  activeSpriteId: string;
  activeFrameIndex: number;
  selectedTileId: string | null;
  past: Project[];
  future: Project[];

  activeSprite(): Sprite;
  resolveTarget(spriteId?: string, frameIndex?: number): ResolveTarget | { error: string };

  setColorAt(x: number, y: number, colorIdx: number): void;
  drawLine(from: [number, number], to: [number, number], colorIdx: number): void;
  applyPixelChanges(changes: PixelChange[], spriteId?: string, frameIndex?: number, allFrames?: boolean): { applied: number; addedColors: number[] };
  fillRegion(x: number, y: number, w: number, h: number, color: number | string | null, spriteId?: string, frameIndex?: number, allFrames?: boolean): number | { error: string };
  floodFillAt(x: number, y: number, colorIdx: number): void;
  clearFrame(spriteId?: string, frameIndex?: number): void;
  transform(op: TransformOp, opts: { dx?: number; dy?: number; color?: number | string | null; frameIndices?: number[]; spriteId?: string }): string | null;
  replaceColor(from: number | string | null, to: number | string | null, spriteId?: string): number | { error: string };

  beginStroke(): void;
  endStroke(label?: string): void;

  addPaletteColor(hex: string): { index: number } | { error: string };
  setActiveSprite(spriteId: string, frameIndex?: number): boolean;
  addSprite(opts: { name: string; width: number; height: number; kind: SpriteKind; copyFromId?: string }): string;
  deleteSprite(id: string): void;
  renameSprite(id: string, name: string): void;
  renameProject(name: string): void;
  importRasterSprite(opts: {
    name: string;
    width: number;
    height: number;
    frames: Array<Array<string | null>>;
    kind?: SpriteKind;
  }): string;
  addFrame(spriteId?: string, copyFrameIndex?: number): number;
  deleteFrame(frameIndex: number, spriteId?: string): boolean;
  selectFrame(index: number): void;

  ensureTilemap(cols: number, rows: number): void;
  placeTile(x: number, y: number, spriteId: string | null): boolean;
  fillTiles(x: number, y: number, w: number, h: number, spriteId: string | null): number;

  undo(): void;
  redo(): void;
  loadProject(p: unknown): { ok: true } | { ok: false; error: string };
  applyRoomProject(p: Project): boolean;
  resetProject(kind: "starter" | "blank"): void;
  exportProject(): string;
}

export const useStore = create<ProjectState>()((set, get) => {
  let strokeActive = false;
  let strokeBaseProject: Project | null = null;

  /** commit: push current project into history and install next */
  function commit(
    next: Project,
    extra?: Partial<ProjectState>,
    source: ProjectChange["source"] = "local",
    label = "Edit",
  ) {
    const { project, past } = get();
    if (strokeActive) {
      // history and the room event are finalized once at endStroke
      set({ project: next, ...extra });
      return;
    }
    set({
      project: next,
      past: [...past.slice(-HISTORY_LIMIT), project],
      future: [],
      ...extra,
    });
    scheduleSave();
    notifyProjectChange({ project: next, previousProject: project, source, label });
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(get().project));
      } catch {
        /* storage full or unavailable */
      }
    }, 400);
  }

  return {
    project: loadStored() ?? createStarterProject(),
    activeSpriteId: "",
    activeFrameIndex: 0,
    selectedTileId: null,
    past: [],
    future: [],

    beginStroke() {
      if (strokeActive) return;
      const { project, past } = get();
      strokeBaseProject = project;
      strokeActive = true;
      set({ past: [...past.slice(-HISTORY_LIMIT), project], future: [] });
    },

    endStroke(label = "Paint stroke") {
      if (!strokeActive) return;
      strokeActive = false;
      const previousProject = strokeBaseProject;
      strokeBaseProject = null;
      scheduleSave();
      if (previousProject) {
        notifyProjectChange({
          project: get().project,
          previousProject,
          source: "local",
          label,
        });
      }
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
      const next = cloneProject(get().project);
      const frame = next.sprites.find((s) => s.id === sprite.id)!.frames[frameIndex];
      frame.pixels[y * sprite.width + x] = colorIdx;
      commit(next);
    },

    drawLine(from, to, colorIdx) {
      const t = get().resolveTarget();
      if ("error" in t) return;
      const { sprite, frameIndex } = t;
      const next = cloneProject(get().project);
      const frame = next.sprites.find((s) => s.id === sprite.id)!.frames[frameIndex];
      for (const [x, y] of bresenhamLine(from[0], from[1], to[0], to[1])) {
        if (inBounds(x, y, sprite.width, sprite.height))
          frame.pixels[y * sprite.width + x] = colorIdx;
      }
      commit(next);
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
          frame.pixels[ch.y * target.width + ch.x] = colorIdx;
          applied++;
        }
      }
      if (applied > 0) commit(next);
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
      for (const idx of fis) {
        const frame = target.frames[idx];
        if (!frame) continue;
        for (let yy = r.y; yy < r.y + r.h; yy++)
          for (let xx = r.x; xx < r.x + r.w; xx++) {
            frame.pixels[yy * target.width + xx] = colorIdx;
            count++;
          }
      }
      if (count > 0) commit(next);
      return count;
    },

    floodFillAt(x, y, colorIdx) {
      const t = get().resolveTarget();
      if ("error" in t) return;
      const { sprite, frameIndex } = t;
      const next = cloneProject(get().project);
      const frame = next.sprites.find((s) => s.id === sprite.id)!.frames[frameIndex];
      frame.pixels = floodFill(frame.pixels, sprite.width, sprite.height, x, y, colorIdx);
      commit(next);
    },

    clearFrame(spriteId, frameIndex) {
      const t = get().resolveTarget(spriteId, frameIndex);
      if ("error" in t) return;
      const { sprite, frameIndex: fi } = t;
      const next = cloneProject(get().project);
      const target = next.sprites.find((s) => s.id === sprite.id)!;
      target.frames[fi].pixels = emptyPixels(target.width, target.height);
      commit(next);
    },

    transform(op, opts) {
      const t = get().resolveTarget(opts.spriteId);
      if ("error" in t) return t.error;
      const { sprite } = t;
      const next = cloneProject(get().project);
      const target = next.sprites.find((s) => s.id === sprite.id)!;
      const fis =
        opts.frameIndices && opts.frameIndices.length
          ? [...new Set(opts.frameIndices)].filter((i) => target.frames[i])
          : target.frames.map((_, i) => i);
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
      if (project.palette.length >= MAX_PALETTE)
        return { error: `palette is full (${MAX_PALETTE} colors max)` };
      const next = cloneProject(project);
      next.palette.push(normalized);
      commit(next);
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
      const next = cloneProject(get().project);
      const w = Math.max(1, Math.min(64, Math.round(opts.width)));
      const h = Math.max(1, Math.min(64, Math.round(opts.height)));
      let pixels = emptyPixels(w, h);
      let frameCount = opts.kind === "character" ? 2 : 1;
      if (opts.copyFromId) {
        const src = next.sprites.find((s) => s.id === opts.copyFromId);
        if (src && src.width === w && src.height === h) {
          pixels = [...src.frames[0].pixels];
          frameCount = src.frames.length;
        }
      }
      const id = uid("sprite");
      const sprite: Sprite = {
        id,
        name: opts.name || "Untitled",
        width: w,
        height: h,
        kind: opts.kind,
        frames: Array.from({ length: frameCount }, (_, i) => ({
          id: `${id}-f${i}`,
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
      if (!sp || !name.trim()) return;
      sp.name = name.trim();
      commit(next);
    },

    renameProject(name) {
      const trimmed = name.trim();
      if (!trimmed || trimmed === get().project.name) return;
      const next = cloneProject(get().project);
      next.name = trimmed;
      commit(next);
    },

    importRasterSprite(opts) {
      const next = cloneProject(get().project);
      const width = Math.max(1, Math.min(64, Math.round(opts.width)));
      const height = Math.max(1, Math.min(64, Math.round(opts.height)));
      const id = uid("sprite");
      const frames = opts.frames.slice(0, 32).map((source) => {
        const pixels = new Array<number>(width * height).fill(TRANSPARENT);
        for (let i = 0; i < pixels.length; i++) {
          const value = source[i];
          if (!value) continue;
          const hex = normalizeHex(value);
          if (!hex) continue;
          let paletteIndex = next.palette.indexOf(hex);
          if (paletteIndex < 0) {
            if (next.palette.length >= MAX_PALETTE) continue;
            paletteIndex = next.palette.length;
            next.palette.push(hex);
          }
          pixels[i] = paletteIndex;
        }
        return { id: uid("frame"), pixels };
      });
      const safeFrames = frames.length > 0 ? frames : [{ id: uid("frame"), pixels: emptyPixels(width, height) }];
      next.sprites.push({
        id,
        name: opts.name.trim() || "Imported sprite",
        width,
        height,
        kind: opts.kind ?? "item",
        frames: safeFrames,
      });
      commit(next, { activeSpriteId: id, activeFrameIndex: 0 });
      return id;
    },

    addFrame(spriteId, copyFrameIndex) {
      const t = get().resolveTarget(spriteId);
      if ("error" in t) return -1;
      const { sprite } = t;
      const next = cloneProject(get().project);
      const target = next.sprites.find((s) => s.id === sprite.id)!;
      const srcIdx = copyFrameIndex ?? target.frames.length - 1;
      const src = target.frames[Math.max(0, Math.min(srcIdx, target.frames.length - 1))];
      const id = uid("frame");
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
      const c = Math.max(2, Math.min(64, cols));
      const r = Math.max(2, Math.min(64, rows));
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
      if (spriteId !== null && !project.sprites.some((s) => s.id === spriteId)) return false;
      const next = cloneProject(project);
      next.tilemap!.cells[y * tm.cols + x] = spriteId;
      commit(next);
      return true;
    },

    fillTiles(x, y, w, h, spriteId) {
      const { project } = get();
      const tm = project.tilemap;
      if (!tm) return 0;
      if (spriteId !== null && !project.sprites.some((s) => s.id === spriteId)) return 0;
      const r = clampRect(x, y, w, h, tm.cols, tm.rows);
      if (!r) return 0;
      const next = cloneProject(project);
      let count = 0;
      for (let yy = r.y; yy < r.y + r.h; yy++)
        for (let xx = r.x; xx < r.x + r.w; xx++) {
          next.tilemap!.cells[yy * tm.cols + xx] = spriteId;
          count++;
        }
      if (count) commit(next);
      return count;
    },

    undo() {
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
      commit(sanitized, {
        activeSpriteId: sanitized.sprites[0].id,
        activeFrameIndex: 0,
        selectedTileId: null,
      });
      return { ok: true };
    },

    applyRoomProject(p) {
      const sanitized = sanitizeProject(p);
      if (!sanitized) return false;
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
          get().selectedTileId && project.sprites.some((sprite) => sprite.id === get().selectedTileId)
            ? get().selectedTileId
            : null,
      });
      scheduleSave();
      notifyProjectChange({ project, previousProject, source: "remote", label: "Room update" });
      return true;
    },

    resetProject(kind) {
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
