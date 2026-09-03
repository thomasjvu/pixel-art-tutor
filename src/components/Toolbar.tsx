import { useRef } from "react";
import { Icon } from "./Icon";
import { useEditor } from "../store/editorStore";
import { useStore } from "../store/projectStore";
import { useUi } from "../store/uiStore";
import { redoProject, undoProject } from "../realtime/roomClient";
import type { ToolName } from "../store/editorStore";

const TOOLS: { id: ToolName; icon: string; label: string; key: string }[] = [
  { id: "pencil", icon: "mingcute:pencil", label: "Pencil", key: "B" },
  { id: "eraser", icon: "mingcute:eraser", label: "Eraser", key: "E" },
  { id: "fill", icon: "mingcute:bucket", label: "Fill", key: "G" },
  { id: "picker", icon: "mingcute:eye", label: "Pick", key: "I" },
  { id: "select", icon: "mingcute:cursor", label: "Select", key: "V" },
];

export function Toolbar() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const colorIdx = useEditor((s) => s.colorIdx);
  const setColor = useEditor((s) => s.setColor);
  const zoom = useEditor((s) => s.zoom);
  const setZoom = useEditor((s) => s.setZoom);
  const showGrid = useEditor((s) => s.showGrid);
  const setShowGrid = useEditor((s) => s.setShowGrid);
  const onion = useEditor((s) => s.onion);
  const toggleOnion = useEditor((s) => s.toggleOnion);
  const pixelPerfect = useEditor((s) => s.pixelPerfect);
  const setPixelPerfect = useEditor((s) => s.setPixelPerfect);
  const shadingMode = useEditor((s) => s.shadingMode);
  const setShadingMode = useEditor((s) => s.setShadingMode);
  const tiledMode = useEditor((s) => s.tiledMode);
  const setTiledMode = useEditor((s) => s.setTiledMode);
  const brushMode = useEditor((s) => s.brushMode);
  const setBrushMode = useEditor((s) => s.setBrushMode);
  const palette = useStore((s) => s.project.palette);
  const onionAvailable = useStore((s) => (s.activeSprite()?.frames.length ?? 0) > 1);
  const past = useStore((s) => s.past.length);
  const future = useStore((s) => s.future.length);
  const roomStatus = useUi((s) => s.roomStatus);
  const roomCanUndo = useUi((s) => s.roomCanUndo);
  const roomCanRedo = useUi((s) => s.roomCanRedo);
  const sharedRoom = roomStatus === "connected";
  const colorInputRef = useRef<HTMLInputElement>(null);
  const currentHex = /^#[0-9a-f]{6}$/i.test(palette[colorIdx] ?? "") ? (palette[colorIdx] as string) : "#38b764";

  function pickCustomColor(hex: string) {
    const result = useStore.getState().addPaletteColor(hex);
    if ("index" in result) setColor(result.index);
  }

  return (
    <aside className="toolbar" aria-label="Pixel tools">
      <span className="toolbar-label-row">
        <span className="toolbar-label">Tools</span>
        <button
          className="rail-hide"
          onClick={() => useEditor.getState().setToolbarOpen(false)}
          title="Hide toolbar"
          aria-label="Hide toolbar"
        >
          <Icon icon="mingcute:back-2" />
        </button>
      </span>
      <div className="tool-grid">
        {TOOLS.map((item) => (
          <button
            key={item.id}
            className={tool === item.id ? "tool-btn active" : "tool-btn"}
            onClick={() => setTool(item.id)}
            title={`${item.label} (${item.key}) — right-click always erases`}
            aria-label={`${item.label} tool`}
            aria-pressed={tool === item.id}
          >
            <Icon icon={item.icon} />
            <span className="tool-key">{item.key}</span>
          </button>
        ))}
      </div>

      <div className="toolbar-rule" />

      <div className="toolbar-action-row">
        <button className="tool-btn" onClick={undoProject} disabled={sharedRoom ? !roomCanUndo : !past} title="Undo (Ctrl/Cmd+Z)">
          <Icon icon="mingcute:undo-2" />
        </button>
        <button className="tool-btn" onClick={redoProject} disabled={sharedRoom ? !roomCanRedo : !future} title="Redo (Ctrl/Cmd+Y)">
          <Icon icon="mingcute:redo-2" />
        </button>
      </div>

      <div className="toolbar-toggle-stack">
        <button
          className={showGrid ? "tool-toggle active" : "tool-toggle"}
          onClick={() => setShowGrid(!showGrid)}
          title="Toggle pixel grid"
          aria-pressed={showGrid}
        >
          <Icon icon="mingcute:grid-2" />
          <span>Grid</span>
        </button>
        <button
          className={onion ? "tool-toggle active" : "tool-toggle"}
          disabled={!onionAvailable}
          onClick={toggleOnion}
          title={onionAvailable ? "Toggle onion skin" : "Add another frame to use onion skin"}
          aria-pressed={onion}
        >
          <Icon icon="mingcute:layers" />
          <span>Onion</span>
        </button>
        <button
          className={pixelPerfect ? "tool-toggle active" : "tool-toggle"}
          onClick={() => setPixelPerfect(!pixelPerfect)}
          title="Use pixel-perfect connected strokes"
          aria-pressed={pixelPerfect}
        >
          <Icon icon="mingcute:magic-2" />
          <span>Pixel perfect</span>
        </button>
        <button
          className={shadingMode ? "tool-toggle active" : "tool-toggle"}
          onClick={() => setShadingMode(!shadingMode)}
          title="Choose a nearby palette shade while painting"
          aria-pressed={shadingMode}
        >
          <Icon icon="mingcute:sun" />
          <span>Shading ink</span>
        </button>
        <button
          className={tiledMode ? "tool-toggle active" : "tool-toggle"}
          onClick={() => setTiledMode(!tiledMode)}
          title="Preview the canvas as a repeating tile"
          aria-pressed={tiledMode}
        >
          <Icon icon="mingcute:grid-2" />
          <span>Tiled</span>
        </button>
        <button
          className={brushMode !== "solid" ? "tool-toggle active" : "tool-toggle"}
          onClick={() => setBrushMode(brushMode === "solid" ? "checker" : "solid")}
          title="Use a checker dither brush for pixel shading"
          aria-pressed={brushMode !== "solid"}
        >
          <Icon icon="mingcute:magic-2" />
          <span>{brushMode === "dots" ? "Dot brush" : "Dither brush"}</span>
        </button>
      </div>

      <button
        className="toolbar-colors picker"
        title="Pick a custom color (adds it to the palette)"
        aria-label="Pick a custom color"
        onClick={() => colorInputRef.current?.click()}
      >
        <span className="color-back" />
        <span
          className="color-front"
          style={{ background: palette[colorIdx] ?? "#38b764" }}
        />
        <span className="color-index">{String(colorIdx).padStart(2, "0")}</span>
        <input
          ref={colorInputRef}
          type="color"
          hidden
          value={currentHex}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => pickCustomColor(e.target.value)}
          aria-hidden="true"
          tabIndex={-1}
        />
      </button>

      <div className="toolbar-spacer" />

      <div className="zoom-control">
        <span className="zoom-label">Zoom</span>
        <button className="zoom-button" onClick={() => setZoom(zoom - 1)} title="Zoom out" aria-label="Zoom out">
          −
        </button>
        <span>{zoom}px</span>
        <button className="zoom-button" onClick={() => setZoom(zoom + 1)} title="Zoom in" aria-label="Zoom in">
          +
        </button>
      </div>
    </aside>
  );
}
