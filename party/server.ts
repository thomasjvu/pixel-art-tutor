import { routePartykitRequest, Server } from "partyserver";
import type { Connection, WSMessage } from "partyserver";
import {
  applyRoomPatch,
  cloneProject,
  isRoomPatch,
  isProject,
  ROOM_PROTOCOL_VERSION,
  type ActorKind,
  type RoomErrorScope,
  type RoomOperationSummary,
  type RoomPatch,
  type RoomPresence,
} from "../src/realtime/protocol";
import { MAX_ID_LENGTH, MAX_PROJECT_JSON_LENGTH } from "../src/projectLimits";
import type { Project } from "../src/types";

const STORAGE_KEY = "pixel-room-state-v1";
const MAX_HISTORY = 32;
const MAX_MESSAGE_LENGTH = MAX_PROJECT_JSON_LENGTH;
const MAX_CONNECTIONS_PER_ROOM = 16;
const RATE_WINDOW_MS = 10_000;
const MAX_OPERATIONS_PER_WINDOW = 30;
const MAX_PRESENCE_PER_WINDOW = 120;

interface StoredOperation extends RoomOperationSummary {
  seq: number;
  beforeProject: Project;
  afterProject: Project;
}

interface StoredRoomState {
  schemaVersion: 1;
  seq: number;
  project: Project;
  history: StoredOperation[];
}

interface ConnectionState {
  clientId: string;
  name: string;
  kind: ActorKind;
  color: string;
  ready: boolean;
  presence: RoomPresence;
  operationWindowStartedAt: number;
  operationCount: number;
  presenceWindowStartedAt: number;
  presenceCount: number;
}

interface RoomErrorOptions {
  includeSnapshot?: boolean;
  operationId?: string;
  scope?: RoomErrorScope;
}

interface RoomEnv {
  PixelRoom: DurableObjectNamespace<PixelRoom>;
  ROOM_ALLOWED_ORIGIN?: string;
}

function text(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
}

function actorKind(value: unknown): ActorKind {
  return value === "agent" ? "agent" : "human";
}

function color(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function point(value: unknown): { x: number; y: number } | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { x?: unknown; y?: unknown };
  if (!Number.isInteger(candidate.x) || !Number.isInteger(candidate.y)) return null;
  return { x: candidate.x as number, y: candidate.y as number };
}

function presenceValue(value: unknown, fallback: RoomPresence): RoomPresence | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<RoomPresence>;
  const status = [
    "idle",
    "thinking",
    "drawing",
    "filling",
    "transforming",
    "reviewing",
    "done",
  ].includes(String(candidate.status))
    ? candidate.status!
    : fallback.status;
  return {
    ...fallback,
    name: text(candidate.name, fallback.name, 32),
    kind: actorKind(candidate.kind),
    color: color(candidate.color, fallback.color),
    status,
    tool: text(candidate.tool, fallback.tool, 32),
    spriteId: typeof candidate.spriteId === "string" ? candidate.spriteId.slice(0, 128) : null,
    frameIndex:
      typeof candidate.frameIndex === "number" && Number.isInteger(candidate.frameIndex)
        ? Math.max(0, Math.min(31, candidate.frameIndex))
        : fallback.frameIndex,
    cursor: point(candidate.cursor),
    progress:
      typeof candidate.progress === "number" && Number.isFinite(candidate.progress)
        ? Math.max(0, Math.min(1, candidate.progress))
        : fallback.progress,
    message: text(candidate.message, fallback.message, 96),
    updatedAt: Date.now(),
  };
}

function operationId(prefix: string): string {
  const uuid = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : null;
  return `${prefix}-${uuid ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`;
}

function originGuard(request: Request, allowedOrigin: string | null): Response | undefined {
  if (!allowedOrigin) return undefined;
  const origin = request.headers.get("Origin");
  return origin && origin !== allowedOrigin
    ? new Response("Origin is not allowed for this room server.", { status: 403 })
    : undefined;
}

function connectionState(connection: Connection): ConnectionState | null {
  const state = connection.state as ConnectionState | null;
  return state?.clientId ? state : null;
}

