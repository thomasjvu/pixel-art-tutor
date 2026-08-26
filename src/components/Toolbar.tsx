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
];

export function Toolbar() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const colorIdx = useEditor((s) => s.colorIdx);
  const zoom = useEditor((s) => s.zoom);
  const setZoom = useEditor((s) => s.setZoom);
  const showGrid = useEditor((s) => s.showGrid);
  const setShowGrid = useEditor((s) => s.setShowGrid);
  const onion = useEditor((s) => s.onion);
  const toggleOnion = useEditor((s) => s.toggleOnion);
  const palette = useStore((s) => s.project.palette);
  const past = useStore((s) => s.past.length);
  const future = useStore((s) => s.future.length);
  const roomStatus = useUi((s) => s.roomStatus);
  const roomCanUndo = useUi((s) => s.roomCanUndo);
  const roomCanRedo = useUi((s) => s.roomCanRedo);
  const sharedRoom = roomStatus === "connected";

  return (
    <aside className="toolbar" aria-label="Pixel tools">
      <span className="toolbar-label">Tools</span>
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
          onClick={toggleOnion}
          title="Toggle onion skin"
          aria-pressed={onion}
        >
          <Icon icon="mingcute:layers" />
          <span>Onion</span>
        </button>
      </div>

      <div className="toolbar-colors" title="Selected color">
        <span className="color-back" />
        <span
          className="color-front"
          style={{ background: palette[colorIdx] ?? "#38b764" }}
        />
        <span className="color-index">{String(colorIdx).padStart(2, "0")}</span>
      </div>

      <div className="toolbar-spacer" />

      <div className="zoom-control">
        <button className="zoom-button" onClick={() => setZoom(zoom - 4)} title="Zoom out">
          −
        </button>
        <span>{zoom}px</span>
        <button className="zoom-button" onClick={() => setZoom(zoom + 4)} title="Zoom in">
          +
        </button>
      </div>
    </aside>
  );
}
