import { create } from "zustand";

export interface ToolLogEntry {
  id: string;
  time: string;
  tool: string;
  summary: string;
  source: "agent" | "app";
}

export type McpStatus = "unsupported" | "registering" | "ready" | "error";

interface UiState {
  mcpStatus: McpStatus;
  mcpError: string | null;
  registeredTools: { name: string; description: string }[];
  log: ToolLogEntry[];
  setMcp(status: McpStatus, error?: string | null): void;
  setTools(tools: { name: string; description: string }[]): void;
  pushLog(entry: Omit<ToolLogEntry, "id" | "time">): void;
}

export const useUi = create<UiState>()((set) => ({
  mcpStatus: "registering",
  mcpError: null,
  registeredTools: [],
  log: [],
  setMcp: (status, error = null) => set({ mcpStatus: status, mcpError: error }),
  setTools: (tools) => set({ registeredTools: tools }),
  pushLog: (entry) =>
    set((s) => ({
      log: [
        {
          ...entry,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          time: new Date().toLocaleTimeString([], { hour12: false }),
        },
        ...s.log,
      ].slice(0, 100),
    })),
}));