function consumeBudget(connection: Connection, kind: "operation" | "presence"): boolean {
  const state = connectionState(connection);
  if (!state) return false;
  const now = Date.now();
  const isOperation = kind === "operation";
  const windowStartedAt = isOperation ? state.operationWindowStartedAt : state.presenceWindowStartedAt;
  const count = isOperation ? state.operationCount : state.presenceCount;
  const maximum = isOperation ? MAX_OPERATIONS_PER_WINDOW : MAX_PRESENCE_PER_WINDOW;
  const expired = !Number.isFinite(windowStartedAt) || now - windowStartedAt >= RATE_WINDOW_MS;
  if (!expired && count >= maximum) return false;
  connection.setState({
    ...state,
    ...(isOperation
      ? { operationWindowStartedAt: expired ? now : windowStartedAt, operationCount: expired ? 1 : count + 1 }
      : { presenceWindowStartedAt: expired ? now : windowStartedAt, presenceCount: expired ? 1 : count + 1 }),
  } satisfies ConnectionState);
  return true;
}

function summary(operation: StoredOperation | null): RoomOperationSummary | null {
  if (!operation) return null;
  return {
    operationId: operation.operationId,
    actorId: operation.actorId,
    label: operation.label,
    kind: operation.kind,
    ...(operation.undoOf ? { undoOf: operation.undoOf } : {}),
    ...(operation.redoOf ? { redoOf: operation.redoOf } : {}),
  };
}

function isStoredOperation(value: unknown): value is StoredOperation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredOperation>;
  return (
    typeof candidate.operationId === "string" &&
    candidate.operationId.length > 0 &&
    typeof candidate.actorId === "string" &&
    candidate.actorId.length > 0 &&
    typeof candidate.label === "string" &&
    candidate.label.length > 0 &&
    (candidate.kind === "edit" || candidate.kind === "undo" || candidate.kind === "redo") &&
    Number.isInteger(candidate.seq) &&
    isProject(candidate.beforeProject) &&
    isProject(candidate.afterProject)
  );
}

export class PixelRoom extends Server<RoomEnv> {
  static options = { hibernate: true };

  private roomState: StoredRoomState | null = null;
  private operationTail: Promise<void> = Promise.resolve();

  async onStart(): Promise<void> {
    const stored = await this.ctx.storage.get<StoredRoomState>(STORAGE_KEY);
    if (
      stored?.schemaVersion === 1 &&
      Number.isInteger(stored.seq) &&
      isProject(stored.project) &&
      Array.isArray(stored.history)
    ) {
      this.roomState = {
        schemaVersion: 1,
        seq: stored.seq,
        project: cloneProject(stored.project),
        history: stored.history
          .filter(isStoredOperation)
          .slice(-MAX_HISTORY),
      };
    }
  }

  async onConnect(connection: Connection, context: { request: Request }): Promise<void> {
    if (Array.from(this.getConnections()).length > MAX_CONNECTIONS_PER_ROOM) {
      connection.close(1008, "Room connection limit reached");
      return;
    }
    const url = new URL(context.request.url);
    const fallbackId = connection.id || operationId("guest");
    const clientId = text(url.searchParams.get("clientId"), fallbackId, 80);
    const name = text(url.searchParams.get("name"), "Guest", 32);
    const connectionColor = color(url.searchParams.get("color"), "#668fd4");
    const presence: RoomPresence = {
      id: clientId,
      name,
      kind: "human",
      color: connectionColor,
      status: "idle",
      tool: "pencil",
      spriteId: null,
      frameIndex: 0,
      cursor: null,
      progress: 0,
      message: "Joining the studio",
      updatedAt: Date.now(),
    };
    connection.setState({
      clientId,
      name,
      kind: "human",
      color: connectionColor,
      ready: false,
      presence,
      operationWindowStartedAt: 0,
      operationCount: 0,
      presenceWindowStartedAt: 0,
      presenceCount: 0,
    } satisfies ConnectionState);
  }

  onClose(): void {
    this.broadcastPresence();
  }

