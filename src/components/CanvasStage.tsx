import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store/projectStore";
import { useEditor } from "../store/editorStore";
import { useUi, type AgentPresenceState } from "../store/uiStore";
import type { RoomPresence } from "../realtime/protocol";
import { spriteLayers, TRANSPARENT } from "../types";

function colorLuma(hex: string | undefined): number {
  if (!hex) return 0;
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return (Number.isFinite(r) ? r : 0) * 0.299 + (Number.isFinite(g) ? g : 0) * 0.587 + (Number.isFinite(b) ? b : 0) * 0.114;
}

function shadingIndex(frame: { pixels: number[] } | undefined, palette: string[], width: number, x: number, y: number, requested: number): number {
  const current = frame?.pixels[y * width + x];
  if (current === undefined || current < 0 || !palette[current]) return requested;
  const direction = colorLuma(palette[requested]) >= colorLuma(palette[current]) ? 1 : -1;
  const target = colorLuma(palette[current]) + direction * 28;
  let best = requested;
  let distance = Number.POSITIVE_INFINITY;
  palette.forEach((hex, index) => {
    if (index === current) return;
    const nextDistance = Math.abs(colorLuma(hex) - target);
    if (nextDistance < distance) {
      distance = nextDistance;
      best = index;
    }
  });
  return best;
}

