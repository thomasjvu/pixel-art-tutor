import { create } from "zustand";
import type { PlaybackMode } from "../types";

export type ToolName = "pencil" | "eraser" | "fill" | "picker" | "select";
export type BrushMode = "solid" | "checker" | "dots";

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
}

export const useEditor = create<EditorState>()((set) => ({
  tool: "pencil",
  colorIdx: 6,
  zoom: 6,
  layerLocked: false,
  layerVisible: true,
  activeLayerId: null,
  onion: true,
  onionMode: "tint",
  showGrid: true,
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
}));