  async onMessage(connection: Connection, rawMessage: WSMessage): Promise<void> {
    if (typeof rawMessage !== "string" || rawMessage.length > MAX_MESSAGE_LENGTH) {
      this.sendError(connection, "That room message was too large.");
      return;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(rawMessage);
    } catch {
      this.sendError(connection, "That room message was not valid JSON.");
      return;
    }
    if (!raw || typeof raw !== "object") {
      this.sendError(connection, "That room message was not understood.");
      return;
    }
    const message = raw as Record<string, unknown>;
    if (message.protocol !== ROOM_PROTOCOL_VERSION || typeof message.type !== "string") {
      this.sendError(connection, "This room client is using an incompatible protocol.");
      return;
    }

    switch (message.type) {
      case "hello":
        await this.handleHello(connection, message);
        break;
      case "presence":
        if (!this.allowBudgetedMessage(connection, "presence")) return;
        this.handlePresence(connection, message.presence);
        break;
      case "snapshot_request":
        if (!this.allowBudgetedMessage(connection, "operation")) return;
        this.handleSnapshotRequest(connection, message);
        break;
      case "operation":
        if (!this.allowBudgetedMessage(connection, "operation")) return;
        await this.withOperationLock(() => this.handleOperation(connection, message));
        break;
      case "undo":
        if (!this.allowBudgetedMessage(connection, "operation")) return;
        await this.withOperationLock(() => this.handleUndo(connection, message, false));
        break;
      case "redo":
        if (!this.allowBudgetedMessage(connection, "operation")) return;
        await this.withOperationLock(() => this.handleUndo(connection, message, true));
        break;
      default:
        this.sendError(connection, "That room action was not recognized.");
    }
  }

  private async handleHello(connection: Connection, message: Record<string, unknown>): Promise<void> {
    const state = connectionState(connection);
    if (!state) {
      this.sendError(connection, "This room connection is no longer active.");
      return;
    }
    if (state.ready) {
      this.sendError(connection, "This room connection has already joined.");
      return;
    }
    if (Array.from(this.getConnections()).length > MAX_CONNECTIONS_PER_ROOM) {
      this.sendError(connection, "This room is full. Try again after another collaborator leaves.");
      connection.close(1008, "Room connection limit reached");
      return;
    }
    if (!isProject(message.project)) {
      this.sendError(connection, "A valid project is required to join this room.");
      return;
    }
    state.name = text(message.name, state.name, 32);
    state.kind = actorKind(message.kind);
    state.color = color(message.color, state.color);
    state.presence = {
      ...state.presence,
      name: state.name,
      kind: state.kind,
      color: state.color,
      updatedAt: Date.now(),
      message: "Browsing the studio",
    };
    state.ready = true;
    connection.setState(state);

    if (!this.roomState) {
      this.roomState = { schemaVersion: 1, seq: 0, project: cloneProject(message.project), history: [] };
      try {
        await this.persist();
      } catch {
        this.roomState = null;
        state.ready = false;
        connection.setState(state);
        this.sendError(connection, "The room could not be initialized. Please retry.");
        return;
      }
    }
    this.sendWelcome(connection);
    this.broadcastPresence();
  }

  private handleSnapshotRequest(connection: Connection, message: Record<string, unknown>): void {
    if (
      typeof message.lastSeq !== "number" ||
      !Number.isInteger(message.lastSeq) ||
      message.lastSeq < 0
    ) {
      this.sendError(connection, "That room snapshot request was not valid.");
      return;
    }
    this.sendWelcome(connection);
  }

  private allowBudgetedMessage(connection: Connection, kind: "operation" | "presence"): boolean {
    const state = connectionState(connection);
    if (!state?.ready) {
      this.sendError(connection, "Join the room before sending that message.");
      return false;
    }
    if (consumeBudget(connection, kind)) return true;
    const label = kind === "operation" ? "edit" : "presence";
    this.sendError(connection, `Too many ${label} messages. Slow down and try again shortly.`);
    connection.close(1008, `${label} rate limit exceeded`);
    return false;
  }

