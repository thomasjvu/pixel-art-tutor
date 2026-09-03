import { useStore } from "../store/projectStore";
import { Icon } from "./Icon";
import { SpriteThumb } from "./SpriteThumb";
import { spriteLayers } from "../types";
import { useEditor } from "../store/editorStore";

export function FramesPanel() {
  const sprite = useStore((s) => s.activeSprite());
  const activeFrameIndex = useStore((s) => s.activeFrameIndex);
  const selectFrame = useStore((s) => s.selectFrame);
  const addFrame = useStore((s) => s.addFrame);
  const deleteFrame = useStore((s) => s.deleteFrame);
  const palette = useStore((s) => s.project.palette);
  const activeLayerId = useEditor((s) => s.activeLayerId);
  const setActiveLayerId = useEditor((s) => s.setActiveLayerId);

  if (!sprite) return null;

  const layers = spriteLayers(sprite);
  const layer = layers.find((entry) => entry.id === activeLayerId) ?? layers[0]!;

  return (
    <div className="panel">
      <div className="frames-row">
        {layer.frames.map((f, i) => (
          <div key={f.id} className={i === activeFrameIndex ? "frame-cell active" : "frame-cell"}>
            <button className="frame-thumb" onClick={() => { setActiveLayerId(layer.id); selectFrame(i); }} title={`${layer.name} frame ${i + 1}`}>
              <SpriteThumb sprite={sprite} frames={layer.frames} frameIndex={i} palette={palette} size={56} />
            </button>
            <span className="frame-num">{i + 1}</span>
            {layer.frames.length > 1 && (
              <button
                className="frame-del"
                title="Delete frame"
                aria-label={`Delete frame ${i + 1}`}
                onClick={() => deleteFrame(i, sprite.id, layer.id)}
              >
                <Icon icon="mingcute:close-circle" />
              </button>
            )}
          </div>
        ))}
        <button
          className="frame-add"
          onClick={() => addFrame(sprite.id, activeFrameIndex, layer.id)}
          title="Duplicate last frame"
          aria-label="Duplicate last frame"
        >
          <Icon icon="mingcute:add" />
        </button>
      </div>
      <p className="hint">
        {layer.name} · duplicate a cel, then nudge pixels to build an idle/walk cycle. Agents can do the
        in-betweening for you via WebMCP.
      </p>
    </div>
  );
}
