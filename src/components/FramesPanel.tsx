import { useStore } from "../store/projectStore";
import { SpriteThumb } from "./SpriteThumb";

export function FramesPanel() {
  const sprite = useStore((s) => s.activeSprite());
  const activeFrameIndex = useStore((s) => s.activeFrameIndex);
  const selectFrame = useStore((s) => s.selectFrame);
  const addFrame = useStore((s) => s.addFrame);
  const deleteFrame = useStore((s) => s.deleteFrame);
  const palette = useStore((s) => s.project.palette);

  if (!sprite) return null;

  return (
    <div className="panel">
      <div className="frames-row">
        {sprite.frames.map((f, i) => (
          <div key={f.id} className={i === activeFrameIndex ? "frame-cell active" : "frame-cell"}>
            <button className="frame-thumb" onClick={() => selectFrame(i)} title={`Frame ${i + 1}`}>
              <SpriteThumb sprite={sprite} frameIndex={i} palette={palette} size={56} />
            </button>
            <span className="frame-num">{i + 1}</span>
            {sprite.frames.length > 1 && (
              <button
                className="frame-del"
                title="Delete frame"
                onClick={() => deleteFrame(i)}
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button className="frame-add" onClick={() => addFrame()} title="Duplicate last frame">
          +
        </button>
      </div>
      <p className="hint">
        Duplicate a frame, then nudge pixels to build an idle/walk cycle. Agents can do the
        in-betweening for you via WebMCP.
      </p>
    </div>
  );
}
