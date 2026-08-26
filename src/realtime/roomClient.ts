import { PartySocket } from "partysocket";
import {
  cloneProject,
  isProject,
  parseRoomMessage,
  ROOM_PROTOCOL_VERSION,
  type ActorKind,
  type RoomClientMessage,
  type RoomOperationSummary,
  type RoomPresence,
  type RoomServerMessage,
} from "./protocol";
import { subscribeProjectChanges, useStore } from "../store/projectStore";
import { useUi } from "../store/uiStore";
import type { ProjectChange } from "./projectEvents";

const ROOM_QUERY_KEY = "room";
const CLIENT_ID_KEY = "pixel-art-tutor.client-id.v1";
const DISPLAY_NAME_KEY = "pixel-art-tutor.display-name.v1";
const ROOM_COLORS = ["#e95d55", "#4daa91", "#668fd4", "#d99c3f", "#9a74c9"];

function randomId(prefix: string): string {
  const uuid = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : null;
  return `${prefix}-${uuid ?? Math.random().toString(36).slice(2, 12)}`;
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
    updatedAt: Date.now(),
  };
}

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
    return this.ready && this.socket?.readyState === 1;
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
    useUi.getState().setRoomPeers([]);
    useUi.getState().setRoomHistory(false, false);
    useUi.getState().setRoomConnection({ roomStatus: "idle", roomId: null, roomError: null, roomSeq: 0 });
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
      this.closeSocket();
      useUi.getState().setRoomPeers([]);
      useUi.getState().setRoomHistory(false, false);
      useUi.getState().setRoomConnection({ roomId: null, roomStatus: "idle", roomError: null, roomSeq: 0 });
      return;
    }
    this.connect(next);
  }

  createRoom(): string {
    const room = `tiny-${Math.random().toString(36).slice(2, 8)}`;
    this.joinRoom(room);
    return room;
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
    this.send({
      type: "undo",
      protocol: ROOM_PROTOCOL_VERSION,
      operationId: this.lastLocalOperationId,
    });
  }

  requestRedo(): void {
    if (!this.isConnected || !this.lastUndoOperationId) {
      useUi.getState().setRoomConnection({ roomError: "There is no shared edit ready to redo." });
      return;
    }
    this.send({
      type: "redo",
      protocol: ROOM_PROTOCOL_VERSION,
      operationId: this.lastUndoOperationId,
    });
  }

  private connect(room: string): void {
    this.activeRoomId = room;
    this.closeSocket();
    this.ready = false;
    this.lastSeq = 0;
    this.lastLocalOperationId = null;
    this.lastUndoOperationId = null;
    this.pendingChange = null;

    const host = configuredHost();
    useUi.getState().setRoomConnection({
      roomId: room,
      roomHost: host,
      roomError: host ? null : "Set VITE_PARTY_HOST to enable shared rooms.",
      roomStatus: host ? "connecting" : "disabled",
      roomSeq: 0,
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
    useUi.getState().setRoomConnection({ roomStatus: "connecting", roomError: null });
    this.send({
      type: "hello",
      protocol: ROOM_PROTOCOL_VERSION,
      clientId: this.id,
      name: this.name,
      kind: "human",
      color: this.color,
      project: cloneProject(useStore.getState().project),
    });
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
        this.onRoomError(message.message, message.project, message.seq);
        break;
    }
  }

  private onWelcome(message: Extract<RoomServerMessage, { type: "welcome" }>): void {
    if (!message.project || !isProject(message.project)) return;
    this.ready = true;
    this.lastSeq = message.seq;
    useUi.getState().setRoomConnection({
      roomId: message.roomId,
      roomStatus: "connected",
      roomError: null,
      roomSeq: message.seq,
    });
    this.onPresenceState(message.peers);

    if (this.pendingChange && projectChanged(message.project, this.pendingChange.project)) {
      this.sendOperation(this.pendingChange);
    } else {
      this.pendingChange = null;
      useStore.getState().applyRoomProject(message.project);
      this.updateHistoryFromLatest(message.latestOperation);
    }
    this.updatePresence(this.presence);
  }

  private onPresence(presence: RoomPresence): void {
    if (presence.id === this.id) return;
    useUi.getState().setRoomPeers([...Object.values(useUi.getState().roomPeers).filter((peer) => peer.id !== presence.id), presence]);
  }

  private onPresenceState(peers: RoomPresence[]): void {
    useUi.getState().setRoomPeers(peers.filter((peer) => peer.id !== this.id));
  }

  private onOperation(message: Extract<RoomServerMessage, { type: "operation" }>): void {
    if (message.seq <= this.lastSeq || !isProject(message.project)) return;
    this.lastSeq = message.seq;
    useUi.getState().setRoomConnection({ roomSeq: message.seq, roomError: null });
    if (message.actorId === this.id) {
      if (projectChanged(useStore.getState().project, message.project)) {
        useStore.getState().applyRoomProject(message.project);
      }
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
      useStore.getState().applyRoomProject(message.project);
      this.lastLocalOperationId = null;
      this.lastUndoOperationId = null;
      useUi.getState().setRoomHistory(false, false);
    }
    this.updateHistoryFromLatest(message);
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

  private onRoomError(message: string, project?: unknown, seq?: number): void {
    const validProject = isProject(project) ? project : undefined;
    if (validProject) useStore.getState().applyRoomProject(validProject);
    if (typeof seq === "number") this.lastSeq = seq;
    this.setRoomError(message);
  }

  private setRoomError(message: string): void {
    useUi.getState().setRoomConnection({ roomStatus: this.socket ? "offline" : "error", roomError: message });
    useUi.getState().pushLog({ tool: "room", summary: message, source: "app" });
  }

  private onProjectChange(change: ProjectChange): void {
    if (change.source === "remote") return;
    if (this.isConnected) {
      this.sendOperation(change);
      return;
    }
    this.pendingChange = this.pendingChange
      ? { ...change, previousProject: this.pendingChange.previousProject }
      : change;
  }

  private sendOperation(change: ProjectChange): void {
    if (!this.isConnected) return;
    const operationId = randomId("op");
    this.lastLocalOperationId = operationId;
    this.lastUndoOperationId = null;
    this.pendingChange = null;
    useUi.getState().setRoomHistory(true, false);
    this.send({
      type: "operation",
      protocol: ROOM_PROTOCOL_VERSION,
      operationId,
      baseSeq: this.lastSeq,
      baseProject: cloneProject(change.previousProject),
      project: cloneProject(change.project),
      label: change.label,
    });
  }

  private send(message: RoomClientMessage): void {
    if (!this.socket || this.socket.readyState !== 1) return;
    try {
      this.socket.send(JSON.stringify(message));
    } catch (error) {
      this.setRoomError(error instanceof Error ? error.message : "Could not send room update.");
    }
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
