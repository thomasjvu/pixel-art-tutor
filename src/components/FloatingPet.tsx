import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { PresenceStatus } from "../realtime/protocol";
import { useUi } from "../store/uiStore";
import { PetAvatar } from "./PetAvatar";

const POSITION_KEY = "pixel-art-tutor.floating-pet-position.v1";
const EDGE = 18;
const STUDIO_UI_SCALE = 1.1;
const PET_BUTTON_WIDTH = 142;
const PET_BUTTON_HEIGHT = 124;
const SPEECH_WIDTH = 168;
const SPEECH_HEIGHT = 56;
const DEFAULT_WIDTH = Math.max(PET_BUTTON_WIDTH, SPEECH_WIDTH) * STUDIO_UI_SCALE;
const DEFAULT_HEIGHT = (SPEECH_HEIGHT + PET_BUTTON_HEIGHT + 8) * STUDIO_UI_SCALE;
const FOOTER_CLEARANCE = 66;
const IDLE_MESSAGE = "Ask your agent to connect to WebMCP on this site!";

interface PetPosition {
  x: number;
  y: number;
}

interface DragState {
  pointerId: number;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  moved: boolean;
}

function isAgentActive(status: PresenceStatus): boolean {
  return status !== "idle" && status !== "done";
}

function defaultPosition(): PetPosition {
  if (typeof window === "undefined") return { x: EDGE, y: EDGE };
  return {
    x: Math.max(EDGE, window.innerWidth - DEFAULT_WIDTH - EDGE),
    y: Math.max(EDGE, window.innerHeight - DEFAULT_HEIGHT - 66),
  };
}

function clampPosition(position: PetPosition, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT): PetPosition {
  if (typeof window === "undefined") return position;
  return {
    x: Math.max(EDGE, Math.min(window.innerWidth - width - EDGE, position.x)),
    y: Math.max(EDGE, Math.min(window.innerHeight - height - FOOTER_CLEARANCE, position.y)),
  };
}

function readPosition(): PetPosition {
  const fallback = defaultPosition();
  try {
    const raw = window.localStorage.getItem(POSITION_KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as { x?: unknown; y?: unknown };
    if (typeof saved.x !== "number" || typeof saved.y !== "number") return fallback;
    return clampPosition({ x: saved.x, y: saved.y });
  } catch {
    return fallback;
  }
}

function savePosition(position: PetPosition): void {
  try {
    window.localStorage.setItem(POSITION_KEY, JSON.stringify(position));
  } catch {
    /* localStorage may be unavailable in a private or embedded browser */
  }
}

export function FloatingPet() {
  const pet = useUi((state) => state.selectedPet);
  const openTutorial = useUi((state) => state.openTutorial);
  const agentPresence = useUi((state) => state.agentPresence);
  const roomPeers = useUi((state) => state.roomPeers);
  const [position, setPosition] = useState<PetPosition>(readPosition);
  const [dragging, setDragging] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [greeting, setGreeting] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const latestPosition = useRef(position);
  const suppressClick = useRef(false);
  const greetedActiveState = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(id);
  }, []);

  const remoteAgent = Object.values(roomPeers).find(
    (peer) =>
      peer.kind === "agent" &&
      isAgentActive(peer.status) &&
      now - peer.updatedAt < 15_000,
  );
  const remoteAgentActive = Boolean(remoteAgent);
  const agentActive = Boolean(agentPresence && isAgentActive(agentPresence.status)) || remoteAgentActive;
  const speechMessage = agentActive
    ? greeting
      ? "Hello!"
      : agentPresence?.message ?? remoteAgent?.message ?? "Hello!"
    : IDLE_MESSAGE;

  useEffect(() => {
    latestPosition.current = position;
  }, [position]);

  useEffect(() => {
    if (!agentActive) {
      greetedActiveState.current = false;
      return;
    }
    if (greetedActiveState.current) return;
    greetedActiveState.current = true;
    setGreeting(true);
    const id = window.setTimeout(() => setGreeting(false), 1_800);
    return () => window.clearTimeout(id);
  }, [agentActive]);

  useEffect(() => {
    function keepPetOnscreen() {
      const shell = shellRef.current;
      const rect = shell?.getBoundingClientRect();
      const width = rect?.width ?? DEFAULT_WIDTH;
      const height = rect?.height ?? DEFAULT_HEIGHT;
      setPosition((current) => {
        const next = clampPosition(current, width, height);
        latestPosition.current = next;
        savePosition(next);
        return next;
      });
    }
    window.addEventListener("resize", keepPetOnscreen);
    return () => window.removeEventListener("resize", keepPetOnscreen);
  }, []);

  if (!pet) return null;

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    const shell = shellRef.current;
    if (!shell) return;
    const rect = shell.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    suppressClick.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
    const shell = shellRef.current;
    const next = clampPosition(
      { x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY },
      shell?.getBoundingClientRect().width ?? DEFAULT_WIDTH,
      shell?.getBoundingClientRect().height ?? DEFAULT_HEIGHT,
    );
    latestPosition.current = next;
    setPosition(next);
  }

  function finishDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    savePosition(latestPosition.current);
    suppressClick.current = drag.moved;
    dragRef.current = null;
    setDragging(false);
  }

  function handleClick() {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    openTutorial(0);
  }

  return (
    <div
      ref={shellRef}
      className={`floating-pet ${agentActive ? "active" : "inactive"}${dragging ? " dragging" : ""}`}
      data-agent-active={agentActive ? "true" : "false"}
      style={{ transform: `translate3d(${position.x / STUDIO_UI_SCALE}px, ${position.y / STUDIO_UI_SCALE}px, 0)` }}
    >
      <div className="floating-pet-bubble" role="status" aria-live="polite">
        {speechMessage}
      </div>
      <button
        className="floating-pet-dragger"
        type="button"
        aria-label={`Open ${pet.name} guide; ${agentActive ? "agent active" : "agent idle"}; ${speechMessage}; drag to move`}
        title={`${pet.name} · ${agentActive ? "agent active" : "agent idle"} · drag to move`}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onClick={handleClick}
      >
        <PetAvatar pet={pet} size={96} className="floating-pet-avatar" />
        <span className="floating-pet-name">{pet.name}</span>
        <span className="floating-pet-grip" aria-hidden="true">⠿</span>
      </button>
    </div>
  );
}
