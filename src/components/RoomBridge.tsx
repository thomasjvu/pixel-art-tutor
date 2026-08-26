import { useEffect } from "react";
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
      });
      return;
    }
    roomClient.updatePresence({
      name: roomClient.displayName,
      kind: "human",
      status: "idle",
      tool,
      spriteId: activeSprite?.id ?? null,
      frameIndex: activeFrameIndex,
      cursor: hover,
      progress: 0,
      message: "Browsing the studio",
    });
  }, [activeFrameIndex, activeSprite?.id, agentPresence, hover, tool]);

  return null;
}
