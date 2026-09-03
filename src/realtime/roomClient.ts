import { PartySocket } from "partysocket";
import {
  applyRoomPatch,
  cloneProject,
  isActiveRoomListing,
  isProject,
  mergeProjectChanges,
  parseRoomMessage,
  projectChangeToRoomPatch,
  ROOM_PROTOCOL_VERSION,
  type ActorKind,
  type ActiveRoomListing,
  type RoomClientMessage,
  type RoomErrorMessage,
  type RoomOperationSummary,
  type RoomPatch,
  type RoomPresence,
  type RoomServerMessage,
} from "./protocol";
import { subscribeProjectChanges, useStore } from "../store/projectStore";
import { useUi, type RoomConnectionStatus } from "../store/uiStore";
import { mergeProjectChangeHints, type ProjectChange } from "./projectEvents";
import { MAX_PROJECT_JSON_LENGTH } from "../projectLimits";

const ROOM_QUERY_KEY = "room";
const CLIENT_ID_KEY = "pixel-art-tutor.client-id.v1";
const DISPLAY_NAME_KEY = "pixel-art-tutor.display-name.v1";
const ROOM_COLORS = ["#e95d55", "#4daa91", "#668fd4", "#d99c3f", "#9a74c9"];

function randomId(prefix: string): string {
  const uuid = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : null;
  if (uuid) return `${prefix}-${uuid}`;
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return `${prefix}-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function randomRoomId(): string {
  const uuid = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : null;
  if (uuid) return `tiny-${uuid.replaceAll("-", "")}`;
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return `tiny-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  return `tiny-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function storageValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function saveStorageValue(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* localStorage may be unavailable in a private or embedded browser */
  }
}

function clientId(): string {
  const existing = storageValue(CLIENT_ID_KEY);
  if (existing) return existing;
  const id = randomId("human");
  saveStorageValue(CLIENT_ID_KEY, id);
  return id;
}

function displayName(): string {
  return storageValue(DISPLAY_NAME_KEY) || "You";
}

function roomFromUrl(): string | null {
  const room = new URLSearchParams(window.location.search).get(ROOM_QUERY_KEY);
  return sanitizeRoomId(room);
}

function sanitizeRoomId(room: string | null | undefined): string | null {
  const value = room?.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-") ?? "";
  return value ? value.slice(0, 48) : null;
}

function projectChanged(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) !== JSON.stringify(b);
  } catch {
    return true;
  }
}

function configuredHost(): string | null {
  const envHost = import.meta.env.VITE_PARTY_HOST?.trim();
  if (envHost) return envHost;
  return import.meta.env.PROD ? window.location.host : null;
}

function roomDirectoryUrl(host: string): string {
  const base = /^https?:\/\//i.test(host) ? host : `${window.location.protocol}//${host}`;
  return new URL("/api/rooms", base).toString();
}

function parseActiveRooms(value: unknown): ActiveRoomListing[] {
  if (!value || typeof value !== "object") return [];
  const rooms = (value as { rooms?: unknown }).rooms;
  return Array.isArray(rooms) ? rooms.filter(isActiveRoomListing) : [];
}

function presenceFor(
  id: string,
  name: string,
  color: string,
  kind: ActorKind = "human",
): RoomPresence {
  return {
    id,
    name,
    kind,
    color,
    status: "idle",
    tool: "pencil",
    spriteId: null,
    frameIndex: 0,
    cursor: null,
    progress: 0,
    message: "Browsing the studio",
    tutorialStep: null,
    preview: [],
    updatedAt: Date.now(),
  };
}

interface InFlightOperation {
  operationId: string;
  change: ProjectChange;
  patch: RoomPatch | null;
}

type SendResult = "sent" | "unavailable" | "too_large" | "failed";

