import { useEffect, useRef } from "react";
import { useEditor } from "../store/editorStore";
import { useStore } from "../store/projectStore";
import { useUi } from "../store/uiStore";
import { roomClient } from "../realtime/roomClient";

/** Keeps the UI stores and the optional room connection in sync. */
export function RoomBridge() {
  const hover = useEditor((state) => state.hover);
  const tool = useEditor((state) => state.tool);
  const activeSprite = useStore((state) => state.activeSprite());
  const activeFrameIndex = useStore((state) => state.activeFrameIndex);
  const agentPresence = useUi((state) => state.agentPresence);
  const followAgent = useUi((state) => state.followAgent);
  const roomPeers = useUi((state) => state.roomPeers);
  const tutorialOpen = useUi((state) => state.tutorialOpen);
  const tutorialStep = useUi((state) => state.tutorialStep);
  const actAsAgent = useUi((state) => state.actAsAgent);
  const selectedPet = useUi((state) => state.selectedPet);

  useEffect(() => {
    roomClient.start();
    return () => roomClient.stop();
  }, []);

  useEffect(() => {
    if (agentPresence) {
      roomClient.updatePresence({
        name: agentPresence.name,
        kind: "agent",
        status: agentPresence.status,
        tool: agentPresence.tool,
        spriteId: agentPresence.spriteId,
        frameIndex: agentPresence.frameIndex,
        cursor: agentPresence.cursor,
        progress: agentPresence.progress,
        message: agentPresence.message,
        preview: agentPresence.preview.slice(-300),
      });
      return;
    }
    roomClient.updatePresence({
      name: actAsAgent ? (selectedPet?.name ?? "Studio Guide") : roomClient.displayName,
      kind: actAsAgent ? "agent" : "human",
      status: "idle",
      tool,
      spriteId: activeSprite?.id ?? null,
      frameIndex: activeFrameIndex,
      cursor: hover,
      progress: 0,
      message: "Browsing the studio",
      preview: [],
    });
  }, [actAsAgent, activeFrameIndex, activeSprite?.id, agentPresence, hover, selectedPet?.name, tool]);

  // Follow mode: point our editor at the sprite an agent peer is working on,
  // so humans watch agent edits (and the companion cursor) happen live instead
  // of discovering them after the fact. Only follows while the agent is
  // actively working; a finished ("done"/"idle") action leaves the view alone.
  useEffect(() => {
    if (!followAgent) return;
    const now = Date.now();
    const active = Object.values(roomPeers)
      .filter(
        (peer) =>
          peer.kind === "agent" &&
          peer.spriteId &&
          peer.status !== "idle" &&
          peer.status !== "done" &&
          now - peer.updatedAt < 15_000,
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (!active?.spriteId) return;
    const store = useStore.getState();
    const current = store.activeSprite();
    if (current?.id !== active.spriteId || store.activeFrameIndex !== active.frameIndex) {
      store.setActiveSprite(active.spriteId, active.frameIndex);
    }
  }, [followAgent, roomPeers]);

  // Share guided-tour progress with the room so an agent-led tutorial opens
  // the same step on every following screen. Heartbeat while open so late
  // joiners can tell the tour is still live (presence is otherwise idle).
  useEffect(() => {
    if (!tutorialOpen) {
      roomClient.updatePresence({ tutorialStep: null });
      return;
    }
    roomClient.updatePresence({ tutorialStep });
    const id = window.setInterval(() => {
      roomClient.updatePresence({ tutorialStep: useUi.getState().tutorialStep });
    }, 10_000);
    return () => window.clearInterval(id);
  }, [tutorialOpen, tutorialStep]);

  // Mirror a peer's tour when ours is closed, so the human is guided along.
  // Only new steps trigger it: dismissing the tour must stick while the
  // guide stays on the same step, or it would pop back up on every tick.
  const mirroredStep = useRef<number | null>(null);
  useEffect(() => {
    if (!followAgent) return;
    if (useUi.getState().tutorialOpen) return;
    const now = Date.now();
    const guide = Object.values(roomPeers)
      .filter((peer) => peer.tutorialStep != null && now - peer.updatedAt < 15_000)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (!guide || guide.tutorialStep == null) {
      mirroredStep.current = null;
      return;
    }
    if (guide.tutorialStep === mirroredStep.current) return;
    mirroredStep.current = guide.tutorialStep;
    useUi.getState().openTutorial(guide.tutorialStep);
  }, [followAgent, roomPeers]);

  // Remember what agent peers do so Agent activity stays populated after
  // their actions finish (presence flips back to human when idle).
  useEffect(() => {
    const agents = Object.values(roomPeers).filter(
      (peer) => peer.kind === "agent" && peer.status !== "idle",
    );
    if (agents.length > 0) useUi.getState().noteAgentActivity(agents);
  }, [roomPeers]);

  return null;
}