export function CanvasStage() {
  const project = useStore((s) => s.project);
  const activeFrameIndex = useStore((s) => s.activeFrameIndex);
  const setColorAt = useStore((s) => s.setColorAt);
  const drawLine = useStore((s) => s.drawLine);
  const floodFillAt = useStore((s) => s.floodFillAt);
  const selectFrame = useStore((s) => s.selectFrame);

  const {
    tool,
    colorIdx,
    zoom,
    onion,
    onionMode,
    showGrid,
    fps,
    playing,
    playbackMode,
    playbackTagId,
    pixelPerfect,
    brushMode,
    shadingMode,
    tiledMode,
    layerLocked: editorLayerLocked,
  } = useEditor();
  const setColor = useEditor((s) => s.setColor);
  const setZoom = useEditor((s) => s.setZoom);
  const setPlaying = useEditor((s) => s.setPlaying);
  const activeLayerId = useEditor((s) => s.activeLayerId);
  const setActiveLayerId = useEditor((s) => s.setActiveLayerId);
  const setLayerLocked = useEditor((s) => s.setLayerLocked);
  const setLayerVisible = useEditor((s) => s.setLayerVisible);
  const selection = useEditor((s) => s.selection);
  const setSelection = useEditor((s) => s.setSelection);

  const sprite = useStore((s) => s.activeSprite());
  const layers = useMemo(() => (sprite ? spriteLayers(sprite) : []), [sprite]);
  const activeLayer = useMemo(
    () => layers.find((layer) => layer.id === activeLayerId) ?? layers[0],
    [activeLayerId, layers],
  );
  const layerLocked = activeLayer?.locked ?? editorLayerLocked;
  const layerVisible = activeLayer?.visible ?? true;
  const agentPresence = useUi((s) => s.agentPresence);
  const roomPeers = useUi((s) => s.roomPeers);
  const remotePeers = useMemo(() => Object.values(roomPeers), [roomPeers]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);
  const [canvasBox, setCanvasBox] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const displayCellSize = zoom;
  const lastCell = useRef<[number, number] | null>(null);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [moveDrag, setMoveDrag] = useState<{ ox: number; oy: number; dx: number; dy: number } | null>(null);

  useEffect(() => {
    if (!activeLayer) return;
    if (activeLayerId !== activeLayer.id) setActiveLayerId(activeLayer.id);
    if (editorLayerLocked !== activeLayer.locked) setLayerLocked(activeLayer.locked);
    if (useEditor.getState().layerVisible !== activeLayer.visible) setLayerVisible(activeLayer.visible);
  }, [activeLayer, activeLayerId, editorLayerLocked, setActiveLayerId, setLayerLocked, setLayerVisible]);

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
  }, [displayCellSize]);

  // Play the active tag (or the whole active layer) with an explicit playback
  // mode. The ref keeps ping-pong direction stable between ticks without
  // making every tick a React render.
  const playbackDirection = useRef<1 | -1>(1);
  useEffect(() => {
    if (!playing || !sprite || !activeLayer || activeLayer.frames.length < 2) return;
    const tag = sprite.frameTags?.find((entry) => entry.id === playbackTagId);
    const from = tag ? Math.min(tag.from, activeLayer.frames.length - 1) : 0;
    const to = tag ? Math.min(tag.to, activeLayer.frames.length - 1) : activeLayer.frames.length - 1;
    playbackDirection.current = playbackMode === "reverse" ? -1 : 1;
    const id = setInterval(() => {
      const st = useStore.getState();
      const current = st.activeFrameIndex;
      let next = current;
      if (playbackMode === "reverse") {
        next = current <= from ? to : current - 1;
      } else if (playbackMode === "ping_pong") {
        if (current >= to) playbackDirection.current = -1;
        if (current <= from) playbackDirection.current = 1;
        next = current + playbackDirection.current;
      } else {
        next = current >= to ? from : current + 1;
      }
      st.selectFrame(Math.max(from, Math.min(to, next)));
    }, 1000 / fps);
    return () => clearInterval(id);
  }, [playing, sprite, activeLayer, playbackTagId, playbackMode, fps]);

  useEffect(() => {
    if (!playing && activeLayer && activeFrameIndex > activeLayer.frames.length - 1) selectFrame(0);
  }, [playing, activeLayer, activeFrameIndex, selectFrame]);

  const width = (sprite?.width ?? 0) * displayCellSize;
  const height = (sprite?.height ?? 0) * displayCellSize;
  const canvasWidth = tiledMode ? width * 3 : width;
  const canvasHeight = tiledMode ? height * 3 : height;

  // Fine-grained neutral checker so transparency reads without shouting,
  // independent of zoom (a zoom-sized checker turns into a waffle).
  const checker = useMemo(() => {
    const cell = 8;
    const c = document.createElement("canvas");
    c.width = c.height = cell * 2;
    const cx = c.getContext("2d")!;
    cx.fillStyle = "#0b0b0b";
    cx.fillRect(0, 0, cell * 2, cell * 2);
    cx.fillStyle = "#151515";
    cx.fillRect(0, 0, cell, cell);
    cx.fillRect(cell, cell, cell, cell);
    return c;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sprite) return;
    const ctx = canvas.getContext("2d")!;
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const pattern = ctx.createPattern(checker, "repeat");
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const frame = activeLayer?.frames[Math.min(activeFrameIndex, (activeLayer?.frames.length ?? 1) - 1)];
    if (!frame || !activeLayer) return;

    function drawFramePixels(frameToDraw: { pixels: number[] }, opacity: number, blendMode: GlobalCompositeOperation = "source-over") {
      ctx.globalCompositeOperation = blendMode;
      for (let y = 0; y < sprite.height; y++)
        for (let x = 0; x < sprite.width; x++) {
          const p = frameToDraw.pixels[y * sprite.width + x];
          if (p === TRANSPARENT || !project.palette[p]) continue;
          ctx.globalAlpha = opacity * (project.paletteAlpha?.[p] ?? 1);
          ctx.fillStyle = project.palette[p];
          ctx.fillRect(x * displayCellSize, y * displayCellSize, displayCellSize, displayCellSize);
        }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }

    function drawOnionFrame(frameToDraw: { pixels: number[] }, color: string, alpha: number) {
      for (let y = 0; y < sprite.height; y++)
        for (let x = 0; x < sprite.width; x++) {
          const p = frameToDraw.pixels[y * sprite.width + x];
          if (p === TRANSPARENT || !project.palette[p]) continue;
          ctx.globalAlpha = alpha * (project.paletteAlpha?.[p] ?? 1);
          ctx.fillStyle = color;
          ctx.fillRect(x * displayCellSize, y * displayCellSize, displayCellSize, displayCellSize);
        }
      ctx.globalAlpha = 1;
    }

    // Onion skin shows adjacent cels underneath the composite. Red/blue mode
    // keeps the direction of motion legible even when the palette is dark.
    if (onion && activeLayer.frames.length > 1 && layerVisible) {
      const previous = activeFrameIndex > 0 ? activeLayer.frames[activeFrameIndex - 1] : null;
      const following = activeFrameIndex < activeLayer.frames.length - 1 ? activeLayer.frames[activeFrameIndex + 1] : null;
      if (onionMode === "red_blue") {
        if (previous) drawOnionFrame(previous, "#ff4d5a", 0.3);
        if (following) drawOnionFrame(following, "#4d8dff", 0.22);
      } else {
        if (previous) drawFramePixels(previous, 0.24);
        if (following) drawFramePixels(following, 0.15);
      }
    }

    // Composite visible layers from bottom to top. Canvas blend modes mirror
    // the small set exposed by the layer inspector.
    for (const layer of layers) {
      if (!layer.visible) continue;
      const layerFrame = layer.frames[Math.min(activeFrameIndex, layer.frames.length - 1)];
      if (layerFrame) {
        const blendMode: GlobalCompositeOperation = layer.blendMode === "normal" ? "source-over" : layer.blendMode;
        drawFramePixels(layerFrame, layer.opacity, blendMode);
      }
    }

    const preview =
      agentPresence?.spriteId === sprite.id && agentPresence.frameIndex === activeFrameIndex
        ? agentPresence.preview
        : [];

    // Select-tool move preview: lift the selection, redraw it at the drag
    // offset. The commit happens once on pointer-up via movePixels.
    if (
      moveDrag &&
      (moveDrag.dx !== 0 || moveDrag.dy !== 0) &&
      selection &&
      selection.spriteId === sprite.id &&
      selection.frameIndex === activeFrameIndex
    ) {
      const sx0 = Math.max(0, selection.x);
      const sy0 = Math.max(0, selection.y);
      const sx1 = Math.min(sprite.width, selection.x + selection.width);
      const sy1 = Math.min(sprite.height, selection.y + selection.height);
      for (let y = sy0; y < sy1; y++)
        for (let x = sx0; x < sx1; x++) {
          if (pattern) {
            ctx.fillStyle = pattern;
            ctx.fillRect(x * displayCellSize, y * displayCellSize, displayCellSize, displayCellSize);
          }
          const p = frame.pixels[y * sprite.width + x];
          if (p === TRANSPARENT || !project.palette[p]) continue;
          const nx = x + moveDrag.dx;
          const ny = y + moveDrag.dy;
          if (nx < 0 || ny < 0 || nx >= sprite.width || ny >= sprite.height) continue;
          ctx.globalAlpha = activeLayer.opacity * (project.paletteAlpha?.[p] ?? 1);
          ctx.fillStyle = project.palette[p];
          ctx.fillRect(nx * displayCellSize, ny * displayCellSize, displayCellSize, displayCellSize);
        }
      ctx.globalAlpha = 1;
    }

    if (layerVisible && preview.length) {
      ctx.globalAlpha = 0.78;
      for (const cell of preview) {
        if (cell.x < 0 || cell.y < 0 || cell.x >= sprite.width || cell.y >= sprite.height) continue;
        if (cell.color === null) {
          if (pattern) {
            ctx.fillStyle = pattern;
            ctx.fillRect(cell.x * displayCellSize, cell.y * displayCellSize, displayCellSize, displayCellSize);
          }
        } else {
          ctx.fillStyle = cell.color;
          ctx.fillRect(cell.x * displayCellSize, cell.y * displayCellSize, displayCellSize, displayCellSize);
        }
      }
      ctx.globalAlpha = 1;
    }

    // Live previews streamed by room peers: this is what makes agent paint
    // strokes appear one pixel at a time on watchers' screens, before the
    // committed edit lands as a room operation.
    const remotePreviews = remotePeers.filter(
      (peer) =>
        peer.spriteId === sprite.id &&
        peer.frameIndex === activeFrameIndex &&
        peer.preview.length > 0,
    );
    if (layerVisible && remotePreviews.length > 0) {
      ctx.globalAlpha = 0.6;
      for (const peer of remotePreviews) {
        for (const cell of peer.preview) {
          if (cell.x < 0 || cell.y < 0 || cell.x >= sprite.width || cell.y >= sprite.height) continue;
          if (cell.color === null) {
            if (pattern) {
              ctx.fillStyle = pattern;
              ctx.fillRect(cell.x * displayCellSize, cell.y * displayCellSize, displayCellSize, displayCellSize);
            }
          } else {
            ctx.fillStyle = cell.color;
            ctx.fillRect(cell.x * displayCellSize, cell.y * displayCellSize, displayCellSize, displayCellSize);
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    if (showGrid) {
      ctx.strokeStyle = "rgba(244,244,244,0.10)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= sprite.width; x++) {
        ctx.moveTo(x * displayCellSize + 0.5, 0);
        ctx.lineTo(x * displayCellSize + 0.5, canvas.height);
      }
      for (let y = 0; y <= sprite.height; y++) {
        ctx.moveTo(0, y * displayCellSize + 0.5);
        ctx.lineTo(canvas.width, y * displayCellSize + 0.5);
      }
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.24)";
      ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
    }
    if (tiledMode && width > 0 && height > 0) {
      const tile = ctx.getImageData(0, 0, width, height);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let tileY = 0; tileY < 3; tileY++) {
        for (let tileX = 0; tileX < 3; tileX++) {
          ctx.putImageData(tile, tileX * width, tileY * height);
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }, [sprite, layers, activeLayer, project.palette, project.paletteAlpha, activeFrameIndex, displayCellSize, onion, onionMode, layerVisible, showGrid, tiledMode, width, height, checker, agentPresence, moveDrag, selection, remotePeers]);

  function cellFromEvent(e: React.PointerEvent<HTMLCanvasElement>): [number, number] | null {
    const canvas = canvasRef.current;
    if (!canvas || !sprite) return null;
    const rect = canvas.getBoundingClientRect();
    const tileOffsetX = tiledMode ? width : 0;
    const tileOffsetY = tiledMode ? height : 0;
    const x = Math.floor(((e.clientX - rect.left - tileOffsetX) / width) * sprite.width);
    const y = Math.floor(((e.clientY - rect.top - tileOffsetY) / height) * sprite.height);
    if (x < 0 || y < 0 || x >= sprite.width || y >= sprite.height) return null;
    return [x, y];
  }

  function selectionForView() {
    if (!sprite || !selection) return null;
    if (
      selection.spriteId !== sprite.id ||
      (selection.layerId !== undefined && selection.layerId !== activeLayer?.id) ||
      selection.frameIndex !== activeFrameIndex
    ) return null;
    return selection;
  }

  function rectStyle(r: { x: number; y: number; width: number; height: number }) {
    if (!sprite) return {};
    return {
      left: `${(r.x / sprite.width) * 100}%`,
      top: `${(r.y / sprite.height) * 100}%`,
      width: `${(r.width / sprite.width) * 100}%`,
      height: `${(r.height / sprite.height) * 100}%`,
    };
  }

  function commitMarquee(m: { x0: number; y0: number; x1: number; y1: number }) {
    if (!sprite) return;
    if (m.x0 === m.x1 && m.y0 === m.y1) {
      setSelection(null);
      return;
    }
    const x = Math.min(m.x0, m.x1);
    const y = Math.min(m.y0, m.y1);
    setSelection({
      spriteId: sprite.id,
      layerId: activeLayer?.id,
      frameIndex: activeFrameIndex,
      x,
      y,
      width: Math.abs(m.x1 - m.x0) + 1,
      height: Math.abs(m.y1 - m.y0) + 1,
    });
  }

  function commitMoveDrag(d: { dx: number; dy: number }) {
    const s = selectionForView();
    if (!s || !sprite || (d.dx === 0 && d.dy === 0)) return;
    useStore.getState().movePixels(s, d.dx, d.dy);
    setSelection({
      ...s,
      x: Math.max(0, Math.min(sprite.width - s.width, s.x + d.dx)),
      y: Math.max(0, Math.min(sprite.height - s.height, s.y + d.dy)),
    });
  }

  function applyAt(cell: [number, number], erase: boolean) {
    if (!sprite || layerLocked) return;
    const currentLayer = spriteLayers(sprite).find((entry) => entry.id === useEditor.getState().activeLayerId) ?? spriteLayers(sprite)[0];
    const frame = currentLayer?.frames[useStore.getState().activeFrameIndex];
    const [x, y] = cell;
    if (tool === "picker" && !erase) {
      const p = frame?.pixels[y * sprite.width + x];
      if (p !== undefined && p !== TRANSPARENT) setColor(p);
      return;
    }
    if (tool === "fill" && !erase) {
      floodFillAt(x, y, colorIdx, undefined, undefined, currentLayer?.id);
      return;
    }
    if (!erase && brushMode === "checker" && (x + y) % 2 !== 0) return;
    if (!erase && brushMode === "dots" && (x % 2 !== 0 || y % 2 !== 0)) return;
    const idx = tool === "eraser" || erase
      ? TRANSPARENT
      : shadingMode
        ? shadingIndex(frame, useStore.getState().project.palette, sprite.width, x, y, colorIdx)
        : colorIdx;
    setColorAt(x, y, idx, currentLayer?.id);
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
      <div className="stage-canvas-scroll">
        <div
          className="stage-canvas-wrap"
          style={{ width: `${canvasWidth + 6}px`, height: `${canvasHeight + 6}px` }}
        >
          <canvas
          ref={canvasRef}
            width={canvasWidth}
            height={canvasHeight}
          className="stage-canvas"
          aria-label={`${sprite.name} pixel canvas`}
          style={{
            imageRendering: "pixelated",
            width: `${canvasWidth}px`,
            height: `${canvasHeight}px`,
            cursor: layerLocked
              ? "not-allowed"
              : tool === "picker" ? "crosshair" : tool === "fill" ? "cell" : "crosshair",
          }}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            if (layerLocked) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            const cell = cellFromEvent(e);
            if (!cell) return;
            if (tool === "select") {
              const s = selectionForView();
              if (
                s &&
                e.button !== 2 &&
                cell[0] >= s.x && cell[0] < s.x + s.width &&
                cell[1] >= s.y && cell[1] < s.y + s.height
              ) {
                dragging.current = true;
                setMoveDrag({ ox: cell[0], oy: cell[1], dx: 0, dy: 0 });
              } else {
                dragging.current = true;
                setMarquee({ x0: cell[0], y0: cell[1], x1: cell[0], y1: cell[1] });
              }
              return;
            }
            const erase = e.button === 2;
            dragging.current = true;
            lastCell.current = cell;
            if (tool === "pencil" || tool === "eraser") useStore.getState().beginStroke();
            applyAt(cell, erase);
          }}
          onPointerMove={(e) => {
            const cell = cellFromEvent(e);
            useEditor.getState().setHover(cell ? { x: cell[0], y: cell[1] } : null);
            if (layerLocked) return;
            if (!dragging.current || !cell) return;
            if (e.buttons === 0) {
              dragging.current = false;
              useStore.getState().endStroke();
              return;
            }
            if (tool === "select") {
              if (moveDrag) setMoveDrag({ ...moveDrag, dx: cell[0] - moveDrag.ox, dy: cell[1] - moveDrag.oy });
              else if (marquee) setMarquee({ ...marquee, x1: cell[0], y1: cell[1] });
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
              const lineColor = shadingMode && idx !== TRANSPARENT
                ? shadingIndex(
                    activeLayer?.frames[activeFrameIndex],
                    useStore.getState().project.palette,
                    sprite.width,
                    cell[0],
                    cell[1],
                    idx,
                  )
                : idx;
              drawLine(lastCell.current, cell, lineColor, activeLayer?.id, pixelPerfect, brushMode);
            }
            lastCell.current = cell;
          }}
          onPointerUp={() => {
            if (marquee) {
              commitMarquee(marquee);
              setMarquee(null);
            }
            if (moveDrag) {
              commitMoveDrag(moveDrag);
              setMoveDrag(null);
            }
            dragging.current = false;
            lastCell.current = null;
            useStore.getState().endStroke();
          }}
          onPointerCancel={() => {
            setMarquee(null);
            setMoveDrag(null);
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
            left: `${canvasBox.left + (tiledMode ? width : 0)}px`,
            top: `${canvasBox.top + (tiledMode ? height : 0)}px`,
            width: `${tiledMode ? width : canvasBox.width}px`,
            height: `${tiledMode ? height : canvasBox.height}px`,
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
          {(() => {
            const s = selectionForView();
            if (marquee) {
              const x = Math.min(marquee.x0, marquee.x1);
              const y = Math.min(marquee.y0, marquee.y1);
              return (
                <div
                  className="selection-marquee"
                  style={rectStyle({
                    x,
                    y,
                    width: Math.abs(marquee.x1 - marquee.x0) + 1,
                    height: Math.abs(marquee.y1 - marquee.y0) + 1,
                  })}
                />
              );
            }
            if (!s) return null;
            const dx = moveDrag?.dx ?? 0;
            const dy = moveDrag?.dy ?? 0;
            return (
              <div className="selection-outline" style={rectStyle({ ...s, x: s.x + dx, y: s.y + dy })} />
            );
          })()}
          </div>
        </div>
      </div>
      <div className="stage-footer">
        <span className="stage-frame-readout">
          Frame <strong>{Math.min(activeFrameIndex + 1, activeLayer?.frames.length ?? 0)}</strong> / {activeLayer?.frames.length ?? 0}
        </span>
        <span className="stage-hint">
          {showGrid ? "Grid on" : "Grid off"} · {fps} fps
        </span>
        <div className="stage-zoom-control" aria-label="Canvas zoom">
          <button
            className="zoom-step"
            onClick={() => setZoom(zoom - 1)}
            title="Zoom out"
            aria-label="Zoom out"
          >
            −
          </button>
          <span>{displayCellSize}px</span>
          <button
            className="zoom-step"
            onClick={() => setZoom(zoom + 1)}
            title="Zoom in"
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
        <div className="stage-actions">
          <button
            className={onion ? "hud-btn active" : "hud-btn"}
            disabled={(activeLayer?.frames.length ?? 0) < 2}
            onClick={() => useEditor.getState().toggleOnion()}
            title={(activeLayer?.frames.length ?? 0) < 2 ? "Add another frame to use onion skin" : "Toggle onion skin"}
            aria-pressed={onion}
          >
            Onion
          </button>
          <button
            className={playing ? "hud-btn active" : "hud-btn"}
            disabled={(activeLayer?.frames.length ?? 0) < 2}
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

type CursorPresence = Pick<RoomPresence, "id" | "name" | "kind" | "color" | "status" | "cursor" | "progress" | "message" | "preview"> & {
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
