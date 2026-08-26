import { useRef } from "react";
import { Icon } from "./Icon";
import { useEditor } from "../store/editorStore";
import { useStore } from "../store/projectStore";
import { useUi } from "../store/uiStore";
import { redoProject, undoProject } from "../realtime/roomClient";
import {
  downloadCanvas,
  downloadText,
  godotSpriteFrames,
  renderSpriteToCanvas,
  spriteFileStem,
  unitySpriteManifest,
  unityTextureMeta,
} from "../engine/exportImage";

function closeMenu(target: HTMLElement) {
  target.closest("details")?.removeAttribute("open");
}

function imageName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Imported sprite";
}

export function ProjectMenu() {
  const projectFileRef = useRef<HTMLInputElement>(null);
  const imageFileRef = useRef<HTMLInputElement>(null);
  const past = useStore((s) => s.past.length);
  const future = useStore((s) => s.future.length);
  const roomStatus = useUi((s) => s.roomStatus);
  const roomCanUndo = useUi((s) => s.roomCanUndo);
  const roomCanRedo = useUi((s) => s.roomCanRedo);
  const resetProject = useStore((s) => s.resetProject);
  const showGrid = useEditor((s) => s.showGrid);
  const setShowGrid = useEditor((s) => s.setShowGrid);
  const onion = useEditor((s) => s.onion);
  const toggleOnion = useEditor((s) => s.toggleOnion);

  function exportProject() {
    const state = useStore.getState();
    downloadText(
      state.exportProject(),
      `${spriteFileStem(state.project.name)}.pixeltutor.json`,
    );
  }

  function exportSprite(allFrames: boolean) {
    const state = useStore.getState();
    const sprite = state.activeSprite();
    if (!sprite) return;
    const stem = spriteFileStem(sprite.name);
    const canvas = renderSpriteToCanvas(sprite, {
      frameIndex: state.activeFrameIndex,
      allFrames,
      scale: 1,
      palette: state.project.palette,
    });
    downloadCanvas(canvas, `${stem}${allFrames ? "-sheet" : ""}.png`);
  }

  function exportGodot() {
    const state = useStore.getState();
    const sprite = state.activeSprite();
    if (!sprite) return;
    const stem = spriteFileStem(sprite.name);
    exportSprite(true);
    downloadText(
      godotSpriteFrames(sprite, {
        texturePath: `res://art/${stem}-sheet.png`,
        fps: useEditor.getState().fps,
      }),
      `${stem}.tres`,
      "text/plain",
    );
  }

  function exportUnity() {
    const state = useStore.getState();
    const sprite = state.activeSprite();
    if (!sprite) return;
    const stem = spriteFileStem(sprite.name);
    exportSprite(true);
    downloadText(unityTextureMeta(sprite), `${stem}-sheet.png.meta`, "text/plain");
    downloadText(
      unitySpriteManifest(sprite, useEditor.getState().fps),
      `${stem}.unity-sprites.json`,
    );
  }

  function onProjectImport(file: File | undefined) {
    if (!file) return;
    file
      .text()
      .then((text) => {
        try {
          useStore.getState().loadProject(JSON.parse(text));
        } catch {
          window.alert("That project file could not be opened.");
        }
      })
      .catch(() => window.alert("That project file could not be opened."));
  }

  function onImageImport(file: File | undefined) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const scale = Math.min(1, 64 / image.naturalWidth, 64 / image.naturalHeight);
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) return;
        context.imageSmoothingEnabled = false;
        context.drawImage(image, 0, 0, width, height);
        const data = context.getImageData(0, 0, width, height).data;
        const pixels: Array<string | null> = [];
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 16) {
            pixels.push(null);
            continue;
          }
          pixels.push(
            `#${data[i].toString(16).padStart(2, "0")}${data[i + 1]
              .toString(16)
              .padStart(2, "0")}${data[i + 2].toString(16).padStart(2, "0")}`,
          );
        }
        useStore.getState().importRasterSprite({
          name: imageName(file.name),
          width,
          height,
          frames: [pixels],
          kind: "item",
        });
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      window.alert("That image could not be imported.");
    };
    image.src = url;
  }

  return (
    <nav className="menu-bar" aria-label="Main menu">
      <div className="menu-items">
        <details
          className="menu-popover"
          onToggle={(event) => {
            if (!event.currentTarget.open) return;
            document.querySelectorAll(".menu-popover").forEach((menu) => {
              if (menu !== event.currentTarget) menu.removeAttribute("open");
            });
          }}
        >
          <summary>File</summary>
          <div className="menu-panel">
            <button
              className="menu-item"
              onClick={(event) => {
                resetProject("starter");
                closeMenu(event.currentTarget);
              }}
            >
              <Icon icon="mingcute:sparkles-2" />
              <span>Open starter world</span>
              <kbd>⌘1</kbd>
            </button>
            <button
              className="menu-item"
              onClick={(event) => {
                resetProject("blank");
                closeMenu(event.currentTarget);
              }}
            >
              <Icon icon="mingcute:file-new" />
              <span>New blank project</span>
              <kbd>⌘N</kbd>
            </button>
            <div className="menu-divider" />
            <label className="menu-item">
              <Icon icon="mingcute:folder-open-2" />
              <span>Import project JSON…</span>
              <input
                ref={projectFileRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(event) => {
                  onProjectImport(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
            <label className="menu-item">
              <Icon icon="mingcute:image-2" />
              <span>Import PNG as sprite…</span>
              <input
                ref={imageFileRef}
                type="file"
                accept="image/png,image/webp,image/jpeg"
                hidden
                onChange={(event) => {
                  onImageImport(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
            <button
              className="menu-item"
              onClick={(event) => {
                exportProject();
                closeMenu(event.currentTarget);
              }}
            >
              <Icon icon="mingcute:save-2" />
              <span>Save project JSON</span>
              <kbd>⌘S</kbd>
            </button>
          </div>
        </details>

        <details
          className="menu-popover"
          onToggle={(event) => {
            if (!event.currentTarget.open) return;
            document.querySelectorAll(".menu-popover").forEach((menu) => {
              if (menu !== event.currentTarget) menu.removeAttribute("open");
            });
          }}
        >
          <summary>Edit</summary>
          <div className="menu-panel">
            <button className="menu-item" onClick={undoProject} disabled={roomStatus === "connected" ? !roomCanUndo : !past}>
              <Icon icon="mingcute:undo-2" />
              <span>Undo</span>
              <kbd>⌘Z</kbd>
            </button>
            <button className="menu-item" onClick={redoProject} disabled={roomStatus === "connected" ? !roomCanRedo : !future}>
              <Icon icon="mingcute:redo-2" />
              <span>Redo</span>
              <kbd>⇧⌘Z</kbd>
            </button>
          </div>
        </details>

        <details
          className="menu-popover"
          onToggle={(event) => {
            if (!event.currentTarget.open) return;
            document.querySelectorAll(".menu-popover").forEach((menu) => {
              if (menu !== event.currentTarget) menu.removeAttribute("open");
            });
          }}
        >
          <summary>View</summary>
          <div className="menu-panel">
            <button
              className={showGrid ? "menu-item checked" : "menu-item"}
              onClick={() => setShowGrid(!showGrid)}
            >
              <Icon icon="mingcute:grid-2" />
              <span>Pixel grid</span>
              <span className="menu-check">{showGrid ? "✓" : ""}</span>
            </button>
            <button
              className={onion ? "menu-item checked" : "menu-item"}
              onClick={toggleOnion}
            >
              <Icon icon="mingcute:layers" />
              <span>Onion skin</span>
              <span className="menu-check">{onion ? "✓" : ""}</span>
            </button>
          </div>
        </details>

        <details
          className="menu-popover export-popover"
          onToggle={(event) => {
            if (!event.currentTarget.open) return;
            document.querySelectorAll(".menu-popover").forEach((menu) => {
              if (menu !== event.currentTarget) menu.removeAttribute("open");
            });
          }}
        >
          <summary>Export</summary>
          <div className="menu-panel">
            <button className="menu-item" onClick={() => exportSprite(false)}>
              <Icon icon="mingcute:image-2" />
              <span>Current frame PNG</span>
              <span className="file-kind">PNG</span>
            </button>
            <button className="menu-item" onClick={() => exportSprite(true)}>
              <Icon icon="mingcute:gallery" />
              <span>Horizontal sprite sheet</span>
              <span className="file-kind">PNG</span>
            </button>
            <div className="menu-divider" />
            <button className="menu-item" onClick={exportGodot}>
              <Icon icon="mingcute:game-2" />
              <span>Godot pack</span>
              <span className="file-kind">PNG + TRES</span>
            </button>
            <button className="menu-item" onClick={exportUnity}>
              <Icon icon="mingcute:box-3" />
              <span>Unity pack</span>
              <span className="file-kind">PNG + META</span>
            </button>
          </div>
        </details>
      </div>
      <div className="menu-hint">
        <span className="menu-dot" /> Autosaved locally
        <span className="menu-divider-vertical" />
        <span>Right-click erases</span>
      </div>
    </nav>
  );
}
