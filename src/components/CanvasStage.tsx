import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store/projectStore";
import { useEditor } from "../store/editorStore";
import { useUi, type AgentPresenceState } from "../store/uiStore";
import type { RoomPresence } from "../realtime/protocol";
import { TRANSPARENT } from "../types";

export function CanvasStage() {
  const project = useStore((s) => s.project);
  const activeFrameIndex = useStore((s) => s.activeFrameIndex);
  const setColorAt = useStore((s) => s.setColorAt);
  const drawLine = useStore((s) => s.drawLine);
  const floodFillAt = useStore((s) => s.floodFillAt);
  const selectFrame = useStore((s) => s.selectFrame);

  const { tool, colorIdx, zoom, onion, showGrid, fps, playing } = useEditor();
  const setColor = useEditor((s) => s.setColor);
  const setPlaying = useEditor((s) => s.setPlaying);

  const sprite = useStore((s) => s.activeSprite());
  const agentPresence = useUi((s) => s.agentPresence);
  const roomPeers = useUi((s) => s.roomPeers);
  const remotePeers = Object.values(roomPeers);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);
  const [canvasBox, setCanvasBox] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const lastCell = useRef<[number, number] | null>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const wrap = canvas?.parentElement;
    if (!canvas || !wrap) return;
    const updateBox = () => {
      const canvasRect = canvas.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      setCanvasBox({
        left: canvasRect.left - wrapRect.left,
        top: canvasRect.top - wrapRect.top,
        width: canvasRect.width,
        height: canvasRect.height,
      });
    };
    updateBox();
    const observer = new ResizeObserver(updateBox);
    observer.observe(canvas);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [sprite, zoom]);

  // play mode: advance frames
  useEffect(() => {
    if (!playing || !sprite || sprite.frames.length < 2) return;
    const id = setInterval(() => {
      const st = useStore.getState();
      const len = st.activeSprite()?.frames.length ?? 0;
      if (len < 2) return;
      st.selectFrame((st.activeFrameIndex + 1) % len);
    }, 1000 / fps);
    return () => clearInterval(id);
  }, [playing, sprite?.id, fps]);

  useEffect(() => {
    if (!playing && sprite && activeFrameIndex > sprite.frames.length - 1) selectFrame(0);
  }, [playing, sprite, activeFrameIndex, selectFrame]);

  const width = (sprite?.width ?? 0) * zoom;
  const height = (sprite?.height ?? 0) * zoom;

  const checker = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = zoom;
    const cx = c.getContext("2d")!;
    cx.fillStyle = "#e8e5dc";
    cx.fillRect(0, 0, zoom, zoom);
    cx.fillStyle = "#d8d5cc";
    cx.fillRect(0, 0, Math.ceil(zoom / 2), Math.ceil(zoom / 2));
    cx.fillRect(Math.ceil(zoom / 2), Math.ceil(zoom / 2), Math.ceil(zoom / 2), Math.ceil(zoom / 2));
    return c;
  }, [zoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sprite) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const pattern = ctx.createPattern(checker, "repeat");
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const frame = sprite.frames[activeFrameIndex];
    if (!frame) return;

    // Onion skin shows both adjacent cels, so it remains useful on the first
    // and last frames instead of silently doing nothing at the timeline edges.
    if (onion && sprite.frames.length > 1) {
      const ghostFrames = [
        activeFrameIndex > 0 ? { frame: sprite.frames[activeFrameIndex - 1], alpha: 0.24 } : null,
        activeFrameIndex < sprite.frames.length - 1
          ? { frame: sprite.frames[activeFrameIndex + 1], alpha: 0.15 }
          : null,
      ];
      for (const ghost of ghostFrames) {
        if (!ghost) continue;
        ctx.globalAlpha = ghost.alpha;
        for (let y = 0; y < sprite.height; y++)
          for (let x = 0; x < sprite.width; x++) {
            const p = ghost.frame.pixels[y * sprite.width + x];
            if (p === TRANSPARENT || !project.palette[p]) continue;
            ctx.fillStyle = project.palette[p];
            ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
          }
      }
      ctx.globalAlpha = 1;
    }

    for (let y = 0; y < sprite.height; y++)
      for (let x = 0; x < sprite.width; x++) {
        const p = frame.pixels[y * sprite.width + x];
        if (p === TRANSPARENT || !project.palette[p]) continue;
        ctx.fillStyle = project.palette[p];
        ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
      }

    const preview =
      agentPresence?.spriteId === sprite.id && agentPresence.frameIndex === activeFrameIndex
        ? agentPresence.preview
        : [];
    if (preview.length) {
      ctx.globalAlpha = 0.78;
      for (const cell of preview) {
        if (cell.x < 0 || cell.y < 0 || cell.x >= sprite.width || cell.y >= sprite.height) continue;
        if (cell.color === null) {
          if (pattern) {
            ctx.fillStyle = pattern;
            ctx.fillRect(cell.x * zoom, cell.y * zoom, zoom, zoom);
          }
        } else {
          ctx.fillStyle = cell.color;
          ctx.fillRect(cell.x * zoom, cell.y * zoom, zoom, zoom);
        }
      }
      ctx.globalAlpha = 1;
    }

    if (showGrid) {
      ctx.strokeStyle = "rgba(32,35,59,0.28)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= sprite.width; x++) {
        ctx.moveTo(x * zoom + 0.5, 0);
        ctx.lineTo(x * zoom + 0.5, canvas.height);
      }
      for (let y = 0; y <= sprite.height; y++) {
        ctx.moveTo(0, y * zoom + 0.5);
        ctx.lineTo(canvas.width, y * zoom + 0.5);
      }
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
    }
  }, [sprite, project.palette, activeFrameIndex, zoom, onion, showGrid, checker, agentPresence]);

  function cellFromEvent(e: React.PointerEvent<HTMLCanvasElement>): [number, number] | null {
    const canvas = canvasRef.current;
    if (!canvas || !sprite) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * sprite.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * sprite.height);
    if (x < 0 || y < 0 || x >= sprite.width || y >= sprite.height) return null;
    return [x, y];
  }

  function applyAt(cell: [number, number], erase: boolean) {
    if (!sprite) return;
    const frame = sprite.frames[useStore.getState().activeFrameIndex];
    const [x, y] = cell;
    if (tool === "picker" && !erase) {
      const p = frame?.pixels[y * sprite.width + x];
      if (p !== undefined && p !== TRANSPARENT) setColor(p);
      return;
    }
    if (tool === "fill" && !erase) {
      floodFillAt(x, y, colorIdx);
      return;
    }
    const idx = tool === "eraser" || erase ? TRANSPARENT : colorIdx;
    setColorAt(x, y, idx);
  }

  if (!sprite)
    return <div className="stage empty">No sprite selected</div>;

  return (
    <div className="stage">
      <div className="stage-header">
        <div>
          <strong>{sprite.name}</strong>
        </div>
        <span className="stage-size">{sprite.width} × {sprite.height} px</span>
      </div>
      <div className="stage-canvas-wrap">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="stage-canvas"
          aria-label={`${sprite.name} pixel canvas`}
          style={{
            imageRendering: "pixelated",
            cursor:
              tool === "picker" ? "crosshair" : tool === "fill" ? "cell" : "crosshair",
          }}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            const cell = cellFromEvent(e);
            if (!cell) return;
            const erase = e.button === 2;
            dragging.current = true;
            lastCell.current = cell;
            if (tool === "pencil" || tool === "eraser") useStore.getState().beginStroke();
            applyAt(cell, erase);
          }}
          onPointerMove={(e) => {
            const cell = cellFromEvent(e);
            useEditor.getState().setHover(cell ? { x: cell[0], y: cell[1] } : null);
            if (!dragging.current || !cell) return;
            if (e.buttons === 0) {
              dragging.current = false;
              useStore.getState().endStroke();
              return;
            }
            const erase = e.buttons === 2;
            if (
              tool !== "fill" &&
              tool !== "picker" &&
              lastCell.current &&
              (lastCell.current[0] !== cell[0] || lastCell.current[1] !== cell[1])
            ) {
              const idx = tool === "eraser" || erase ? TRANSPARENT : colorIdx;
              drawLine(lastCell.current, cell, idx);
            }
            lastCell.current = cell;
          }}
          onPointerUp={() => {
            dragging.current = false;
            lastCell.current = null;
            useStore.getState().endStroke();
          }}
          onPointerCancel={() => {
            dragging.current = false;
            lastCell.current = null;
            useStore.getState().endStroke();
          }}
          onPointerLeave={() => useEditor.getState().setHover(null)}
        />
        <div
          className="canvas-agent-overlay"
          aria-hidden="true"
          style={{
            left: `${canvasBox.left}px`,
            top: `${canvasBox.top}px`,
            width: `${canvasBox.width}px`,
            height: `${canvasBox.height}px`,
            ["--cell-width" as string]: `${100 / sprite.width}%`,
            ["--cell-height" as string]: `${100 / sprite.height}%`,
          }}
        >
          {agentPresence && agentPresence.spriteId === sprite.id && agentPresence.frameIndex === activeFrameIndex && (
            <AgentCursor presence={agentPresence} sprite={sprite} />
          )}
          {remotePeers
            .filter((peer) => peer.spriteId === sprite.id && peer.frameIndex === activeFrameIndex)
            .map((peer) => <AgentCursor key={peer.id} presence={peer} sprite={sprite} />)}
        </div>
      </div>
      <div className="stage-footer">
        <span className="stage-frame-readout">
          Frame <strong>{Math.min(activeFrameIndex + 1, sprite.frames.length)}</strong> / {sprite.frames.length}
        </span>
        <span className="stage-hint">{showGrid ? "Grid on" : "Grid off"} · {fps} fps</span>
        <div className="stage-actions">
          <button
            className={onion ? "hud-btn active" : "hud-btn"}
            disabled={sprite.frames.length < 2}
            onClick={() => useEditor.getState().toggleOnion()}
            title={sprite.frames.length < 2 ? "Add another frame to use onion skin" : "Toggle onion skin"}
            aria-pressed={onion}
          >
            Onion
          </button>
          <button
            className={playing ? "hud-btn active" : "hud-btn"}
            disabled={sprite.frames.length < 2}
            onClick={() => setPlaying(!playing)}
            title="Preview animation"
          >
            {playing ? "Pause" : "Preview"}
          </button>
        </div>
      </div>
    </div>
  );
}

type CursorPresence = Pick<RoomPresence, "id" | "name" | "kind" | "color" | "status" | "cursor" | "progress" | "message"> & {
  spriteId: string | null;
  frameIndex: number;
};

function AgentCursor({ presence, sprite }: { presence: CursorPresence | AgentPresenceState; sprite: { id: string; width: number; height: number } }) {
  if (!presence.cursor) return null;
  const left = ((presence.cursor.x + 0.5) / sprite.width) * 100;
  const top = ((presence.cursor.y + 0.5) / sprite.height) * 100;
  const status = presence.status === "idle" ? "" : presence.status;
  return (
    <div
      className={`canvas-agent-cursor ${("kind" in presence && presence.kind === "agent") || "actionId" in presence ? "agent" : "human"}`}
      style={{
        left: `${left}%`,
        top: `${top}%`,
        ["--cursor-color" as string]: "color" in presence ? presence.color : "#e95d55",
        ["--cursor-width" as string]: `${100 / sprite.width}%`,
        ["--cursor-height" as string]: `${100 / sprite.height}%`,
      }}
    >
      <span className="canvas-agent-cell" />
      <span className="canvas-agent-label">
        <i />
        {presence.name}
        {status && <small>{status}</small>}
      </span>
    </div>
  );
}
