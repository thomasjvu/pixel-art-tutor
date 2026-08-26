import { useStore } from "../store/projectStore";
import { SpriteThumb } from "./SpriteThumb";
import type { SpriteKind } from "../types";
import { downloadText } from "../engine/exportImage";

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
    const id = addSprite({ name: n, width: w, height: h, kind: k });
    if (e.agentInvoked && e.respondWith) {
      e.respondWith(Promise.resolve({ ok: true, spriteId: id, message: `"${n}" created and now active in the editor.` }));
    }
    e.currentTarget.reset();
  }

  return (
    <div className="panel">
      <div className="sprite-list">
        {project.sprites.map((sp) => (
          <div key={sp.id} className={sp.id === activeSprite?.id ? "sprite-row active" : "sprite-row"}>
            <button
              className="sprite-select"
              onClick={() => setActiveSprite(sp.id)}
              title={`Edit ${sp.name}`}
            >
              <SpriteThumb sprite={sp} palette={project.palette} size={36} />
              <input
                className="sprite-name"
                value={sp.name}
                onChange={(e) => renameSprite(sp.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Rename ${sp.name}`}
              />
              <span className={"badge kind-" + sp.kind}>{sp.kind}</span>
            </button>
            {project.sprites.length > 1 && (
              <button className="icon-btn" title="Delete sprite" onClick={() => deleteSprite(sp.id)}>
                ×
              </button>
            )}
          </div>
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
          <label className="text-btn file-btn">
            Import
            <input
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                file.text().then((t) => {
                  try {
                    useStore.getState().loadProject(JSON.parse(t));
                  } catch {
                    alert("That doesn't look like a valid project file.");
                  }
                });
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
