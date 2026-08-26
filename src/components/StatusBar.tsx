import { Icon } from "./Icon";
import { useStore } from "../store/projectStore";
import { useEditor } from "../store/editorStore";
import { useUi } from "../store/uiStore";

export function StatusBar() {
  const hover = useEditor((s) => s.hover);
  const colorIdx = useEditor((s) => s.colorIdx);
  const tool = useEditor((s) => s.tool);
  const sprite = useStore((s) => s.activeSprite());
  const palette = useStore((s) => s.project.palette);
  const mcpStatus = useUi((s) => s.mcpStatus);

  return (
    <footer className="statusbar">
      <span className="status-tool"><Icon icon="mingcute:cursor" /> {tool}</span>
      <span className="status-coordinate">
        <Icon icon="mingcute:cross" /> {hover ? `${hover.x}, ${hover.y}` : "—, —"}
      </span>
      <span className="status-size">{sprite ? `${sprite.width} × ${sprite.height} px` : ""}</span>
      <span className="status-color">
        <i style={{ background: palette[colorIdx] ?? "#000" }} />
        <span>FG {String(colorIdx).padStart(2, "0")}</span>
      </span>
      <div className="spacer" />
      <span className={mcpStatus === "ready" ? "status-connection ok" : "status-connection"}>
        <span className="status-light" />
        {mcpStatus === "ready" ? "WebMCP connected" : mcpStatus === "registering" ? "Connecting agent…" : "Offline editing"}
      </span>
    </footer>
  );
}