  private async withOperationLock<T>(task: () => Promise<T>): Promise<T> {
    const previous = this.operationTail;
    let release!: () => void;
    this.operationTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await task();
    } finally {
      release();
    }
  }

  private handlePresence(connection: Connection, value: unknown): void {
    const state = connectionState(connection);
    if (!state?.ready) return;
    const next = presenceValue(value, state.presence);
    if (!next) return;
    state.presence = { ...next, id: state.clientId };
    state.name = next.name;
    state.kind = next.kind;
    state.color = next.color;
    connection.setState(state);
    this.broadcast(JSON.stringify({ type: "presence", protocol: ROOM_PROTOCOL_VERSION, presence: state.presence }), [connection.id]);
  }

  private async handleOperation(connection: Connection, message: Record<string, unknown>): Promise<void> {
    const state = connectionState(connection);
    if (!state?.ready || !this.roomState) {
      this.sendError(connection, "Join the room before sending an edit.");
      return;
    }
    const requestOperationId =
      typeof message.operationId === "string" &&
      message.operationId.length > 0 &&
      message.operationId.length <= MAX_ID_LENGTH
        ? message.operationId
        : undefined;
    const mode =
      message.mode === "patch"
        ? "patch"
        : message.mode === undefined || message.mode === "snapshot"
          ? "snapshot"
          : null;
    if (
      mode === null ||
      typeof message.operationId !== "string" ||
      !message.operationId ||
      message.operationId.length > MAX_ID_LENGTH ||
      typeof message.label !== "string" ||
      !message.label.trim() ||
      message.label.length > 80 ||
      typeof message.baseSeq !== "number" ||
      !Number.isInteger(message.baseSeq) ||
      message.baseSeq < 0
    ) {
      this.sendError(connection, "That room edit was not valid.", {
        includeSnapshot: true,
        operationId: requestOperationId,
      });
      return;
    }
    const existing = this.roomState.history.find((entry) => entry.operationId === message.operationId);
    if (existing) {
      this.sendOperation(existing);
      return;
    }
    const beforeProject = this.roomState.project;
    let nextProject: Project;
    let patch: RoomPatch | null = null;
    if (mode === "patch") {
      if (!isRoomPatch(message.patch)) {
        this.sendError(connection, "That room patch was not valid.", {
          includeSnapshot: true,
          operationId: requestOperationId,
        });
        return;
      }
      patch = message.patch;
      const applied = applyRoomPatch(this.roomState.project, patch);
      if (!applied) {
        this.sendError(connection, "That edit no longer fits the current room project.", {
          includeSnapshot: true,
          operationId: requestOperationId,
        });
        return;
      }
      nextProject = applied;
    } else {
      if (!isProject(message.project)) {
        this.sendError(connection, "That edit did not contain a valid project.", {
          includeSnapshot: true,
          operationId: requestOperationId,
        });
        return;
      }
      if (message.baseSeq !== this.roomState.seq) {
        this.sendError(connection, "That structural edit is based on an older room snapshot.", {
          includeSnapshot: true,
          operationId: requestOperationId,
          scope: "room",
        });
        return;
      }
      nextProject = cloneProject(message.project);
    }
    if (!isProject(nextProject)) {
      this.sendError(connection, "That edit would make the room project invalid.", {
        includeSnapshot: true,
        operationId: requestOperationId,
      });
      return;
    }
    const entry: StoredOperation = {
      operationId: message.operationId,
      actorId: state.clientId,
      label: text(message.label, "Edit", 80),
      kind: "edit",
      seq: this.roomState.seq + 1,
      beforeProject: cloneProject(beforeProject),
      afterProject: cloneProject(nextProject),
    };
    await this.commitOperation(entry, patch, connection, requestOperationId);
  }

  private async handleUndo(
    connection: Connection,
    message: Record<string, unknown>,
    redo: boolean,
  ): Promise<void> {
    const state = connectionState(connection);
    if (!state?.ready || !this.roomState || typeof message.operationId !== "string") {
      this.sendError(connection, "Join the room before changing its history.");
      return;
    }
    const requestOperationId =
      message.operationId.length > 0 && message.operationId.length <= MAX_ID_LENGTH
        ? message.operationId
        : undefined;
    const last = this.roomState.history[this.roomState.history.length - 1];
    if (!last || last.actorId !== state.clientId) {
      this.sendError(
        connection,
        redo ? "Only your latest undo can be redone." : "Only your latest room edit can be undone.",
        { includeSnapshot: true, operationId: requestOperationId },
      );
      return;
    }
    if (!redo && last.operationId !== message.operationId) {
      this.sendError(connection, "Another collaborator edited after that change, so it is no longer undoable.", {
        includeSnapshot: true,
        operationId: requestOperationId,
      });
      return;
    }
    if (redo && (last.kind !== "undo" || last.operationId !== message.operationId)) {
      this.sendError(connection, "That undo is no longer the latest room action.", {
        includeSnapshot: true,
        operationId: requestOperationId,
      });
      return;
    }

    const nextProject = last.beforeProject;
    const entry: StoredOperation = {
      operationId: operationId(redo ? "redo" : "undo"),
      actorId: state.clientId,
      label: redo ? "Redo" : "Undo",
      kind: redo ? "redo" : "undo",
      ...(redo ? { redoOf: last.operationId } : { undoOf: last.operationId }),
      seq: this.roomState.seq + 1,
      beforeProject: cloneProject(this.roomState.project),
      afterProject: cloneProject(nextProject),
    };
    await this.commitOperation(entry, null, connection, requestOperationId);
  }

  private async commitOperation(
    entry: StoredOperation,
    patch: RoomPatch | null = null,
    origin: Connection | null = null,
    requestOperationId: string | undefined = entry.operationId,
  ): Promise<void> {
    if (!this.roomState) return;
    const previousState = this.roomState;
    const nextState: StoredRoomState = {
      schemaVersion: 1,
      seq: entry.seq,
      project: cloneProject(entry.afterProject),
      history: [...previousState.history, entry].slice(-MAX_HISTORY),
    };
    this.roomState = nextState;
    try {
      await this.persist();
    } catch {
      if (this.roomState === nextState) this.roomState = previousState;
      if (origin) {
        this.sendError(origin, "The room could not save that edit. Please retry.", {
          includeSnapshot: true,
          operationId: requestOperationId,
          scope: "request",
        });
      }
      return;
    }
    this.sendOperation(entry, patch);
  }

  private sendWelcome(connection: Connection): void {
    if (!this.roomState) return;
    connection.send(
      JSON.stringify({
        type: "welcome",
        protocol: ROOM_PROTOCOL_VERSION,
        roomId: this.name,
        seq: this.roomState.seq,
        project: this.roomState.project,
        peers: this.presences(),
        latestOperation: summary(this.roomState.history[this.roomState.history.length - 1] ?? null),
      }),
    );
  }

  private sendOperation(entry: StoredOperation, patch: RoomPatch | null = null): void {
    const operation = patch
      ? { mode: "patch" as const, patch }
      : { mode: "snapshot" as const, project: entry.afterProject };
    this.broadcast(
      JSON.stringify({
        type: "operation",
        protocol: ROOM_PROTOCOL_VERSION,
        seq: entry.seq,
        operationId: entry.operationId,
        actorId: entry.actorId,
        label: entry.label,
        kind: entry.kind,
        ...operation,
        ...(entry.undoOf ? { undoOf: entry.undoOf } : {}),
        ...(entry.redoOf ? { redoOf: entry.redoOf } : {}),
      }),
    );
  }

  private sendError(
    connection: Connection,
    message: string,
    options: boolean | RoomErrorOptions = {},
  ): void {
    const normalized = typeof options === "boolean" ? { includeSnapshot: options } : options;
    connection.send(
      JSON.stringify({
        type: "room_error",
        protocol: ROOM_PROTOCOL_VERSION,
        scope: normalized.scope ?? "request",
        ...(normalized.operationId ? { operationId: normalized.operationId } : {}),
        message,
        ...(normalized.includeSnapshot && this.roomState
          ? { project: this.roomState.project, seq: this.roomState.seq }
          : {}),
      }),
    );
  }

  private presences(): RoomPresence[] {
    return Array.from(this.getConnections())
      .map((connection) => {
        const state = connectionState(connection);
        return state?.ready ? state.presence : null;
      })
      .filter((presence): presence is RoomPresence => Boolean(presence));
  }

  private broadcastPresence(): void {
    this.broadcast(
      JSON.stringify({
        type: "presence_state",
        protocol: ROOM_PROTOCOL_VERSION,
        peers: this.presences(),
      }),
    );
  }

  private persist(): Promise<void> {
    return this.roomState ? this.ctx.storage.put(STORAGE_KEY, this.roomState) : Promise.resolve();
  }
}

export default {
  async fetch(request: Request, env: RoomEnv): Promise<Response> {
    const allowedOrigin = env.ROOM_ALLOWED_ORIGIN?.trim() || null;
    const cors = allowedOrigin
      ? {
          "Access-Control-Allow-Origin": allowedOrigin,
          "Access-Control-Allow-Methods": "GET, POST, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        }
      : false;
    return (
      (await routePartykitRequest<RoomEnv>(request, env, {
        cors,
        onBeforeConnect: (req) => originGuard(req, allowedOrigin),
        onBeforeRequest: (req) => originGuard(req, allowedOrigin),
      })) ??
      new Response("Pixel room server", { status: 404 })
    );
  },
} satisfies ExportedHandler<RoomEnv>;
