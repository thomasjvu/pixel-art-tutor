import { create } from "zustand";
import type { PlaybackMode } from "../types";

export type ToolName = "pencil" | "eraser" | "fill" | "picker" | "select";
export type BrushMode = "solid" | "checker" | "dots";

/** A 256×256 logical canvas renders at one CSS pixel per cell by default. */
export const DEFAULT_CANVAS_ZOOM = 1;
export const DEFAULT_TIMELINE_HEIGHT = 330;
export const MIN_TIMELINE_HEIGHT = 112;
export const MAX_TIMELINE_HEIGHT = 560;

const TIMELINE_SETTINGS_KEY = "pixel-art-tutor.timeline-settings.v1";

interface TimelineSettings {
  open: boolean;
  height: number;
}

function clampTimelineHeight(value: number): number {
  return Math.max(MIN_TIMELINE_HEIGHT, Math.min(MAX_TIMELINE_HEIGHT, Math.round(value)));
}

function readTimelineSettings(): TimelineSettings {
  if (typeof window === "undefined") return { open: true, height: DEFAULT_TIMELINE_HEIGHT };
  try {
    const raw = window.localStorage.getItem(TIMELINE_SETTINGS_KEY);
    if (!raw) return { open: true, height: DEFAULT_TIMELINE_HEIGHT };
    const saved = JSON.parse(raw) as Partial<TimelineSettings>;
    return {
      open: saved.open !== false,
      height: typeof saved.height === "number" ? clampTimelineHeight(saved.height) : DEFAULT_TIMELINE_HEIGHT,
    };
  } catch {
    return { open: true, height: DEFAULT_TIMELINE_HEIGHT };
  }
}

function saveTimelineSettings(settings: TimelineSettings): void {
  try {
    window.localStorage.setItem(TIMELINE_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* localStorage may be unavailable in a private or embedded browser */
  }
}

export interface SelectionRect {
  spriteId: string;
  layerId?: string;
  frameIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface EditorState {
  tool: ToolName;
  colorIdx: number;
  zoom: number;
  layerLocked: boolean;
  layerVisible: boolean;
  activeLayerId: string | null;
  onion: boolean;
  onionMode: "tint" | "red_blue";
  showGrid: boolean;
  fps: number;
  playing: boolean;
  playbackMode: PlaybackMode;
  playbackTagId: string | null;
  pixelPerfect: boolean;
  shadingMode: boolean;
  tiledMode: boolean;
  brushMode: BrushMode;
  hover: { x: number; y: number } | null;
  selection: SelectionRect | null;
  toolbarOpen: boolean;
  sidebarOpen: boolean;
  timelineOpen: boolean;
  timelineHeight: number;
  setTool(t: ToolName): void;
  setColor(i: number): void;
  setZoom(z: number): void;
  setLayerLocked(locked: boolean): void;
  setLayerVisible(visible: boolean): void;
  setActiveLayerId(id: string | null): void;
  toggleOnion(): void;
  setOnionMode(mode: "tint" | "red_blue"): void;
  setShowGrid(show: boolean): void;
  setFps(fps: number): void;
  setPlaying(p: boolean): void;
  setPlaybackMode(mode: PlaybackMode): void;
  setPlaybackTagId(id: string | null): void;
  setPixelPerfect(enabled: boolean): void;
  setShadingMode(enabled: boolean): void;
  setTiledMode(enabled: boolean): void;
  setBrushMode(mode: BrushMode): void;
  setHover(h: { x: number; y: number } | null): void;
  setSelection(s: SelectionRect | null): void;
  setToolbarOpen(open: boolean): void;
  setSidebarOpen(open: boolean): void;
  setTimelineOpen(open: boolean): void;
  setTimelineHeight(height: number): void;
}

const timelineSettings = readTimelineSettings();

export const useEditor = create<EditorState>()((set) => ({
  tool: "pencil",
  colorIdx: 6,
  zoom: DEFAULT_CANVAS_ZOOM,
  layerLocked: false,
  layerVisible: true,
  activeLayerId: null,
  onion: false,
  onionMode: "tint",
  showGrid: false,
  fps: 8,
  playing: false,
  playbackMode: "forward",
  playbackTagId: null,
  pixelPerfect: true,
  shadingMode: false,
  tiledMode: false,
  brushMode: "solid",
  hover: null,
  selection: null,
  toolbarOpen: true,
  sidebarOpen: true,
  timelineOpen: timelineSettings.open,
  timelineHeight: timelineSettings.height,
  setTool: (tool) => set({ tool }),
  setColor: (colorIdx) => set({ colorIdx }),
  setZoom: (z) => set({ zoom: Math.max(1, Math.min(48, Math.round(z))) }),
  setLayerLocked: (layerLocked) => set({ layerLocked }),
  setLayerVisible: (layerVisible) => set({ layerVisible }),
  setActiveLayerId: (activeLayerId) => set({ activeLayerId }),
  toggleOnion: () => set((s) => ({ onion: !s.onion })),
  setOnionMode: (onionMode) => set({ onionMode }),
  setShowGrid: (showGrid) => set({ showGrid }),
  setFps: (fps) => set({ fps: Math.max(1, Math.min(30, Math.round(fps))) }),
  setPlaying: (playing) => set({ playing }),
  setPlaybackMode: (playbackMode) => set({ playbackMode }),
  setPlaybackTagId: (playbackTagId) => set({ playbackTagId }),
  setPixelPerfect: (pixelPerfect) => set({ pixelPerfect }),
  setShadingMode: (shadingMode) => set({ shadingMode }),
  setTiledMode: (tiledMode) => set({ tiledMode }),
  setBrushMode: (brushMode) => set({ brushMode }),
  setHover: (hover) => set({ hover }),
  setSelection: (selection) => set({ selection }),
  setToolbarOpen: (toolbarOpen) => set({ toolbarOpen }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setTimelineOpen: (timelineOpen) =>
    set((state) => {
      saveTimelineSettings({ open: timelineOpen, height: state.timelineHeight });
      return { timelineOpen };
    }),
  setTimelineHeight: (height) =>
    set((state) => {
      const timelineHeight = clampTimelineHeight(height);
      saveTimelineSettings({ open: state.timelineOpen, height: timelineHeight });
      return { timelineHeight };
    }),
}));
