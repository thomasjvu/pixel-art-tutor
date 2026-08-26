import { useEditor } from "../store/editorStore";
import { useStore } from "../store/projectStore";
import { downloadCanvas, renderSpriteToCanvas } from "../engine/exportImage";
import type { ToolName } from "../store/editorStore";

const TOOLS: { id: ToolName; icon: string; label: string; key: string }[] = [
  { id: "pencil", icon: "✏️", label: "Pencil", key: "B" },
  { id: "eraser", icon: "🧽", label: "Eraser", key: "E" },
  { id: "fill", icon: "🪣", label: "Fill", key: "G" },
  { id: "picker", icon: "💧", label: "Pick color", key: "I" },
];

export function Toolbar() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const zoom = useEditor((s) => s.zoom);
  const setZoom = useEditor((s) => s.setZoom);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const past = useStore((s) => s.past.length);
  const future = useStore((s) => s.future.length);

  function exportPng(allFrames: boolean) {
    const st = useStore.getState();
    const sprite = st.activeSprite();
    if (!sprite) return;
    const canvas = renderSpriteToCanvas(sprite, {
      frameIndex: st.activeFrameIndex,
      allFrames,
      scale: 8,
      palette: st.project.palette,
    });
    downloadCanvas(canvas, `${sprite.name.replace(/\W+/g, "-").toLowerCase()}${allFrames ? "-sheet" : ""}.png`);
  }

  return (
    <div className="toolbar">
      <div className="tool-group">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={tool === t.id ? "tool-btn active" : "tool-btn"}
            onClick={() => setTool(t.id)}
            title={`${t.label} (${t.key}) — right-click always erases`}
          >
            <span aria-hidden>{t.icon}</span>
          </button>
        ))}
      </div>
      <div className="tool-group">
        <button className="tool-btn" onClick={undo} disabled={!past} title="Undo (Ctrl+Z)">
          ↩
        </button>
        <button className="tool-btn" onClick={redo} disabled={!future} title="Redo (Ctrl+Y)">
          ↪
        </button>
      </div>
      <div className="tool-group zoom">
        <button className="tool-btn" onClick={() => setZoom(zoom - 4)} title="Zoom out">
          −
        </button>
        <span className="zoom-label">{zoom}px</span>
        <button className="tool-btn" onClick={() => setZoom(zoom + 4)} title="Zoom in">
          +
        </button>
      </div>
      <div className="spacer" />
      <div className="tool-group">
        <button className="text-btn" onClick={() => exportPng(false)}>
          PNG
        </button>
        <button className="text-btn" onClick={() => exportPng(true)}>
          Sheet
        </button>
      </div>
    </div>
  );
}
