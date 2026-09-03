import { useState } from "react";
import { useStore } from "../store/projectStore";
import { useEditor } from "../store/editorStore";
import { normalizeHex } from "../engine/color";

export function PalettePanel() {
  const palette = useStore((s) => s.project.palette);
  const colorIdx = useEditor((s) => s.colorIdx);
  const setColor = useEditor((s) => s.setColor);
  const addPaletteColor = useStore((s) => s.addPaletteColor);
  const replaceColor = useStore((s) => s.replaceColor);
  const [custom, setCustom] = useState("#38b764");
  const [replaceMode, setReplaceMode] = useState(false);

  function addColor() {
    const hex = normalizeHex(custom);
    if (!hex) return;
    const r = addPaletteColor(hex);
    if ("index" in r) setColor(r.index);
  }

  return (
    <div className="panel">
      <div className="palette-grid">
        {palette.map((hex, i) => (
          <button
            key={hex + i}
            className={i === colorIdx ? "swatch active" : "swatch"}
            style={{ background: hex }}
            title={`#${i} ${hex}`}
            onClick={() => (replaceMode ? replaceColor(colorIdx, i) : setColor(i))}
          />
        ))}
      </div>
      <div className="panel-row">
        {replaceMode && <span className="hint">Click a swatch to remap all “{palette[colorIdx]}” pixels to it</span>}
      </div>
      <div className="panel-row">
        <input
          type="color"
          value={normalizeHex(custom) ?? "#38b764"}
          onChange={(e) => setCustom(e.target.value)}
          className="color-input"
          aria-label="Pick custom color"
        />
        <input
          className="text-input grow"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          aria-label="Hex color"
        />
        <button className="text-btn" onClick={addColor}>
          Add
        </button>
      </div>
      <div className="panel-row">
        <button
          className={replaceMode ? "text-btn active" : "text-btn"}
          onClick={() => setReplaceMode(!replaceMode)}
          title="Replace the selected color with another across the project"
        >
          {replaceMode ? "Cancel remap" : "Remap color…"}
        </button>
      </div>
      <PaletteLibrary />
    </div>
  );
}

function PaletteLibrary() {
  const savePaletteAs = useStore((s) => s.savePaletteAs);
  const applyPaletteSave = useStore((s) => s.applyPaletteSave);
  const deletePaletteSave = useStore((s) => s.deletePaletteSave);
  const listPaletteSaves = useStore((s) => s.listPaletteSaves);
  const [draft, setDraft] = useState("");
  const [saves, setSaves] = useState(() => listPaletteSaves());
  const refresh = () => setSaves(listPaletteSaves());

  function save() {
    const result = savePaletteAs(draft.trim() ? draft : undefined);
    if (!result.ok) {
      alert(`Could not save palette: ${result.error}`);
      return;
    }
    setDraft("");
    refresh();
  }

  function apply(name: string) {
    const result = applyPaletteSave(name);
    if (!result.ok) alert(`Could not apply palette: ${result.error}`);
  }

  return (
    <div>
      <div className="panel-row">
        <input
          className="text-input grow"
          value={draft}
          maxLength={64}
          placeholder="slime-grotto"
          aria-label="Palette save name"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
        />
        <button className="text-btn" onClick={save} title="Save the current palette">
          Save palette
        </button>
      </div>
      {saves.length === 0 && <p className="hint">No saved palettes yet.</p>}
      <ul className="log-list">
        {saves.map((s) => (
          <li key={s.name}>
            <button className="text-btn grow" onClick={() => apply(s.name)} title={`Merge '${s.name}' into this project`}>
              {s.name}
            </button>
            <button
              className="icon-btn"
              title={`Delete '${s.name}'`}
              aria-label={`Delete saved palette ${s.name}`}
              onClick={() => {
                deletePaletteSave(s.name);
                refresh();
              }}
            >
              <span aria-hidden="true">×</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
