import { useState } from "react";
import { useStore } from "../store/projectStore";
import { Icon } from "./Icon";
import { SpriteThumb } from "./SpriteThumb";
import type { Sprite, SpriteKind } from "../types";
import { downloadText } from "../engine/exportImage";
import {
  DEFAULT_CHARACTER_FRAME_COUNT,
  MAX_FRAMES_PER_SPRITE,
  MAX_DIMENSION,
  MAX_PROJECT_JSON_LENGTH,
  MAX_SPRITE_NAME_LENGTH,
} from "../projectLimits";
import { useUi } from "../store/uiStore";

/** SubmitEvent extensions from the WebMCP Declarative API */
interface WebMCPSubmitEvent extends React.FormEvent<HTMLFormElement> {
  agentInvoked?: boolean;
  respondWith?: (promise: Promise<unknown>) => void;
}

export function SpritesPanel() {
  const project = useStore((s) => s.project);
  const activeSprite = useStore((s) => s.activeSprite());
  const setActiveSprite = useStore((s) => s.setActiveSprite);
  const addSprite = useStore((s) => s.addSprite);
  const deleteSprite = useStore((s) => s.deleteSprite);
  const renameSprite = useStore((s) => s.renameSprite);
  const resetProject = useStore((s) => s.resetProject);
  const setNewProjectOpen = useUi((s) => s.setNewProjectOpen);

  function onNewSpriteSubmit(e: WebMCPSubmitEvent) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const n = String(data.get("name") ?? "").trim() || "Untitled";
    const w = Math.max(1, Math.min(MAX_DIMENSION, Number(data.get("width")) || MAX_DIMENSION));
    const h = Math.max(1, Math.min(MAX_DIMENSION, Number(data.get("height")) || MAX_DIMENSION));
    const k = (String(data.get("kind")) || "character") as SpriteKind;
    const requestedFrames = Number(data.get("frameCount"));
    const frameCount = Number.isInteger(requestedFrames) ? requestedFrames : undefined;
    useStore.getState().interruptStroke();
    const id = addSprite({ name: n, width: w, height: h, kind: k, frameCount });
    const created = id ? useStore.getState().project.sprites.find((sprite) => sprite.id === id) : null;
    if (e.agentInvoked && e.respondWith) {
      e.respondWith(
        Promise.resolve(
          id
            ? { ok: true, spriteId: id, frames: created?.frames.length ?? 0, message: `"${n}" created and now active in the editor.` }
            : { ok: false, error: "project capacity reached (sprite, frame, or pixel limit)" },
        ),
      );
    }
    if (!id) {
      if (!e.agentInvoked) alert("Could not create sprite: project capacity reached.");
      return;
    }
    e.currentTarget.reset();
  }

  return (
    <div className="panel">
      <div className="sprite-list">
        {project.sprites.map((sp) => (
          <SpriteRow
            key={`${sp.id}:${sp.name}`}
            sprite={sp}
            palette={project.palette}
            active={sp.id === activeSprite?.id}
            canDelete={project.sprites.length > 1}
            onSelect={() => setActiveSprite(sp.id)}
            onDelete={() => deleteSprite(sp.id)}
            onRename={renameSprite}
          />
        ))}
      </div>

      <form
        toolname="request_new_sprite"
        tooldescription="Create a new sprite in the pixel art project. Prefill the fields; the human reviews and clicks Create to confirm."
        className="new-sprite-form"
        onSubmit={onNewSpriteSubmit}
      >
        <h4>New sprite</h4>
        <div className="panel-row">
          <label className="field grow">
            <span>Name</span>
            <input
              name="name"
              defaultValue=""
              maxLength={MAX_SPRITE_NAME_LENGTH}
              placeholder="Potion"
              toolparamdescription="Name of the sprite, e.g. 'Potion' or 'Knight idle'."
            />
          </label>
        </div>
        <div className="panel-row">
          <label className="field">
            <span>Width</span>
            <input name="width" type="number" min={1} max={MAX_DIMENSION} defaultValue={MAX_DIMENSION} list="common-sizes" toolparamdescription="Canvas width in logical pixels, up to 256." />
          </label>
          <label className="field">
            <span>Height</span>
            <input name="height" type="number" min={1} max={MAX_DIMENSION} defaultValue={MAX_DIMENSION} list="common-sizes" toolparamdescription="Canvas height in logical pixels, up to 256." />
          </label>
          <datalist id="common-sizes">
            <option value="8" />
            <option value="16" />
            <option value="24" />
            <option value="32" />
            <option value="48" />
            <option value="64" />
            <option value="128" />
            <option value="256" />
          </datalist>
        </div>
        <div className="panel-row">
          <label className="field grow">
            <span>Kind</span>
            <select
              name="kind"
              defaultValue="character"
              onChange={(event) => {
                const nextKind = event.currentTarget.value as SpriteKind;
                const frameInput = event.currentTarget.form?.elements.namedItem("frameCount");
                if (frameInput instanceof HTMLInputElement && (frameInput.value === "4" || frameInput.value === "1")) {
                  frameInput.value = nextKind === "character" ? String(DEFAULT_CHARACTER_FRAME_COUNT) : "1";
                }
              }}
              toolparamdescription="'tile' adds the sprite to the tileset used for map painting."
            >
              <option value="character">character</option>
              <option value="item">item</option>
              <option value="tile">tile</option>
            </select>
          </label>
          <label className="field">
            <span>Frames</span>
            <input
              name="frameCount"
              type="number"
              min={1}
              max={MAX_FRAMES_PER_SPRITE}
              defaultValue={DEFAULT_CHARACTER_FRAME_COUNT}
              toolparamdescription="Animation frame count. Defaults to 4 for characters; use 1 for a still item or tile."
            />
          </label>
          <button type="submit" className="primary-btn">
            Create
          </button>
        </div>
        <p className="hint webmcp-note">
          <Icon icon="mingcute:bot" />
          <span>Agent can fill this in; you keep the final click.</span>
        </p>
      </form>

      <details className="io-details">
        <summary>Project file</summary>
        <div className="panel-row wrap">
          <ExportButton />
          <ShareButton />
          <label className="text-btn file-btn">
            Import
            <input
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > MAX_PROJECT_JSON_LENGTH) {
                  alert(`Could not import project: file exceeds the ${MAX_PROJECT_JSON_LENGTH.toLocaleString()} character limit`);
                  e.target.value = "";
                  return;
                }
                file.text().then((t) => {
                  let parsed: unknown;
                  try {
                    parsed = JSON.parse(t);
                  } catch {
                    alert("That doesn't look like a valid project file.");
                    return;
                  }
                  const result = useStore.getState().loadProject(parsed);
                  if (!result.ok) alert(`Could not import project: ${result.error}`);
                }).catch(() => alert("That project file could not be opened."));
                e.target.value = "";
              }}
            />
          </label>
          <button className="text-btn danger" onClick={() => resetProject("starter")}>
            Reset demo
          </button>
          <button className="text-btn" onClick={() => setNewProjectOpen(true)}>
            New project…
          </button>
        </div>
      </details>

      <details className="io-details">
        <summary>Saved projects</summary>
        <ProjectLibrary />
      </details>
    </div>
  );
}

