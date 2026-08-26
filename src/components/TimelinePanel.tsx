import { Icon } from "./Icon";
import { useEditor } from "../store/editorStore";
import { useStore } from "../store/projectStore";
import { SpriteThumb } from "./SpriteThumb";

export function TimelinePanel() {
  const sprite = useStore((s) => s.activeSprite());
  const activeFrameIndex = useStore((s) => s.activeFrameIndex);
  const selectFrame = useStore((s) => s.selectFrame);
  const addFrame = useStore((s) => s.addFrame);
  const deleteFrame = useStore((s) => s.deleteFrame);
  const palette = useStore((s) => s.project.palette);
  const playing = useEditor((s) => s.playing);
  const setPlaying = useEditor((s) => s.setPlaying);
  const onion = useEditor((s) => s.onion);
  const toggleOnion = useEditor((s) => s.toggleOnion);
  const fps = useEditor((s) => s.fps);
  const setFps = useEditor((s) => s.setFps);

  if (!sprite) {
    return (
      <section className="timeline-panel timeline-empty">
        <span className="eyebrow">Animation</span>
        <p>Select a sprite to start animating.</p>
      </section>
    );
  }

  const frameCount = sprite.frames.length;
  const previousFrame = () => selectFrame(Math.max(0, activeFrameIndex - 1));
  const nextFrame = () => selectFrame(Math.min(frameCount - 1, activeFrameIndex + 1));

  return (
    <section className="timeline-panel" aria-label="Animation timeline">
      <div className="timeline-header">
        <div className="timeline-heading">
          <span className="eyebrow">Animation</span>
          <h2>
            Timeline <span>{frameCount} cels</span>
          </h2>
        </div>
        <div className="timeline-controls">
          <button className="round-btn" onClick={previousFrame} title="Previous frame">
            <Icon icon="mingcute:back-2" />
          </button>
          <button
            className={playing ? "round-btn play active" : "round-btn play"}
            onClick={() => setPlaying(!playing)}
            disabled={frameCount < 2}
            title={playing ? "Pause preview" : "Play preview"}
          >
            <Icon icon={playing ? "mingcute:pause-fill" : "mingcute:play-fill"} />
          </button>
          <button className="round-btn" onClick={nextFrame} title="Next frame">
            <Icon icon="mingcute:forward-2" />
          </button>
          <span className="control-divider" />
          <label className="fps-control">
            <span>FPS</span>
            <input
              type="number"
              min={1}
              max={30}
              value={fps}
              onChange={(event) => setFps(Number(event.target.value) || 1)}
              aria-label="Animation frames per second"
            />
          </label>
          <button
            className={onion ? "timeline-tool active" : "timeline-tool"}
            onClick={toggleOnion}
            title="Toggle onion skin"
          >
            <Icon icon="mingcute:layers" />
            <span>Onion</span>
          </button>
          <button
            className="timeline-tool add-frame-btn"
            onClick={() => addFrame(sprite.id, activeFrameIndex)}
            title="Duplicate the selected frame"
          >
            <Icon icon="mingcute:add" />
            <span>Cel</span>
          </button>
        </div>
      </div>

      <div className="timeline-scroll">
        <div className="timeline-ruler">
          <div className="timeline-lane-label">LAYER</div>
          <div className="timeline-ruler-track">
            {sprite.frames.map((_, index) => (
              <span className="ruler-tick" key={index}>
                {index + 1}
              </span>
            ))}
          </div>
        </div>
        <div className="timeline-row">
          <div className="timeline-lane-label timeline-layer-name">
            <span className="layer-icon"><Icon icon="mingcute:layers" /></span>
            <span>Artwork</span>
            <span className="layer-lock" aria-label="Visible layer"><Icon icon="mingcute:eye" /></span>
          </div>
          <div className="timeline-cels">
            {sprite.frames.map((frame, index) => (
              <div
                className={index === activeFrameIndex ? "timeline-cel active" : "timeline-cel"}
                key={frame.id}
              >
                <button
                  className="timeline-cel-button"
                  onClick={() => selectFrame(index)}
                  title={`Frame ${index + 1}`}
                >
                  <SpriteThumb sprite={sprite} frameIndex={index} palette={palette} size={48} />
                  <span>{index + 1}</span>
                </button>
                {frameCount > 1 && (
                  <button
                    className="timeline-cel-delete"
                    onClick={() => deleteFrame(index)}
                    title={`Delete frame ${index + 1}`}
                    aria-label={`Delete frame ${index + 1}`}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              className="timeline-add-cell"
              onClick={() => addFrame(sprite.id, activeFrameIndex)}
              title="Duplicate selected frame"
            >
              <Icon icon="mingcute:add" />
            </button>
          </div>
        </div>
      </div>

      <div className="timeline-footer">
        <span><Icon icon="mingcute:mouse" /> Click a cel to edit</span>
        <span><kbd>←</kbd><kbd>→</kbd> step frames</span>
        <span className="timeline-meta">{sprite.name} · looping preview</span>
      </div>
    </section>
  );
}
