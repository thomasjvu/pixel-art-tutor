import { create } from "zustand";
import type { PixelPoint, PresenceStatus, RoomPresence } from "../realtime/protocol";

export interface ToolLogEntry {
  id: string;
  time: string;
  tool: string;
  summary: string;
  source: "agent" | "app";
}

export type McpStatus = "unsupported" | "registering" | "ready" | "error";

export type RoomConnectionStatus =
  | "idle"
  | "disabled"
  | "connecting"
  | "connected"
  | "offline"
  | "error";

export interface AgentPreviewPixel {
  x: number;
  y: number;
  color: string | null;
}

export interface AgentPresenceState {
  actionId: string;
  name: string;
  tool: string;
  status: PresenceStatus;
  spriteId: string | null;
  frameIndex: number;
  cursor: PixelPoint | null;
  progress: number;
  message: string;
  preview: AgentPreviewPixel[];
}

interface UiState {
  mcpStatus: McpStatus;
  mcpError: string | null;
  registeredTools: { name: string; description: string }[];
  log: ToolLogEntry[];
  agentPresence: AgentPresenceState | null;
  roomId: string | null;
  roomStatus: RoomConnectionStatus;
  roomError: string | null;
  roomPeers: Record<string, RoomPresence>;
  roomSeq: number;
  roomActorId: string;
  roomDisplayName: string;
  roomHost: string | null;
  roomCanUndo: boolean;
  roomCanRedo: boolean;
  roomSyncBlocked: boolean;
  setMcp(status: McpStatus, error?: string | null): void;
  setTools(tools: { name: string; description: string }[]): void;
  pushLog(entry: Omit<ToolLogEntry, "id" | "time">): void;
  beginAgentAction(action: AgentPresenceState): void;
  updateAgentAction(actionId: string, patch: Partial<Omit<AgentPresenceState, "actionId">>): void;
  finishAgentAction(actionId: string, message?: string): void;
  clearAgentAction(actionId?: string): void;
  setRoomConnection(patch: {
    roomId?: string | null;
    roomStatus?: RoomConnectionStatus;
    roomError?: string | null;
    roomSeq?: number;
    roomSyncBlocked?: boolean;
    roomActorId?: string;
    roomDisplayName?: string;
    roomHost?: string | null;
  }): void;
  setRoomPeers(peers: RoomPresence[]): void;
  setRoomHistory(canUndo: boolean, canRedo: boolean): void;
}

export const useUi = create<UiState>()((set) => ({
  mcpStatus: "registering",
  mcpError: null,
  registeredTools: [],
  log: [],
  agentPresence: null,
  roomId: null,
  roomStatus: "idle",
  roomError: null,
  roomPeers: {},
  roomSeq: 0,
  roomActorId: "",
  roomDisplayName: "",
  roomHost: null,
  roomCanUndo: false,
  roomCanRedo: false,
  roomSyncBlocked: false,
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
  beginAgentAction: (agentPresence) => set({ agentPresence }),
  updateAgentAction: (actionId, patch) =>
    set((state) =>
      state.agentPresence?.actionId === actionId
        ? { agentPresence: { ...state.agentPresence, ...patch } }
        : state,
    ),
  finishAgentAction: (actionId, message = "Finished") =>
    set((state) =>
      state.agentPresence?.actionId === actionId
        ? {
            agentPresence: {
              ...state.agentPresence,
              status: "done",
              progress: 1,
              message,
              preview: [],
            },
          }
        : state,
    ),
  clearAgentAction: (actionId) =>
    set((state) =>
      !actionId || state.agentPresence?.actionId === actionId ? { agentPresence: null } : state,
    ),
  setRoomConnection: (patch) => set(patch),
  setRoomPeers: (peers) =>
    set({ roomPeers: Object.fromEntries(peers.map((peer) => [peer.id, peer])) }),
  setRoomHistory: (roomCanUndo, roomCanRedo) => set({ roomCanUndo, roomCanRedo }),
}));