function ProjectLibrary() {
  const saveProjectAs = useStore((s) => s.saveProjectAs);
  const openProjectSave = useStore((s) => s.openProjectSave);
  const deleteProjectSave = useStore((s) => s.deleteProjectSave);
  const listProjectSaves = useStore((s) => s.listProjectSaves);
  const [draft, setDraft] = useState("");
  const [saves, setSaves] = useState(() => listProjectSaves());
  const refresh = () => setSaves(listProjectSaves());

  function save() {
    const result = saveProjectAs(draft.trim() ? draft : undefined);
    if (!result.ok) {
      alert(`Could not save project: ${result.error}`);
      return;
    }
    setDraft("");
    refresh();
  }

  function open(name: string) {
    if (!window.confirm(`Open '${name}'? Your current project stays in undo history.`)) return;
    const result = openProjectSave(name);
    if (!result.ok) alert(`Could not open project: ${result.error}`);
  }

  return (
    <div>
      <div className="panel-row">
        <input
          className="text-input grow"
          value={draft}
          maxLength={64}
          placeholder="guided-tutorial-01"
          aria-label="Save name"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
        />
        <button className="text-btn" onClick={save}>
          Save
        </button>
      </div>
      {saves.length === 0 && <p className="hint">No saved projects yet — name one above.</p>}
      <ul className="log-list">
        {saves.map((s) => (
          <li key={s.name}>
            <button className="text-btn grow" onClick={() => open(s.name)} title={`Open '${s.name}'`}>
              {s.name}
            </button>
            <button
              className="icon-btn"
              title={`Delete '${s.name}'`}
              aria-label={`Delete saved project ${s.name}`}
              onClick={() => {
                deleteProjectSave(s.name);
                refresh();
              }}
            >
              <Icon icon="mingcute:close-circle" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SpriteRow({
  sprite,
  palette,
  active,
  canDelete,
  onSelect,
  onDelete,
  onRename,
}: {
  sprite: Sprite;
  palette: string[];
  active: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (id: string, name: string) => void;
}) {
  const [draft, setDraft] = useState(sprite.name);

  function commitName() {
    const next = draft.trim().slice(0, MAX_SPRITE_NAME_LENGTH);
    if (!next) {
      setDraft(sprite.name);
      return;
    }
    onRename(sprite.id, next);
    setDraft(next);
  }

  return (
    <div className={active ? "sprite-row active" : "sprite-row"}>
      <button className="sprite-select" onClick={onSelect} title={`Edit ${sprite.name}`}>
        <SpriteThumb sprite={sprite} palette={palette} size={36} />
        <span className={"badge kind-" + sprite.kind}>{sprite.kind}</span>
      </button>
      <input
        className="sprite-name"
        value={draft}
        maxLength={MAX_SPRITE_NAME_LENGTH}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitName}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setDraft(sprite.name);
            event.currentTarget.blur();
          }
        }}
        aria-label={`Rename ${sprite.name}`}
      />
      {canDelete && (
        <button className="icon-btn" title="Delete sprite" aria-label={`Delete ${sprite.name}`} onClick={onDelete}>
          <Icon icon="mingcute:close-circle" />
        </button>
      )}
    </div>
  );
}

function ShareButton() {
  const setShareOpen = useUi((state) => state.setShareOpen);
  return (
    <button
      className="text-btn"
      onClick={() => setShareOpen(true)}
    >
      Share…
    </button>
  );
}

function ExportButton() {
  const exportProject = useStore((s) => s.exportProject);
  return (
    <button
      className="text-btn"
      onClick={() => {
        const st = useStore.getState();
        downloadText(
          exportProject(),
          `${st.project.name.replace(/\W+/g, "-").toLowerCase()}.pixeltutor.json`,
        );
      }}
    >
      Save JSON
    </button>
  );
}
