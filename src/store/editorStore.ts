import { create } from "zustand";

export type ToolName = "pencil" | "eraser" | "fill" | "picker";

interface EditorState {
  tool: ToolName;
  colorIdx: number;
  zoom: number;
  onion: boolean;
  showGrid: boolean;
  fps: number;
  playing: boolean;
  hover: { x: number; y: number } | null;
  setTool(t: ToolName): void;
  setColor(i: number): void;
  setZoom(z: number): void;
  toggleOnion(): void;
  setShowGrid(show: boolean): void;
  setFps(fps: number): void;
  setPlaying(p: boolean): void;
  setHover(h: { x: number; y: number } | null): void;
}

export const useEditor = create<EditorState>()((set) => ({
  tool: "pencil",
  colorIdx: 6,
  zoom: 26,
  onion: true,
  showGrid: true,
  fps: 8,
  playing: false,
  hover: null,
  setTool: (tool) => set({ tool }),
  setColor: (colorIdx) => set({ colorIdx }),
  setZoom: (z) => set({ zoom: Math.max(4, Math.min(48, z)) }),
  toggleOnion: () => set((s) => ({ onion: !s.onion })),
  setShowGrid: (showGrid) => set({ showGrid }),
  setFps: (fps) => set({ fps: Math.max(1, Math.min(30, Math.round(fps))) }),
  setPlaying: (playing) => set({ playing }),
  setHover: (hover) => set({ hover }),
}));