export class RoomClient {
  private socket: PartySocket | null = null;
  private unsubscribeProjects: (() => void) | null = null;
  private presenceTimer: number | null = null;
  private pendingPresence: RoomPresence | null = null;
  private started = false;
  private intentionalClose = false;
  private ready = false;
  private activeRoomId: string | null = null;
  private lastSeq = 0;
  private pendingChange: ProjectChange | null = null;
  private inFlightOperation: InFlightOperation | null = null;
  private resyncRequired = false;
  private snapshotRequestOutstanding = false;
  private roomDirectoryAbort: AbortController | null = null;
  private lastLocalOperationId: string | null = null;
  private lastUndoOperationId: string | null = null;
  private readonly id = clientId();
  private readonly color = ROOM_COLORS[Math.floor(Math.random() * ROOM_COLORS.length)]!;
  private name = displayName();
  private presence = presenceFor(this.id, this.name, this.color);

  get actorId(): string {
    return this.id;
  }

  get displayName(): string {
    return this.name;
  }

  get roomId(): string | null {
    return this.activeRoomId ?? roomFromUrl();
  }

  get host(): string | null {
    return configuredHost();
  }

  get isConnected(): boolean {
    return !useUi.getState().roomSyncBlocked && this.ready && this.socket?.readyState === 1;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.unsubscribeProjects = subscribeProjectChanges((change) => this.onProjectChange(change));
    useUi.getState().setRoomConnection({
      roomActorId: this.id,
      roomDisplayName: this.name,
      roomHost: configuredHost(),
    });
    const room = roomFromUrl();
    if (room) this.connect(room);
  }

  stop(): void {
    this.started = false;
    this.unsubscribeProjects?.();
    this.unsubscribeProjects = null;
    this.closeSocket();
    if (this.presenceTimer !== null) window.clearTimeout(this.presenceTimer);
    this.presenceTimer = null;
    this.pendingPresence = null;
    this.pendingChange = null;
    this.inFlightOperation = null;
    this.resyncRequired = false;
    this.snapshotRequestOutstanding = false;
    this.roomDirectoryAbort?.abort();
    this.roomDirectoryAbort = null;
    useUi.getState().setRoomPeers([]);
    useUi.getState().setRoomHistory(false, false);
    useUi.getState().setRoomConnection({
      roomStatus: "idle",
      roomId: null,
      roomError: null,
      roomSeq: 0,
      roomSyncBlocked: false,
    });
  }

  joinRoom(room: string | null): void {
    const next = sanitizeRoomId(room);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set(ROOM_QUERY_KEY, next);
    else url.searchParams.delete(ROOM_QUERY_KEY);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);

