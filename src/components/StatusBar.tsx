import { Icon } from "./Icon";
import { storedProjectRecovery, useStore } from "../store/projectStore";
import { useEditor } from "../store/editorStore";
import { useUi } from "../store/uiStore";
import { downloadText, spriteFileStem } from "../engine/exportImage";

export function StatusBar() {
  const hover = useEditor((s) => s.hover);
  const colorIdx = useEditor((s) => s.colorIdx);
  const tool = useEditor((s) => s.tool);
  const sprite = useStore((s) => s.activeSprite());
  const palette = useStore((s) => s.project.palette);
  const storageRecovery = useStore((s) => s.storageRecovery);
  const storageStatus = useStore((s) => s.storageStatus);
  const storageError = useStore((s) => s.storageError);
  const dismissStorageRecovery = useStore((s) => s.dismissStorageRecovery);
  const mcpStatus = useUi((s) => s.mcpStatus);
  const recovery = storageRecovery ? storedProjectRecovery() : null;

  function downloadCurrentBackup() {
    const state = useStore.getState();
    downloadText(
      state.exportProject(),
      spriteFileStem(state.project.name) + "-backup.pixeltutor.json",
    );
  }

  const storageNotice =
    storageStatus === "pending"
      ? "Saving locally…"
      : storageStatus === "not_saved"
        ? "Local save not yet complete"
        : storageStatus === "too_large"
          ? "Local autosave unavailable: project is too large"
          : storageStatus === "unavailable"
            ? "Local autosave unavailable"
            : null;

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
      {storageRecovery && (
        <span className="status-recovery" role="status">
          Saved project needs recovery
          {recovery && (
            <button
              type="button"
              onClick={() => downloadText(recovery, "pixel-art-tutor-recovery.json")}
            >
              Download backup
            </button>
          )}
          <button type="button" onClick={dismissStorageRecovery} aria-label="Dismiss recovery notice">
            Dismiss
          </button>
        </span>
      )}
      {storageNotice && (
        <span className="status-recovery" role={storageStatus === "pending" ? "status" : "alert"}>
          {storageNotice}
          {storageError && storageStatus !== "pending" && <span>{storageError}</span>}
          {storageStatus === "too_large" || storageStatus === "unavailable" ? (
            <button type="button" onClick={downloadCurrentBackup}>
              Download backup
            </button>
          ) : null}
        </span>
      )}
      <div className="spacer" />
      <span className={mcpStatus === "ready" ? "status-connection ok" : "status-connection"}>
        <span className="status-light" />
        {mcpStatus === "ready" ? "WebMCP connected" : mcpStatus === "registering" ? "Connecting agent…" : "Offline editing"}
      </span>
    </footer>
  );
}
