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
    </div>
  );
}
