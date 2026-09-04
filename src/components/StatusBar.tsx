import { useEffect, useRef } from "react";
import { Icon } from "./Icon";
import { storedProjectRecovery, useStore } from "../store/projectStore";
import { useEditor } from "../store/editorStore";
import { useUi } from "../store/uiStore";
import { downloadText, spriteFileStem } from "../engine/exportImage";

export function StatusBar({ onOpenAgent }: { onOpenAgent: () => void }) {
  const projectTitleRef = useRef<HTMLInputElement>(null);
  const hover = useEditor((s) => s.hover);
  const colorIdx = useEditor((s) => s.colorIdx);
  const tool = useEditor((s) => s.tool);
  const sprite = useStore((s) => s.activeSprite());
  const palette = useStore((s) => s.project.palette);
  const storageRecovery = useStore((s) => s.storageRecovery);
  const storageStatus = useStore((s) => s.storageStatus);
  const storageError = useStore((s) => s.storageError);
  const dismissStorageRecovery = useStore((s) => s.dismissStorageRecovery);
  const projectName = useStore((s) => s.project.name);
  const spriteCount = useStore((s) => s.project.sprites.length);
  const renameProject = useStore((s) => s.renameProject);
  const mcpStatus = useUi((s) => s.mcpStatus);
  const roomStatus = useUi((s) => s.roomStatus);
  const roomPeers = useUi((s) => Object.keys(s.roomPeers).length);
  const recovery = storageRecovery ? storedProjectRecovery() : null;

  useEffect(() => {
    if (projectTitleRef.current && document.activeElement !== projectTitleRef.current) {
      projectTitleRef.current.value = projectName;
    }
  }, [projectName]);

  function finishProjectTitle(input: HTMLInputElement) {
    const next = input.value.trim();
    if (next) renameProject(next);
    else input.value = projectName;
  }

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
      <div className="footer-identity">
        <div className="footer-project">
          <input
            className="footer-project-title"
            ref={projectTitleRef}
            defaultValue={projectName}
            onBlur={(event) => finishProjectTitle(event.currentTarget)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                event.currentTarget.value = projectName;
                event.currentTarget.blur();
              }
            }}
            aria-label="Project name"
          />
          <span className="footer-project-subtitle">
            {spriteCount} sprite{spriteCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="footer-readouts" aria-label="Canvas readouts">
        <span className="status-tool"><Icon icon="mingcute:cursor" /> {tool}</span>
        <span className="status-coordinate">
          <Icon icon="mingcute:cross" /> {hover ? `${hover.x}, ${hover.y}` : "—, —"}
        </span>
        <span className="status-size">{sprite ? `${sprite.width} × ${sprite.height} px` : ""}</span>
        <span className="status-color">
          <i style={{ background: palette[colorIdx] ?? "#000" }} />
          <span>FG {String(colorIdx).padStart(2, "0")}</span>
        </span>
        <span className="footer-hint">Right-click erases</span>
      </div>
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
      <div className="footer-connections">
        <span className="footer-save-state">
          <span className={`status-light ${storageStatus === "saved" ? "ready" : ""}`} />
          {storageStatus === "saved" ? "Saved" : storageStatus === "pending" ? "Saving" : "Local"}
        </span>
        <span className={mcpStatus === "ready" ? "status-connection ok" : "status-connection"}>
          <span className="status-light" />
          {mcpStatus === "ready" ? "WebMCP" : mcpStatus === "registering" ? "Agent…" : "Offline"}
        </span>
        <span className="footer-room-status">
          <span className={`status-light ${roomStatus === "connected" ? "ready" : ""}`} />
          {roomStatus === "connected"
            ? `${roomPeers + 1} in room`
            : roomStatus === "connecting"
              ? "Joining"
              : "Solo"}
        </span>
        <button
          className="footer-help"
          title="Open agent help"
          aria-label="Open agent help"
          onClick={onOpenAgent}
        >
          <Icon icon="mingcute:question" />
        </button>
      </div>
    </footer>
  );
}
