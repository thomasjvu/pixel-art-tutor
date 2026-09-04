import { useRef } from "react";
import { Icon } from "./Icon";
import { useEditor } from "../store/editorStore";
import { useStore } from "../store/projectStore";
import { useUi } from "../store/uiStore";
import { redoProject, undoProject } from "../realtime/roomClient";
import {
  downloadBlob,
  downloadCanvas,
  downloadText,
  encodeAnimatedGif,
  godotSpriteFrames,
  renderTextureAtlas,
  renderSpriteToCanvas,
  spriteFileStem,
  unitySpriteManifest,
  unityTextureMeta,
} from "../engine/exportImage";
import { buildGamePackManifest, gamePackSpriteFiles } from "../engine/exportManifest";
import { MAX_DIMENSION, MAX_PROJECT_JSON_LENGTH } from "../projectLimits";
import { formatShortcut, usePreferences } from "../store/preferencesStore";
import { spriteLayers } from "../types";

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
  const setPreferencesOpen = useUi((s) => s.setPreferencesOpen);
  const setNewProjectOpen = useUi((s) => s.setNewProjectOpen);
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  const setShareOpen = useUi((s) => s.setShareOpen);
  const resetProject = useStore((s) => s.resetProject);
  const showGrid = useEditor((s) => s.showGrid);
  const setShowGrid = useEditor((s) => s.setShowGrid);
  const onion = useEditor((s) => s.onion);
  const toggleOnion = useEditor((s) => s.toggleOnion);
  const onionAvailable = useStore((s) => (s.activeSprite()?.frames.length ?? 0) > 1);
  const playbackTagId = useEditor((s) => s.playbackTagId);
  const keymap = usePreferences((s) => s.keymap);
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
      paletteAlpha: state.project.paletteAlpha,
    });
    downloadCanvas(canvas, `${stem}${allFrames ? "-sheet" : ""}.png`);
  }

  function exportPngSequence() {
    const state = useStore.getState();
    const sprite = state.activeSprite();
    if (!sprite) return;
    const stem = spriteFileStem(sprite.name);
    const count = Math.max(1, ...spriteLayers(sprite).map((layer) => layer.frames.length));
    for (let index = 0; index < count; index++) {
      downloadCanvas(
        renderSpriteToCanvas(sprite, {
          frameIndex: index,
          scale: 1,
          palette: state.project.palette,
          paletteAlpha: state.project.paletteAlpha,
        }),
        `${stem}-${String(index + 1).padStart(2, "0")}.png`,
      );
    }
  }

  function exportAnimatedGif() {
    const state = useStore.getState();
    const sprite = state.activeSprite();
    if (!sprite) return;
    const tag = sprite.frameTags?.find((entry) => entry.id === playbackTagId);
    const frameIndices = tag
      ? Array.from({ length: tag.to - tag.from + 1 }, (_, index) => tag.from + index)
      : undefined;
    downloadBlob(
      encodeAnimatedGif(sprite, {
        palette: state.project.palette,
        paletteAlpha: state.project.paletteAlpha,
        fps: useEditor.getState().fps,
        frameIndices,
      }),
      `${spriteFileStem(sprite.name)}${tag ? `-${spriteFileStem(tag.name)}` : ""}.gif`,
    );
  }

  function exportTextureAtlas() {
    const state = useStore.getState();
    const atlas = renderTextureAtlas(state.project, {
      palette: state.project.palette,
      paletteAlpha: state.project.paletteAlpha,
    });
    const stem = spriteFileStem(state.project.name);
    downloadCanvas(atlas.canvas, `${stem}-atlas.png`);
    downloadText(
      JSON.stringify({
        format: "pixel-art-tutor/texture-atlas",
        version: 1,
        image: `${stem}-atlas.png`,
        fps: useEditor.getState().fps,
        sprites: state.project.sprites.map((sprite) => ({
          id: sprite.id,
          name: sprite.name,
          tags: sprite.frameTags ?? [],
          frames: atlas.entries.filter((entry) => entry.spriteId === sprite.id),
        })),
        size: { width: atlas.canvas.width, height: atlas.canvas.height },
      }, null, 2),
      `${stem}-atlas.json`,
    );
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

  function exportGamePack() {
    const state = useStore.getState();
    const files = gamePackSpriteFiles(state.project);
    downloadText(
      buildGamePackManifest(state.project, useEditor.getState().fps),
      `${spriteFileStem(state.project.name)}.pixel-pack.json`,
    );
    for (const { sprite, stem } of files) {
      downloadCanvas(
        renderSpriteToCanvas(sprite, {
          allFrames: true,
          scale: 1,
          palette: state.project.palette,
          paletteAlpha: state.project.paletteAlpha,
        }),
        `${stem}-sheet.png`,
      );
    }
    useUi.getState().pushLog({
      tool: "export_game_pack",
      summary: `Downloaded manifest and ${files.length} sprite sheet${files.length === 1 ? "" : "s"}`,
      source: "app",
    });
  }

  function onProjectImport(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_PROJECT_JSON_LENGTH) {
      window.alert(`That project file is too large (limit: ${MAX_PROJECT_JSON_LENGTH.toLocaleString()} characters).`);
      return;
    }
    file
      .text()
      .then((text) => {
        try {
          const result = useStore.getState().loadProject(JSON.parse(text));
          if (!result.ok) window.alert(`Could not import project: ${result.error}`);
        } catch {
          window.alert("That project file could not be opened.");
        }
      })
      .catch(() => window.alert("That project file could not be opened."));
  }

  function readRasterFrame(
    file: File,
    width?: number,
    height?: number,
  ): Promise<{ width: number; height: number; pixels: Array<string | null> }> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        try {
          const scale = Math.min(1, MAX_DIMENSION / image.naturalWidth, MAX_DIMENSION / image.naturalHeight);
          const targetWidth = width ?? Math.max(1, Math.round(image.naturalWidth * scale));
          const targetHeight = height ?? Math.max(1, Math.round(image.naturalHeight * scale));
          const canvas = document.createElement("canvas");
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const context = canvas.getContext("2d");
          if (!context) {
            reject(new Error("canvas unavailable"));
            return;
          }
          context.imageSmoothingEnabled = false;
          context.clearRect(0, 0, targetWidth, targetHeight);
          context.drawImage(image, 0, 0, targetWidth, targetHeight);
          const data = context.getImageData(0, 0, targetWidth, targetHeight).data;
          const pixels: Array<string | null> = [];
          for (let index = 0; index < data.length; index += 4) {
            if (data[index + 3]! < 16) {
              pixels.push(null);
              continue;
            }
            pixels.push(
              `#${data[index]!.toString(16).padStart(2, "0")}${data[index + 1]!.toString(16).padStart(2, "0")}${data[index + 2]!.toString(16).padStart(2, "0")}`,
            );
          }
          resolve({ width: targetWidth, height: targetHeight, pixels });
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("image could not be imported"));
      };
      image.src = url;
    });
  }

  function onImageImport(files: File[] | undefined) {
    if (!files?.length) return;
    const first = files[0]!;
    readRasterFrame(first)
      .then(async (base) => {
        const frames = [base.pixels];
        for (const file of files.slice(1)) {
          frames.push((await readRasterFrame(file, base.width, base.height)).pixels);
        }
        const importedId = useStore.getState().importRasterSprite({
          name: imageName(first.name),
          width: base.width,
          height: base.height,
          frames,
          kind: files.length > 1 ? "character" : "item",
        });
        if (!importedId) window.alert("Could not import image: project capacity reached.");
      })
      .catch(() => window.alert("That image could not be imported."));
  }

  return (
    <nav className="menu-bar" aria-label="Main menu">
      <div className="menu-app-mark" role="img" aria-label="Pixel Patch">
        <svg width="22" height="22" viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden="true">
          <rect width="8" height="8" fill="#000" />
          <rect x="1" y="1" width="2" height="2" fill="#ff2e2e" />
          <rect x="5" y="1" width="2" height="2" fill="#ffee00" />
          <rect x="3" y="3" width="2" height="2" fill="#fff" />
          <rect x="1" y="5" width="2" height="2" fill="#fff" />
          <rect x="5" y="5" width="2" height="2" fill="#ff2e2e" />
        </svg>
      </div>
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
                setNewProjectOpen(true);
                closeMenu(event.currentTarget);
              }}
            >
              <Icon icon="mingcute:file-new" />
              <span>New project…</span>
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
              <span>Import PNG / sequence…</span>
              <input
                ref={imageFileRef}
                type="file"
                multiple
                accept="image/png,image/webp,image/jpeg"
                hidden
                onChange={(event) => {
                  onImageImport(event.target.files ? Array.from(event.target.files) : undefined);
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
            <div className="menu-divider" />
            <button
              className="menu-item"
              onClick={(event) => {
                setPreferencesOpen(true);
                closeMenu(event.currentTarget);
              }}
            >
              <Icon icon="mingcute:magic-2" />
              <span>Preferences…</span>
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
              aria-pressed={showGrid}
            >
              <Icon icon="mingcute:grid-2" />
              <span>Pixel grid</span>
              <kbd>{formatShortcut(keymap.toggleGrid)}</kbd>
              <span className="menu-check">{showGrid ? "✓" : ""}</span>
            </button>
            <button
              className={onion ? "menu-item checked" : "menu-item"}
              disabled={!onionAvailable}
              onClick={toggleOnion}
              title={onionAvailable ? "Toggle onion skin" : "Add another frame to use onion skin"}
              aria-pressed={onion}
            >
              <Icon icon="mingcute:layers" />
              <span>Onion skin</span>
              <kbd>{formatShortcut(keymap.toggleOnion)}</kbd>
              <span className="menu-check">{onion ? "✓" : ""}</span>
            </button>
            <div className="menu-divider" />
            <button
              className="menu-item"
              onClick={(event) => {
                setTheme(theme === "dark" ? "light" : "dark");
                closeMenu(event.currentTarget);
              }}
              aria-pressed={theme === "light"}
            >
              <Icon icon={theme === "dark" ? "mingcute:sun" : "mingcute:moon"} />
              <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
              <span className="menu-check">{theme === "light" ? "✓" : ""}</span>
            </button>
          </div>
        </details>

        <details
          className="menu-popover share-popover"
          onToggle={(event) => {
            if (!event.currentTarget.open) return;
            document.querySelectorAll(".menu-popover").forEach((menu) => {
              if (menu !== event.currentTarget) menu.removeAttribute("open");
            });
          }}
        >
          <summary>Share</summary>
          <div className="menu-panel">
            <button
              className="menu-item"
              onClick={(event) => {
                setShareOpen(true);
                closeMenu(event.currentTarget);
              }}
            >
              <Icon icon="mingcute:heart" />
              <span>Share project…</span>
            </button>
            <p className="menu-note">Copy a project link or open a social share composer.</p>
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
            <button className="menu-item" onClick={exportPngSequence}>
              <Icon icon="mingcute:gallery" />
              <span>PNG frame sequence</span>
              <span className="file-kind">PNGs</span>
            </button>
            <button className="menu-item" onClick={exportAnimatedGif}>
              <Icon icon="mingcute:movie" />
              <span>Animated GIF</span>
              <span className="file-kind">GIF</span>
            </button>
            <div className="menu-divider" />
            <button className="menu-item" onClick={exportTextureAtlas}>
              <Icon icon="mingcute:box-3" />
              <span>Texture atlas</span>
              <span className="file-kind">PNG + JSON</span>
            </button>
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
            <div className="menu-divider" />
            <button className="menu-item" onClick={exportGamePack}>
              <Icon icon="mingcute:box-3" />
              <span>Entire game pack</span>
              <span className="file-kind">JSON + PNGs</span>
            </button>
            <p className="menu-note">Downloads one manifest and one horizontal sheet per sprite.</p>
          </div>
        </details>
      </div>
    </nav>
  );
}
