import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store/projectStore";
import { useEditor } from "../store/editorStore";
import { TRANSPARENT } from "../types";

export function CanvasStage() {
  const project = useStore((s) => s.project);
  const activeFrameIndex = useStore((s) => s.activeFrameIndex);
  const setColorAt = useStore((s) => s.setColorAt);
  const drawLine = useStore((s) => s.drawLine);
  const floodFillAt = useStore((s) => s.floodFillAt);
  const selectFrame = useStore((s) => s.selectFrame);

  const { tool, colorIdx, zoom, onion, playing } = useEditor();
  const setColor = useEditor((s) => s.setColor);
  const setPlaying = useEditor((s) => s.setPlaying);

  const sprite = useStore((s) => s.activeSprite());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragging, setDragging] = useState(false);
  const lastCell = useRef<[number, number] | null>(null);

  // play mode: advance frames
  useEffect(() => {
    if (!playing || !sprite || sprite.frames.length < 2) return;
    const id = setInterval(() => {
      const st = useStore.getState();
      st.selectFrame((st.activeFrameIndex + 1) % (sprite.frames.length));
    }, 220);
    return () => clearInterval(id);
  }, [playing, sprite]);

  useEffect(() => {
    if (!playing && sprite && activeFrameIndex > sprite.frames.length - 1) selectFrame(0);
  }, [playing, sprite, activeFrameIndex, selectFrame]);

  const width = (sprite?.width ?? 0) * zoom;
  const height = (sprite?.height ?? 0) * zoom;

  const checker = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = zoom;
    const cx = c.getContext("2d")!;
    cx.fillStyle = "#232733";
    cx.fillRect(0, 0, zoom, zoom);
    cx.fillStyle = "#2a2f3d";
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

    // onion skin: previous frame ghost
    if (onion && activeFrameIndex > 0) {
      const prev = sprite.frames[activeFrameIndex - 1];
      ctx.globalAlpha = 0.22;
      for (let y = 0; y < sprite.height; y++)
        for (let x = 0; x < sprite.width; x++) {
          const p = prev.pixels[y * sprite.width + x];
          if (p === TRANSPARENT || !project.palette[p]) continue;
          ctx.fillStyle = project.palette[p];
          ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
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

    if (zoom >= 10) {
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
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
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
    }
  }, [sprite, project.palette, activeFrameIndex, zoom, onion, checker]);

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
      <div className="stage-canvas-wrap">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="stage-canvas"
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
            setDragging(true);
            lastCell.current = cell;
            applyAt(cell, erase);
          }}
          onPointerMove={(e) => {
            const cell = cellFromEvent(e);
            useEditor.getState().setHover(cell ? { x: cell[0], y: cell[1] } : null);
            if (!dragging || !cell) return;
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
            setDragging(false);
            lastCell.current = null;
          }}
          onPointerLeave={() => useEditor.getState().setHover(null)}
        />
      </div>
      <div className="stage-hud">
        <button
          className={playing ? "hud-btn active" : "hud-btn"}
          disabled={sprite.frames.length < 2}
          onClick={() => setPlaying(!playing)}
          title="Preview animation"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <span className="hud-info">
          {sprite.name} · {sprite.width}×{sprite.height} · frame{" "}
          {Math.min(activeFrameIndex + 1, sprite.frames.length)}/{sprite.frames.length}
        </span>
        <button
          className={onion ? "hud-btn active" : "hud-btn"}
          onClick={() => useEditor.getState().toggleOnion()}
          title="Onion skin (ghost previous frame)"
        >
          Onion
        </button>
      </div>
    </div>
  );
}
