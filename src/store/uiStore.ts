import { create } from "zustand";
import type { ActiveRoomListing, PixelPoint, PresenceStatus, RoomPresence } from "../realtime/protocol";
import { clampTutorialStep } from "../engine/tutorial";
import {
  DEFAULT_CODEX_PET,
  normalizeCodexPet,
  petByName,
  type CodexPet,
  type CodexPetSource,
  type PetDiscoveryStatus,
} from "../pets/codexPets";

const ACT_AS_AGENT_KEY = "pixel-art-tutor.act-as-agent.v1";
const CODEX_PET_KEY = "pixel-art-tutor.codex-pet.v1";
const THEME_KEY = "pixel-art-tutor.theme.v1";

export type StudioTheme = "dark" | "light";

function storedActAsAgent(): boolean {
  try {
    return localStorage.getItem(ACT_AS_AGENT_KEY) === "1";
  } catch {
    return false;
  }
}

function storedTheme(): StudioTheme {
  try {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function migrateStoredPet(pet: CodexPet | null): CodexPet | null {
  if (!pet) return null;
  // Earlier builds shipped placeholder companions with these ids. Prefer the
  // real bundled Codex art when an old localStorage selection is encountered.
  if (["codey", "sprout", "miso", "star"].includes(pet.id) && !pet.imageUrl) return DEFAULT_CODEX_PET;
  return pet;
}

function defaultPetSelection(): StoredPetSelection {
  const configured = import.meta.env.VITE_CODEX_PET?.trim();
  return configured
    ? { pet: petByName(configured), source: "codex" }
    : { pet: DEFAULT_CODEX_PET, source: "built-in" };
}

interface StoredPetSelection {
  pet: CodexPet | null;
  source: CodexPetSource;
}

function storedPetSelection(): StoredPetSelection {
  try {
    const raw = localStorage.getItem(CODEX_PET_KEY);
    if (!raw) return defaultPetSelection();
    if (raw === "none") return { pet: null, source: "none" };
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "pet" in parsed) {
      const saved = parsed as { pet?: unknown; source?: unknown };
      const pet = migrateStoredPet(normalizeCodexPet(saved.pet));
      if (pet) {
        const source: CodexPetSource = saved.source === "codex" ? "codex" : "built-in";
        return { pet, source };
      }
    }
    const pet = migrateStoredPet(normalizeCodexPet(parsed));
    return pet ? { pet, source: "built-in" } : defaultPetSelection();
  } catch {
    return defaultPetSelection();
  }
}

function savePetSelection(pet: CodexPet | null, source: CodexPetSource): void {
  try {
    if (!pet || source === "none") {
      localStorage.setItem(CODEX_PET_KEY, "none");
      return;
    }
    localStorage.setItem(CODEX_PET_KEY, JSON.stringify({ pet, source }));
  } catch {
    /* localStorage may be unavailable in a private or embedded browser */
  }
}

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

export type RoomDirectoryStatus = "idle" | "loading" | "ready" | "error" | "unavailable";

export interface AgentPreviewPixel {
  x: number;
  y: number;
  color: string | null;
}

export interface AgentActivityEntry {
  peerId: string;
  name: string;
  tool: string;
  message: string;
  status: PresenceStatus;
  progress: number;
  at: number;
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
  roomAgentLimit: number | null;
  activeRooms: ActiveRoomListing[];
  roomDirectoryStatus: RoomDirectoryStatus;
  roomDirectoryError: string | null;
  preferencesOpen: boolean;
  newProjectOpen: boolean;
  theme: StudioTheme;
  shareOpen: boolean;
  roomCanUndo: boolean;
  roomCanRedo: boolean;
  roomSyncBlocked: boolean;
  followAgent: boolean;
  setFollowAgent(follow: boolean): void;
  tutorialOpen: boolean;
  tutorialStep: number;
  openTutorial(step?: number): void;
  closeTutorial(): void;
  setTutorialStep(step: number): void;
  agentActivity: AgentActivityEntry[];
  noteAgentActivity(peers: RoomPresence[]): void;
  selectedPet: CodexPet | null;
  petSource: CodexPetSource;
  petDiscovery: PetDiscoveryStatus;
  setSelectedPet(pet: CodexPet | null, source?: CodexPetSource): void;
  adoptCodexPet(pet: CodexPet): void;
  setPetDiscovery(status: PetDiscoveryStatus): void;
  /** When true this window presents as kind "agent" even while idle. */
  actAsAgent: boolean;
  setActAsAgent(act: boolean): void;
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
    roomAgentLimit?: number | null;
  }): void;
  setRoomPeers(peers: RoomPresence[]): void;
  setActiveRooms(
    activeRooms: ActiveRoomListing[],
    status?: RoomDirectoryStatus,
    error?: string | null,
  ): void;
  setPreferencesOpen(open: boolean): void;
  setNewProjectOpen(open: boolean): void;
  setTheme(theme: StudioTheme): void;
  setShareOpen(open: boolean): void;
  setRoomHistory(canUndo: boolean, canRedo: boolean): void;
}

