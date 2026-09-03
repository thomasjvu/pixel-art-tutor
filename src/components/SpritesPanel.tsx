import { useState } from "react";
import { useStore } from "../store/projectStore";
import { Icon } from "./Icon";
import { SpriteThumb } from "./SpriteThumb";
import type { Sprite, SpriteKind } from "../types";
import { downloadText } from "../engine/exportImage";
import { projectHashFromJson } from "../engine/share";
import { MAX_PROJECT_JSON_LENGTH, MAX_SPRITE_NAME_LENGTH } from "../projectLimits";

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

  function onNewSpriteSubmit(e: WebMCPSubmitEvent) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const n = String(data.get("name") ?? "").trim() || "Untitled";
    const w = Math.max(1, Math.min(64, Number(data.get("width")) || 16));
    const h = Math.max(1, Math.min(64, Number(data.get("height")) || 16));
    const k = (String(data.get("kind")) || "character") as SpriteKind;
    useStore.getState().interruptStroke();
    const id = addSprite({ name: n, width: w, height: h, kind: k });
    if (e.agentInvoked && e.respondWith) {
      e.respondWith(
        Promise.resolve(
          id
            ? { ok: true, spriteId: id, message: `"${n}" created and now active in the editor.` }
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
            <input name="width" type="number" min={1} max={64} defaultValue={16} list="common-sizes" toolparamdescription="Canvas width in pixels, typically 8, 16 or 32." />
          </label>
          <label className="field">
            <span>Height</span>
            <input name="height" type="number" min={1} max={64} defaultValue={16} list="common-sizes" toolparamdescription="Canvas height in pixels, typically 8, 16 or 32." />
          </label>
          <datalist id="common-sizes">
            <option value="8" />
            <option value="16" />
            <option value="24" />
            <option value="32" />
            <option value="48" />
          </datalist>
        </div>
        <div className="panel-row">
          <label className="field grow">
            <span>Kind</span>
            <select
              name="kind"
              defaultValue="character"
              toolparamdescription="'tile' adds the sprite to the tileset used for map painting."
            >
              <option value="character">character</option>
              <option value="item">item</option>
              <option value="tile">tile</option>
            </select>
          </label>
          <button type="submit" className="primary-btn">
            Create
          </button>
        </div>
        <p className="hint webmcp-note">
          ⚡ This form is also a WebMCP tool (<code>request_new_sprite</code>): an agent can prefill
          it for you — you keep the final click.
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
          <button className="text-btn danger" onClick={() => resetProject("blank")}>
            New blank
          </button>
        </div>
      </details>
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
        <span className="sprite-label">{sprite.name}</span>
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
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="text-btn"
      onClick={async () => {
        const st = useStore.getState();
        const hash = projectHashFromJson(st.exportProject());
        if (!hash) {
          alert("This project is too large to fit in a share link. Save the project JSON instead.");
          return;
        }
        const url = `${location.origin}${location.pathname}${hash}`;
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          alert(`Share link (copy manually):\n${url}`);
        }
      }}
    >
      {copied ? "Copied!" : "Share link"}
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
