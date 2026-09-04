import { useRef } from "react";
import { Icon } from "./Icon";
import { useEditor } from "../store/editorStore";
import { useStore } from "../store/projectStore";
import { useUi } from "../store/uiStore";
import { redoProject, undoProject } from "../realtime/roomClient";
import type { ToolName } from "../store/editorStore";
import { formatShortcut, usePreferences, type KeymapAction } from "../store/preferencesStore";

const TOOLS: { id: ToolName; icon: string; label: string; action: KeymapAction }[] = [
  { id: "pencil", icon: "mingcute:pencil", label: "Pencil", action: "pencil" },
  { id: "eraser", icon: "mingcute:eraser", label: "Eraser", action: "eraser" },
  { id: "fill", icon: "mingcute:bucket", label: "Fill", action: "fill" },
  { id: "picker", icon: "mingcute:eye", label: "Pick", action: "picker" },
  { id: "select", icon: "mingcute:cursor", label: "Select", action: "select" },
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
  const keymap = usePreferences((s) => s.keymap);

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
            title={`${item.label} (${formatShortcut(keymap[item.action])}) — right-click always erases`}
            data-tooltip={`${item.label} · ${formatShortcut(keymap[item.action])} · right-click erases`}
            aria-label={`${item.label} tool`}
            aria-pressed={tool === item.id}
          >
            <Icon icon={item.icon} />
            <span className="tool-key">{formatShortcut(keymap[item.action])}</span>
          </button>
        ))}
      </div>

      <div className="toolbar-rule" />

      <div className="toolbar-action-row">
        <button
          className="tool-btn"
          onClick={undoProject}
          disabled={sharedRoom ? !roomCanUndo : !past}
          title="Undo (Ctrl/Cmd+Z)"
          data-tooltip="Undo · Ctrl/Cmd+Z"
          aria-label="Undo"
        >
          <Icon icon="mingcute:undo-2" />
        </button>
        <button
          className="tool-btn"
          onClick={redoProject}
          disabled={sharedRoom ? !roomCanRedo : !future}
          title="Redo (Ctrl/Cmd+Y)"
          data-tooltip="Redo · Ctrl/Cmd+Y"
          aria-label="Redo"
        >
          <Icon icon="mingcute:redo-2" />
        </button>
      </div>

      <div className="toolbar-toggle-stack">
        <button
          className={showGrid ? "tool-toggle active" : "tool-toggle"}
          onClick={() => setShowGrid(!showGrid)}
          title="Toggle pixel grid"
          data-tooltip={`Grid · ${formatShortcut(keymap.toggleGrid)}`}
          aria-label="Toggle pixel grid"
          aria-pressed={showGrid}
        >
          <Icon icon="mingcute:grid-2" />
          <span className="tool-toggle-label">Grid</span>
          <span className="tool-shortcut">{formatShortcut(keymap.toggleGrid)}</span>
        </button>
        <button
          className={onion ? "tool-toggle active" : "tool-toggle"}
          disabled={!onionAvailable}
          onClick={toggleOnion}
          title={onionAvailable ? "Toggle onion skin" : "Add another frame to use onion skin"}
          data-tooltip={onionAvailable ? `Onion skin · ${formatShortcut(keymap.toggleOnion)}` : "Onion skin · add another frame first"}
          aria-label="Toggle onion skin"
          aria-pressed={onion}
        >
          <Icon icon="mingcute:layers" />
          <span className="tool-toggle-label">Onion</span>
          <span className="tool-shortcut">{formatShortcut(keymap.toggleOnion)}</span>
        </button>
        <button
          className={pixelPerfect ? "tool-toggle active" : "tool-toggle"}
          onClick={() => setPixelPerfect(!pixelPerfect)}
          title="Use pixel-perfect connected strokes"
          data-tooltip={`Pixel-perfect stroke · ${formatShortcut(keymap.togglePixelPerfect)}`}
          aria-label="Toggle pixel-perfect stroke"
          aria-pressed={pixelPerfect}
        >
          <Icon icon="mingcute:magic-2" />
          <span className="tool-toggle-label">Pixel perfect</span>
          <span className="tool-shortcut">{formatShortcut(keymap.togglePixelPerfect)}</span>
        </button>
        <button
          className={shadingMode ? "tool-toggle active" : "tool-toggle"}
          onClick={() => setShadingMode(!shadingMode)}
          title="Choose a nearby palette shade while painting"
          data-tooltip={`Shading ink · ${formatShortcut(keymap.toggleShading)}`}
          aria-label="Toggle shading ink"
          aria-pressed={shadingMode}
        >
          <Icon icon="mingcute:sun" />
          <span className="tool-toggle-label">Shading ink</span>
          <span className="tool-shortcut">{formatShortcut(keymap.toggleShading)}</span>
        </button>
        <button
          className={tiledMode ? "tool-toggle active" : "tool-toggle"}
          onClick={() => setTiledMode(!tiledMode)}
          title="Preview the canvas as a repeating tile"
          data-tooltip={`Tiled preview · ${formatShortcut(keymap.toggleTiled)}`}
          aria-label="Toggle tiled preview"
          aria-pressed={tiledMode}
        >
          <Icon icon="mingcute:grid-2" />
          <span className="tool-toggle-label">Tiled</span>
          <span className="tool-shortcut">{formatShortcut(keymap.toggleTiled)}</span>
        </button>
        <button
          className={brushMode !== "solid" ? "tool-toggle active" : "tool-toggle"}
          onClick={() => setBrushMode(brushMode === "solid" ? "checker" : "solid")}
          title="Use a checker dither brush for pixel shading"
          data-tooltip={`Dither brush · ${formatShortcut(keymap.toggleBrush)}`}
          aria-label="Toggle dither brush"
          aria-pressed={brushMode !== "solid"}
        >
          <Icon icon="mingcute:magic-2" />
          <span className="tool-toggle-label">{brushMode === "dots" ? "Dot brush" : "Dither brush"}</span>
          <span className="tool-shortcut">{formatShortcut(keymap.toggleBrush)}</span>
        </button>
      </div>

      <button
        className="toolbar-colors picker"
        title="Pick a custom color (adds it to the palette)"
        data-tooltip="Choose a custom color"
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
        <button className="zoom-button" onClick={() => setZoom(zoom - 1)} title="Zoom out" data-tooltip="Zoom out" aria-label="Zoom out">
          −
        </button>
        <span>{zoom}px</span>
        <button className="zoom-button" onClick={() => setZoom(zoom + 1)} title="Zoom in" data-tooltip="Zoom in" aria-label="Zoom in">
          +
        </button>
      </div>
    </aside>
  );
}
