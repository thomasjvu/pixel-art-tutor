import { useCallback, useEffect, useState } from "react";
import { Icon } from "./Icon";
import { useUi } from "../store/uiStore";
import { createBlankProjectTab } from "../store/workspaceActions";
import {
  DEFAULT_CANVAS_SIZE,
  DEFAULT_CHARACTER_FRAME_COUNT,
  MAX_FRAMES_PER_SPRITE,
  MAX_PROJECT_NAME_LENGTH,
  MAX_DIMENSION,
} from "../projectLimits";
import type { SpriteKind } from "../types";

const NEW_PROJECT_SETTINGS_KEY = "pixel-art-tutor.new-project-settings.v2";

interface NewProjectDraft {
  name: string;
  width: number;
  height: number;
  frameCount: number;
  kind: SpriteKind;
}

const DEFAULT_DRAFT: NewProjectDraft = {
  name: "Untitled",
  width: DEFAULT_CANVAS_SIZE,
  height: DEFAULT_CANVAS_SIZE,
  frameCount: DEFAULT_CHARACTER_FRAME_COUNT,
  kind: "character",
};

function boundedNumber(value: unknown, fallback: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(max, Math.round(parsed))) : fallback;
}

function readDraft(): NewProjectDraft {
  try {
    const raw = localStorage.getItem(NEW_PROJECT_SETTINGS_KEY);
    if (!raw) return DEFAULT_DRAFT;
    const saved = JSON.parse(raw) as Partial<NewProjectDraft>;
    return {
      name: typeof saved.name === "string" && saved.name.trim() ? saved.name.slice(0, MAX_PROJECT_NAME_LENGTH) : DEFAULT_DRAFT.name,
      width: boundedNumber(saved.width, DEFAULT_DRAFT.width, MAX_DIMENSION),
      height: boundedNumber(saved.height, DEFAULT_DRAFT.height, MAX_DIMENSION),
      frameCount: boundedNumber(saved.frameCount, DEFAULT_DRAFT.frameCount, MAX_FRAMES_PER_SPRITE),
      kind: saved.kind === "item" || saved.kind === "tile" ? saved.kind : "character",
    };
  } catch {
    return DEFAULT_DRAFT;
  }
}

function rememberDraft(draft: NewProjectDraft): void {
  try {
    localStorage.setItem(NEW_PROJECT_SETTINGS_KEY, JSON.stringify(draft));
  } catch {
    /* localStorage may be unavailable in a private or embedded browser */
  }
}

export function NewProjectDialog() {
  const open = useUi((state) => state.newProjectOpen);
  const setOpen = useUi((state) => state.setNewProjectOpen);
  const [draft, setDraft] = useState<NewProjectDraft>(() => readDraft());
  const close = useCallback(() => {
    setDraft(readDraft());
    setOpen(false);
  }, [setOpen]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  if (!open) return null;

  function update(patch: Partial<NewProjectDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: NewProjectDraft = {
      name: draft.name.trim().slice(0, MAX_PROJECT_NAME_LENGTH) || "Untitled",
      width: boundedNumber(draft.width, DEFAULT_DRAFT.width, MAX_DIMENSION),
      height: boundedNumber(draft.height, DEFAULT_DRAFT.height, MAX_DIMENSION),
      frameCount: boundedNumber(draft.frameCount, DEFAULT_DRAFT.frameCount, MAX_FRAMES_PER_SPRITE),
      kind: draft.kind,
    };
    rememberDraft(next);
    createBlankProjectTab(next);
    setOpen(false);
  }

  return (
    <div
      className="dialog-veil"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) close();
      }}
    >
      <section className="new-project-dialog" role="dialog" aria-modal="true" aria-labelledby="new-project-title">
        <div className="dialog-heading">
          <div>
            <span className="dialog-kicker">NEW WORLD</span>
            <h2 id="new-project-title">Create a project</h2>
          </div>
          <button className="dialog-close" onClick={close} aria-label="Close new project" title="Close">
            <Icon icon="mingcute:close-circle" />
          </button>
        </div>

        <p className="dialog-intro">Give your world a name, then choose the canvas you want to draw on.</p>

        <form className="new-project-form" onSubmit={create}>
          <label className="new-project-name field">
            <span>Project name</span>
            <input
              autoFocus
              value={draft.name}
              maxLength={MAX_PROJECT_NAME_LENGTH}
              onChange={(event) => update({ name: event.currentTarget.value })}
              placeholder="Moonlit meadow"
            />
          </label>

          <div className="new-project-section-heading">
            <h3>Canvas size</h3>
            <span>logical pixels</span>
          </div>
          <div className="new-project-size-row">
            <label className="field">
              <span>Width</span>
              <input
                type="number"
                min={1}
                max={MAX_DIMENSION}
                value={draft.width}
                onChange={(event) => update({ width: boundedNumber(event.currentTarget.value, draft.width, MAX_DIMENSION) })}
              />
            </label>
            <span className="new-project-times">×</span>
            <label className="field">
              <span>Height</span>
              <input
                type="number"
                min={1}
                max={MAX_DIMENSION}
                value={draft.height}
                onChange={(event) => update({ height: boundedNumber(event.currentTarget.value, draft.height, MAX_DIMENSION) })}
              />
            </label>
          </div>
          <div className="new-project-presets" aria-label="Canvas size presets">
            {[16, 32, 64, 128, 256].map((size) => (
              <button
                type="button"
                className={draft.width === size && draft.height === size ? "size-preset active" : "size-preset"}
                key={size}
                onClick={() => update({ width: size, height: size })}
                aria-pressed={draft.width === size && draft.height === size}
              >
                {size}²
              </button>
            ))}
          </div>

          <div className="new-project-options-row">
            <label className="field grow">
              <span>Canvas kind</span>
              <select value={draft.kind} onChange={(event) => update({ kind: event.currentTarget.value as SpriteKind })}>
                <option value="character">Character / animated</option>
                <option value="item">Item / illustration</option>
                <option value="tile">Tile / repeating texture</option>
              </select>
            </label>
            <label className="field new-project-frames">
              <span>Frames</span>
              <input
                type="number"
                min={1}
                max={MAX_FRAMES_PER_SPRITE}
                value={draft.frameCount}
                onChange={(event) => update({ frameCount: boundedNumber(event.currentTarget.value, draft.frameCount, MAX_FRAMES_PER_SPRITE) })}
              />
            </label>
          </div>

          <p className="new-project-memory-note">
            <Icon icon="mingcute:save-2" />
            <span>Your last name, size, kind, and frame count are remembered on this localhost.</span>
          </p>

          <div className="dialog-footer">
            <button type="button" className="text-btn" onClick={close}>Cancel</button>
            <button type="submit" className="primary-btn">Create project</button>
          </div>
        </form>
      </section>
    </div>
  );
}