    if (!next) {
      this.activeRoomId = null;
      this.pendingChange = null;
      this.inFlightOperation = null;
      this.resyncRequired = false;
      this.snapshotRequestOutstanding = false;
      this.closeSocket();
      useUi.getState().setRoomPeers([]);
      useUi.getState().setRoomHistory(false, false);
      useUi.getState().setRoomConnection({
        roomId: null,
        roomStatus: "idle",
        roomError: null,
        roomSeq: 0,
        roomSyncBlocked: false,
      });
      return;
    }
    this.connect(next);
  }

  createRoom(): string {
    const room = randomRoomId();
    this.joinRoom(room);
    return room;
  }

  async refreshRooms(): Promise<void> {
    const host = configuredHost();
    this.roomDirectoryAbort?.abort();
    if (!host) {
      useUi.getState().setActiveRooms([], "unavailable", "Set VITE_PARTY_HOST to browse active rooms.");
      return;
    }
    const controller = new AbortController();
    this.roomDirectoryAbort = controller;
    const currentRooms = useUi.getState().activeRooms;
    useUi.getState().setActiveRooms(currentRooms, "loading", null);
    try {
      const response = await fetch(roomDirectoryUrl(host), {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Room directory returned HTTP ${response.status}.`);
      const rooms = parseActiveRooms(await response.json());
      if (!controller.signal.aborted) useUi.getState().setActiveRooms(rooms, "ready", null);
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : "Could not load active rooms.";
      useUi.getState().setActiveRooms(useUi.getState().activeRooms, "error", message);
    } finally {
      if (this.roomDirectoryAbort === controller) this.roomDirectoryAbort = null;
    }
  }

  cancelRoomDirectoryRefresh(): void {
    this.roomDirectoryAbort?.abort();
    this.roomDirectoryAbort = null;
  }

  shareUrl(): string {
    const url = new URL(window.location.href);
    if (this.roomId) url.searchParams.set(ROOM_QUERY_KEY, this.roomId);
    return url.toString();
  }

  setDisplayName(next: string): void {
    const value = next.trim().slice(0, 32) || "You";
    this.name = value;
    saveStorageValue(DISPLAY_NAME_KEY, value);
    this.updatePresence({ name: value, kind: "human", message: "Browsing the studio" });
    useUi.getState().setRoomConnection({ roomDisplayName: value });
  }

  updatePresence(patch: Partial<Omit<RoomPresence, "id" | "updatedAt">>): void {
    this.presence = { ...this.presence, ...patch, id: this.id, updatedAt: Date.now() };
    if (!this.isConnected) return;
    this.pendingPresence = this.presence;
    if (this.presenceTimer !== null) return;
    this.presenceTimer = window.setTimeout(() => {
      this.presenceTimer = null;
      const next = this.pendingPresence;
      this.pendingPresence = null;
      if (next) this.send({ type: "presence", protocol: ROOM_PROTOCOL_VERSION, presence: next });
    }, 45);
  }

  requestUndo(): void {
    if (!this.isConnected || !this.lastLocalOperationId) {
      useUi.getState().setRoomConnection({ roomError: "Only your latest room edit can be undone." });
      return;
    }
    if (this.inFlightOperation) {
      this.setRoomError("Your latest room edit is still syncing. Try undo again in a moment.");
      return;
    }
    const sent = this.send({
      type: "undo",
      protocol: ROOM_PROTOCOL_VERSION,
      operationId: this.lastLocalOperationId,
    });
    if (sent !== "sent") this.setRoomError("Could not send the undo request. It will be available after reconnecting.");
  }

  requestRedo(): void {
    if (!this.isConnected || !this.lastUndoOperationId) {
      useUi.getState().setRoomConnection({ roomError: "There is no shared edit ready to redo." });
      return;
    }
    if (this.inFlightOperation) {
      this.setRoomError("Your latest room edit is still syncing. Try redo again in a moment.");
      return;
    }
    const sent = this.send({
      type: "redo",
      protocol: ROOM_PROTOCOL_VERSION,
      operationId: this.lastUndoOperationId,
    });
    if (sent !== "sent") this.setRoomError("Could not send the redo request. It will be available after reconnecting.");
  }

  private connect(room: string): void {
    this.activeRoomId = room;
    this.closeSocket();
    this.ready = false;
    this.lastSeq = 0;
    this.lastLocalOperationId = null;
    this.lastUndoOperationId = null;
    this.pendingChange = null;
    this.inFlightOperation = null;
    this.resyncRequired = false;
    this.snapshotRequestOutstanding = false;

    const host = configuredHost();
    useUi.getState().setRoomConnection({
      roomId: room,
      roomHost: host,
      roomError: host ? null : "Set VITE_PARTY_HOST to enable shared rooms.",
      roomStatus: host ? "connecting" : "disabled",
      roomSeq: 0,
      roomSyncBlocked: false,
    });
    if (!host) return;

    this.intentionalClose = false;
    try {
      const socket = new PartySocket({
        host,
        party: "pixel-room",
        room,
        id: this.id,
        query: {
          clientId: this.id,
          name: this.name,
          color: this.color,
        },
      });
      this.socket = socket;
      socket.addEventListener("open", () => {
        if (this.socket === socket) this.onOpen();
      });
      socket.addEventListener("message", (event) => {
        if (this.socket === socket) this.onMessage(event as MessageEvent<string>);
      });
      socket.addEventListener("close", () => {
        if (this.socket === socket) this.onClose();
      });
      socket.addEventListener("error", () => {
        if (this.socket === socket) this.onError();
      });
    } catch (error) {
      this.setRoomError(error instanceof Error ? error.message : "Could not open the room.");
    }
  }

  private closeSocket(): void {
    if (!this.socket) return;
    this.intentionalClose = true;
    this.socket.close(1000, "Leaving room");
    this.socket = null;
    this.ready = false;
  }

  private onOpen(): void {
    this.ready = false;
    this.snapshotRequestOutstanding = false;
    useUi.getState().setRoomConnection({ roomStatus: "connecting", roomError: null });
    const sent = this.send({
      type: "hello",
      protocol: ROOM_PROTOCOL_VERSION,
      clientId: this.id,
      name: this.name,
      kind: "human",
      color: this.color,
      project: cloneProject(useStore.getState().project),
    });
    if (sent === "too_large") {
      this.blockRoomSync("This project is too large to join a room. Download a local backup before continuing.");
    }
  }

  private onClose(): void {
    if (this.intentionalClose) return;
    this.ready = false;
    useUi.getState().setRoomConnection({ roomStatus: "offline" });
  }

  private onError(): void {
    if (!this.intentionalClose) useUi.getState().setRoomConnection({ roomStatus: "offline" });
  }

  private onMessage(event: MessageEvent<string>): void {
    let raw: unknown;
    try {
      raw = JSON.parse(event.data);
    } catch {
      return;
    }
    const message = parseRoomMessage(raw);
    if (!message) return;
    switch (message.type) {
      case "welcome":
        this.onWelcome(message);
        break;
      case "presence":
        this.onPresence(message.presence);
        break;
      case "presence_state":
        this.onPresenceState(message.peers);
        break;
      case "operation":
        this.onOperation(message);
        break;
      case "room_error":
        this.onRoomError(message);
        break;
    }
  }

  private onWelcome(message: Extract<RoomServerMessage, { type: "welcome" }>): void {
    if (!message.project || !isProject(message.project)) return;
    this.ready = true;
    this.lastSeq = message.seq;
    this.resyncRequired = false;
    this.snapshotRequestOutstanding = false;
    useUi.getState().setRoomConnection({
      roomId: message.roomId,
      roomStatus: "connected",
      roomError: null,
      roomSeq: message.seq,
      roomSyncBlocked: false,
    });
    this.onPresenceState(message.peers);

    const inFlight = this.inFlightOperation;
    if (inFlight) {
      const acknowledged =
        message.latestOperation?.operationId === inFlight.operationId ||
        !projectChanged(message.project, inFlight.change.project);
      if (acknowledged) {
        this.inFlightOperation = null;
        if (this.pendingChange) {
          if (projectChanged(message.project, this.pendingChange.project)) {
            this.pendingChange = this.rebaseChange(message.project, this.pendingChange);
          } else {
            this.pendingChange = null;
          }
        }
        useStore.getState().applyRoomProject(this.restoreOptimisticEdits(message.project));
        this.updateHistoryFromLatest(message.latestOperation);
      } else {
        this.inFlightOperation = {
          ...inFlight,
          change: this.rebaseChange(message.project, inFlight.change),
        };
        if (this.pendingChange) {
          this.pendingChange = this.rebaseChange(
            this.inFlightOperation.change.project,
            this.pendingChange,
          );
        }
        useStore.getState().applyRoomProject(this.restoreOptimisticEdits(message.project));
        // Keep the optimistic local edit visible while retrying the exact
        // operation ID. The server deduplicates a message it already accepted.
        this.sendOperation(this.inFlightOperation);
      }
    } else if (this.pendingChange) {
      if (projectChanged(message.project, this.pendingChange.project)) {
        this.pendingChange = this.rebaseChange(message.project, this.pendingChange);
        useStore.getState().applyRoomProject(this.restoreOptimisticEdits(message.project));
      } else {
        this.pendingChange = null;
        useStore.getState().applyRoomProject(message.project);
        this.updateHistoryFromLatest(message.latestOperation);
      }
    } else {
      useStore.getState().applyRoomProject(message.project);
      this.updateHistoryFromLatest(message.latestOperation);
    }
    this.updatePresence(this.presence);
    this.flushProjectOutbox();
  }

  private onPresence(presence: RoomPresence): void {
    if (presence.id === this.id) return;
    useUi.getState().setRoomPeers([...Object.values(useUi.getState().roomPeers).filter((peer) => peer.id !== presence.id), presence]);
  }

  private onPresenceState(peers: RoomPresence[]): void {
    useUi.getState().setRoomPeers(peers.filter((peer) => peer.id !== this.id));
  }

  private rebaseChange(base: ProjectChange["project"], change: ProjectChange): ProjectChange {
    const rebased = this.applyChangeToProject(base, change) ?? mergeProjectChanges(
      base,
      change.previousProject,
      change.project,
    );
    return {
      ...change,
      previousProject: cloneProject(base),
      project: cloneProject(rebased),
    };
  }

  private applyChangeToProject(base: ProjectChange["project"], change: ProjectChange): ProjectChange["project"] | null {
    const patch = projectChangeToRoomPatch(change.previousProject, change.project, change.hint);
    if (patch) return applyRoomPatch(base, patch);
    const merged = mergeProjectChanges(base, change.previousProject, change.project);
    return isProject(merged) ? merged : null;
  }

  private restoreOptimisticEdits(base: ProjectChange["project"]): ProjectChange["project"] {
    let next = base;
    if (this.inFlightOperation) {
      next = this.applyChangeToProject(next, this.inFlightOperation.change) ?? next;
    }
    if (this.pendingChange) {
      next = this.applyChangeToProject(next, this.pendingChange) ?? next;
    }
    return next;
  }

  private requestSnapshot(): void {
    if (this.snapshotRequestOutstanding) return;
    if (!this.isConnected) {
      this.reconnectForResync();
      return;
    }
    this.snapshotRequestOutstanding = true;
    const result = this.send({
      type: "snapshot_request",
      protocol: ROOM_PROTOCOL_VERSION,
      lastSeq: this.lastSeq,
    });
    if (result !== "sent") {
      this.snapshotRequestOutstanding = false;
      this.reconnectForResync();
    }
  }

  private reconnectForResync(): void {
    const socket = this.socket;
    if (!socket || this.intentionalClose) return;
    try {
      socket.reconnect(1012, "Room resync");
    } catch {
      socket.close(1012, "Room resync");
    }
  }

  private onOperation(message: Extract<RoomServerMessage, { type: "operation" }>): void {
    if (this.resyncRequired || useUi.getState().roomSyncBlocked) return;
    if (message.seq <= this.lastSeq) return;
    const currentProject = useStore.getState().project;
    const operationProject =
      message.mode === "patch"
        ? applyRoomPatch(currentProject, message.patch)
        : isProject(message.project)
          ? message.project
          : null;
    if (!operationProject) {
      this.resyncRequired = true;
      this.setRoomError("A room edit could not be applied. Requesting a fresh room snapshot.");
      this.requestSnapshot();
      return;
    }
    this.lastSeq = message.seq;
    useUi.getState().setRoomConnection({ roomSeq: message.seq, roomError: null });
    const acknowledged = this.inFlightOperation?.operationId === message.operationId;
    let nextProject = operationProject;
    if (message.actorId === this.id && acknowledged && this.pendingChange) {
      nextProject = this.applyChangeToProject(nextProject, this.pendingChange) ?? nextProject;
    } else if (message.actorId !== this.id && (this.inFlightOperation || this.pendingChange)) {
      nextProject = this.restoreOptimisticEdits(nextProject);
    }
    if (message.actorId === this.id) {
      if (projectChanged(currentProject, nextProject)) {
        useStore.getState().applyRoomProject(nextProject);
      }
      if (acknowledged) this.inFlightOperation = null;
      if (message.kind === "edit") {
        this.lastLocalOperationId = message.operationId;
        this.lastUndoOperationId = null;
        useUi.getState().setRoomHistory(true, false);
      } else if (message.kind === "undo") {
        this.lastLocalOperationId = null;
        this.lastUndoOperationId = message.operationId;
        useUi.getState().setRoomHistory(false, true);
      } else {
        this.lastLocalOperationId = message.operationId;
        this.lastUndoOperationId = null;
        useUi.getState().setRoomHistory(true, false);
      }
    } else {
      if (projectChanged(currentProject, nextProject)) {
        useStore.getState().applyRoomProject(nextProject);
      }
      if (this.inFlightOperation) {
        useUi.getState().setRoomHistory(true, false);
      } else {
        this.lastLocalOperationId = null;
        this.lastUndoOperationId = null;
        useUi.getState().setRoomHistory(false, false);
      }
    }
    if (message.actorId === this.id || !this.inFlightOperation) this.updateHistoryFromLatest(message);
    this.flushProjectOutbox();
  }

  private updateHistoryFromLatest(operation: RoomOperationSummary | null): void {
    if (!operation || operation.actorId !== this.id) {
      this.lastLocalOperationId = null;
      this.lastUndoOperationId = null;
      useUi.getState().setRoomHistory(false, false);
      return;
    }
    if (operation.kind === "undo") {
      this.lastLocalOperationId = null;
      this.lastUndoOperationId = operation.operationId;
      useUi.getState().setRoomHistory(false, true);
    } else {
      this.lastLocalOperationId = operation.operationId;
      this.lastUndoOperationId = null;
      useUi.getState().setRoomHistory(true, false);
    }
  }

  private onRoomError(message: RoomErrorMessage): void {
    const validProject = isProject(message.project) ? message.project : undefined;
    const inFlight = this.inFlightOperation;
    const matchesInFlight =
      Boolean(message.operationId) && inFlight?.operationId === message.operationId;
    const failedInFlight =
      matchesInFlight && (message.scope === undefined || message.scope === "request");
    if (validProject) {
      this.resyncRequired = false;
      this.snapshotRequestOutstanding = false;
      if (failedInFlight) {
        this.inFlightOperation = null;
        this.lastLocalOperationId = null;
        this.lastUndoOperationId = null;
      } else if (inFlight) {
        this.inFlightOperation = {
          ...inFlight,
          change: this.rebaseChange(validProject, inFlight.change),
        };
      }
      if (this.pendingChange) {
        const pendingBase = this.inFlightOperation?.change.project ?? validProject;
        this.pendingChange = this.rebaseChange(pendingBase, this.pendingChange);
      }
      useStore.getState().applyRoomProject(this.restoreOptimisticEdits(validProject));
      if (failedInFlight) useUi.getState().setRoomHistory(false, false);
    } else if (failedInFlight) {
      this.inFlightOperation = null;
      this.lastLocalOperationId = null;
      this.lastUndoOperationId = null;
      useUi.getState().setRoomHistory(false, false);
    }
    if (typeof message.seq === "number") this.lastSeq = message.seq;
    if (validProject && message.scope === "room" && this.inFlightOperation) {
      this.sendOperation(this.inFlightOperation);
    }
    this.setRoomError(message.message);
    this.flushProjectOutbox();
  }

  private setRoomError(message: string, status?: RoomConnectionStatus): void {
    useUi.getState().setRoomConnection({
      roomStatus: status ?? (this.isConnected ? "connected" : this.socket ? "offline" : "error"),
      roomError: message,
    });
    useUi.getState().pushLog({ tool: "room", summary: message, source: "app" });
  }

  private onProjectChange(change: ProjectChange): void {
    if (change.source === "remote") return;
    if (useUi.getState().roomSyncBlocked) return;
    this.queueProjectChange(change);
    this.flushProjectOutbox();
  }

  private queueProjectChange(change: ProjectChange): void {
    const previousProject = this.pendingChange?.previousProject ?? this.inFlightOperation?.change.project;
    const hint = this.pendingChange
      ? mergeProjectChangeHints(this.pendingChange.hint, change.hint)
      : change.hint;
    this.pendingChange = {
      ...change,
      ...(previousProject ? { previousProject } : {}),
      ...(hint ? { hint } : {}),
    };
  }

  private flushProjectOutbox(): void {
    if (
      !this.isConnected ||
      this.inFlightOperation ||
      !this.pendingChange ||
      useUi.getState().roomSyncBlocked
    ) {
      return;
    }
    const change = this.pendingChange;
    const record: InFlightOperation = {
      operationId: randomId("op"),
      change,
      patch: projectChangeToRoomPatch(change.previousProject, change.project, change.hint),
    };
    const prepared = this.prepareMessage(this.operationMessage(record));
    if (prepared.status === "too_large") {
      this.blockRoomSync("That edit is too large to send to the room. Download a local backup before continuing.");
      return;
    }
    if (prepared.status === "failed") {
      this.setRoomError("Could not prepare that room update.");
      return;
    }
    this.inFlightOperation = record;
    this.pendingChange = null;
    this.lastLocalOperationId = record.operationId;
    this.lastUndoOperationId = null;
    useUi.getState().setRoomHistory(true, false);
    const sent = this.sendPrepared(prepared.serialized);
    if (sent !== "sent" && this.socket && !this.isConnected) {
      useUi.getState().setRoomConnection({ roomStatus: "offline" });
    }
  }

  private operationMessage(operation: InFlightOperation): RoomClientMessage {
    const base = {
      type: "operation" as const,
      protocol: ROOM_PROTOCOL_VERSION,
      operationId: operation.operationId,
      baseSeq: this.lastSeq,
      label: operation.change.label,
    };
    const message: RoomClientMessage = operation.patch
      ? { ...base, mode: "patch", patch: operation.patch }
      : {
          ...base,
          mode: "snapshot",
          project: cloneProject(operation.change.project),
        };
    return message;
  }

  private sendOperation(operation: InFlightOperation): SendResult {
    const message = this.operationMessage(operation);
    const sent = this.send(message);
    if (sent === "too_large") {
      this.blockRoomSync("That edit is too large to send to the room. Download a local backup before continuing.");
    } else if (sent !== "sent" && this.socket && !this.isConnected) {
      useUi.getState().setRoomConnection({ roomStatus: "offline" });
    }
    return sent;
  }

  private prepareMessage(
    message: RoomClientMessage,
  ):
    | { status: "ready"; serialized: string }
    | { status: "too_large" }
    | { status: "failed" } {
    try {
      const serialized = JSON.stringify(message);
      if (serialized.length > MAX_PROJECT_JSON_LENGTH) {
        return { status: "too_large" };
      }
      return { status: "ready", serialized };
    } catch {
      return { status: "failed" };
    }
  }

  private sendPrepared(serialized: string): SendResult {
    if (!this.socket || this.socket.readyState !== 1) return "unavailable";
    try {
      this.socket.send(serialized);
      return "sent";
    } catch (error) {
      this.setRoomError(
        error instanceof Error ? error.message : "Could not send room update.",
        "offline",
      );
      return "failed";
    }
  }

  private send(message: RoomClientMessage): SendResult {
    const prepared = this.prepareMessage(message);
    if (prepared.status === "too_large") {
      this.setRoomError("That room message is too large to send.");
      return "too_large";
    }
    if (prepared.status === "failed") {
      this.setRoomError("Could not prepare that room message.");
      return "failed";
    }
    return this.sendPrepared(prepared.serialized);
  }

  private blockRoomSync(message: string): void {
    this.inFlightOperation = null;
    this.pendingChange = null;
    useUi.getState().setRoomConnection({
      roomStatus: "error",
      roomError: message,
      roomSyncBlocked: true,
    });
    useUi.getState().pushLog({ tool: "room", summary: message, source: "app" });
  }
}

export const roomClient = new RoomClient();

export function undoProject(): void {
  if (roomClient.isConnected) roomClient.requestUndo();
  else useStore.getState().undo();
}

export function redoProject(): void {
  if (roomClient.isConnected) roomClient.requestRedo();
  else useStore.getState().redo();
}