function mergeAgentPreview(previous: RoomPresence | undefined, next: RoomPresence): RoomPresence {
  if (
    !previous ||
    previous.kind !== "agent" ||
    next.kind !== "agent" ||
    previous.status === "idle" ||
    previous.status === "done" ||
    next.status === "idle" ||
    next.status === "done" ||
    previous.tool !== next.tool ||
    previous.message !== next.message ||
    previous.spriteId !== next.spriteId ||
    previous.frameIndex !== next.frameIndex ||
    previous.progress <= 0 ||
    next.progress <= 0 ||
    next.progress < previous.progress ||
    previous.preview.length === 0 ||
    next.preview.length === 0
  ) {
    return next;
  }

  // The worker bounds each presence packet to its most recent 300 cells. Keep
  // a bounded packet history in the UI so a long action still reads as one
  // continuous stroke instead of a moving 300-cell window.
  const cells = new Map<string, AgentPreviewPixel>();
  for (const cell of previous.preview) cells.set(`${cell.x},${cell.y}`, cell);
  for (const cell of next.preview) cells.set(`${cell.x},${cell.y}`, cell);
  return { ...next, preview: [...cells.values()] };
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
  roomAgentLimit: null,
  activeRooms: [],
  roomDirectoryStatus: "idle",
  roomDirectoryError: null,
  preferencesOpen: false,
  newProjectOpen: false,
  theme: storedTheme(),
  shareOpen: false,
  roomCanUndo: false,
  roomCanRedo: false,
  roomSyncBlocked: false,
  followAgent: true,
  setFollowAgent: (followAgent) => set({ followAgent }),
  tutorialOpen: false,
  tutorialStep: 0,
  openTutorial: (step = 0) => set({ tutorialOpen: true, tutorialStep: clampTutorialStep(step) }),
  closeTutorial: () => set({ tutorialOpen: false }),
  setTutorialStep: (tutorialStep) => set({ tutorialStep: clampTutorialStep(tutorialStep), tutorialOpen: true }),
  agentActivity: [],
  noteAgentActivity: (peers) =>
    set((state) => {
      const now = Date.now();
      const next = [...state.agentActivity];
      for (const peer of peers) {
        const key = `${peer.id} ${peer.tool} ${peer.message}`;
        const existing = next.findIndex(
          (entry) => `${entry.peerId} ${entry.tool} ${entry.message}` === key,
        );
        const entry: AgentActivityEntry = {
          peerId: peer.id,
          name: peer.name,
          tool: peer.tool,
          message: peer.message,
          status: peer.status,
          progress: peer.progress,
          at: now,
        };
        if (existing >= 0) next[existing] = entry;
        else next.unshift(entry);
      }
      return { agentActivity: next.slice(0, 10) };
    }),
  ...(() => {
    const selection = storedPetSelection();
    return {
      selectedPet: selection.pet,
      petSource: selection.source,
      petDiscovery: selection.source === "codex" ? "detected" as PetDiscoveryStatus : "searching" as PetDiscoveryStatus,
    };
  })(),
  setSelectedPet: (selectedPet, source = selectedPet ? "built-in" : "none") => {
    const petSource: CodexPetSource = selectedPet ? source : "none";
    savePetSelection(selectedPet, petSource);
    set({
      selectedPet,
      petSource,
      petDiscovery: petSource === "none" ? "none" : petSource === "codex" ? "detected" : "fallback",
    });
  },
  adoptCodexPet: (selectedPet) => {
    savePetSelection(selectedPet, "codex");
    set({ selectedPet, petSource: "codex", petDiscovery: "detected" });
  },
  setPetDiscovery: (petDiscovery) => set({ petDiscovery }),
  actAsAgent: storedActAsAgent(),
  setActAsAgent: (actAsAgent) => {
    try {
      localStorage.setItem(ACT_AS_AGENT_KEY, actAsAgent ? "1" : "0");
    } catch {
      /* localStorage may be unavailable in a private or embedded browser */
    }
    set({ actAsAgent });
  },
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
    set((state) => ({
      roomPeers: Object.fromEntries(
        peers.map((peer) => [peer.id, mergeAgentPreview(state.roomPeers[peer.id], peer)]),
      ),
    })),
  setActiveRooms: (activeRooms, roomDirectoryStatus = "ready", roomDirectoryError = null) =>
    set({ activeRooms, roomDirectoryStatus, roomDirectoryError }),
  setPreferencesOpen: (preferencesOpen) => set({ preferencesOpen }),
  setNewProjectOpen: (newProjectOpen) => set({ newProjectOpen }),
  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* localStorage may be unavailable in a private or embedded browser */
    }
    set({ theme });
  },
  setShareOpen: (shareOpen) => set({ shareOpen }),
  setRoomHistory: (roomCanUndo, roomCanRedo) => set({ roomCanUndo, roomCanRedo }),
}));
