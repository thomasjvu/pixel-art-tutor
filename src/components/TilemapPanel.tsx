import { useEffect, useRef, useState } from "react";
import { useStore } from "../store/projectStore";
import { SpriteThumb } from "./SpriteThumb";
import { TRANSPARENT } from "../types";

export function TilemapPanel() {
  const project = useStore((s) => s.project);
  const ensureTilemap = useStore((s) => s.ensureTilemap);
  const placeTile = useStore((s) => s.placeTile);
  const fillTiles = useStore((s) => s.fillTiles);
  const addSprite = useStore((s) => s.addSprite);

  const tiles = project.sprites.filter((sp) => sp.kind === "tile");
  const [pickedTile, setPickedTile] = useState<string | null>(null);
  const [eraseMode, setEraseMode] = useState(false);
  const selected =
    pickedTile && tiles.some((t) => t.id === pickedTile) ? pickedTile : tiles[0]?.id ?? null;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const painting = useRef<false | "paint" | "erase">(false);

  const tm = project.tilemap;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !tm) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const CELL = canvas.width / tm.cols;
    const spriteById = new Map(project.sprites.map((sp) => [sp.id, sp]));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < tm.rows; y++)
      for (let x = 0; x < tm.cols; x++) {
        const id = tm.cells[y * tm.cols + x];
        // cell background
        ctx.fillStyle = (x + y) % 2 === 0 ? "#e8e5dc" : "#d8d5cc";
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        if (!id) continue;
        const sprite = spriteById.get(id);
        if (!sprite) continue;
        const frame = sprite.frames[0];
        const scale = CELL / sprite.width;
        for (let py = 0; py < sprite.height; py++)
          for (let px = 0; px < sprite.width; px++) {
            const p = frame.pixels[py * sprite.width + px];
            if (p === TRANSPARENT || !project.palette[p]) continue;
            ctx.fillStyle = project.palette[p];
            ctx.fillRect(
              Math.floor((x * CELL + px * scale)),
              Math.floor((y * CELL + py * scale)),
              Math.ceil(scale),
              Math.ceil(scale),
            );
          }
      }
    ctx.strokeStyle = "rgba(40,50,74,0.12)";
    ctx.beginPath();
    for (let x = 0; x <= tm.cols; x++) {
      ctx.moveTo(x * CELL + 0.5, 0);
      ctx.lineTo(x * CELL + 0.5, canvas.height);
    }
    for (let y = 0; y <= tm.rows; y++) {
      ctx.moveTo(0, y * CELL + 0.5);
      ctx.lineTo(canvas.width, y * CELL + 0.5);
    }
    ctx.stroke();
  }, [tm, project.sprites, project.palette]);

  function cellFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!tm) return null;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * tm.cols);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * tm.rows);
    if (x < 0 || y < 0 || x >= tm.cols || y >= tm.rows) return null;
    return [x, y] as const;
  }

  if (!tm)
    return (
      <div className="panel">
        <p className="hint">No tilemap yet.</p>
        <button className="primary-btn" onClick={() => ensureTilemap(12, 9)}>
          Create 12×9 tilemap
        </button>
      </div>
    );

  return (
    <div className="panel">
      <canvas
        ref={canvasRef}
        width={432}
        height={(432 / tm.cols) * tm.rows}
        className="tilemap-canvas"
        style={{ imageRendering: "pixelated", touchAction: "none" }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const cell = cellFromEvent(e);
          if (!cell) return;
          const erase = e.button === 2 || eraseMode;
          painting.current = erase ? "erase" : "paint";
          useStore.getState().beginStroke();
          placeTile(cell[0], cell[1], erase ? null : selected);
        }}
        onPointerMove={(e) => {
          if (!painting.current) return;
          const cell = cellFromEvent(e);
          if (!cell) return;
          placeTile(cell[0], cell[1], painting.current === "erase" ? null : selected);
        }}
        onPointerUp={() => {
          painting.current = false;
          useStore.getState().endStroke();
        }}
        onPointerCancel={() => {
          painting.current = false;
          useStore.getState().endStroke();
        }}
      />
      <div className="panel-row wrap">
        {tiles.map((t) => (
          <button
            key={t.id}
            className={t.id === selected && !eraseMode ? "tile-pick active" : "tile-pick"}
            title={t.name}
            onClick={() => {
              setPickedTile(t.id);
              setEraseMode(false);
            }}
          >
            <SpriteThumb sprite={t} palette={project.palette} size={32} />
          </button>
        ))}
        <button
          className={eraseMode ? "tool-btn active" : "tool-btn"}
          onClick={() => setEraseMode(!eraseMode)}
          title="Eraser mode (or right-click)"
        >
          🧽
        </button>
        <button
          className="text-btn"
          onClick={() => addSprite({ name: `Tile ${tiles.length + 1}`, width: 16, height: 16, kind: "tile" })}
          title="Add a new blank tile to the tileset"
        >
          + Tile
        </button>
      </div>
      <div className="panel-row">
        <label className="field">
          <span>Cols</span>
          <input
            type="number"
            min={2}
            max={64}
            value={tm.cols}
            onChange={(e) => ensureTilemap(Number(e.target.value) || tm.cols, tm.rows)}
          />
        </label>
        <label className="field">
          <span>Rows</span>
          <input
            type="number"
            min={2}
            max={64}
            value={tm.rows}
            onChange={(e) => ensureTilemap(tm.cols, Number(e.target.value) || tm.rows)}
          />
        </label>
        <button
          className="text-btn"
          onClick={() =>
            fillTiles(0, 0, tm.cols, tm.rows, eraseMode ? null : selected ?? null)
          }
        >
          Fill all
        </button>
      </div>
      <p className="hint">Paint with a tile, right-click erases. Agents can paint via place_tile / fill_tiles.</p>
    </div>
  );
}
