import { useState } from "react";
import { useStore } from "../store/projectStore";
import { useEditor } from "../store/editorStore";
import { normalizeHex } from "../engine/color";

function hexToHsl(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16) / 255;
  const g = Number.parseInt(value.slice(2, 4), 16) / 255;
  const b = Number.parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness];
  const distance = max - min;
  const saturation = lightness > 0.5 ? distance / (2 - max - min) : distance / (max + min);
  let hue = 0;
  if (max === r) hue = (g - b) / distance + (g < b ? 6 : 0);
  else if (max === g) hue = (b - r) / distance + 2;
  else hue = (r - g) / distance + 4;
  return [hue * 60, saturation, lightness];
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const h = ((hue % 360) + 360) % 360 / 60;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const second = chroma * (1 - Math.abs((h % 2) - 1));
  const match = lightness - chroma / 2;
  const rgb = h < 1 ? [chroma, second, 0] : h < 2 ? [second, chroma, 0] : h < 3 ? [0, chroma, second] : h < 4 ? [0, second, chroma] : h < 5 ? [second, 0, chroma] : [chroma, 0, second];
  return `#${rgb.map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, "0")).join("")}`;
}

const EMPTY_PALETTE_ALPHA: number[] = [];

export function PalettePanel() {
  const palette = useStore((s) => s.project.palette);
  const paletteAlpha = useStore((s) => s.project.paletteAlpha ?? EMPTY_PALETTE_ALPHA);
  const colorIdx = useEditor((s) => s.colorIdx);
  const setColor = useEditor((s) => s.setColor);
  const addPaletteColor = useStore((s) => s.addPaletteColor);
  const replaceColor = useStore((s) => s.replaceColor);
  const setPaletteAlpha = useStore((s) => s.setPaletteAlpha);
  const movePaletteColor = useStore((s) => s.movePaletteColor);
  const [custom, setCustom] = useState("#38b764");
  const [replaceMode, setReplaceMode] = useState(false);
  const [columns, setColumns] = useState(8);
  const [clipboardStatus, setClipboardStatus] = useState("");

  function addColor() {
    const hex = normalizeHex(custom);
    if (!hex) return;
    const r = addPaletteColor(hex);
    if ("index" in r) setColor(r.index);
  }

  return (
    <div className="panel">
      <div className="palette-toolbar">
        <span className="palette-toolbar-label">PALETTE</span>
        <label className="palette-columns-control">
          <span>Cols</span>
          <select value={columns} onChange={(event) => setColumns(Number(event.target.value))} aria-label="Palette columns">
            {[4, 6, 8, 10, 12].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <button
          className="text-btn compact"
          onClick={() => {
            const value = palette[colorIdx];
            if (!value) return;
            if (!navigator.clipboard) {
              setClipboardStatus("clipboard unavailable");
              return;
            }
            void navigator.clipboard.writeText(value).then(() => setClipboardStatus("copied")).catch(() => setClipboardStatus("clipboard unavailable"));
          }}
          title="Copy the selected color as hex"
        >Copy</button>
        <button
          className="text-btn compact"
          onClick={async () => {
            try {
              const value = await navigator.clipboard?.readText();
              const result = value ? addPaletteColor(value) : { error: "clipboard is empty" };
              if ("index" in result) {
                setColor(result.index);
                setClipboardStatus("pasted");
              } else setClipboardStatus(result.error);
            } catch {
              setClipboardStatus("clipboard unavailable");
            }
          }}
          title="Add a hex color from the clipboard"
        >Paste</button>
      </div>
      <div className="palette-grid" style={{ "--palette-columns": columns } as React.CSSProperties}>
        {palette.map((hex, i) => (
          <button
            key={hex + i}
            className={i === colorIdx ? "swatch active" : "swatch"}
            style={{ background: hex, opacity: paletteAlpha[i] ?? 1 }}
            title={`#${i} ${hex} · ${Math.round((paletteAlpha[i] ?? 1) * 100)}% alpha`}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("application/x-pixel-palette-index", String(i));
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const from = Number(event.dataTransfer.getData("application/x-pixel-palette-index"));
              if (Number.isInteger(from) && movePaletteColor(from, i)) setColor(i);
            }}
            onClick={() => (replaceMode ? replaceColor(colorIdx, i) : setColor(i))}
          />
        ))}
      </div>
      {clipboardStatus && <p className="palette-status" role="status">{clipboardStatus}</p>}
      <div className="panel-row">
        {replaceMode && <span className="hint">Click a swatch to remap all “{palette[colorIdx]}” pixels to it</span>}
      </div>
      <div className="palette-alpha-row">
        <label className="alpha-label" htmlFor="palette-alpha">Alpha</label>
        <input
          id="palette-alpha"
          className="alpha-range"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={paletteAlpha[colorIdx] ?? 1}
          onChange={(event) => setPaletteAlpha(colorIdx, Number(event.target.value))}
          aria-label="Selected color alpha"
        />
        <output>{Math.round((paletteAlpha[colorIdx] ?? 1) * 100)}%</output>
      </div>
      <div className="palette-harmony-row">
        <button
          className="color-wheel"
          title="Add a triadic color harmony"
          aria-label="Add a triadic color harmony"
          onClick={() => {
            const source = normalizeHex(custom) ?? palette[colorIdx] ?? "#38b764";
            const [hue, saturation, lightness] = hexToHsl(source);
            let last = colorIdx;
            for (const offset of [120, 240]) {
              const result = addPaletteColor(hslToHex(hue + offset, saturation, lightness));
              if ("index" in result) last = result.index;
            }
            setColor(last);
          }}
        >
          <span />
        </button>
        <span className="hint">Color wheel · triad</span>
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
