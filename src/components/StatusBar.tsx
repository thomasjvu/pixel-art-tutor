import { useStore } from "../store/projectStore";
import { useEditor } from "../store/editorStore";
import { useUi } from "../store/uiStore";

export function StatusBar() {
  const hover = useEditor((s) => s.hover);
  const colorIdx = useEditor((s) => s.colorIdx);
  const sprite = useStore((s) => s.activeSprite());
  const palette = useStore((s) => s.project.palette);
  const mcpStatus = useUi((s) => s.mcpStatus);

  return (
    <footer className="statusbar">
      <span>
        {hover ? `x:${hover.x} y:${hover.y}` : "—"}
      </span>
      <span>{sprite ? `${sprite.width}×${sprite.height}` : ""}</span>
      <span className="status-color">
        <i style={{ background: palette[colorIdx] ?? "#000" }} />
        {palette[colorIdx] ?? ""}
      </span>
      <div className="spacer" />
      <span className={mcpStatus === "ready" ? "ok" : ""}>
        {mcpStatus === "ready" ? "agent connected" : mcpStatus === "registering" ? "connecting…" : "no agent"}
      </span>
    </footer>
  );
}
