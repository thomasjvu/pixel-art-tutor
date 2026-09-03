import { useEffect } from "react";
import { Icon } from "./Icon";
import { useEditor } from "../store/editorStore";
import { useStore } from "../store/projectStore";
import { spriteLayers, type BlendMode, type Layer } from "../types";
import { SpriteThumb } from "./SpriteThumb";

function stop(event: React.SyntheticEvent) {
  event.stopPropagation();
}

export function TimelinePanel() {
  const sprite = useStore((s) => s.activeSprite());
  const activeFrameIndex = useStore((s) => s.activeFrameIndex);
  const selectFrame = useStore((s) => s.selectFrame);
  const addFrame = useStore((s) => s.addFrame);
  const deleteFrame = useStore((s) => s.deleteFrame);
  const moveFrame = useStore((s) => s.moveFrame);
  const linkFrame = useStore((s) => s.linkFrame);
  const unlinkFrame = useStore((s) => s.unlinkFrame);
  const addLayer = useStore((s) => s.addLayer);
  const duplicateLayer = useStore((s) => s.duplicateLayer);
  const deleteLayer = useStore((s) => s.deleteLayer);
  const moveLayer = useStore((s) => s.moveLayer);
  const renameLayer = useStore((s) => s.renameLayer);
  const setLayerVisibility = useStore((s) => s.setLayerVisibility);
  const setLayerLocked = useStore((s) => s.setLayerLocked);
  const setLayerOpacity = useStore((s) => s.setLayerOpacity);
  const setLayerBlendMode = useStore((s) => s.setLayerBlendMode);
  const addFrameTag = useStore((s) => s.addFrameTag);
  const deleteFrameTag = useStore((s) => s.deleteFrameTag);
  const palette = useStore((s) => s.project.palette);
  const activeLayerId = useEditor((s) => s.activeLayerId);
  const setActiveLayerId = useEditor((s) => s.setActiveLayerId);
  const playing = useEditor((s) => s.playing);
  const setPlaying = useEditor((s) => s.setPlaying);
  const onion = useEditor((s) => s.onion);
  const toggleOnion = useEditor((s) => s.toggleOnion);
  const onionMode = useEditor((s) => s.onionMode);
  const setOnionMode = useEditor((s) => s.setOnionMode);
  const fps = useEditor((s) => s.fps);
  const setFps = useEditor((s) => s.setFps);
  const playbackMode = useEditor((s) => s.playbackMode);
  const setPlaybackMode = useEditor((s) => s.setPlaybackMode);
  const playbackTagId = useEditor((s) => s.playbackTagId);
  const setPlaybackTagId = useEditor((s) => s.setPlaybackTagId);

  const layers = sprite ? spriteLayers(sprite) : [];
  const activeLayer = layers.find((layer) => layer.id === activeLayerId) ?? layers[0];
  const frameCount = activeLayer?.frames.length ?? 0;
  const frameColumns = Math.max(frameCount, ...layers.map((layer) => layer.frames.length));
  const tags = sprite?.frameTags ?? [];

  useEffect(() => {
    if (activeLayer && activeLayer.id !== activeLayerId) setActiveLayerId(activeLayer.id);
  }, [activeLayer, activeLayerId, setActiveLayerId]);

  if (!sprite || !activeLayer) {
    return (
      <section className="timeline-panel timeline-empty">
        <p>Select a sprite to start animating.</p>
      </section>
    );
  }

  const previousFrame = () => selectFrame(Math.max(0, activeFrameIndex - 1));
  const nextFrame = () => selectFrame(Math.min(frameCount - 1, activeFrameIndex + 1));

  function selectLayer(layer: Layer, frameIndex = activeFrameIndex) {
    setActiveLayerId(layer.id);
    selectFrame(Math.min(frameIndex, layer.frames.length - 1));
  }

  function addNewLayer() {
    const id = addLayer(sprite.id, `Layer ${layers.length + 1}`, activeLayer.id);
    if (id) setActiveLayerId(id);
  }

  function handleLayerDrop(event: React.DragEvent<HTMLDivElement>, targetIndex: number) {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("application/x-pixel-layer");
    if (!sourceId) return;
    const sourceIndex = layers.findIndex((layer) => layer.id === sourceId);
    if (sourceIndex < 0 || sourceIndex === targetIndex) return;
    const direction = sourceIndex < targetIndex ? 1 : -1;
    for (let index = sourceIndex; index !== targetIndex; index += direction) {
      moveLayer(sourceId, direction, sprite.id);
    }
  }

  function handleFrameDrop(event: React.DragEvent<HTMLDivElement>, layer: Layer, targetIndex: number) {
    event.preventDefault();
    const sourceLayerId = event.dataTransfer.getData("application/x-pixel-frame-layer");
    const sourceIndex = Number(event.dataTransfer.getData("application/x-pixel-frame-index"));
    if (sourceLayerId !== layer.id || !Number.isInteger(sourceIndex) || sourceIndex === targetIndex) return;
    moveFrame(sourceIndex, targetIndex, sprite.id, layer.id);
  }

  function createTag() {
    const id = addFrameTag({
      name: `Tag ${tags.length + 1}`,
      from: Math.min(activeFrameIndex, frameCount - 1),
      to: frameCount - 1,
    }, sprite.id);
    if (id) setPlaybackTagId(id);
  }

  return (
    <section className="timeline-panel" aria-label="Animation timeline">
      <div className="timeline-header">
        <div className="timeline-heading">
          <h2>
            Timeline <span>{layers.length} layers · {frameColumns} cels</span>
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
          <select
            className="timeline-select"
            value={playbackMode}
            onChange={(event) => setPlaybackMode(event.target.value as "forward" | "reverse" | "ping_pong")}
            aria-label="Playback mode"
            title="Playback mode"
          >
            <option value="forward">Forward</option>
            <option value="reverse">Reverse</option>
            <option value="ping_pong">Ping-pong</option>
          </select>
          <select
            className="timeline-select tag-select"
            value={playbackTagId ?? "all"}
            onChange={(event) => setPlaybackTagId(event.target.value === "all" ? null : event.target.value)}
            aria-label="Animation tag"
            title="Playback section"
          >
            <option value="all">All frames</option>
            {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name} · {tag.from + 1}–{tag.to + 1}</option>)}
          </select>
          <button
            className={onion ? "timeline-tool active" : "timeline-tool"}
            disabled={frameCount < 2}
            onClick={toggleOnion}
            title={frameCount < 2 ? "Add another frame to use onion skin" : "Toggle onion skin"}
            aria-pressed={onion}
          >
            <Icon icon="mingcute:layers" />
            <span>Onion</span>
          </button>
          <button
            className={onion && onionMode === "red_blue" ? "timeline-tool active" : "timeline-tool"}
            disabled={!onion || frameCount < 2}
            onClick={() => setOnionMode(onionMode === "red_blue" ? "tint" : "red_blue")}
            title="Toggle red/blue onion skin"
            aria-pressed={onionMode === "red_blue"}
          >
            <span>R/B</span>
          </button>
          <button className="timeline-tool add-frame-btn" onClick={() => addFrame(sprite.id, activeFrameIndex, activeLayer.id)} title="Duplicate the selected cel">
            <Icon icon="mingcute:add" />
            <span>Cel</span>
          </button>
        </div>
      </div>

      <div className="timeline-tag-bar">
        <span className="timeline-tag-label">TAGS</span>
        {tags.map((tag) => (
          <span className={tag.id === playbackTagId ? "frame-tag active" : "frame-tag"} key={tag.id} style={{ "--tag-color": tag.color } as React.CSSProperties}>
            <button onClick={() => setPlaybackTagId(tag.id)} onDoubleClick={() => { const name = window.prompt("Animation tag name", tag.name); if (name) useStore.getState().renameFrameTag(tag.id, name, sprite.id); }} title={`${tag.name} · frames ${tag.from + 1}–${tag.to + 1}`}>{tag.name}</button>
            <button className="frame-tag-delete" onClick={() => { deleteFrameTag(tag.id, sprite.id); if (playbackTagId === tag.id) setPlaybackTagId(null); }} aria-label={`Delete ${tag.name} tag`} title={`Delete ${tag.name} tag`}>×</button>
          </span>
        ))}
        <button className="timeline-tag-add" onClick={createTag} title="Add a tag for the selected frame range">+ tag</button>
      </div>

      <div className="timeline-layer-controls" aria-label="Selected layer properties">
        <span className="timeline-layer-controls-label">LAYER</span>
        <strong title={activeLayer.name}>{activeLayer.name}</strong>
        <label className="layer-opacity-control">
          <span>Opacity</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={activeLayer.opacity}
            onChange={(event) => setLayerOpacity(activeLayer.id, Number(event.target.value), sprite.id)}
            aria-label={`${activeLayer.name} opacity`}
          />
          <output>{Math.round(activeLayer.opacity * 100)}%</output>
        </label>
        <select
          className="layer-blend-select"
          value={activeLayer.blendMode}
          onChange={(event) => setLayerBlendMode(activeLayer.id, event.target.value as BlendMode, sprite.id)}
          aria-label={`${activeLayer.name} blend mode`}
          title="Layer blend mode"
        >
          <option value="normal">Normal</option>
          <option value="multiply">Multiply</option>
          <option value="screen">Screen</option>
          <option value="overlay">Overlay</option>
        </select>
      </div>

      <div className="timeline-scroll">
        <div className="timeline-ruler">
          <div className="timeline-lane-label">LAYERS</div>
          <div className="timeline-ruler-track">
            {Array.from({ length: frameColumns }, (_, index) => <span className="ruler-tick" key={index}>{index + 1}</span>)}
          </div>
        </div>
        {layers.map((layer, layerIndex) => (
          <div
            className={layer.id === activeLayer.id ? "timeline-row active" : "timeline-row"}
            key={layer.id}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("application/x-pixel-layer", layer.id);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => handleLayerDrop(event, layerIndex)}
          >
            <div className="timeline-lane-label timeline-layer-name" onClick={() => selectLayer(layer)}>
              <span className="layer-drag-handle" title="Drag to reorder layer">⠿</span>
              <button className="layer-visibility" onClick={(event) => { stop(event); setLayerVisibility(layer.id, !layer.visible, sprite.id); }} aria-pressed={layer.visible} aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`} title={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}>
                <Icon icon={layer.visible ? "mingcute:eye" : "mingcute:eye-off"} />
              </button>
              <button className={layer.locked ? "layer-lock locked" : "layer-lock"} onClick={(event) => { stop(event); setLayerLocked(layer.id, !layer.locked, sprite.id); }} aria-pressed={layer.locked} aria-label={layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`} title={layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`}>
                <Icon icon={layer.locked ? "mingcute:lock" : "mingcute:unlock"} />
              </button>
              <button className="layer-name-button" onClick={(event) => { stop(event); selectLayer(layer); }} onDoubleClick={(event) => { stop(event); const name = window.prompt("Layer name", layer.name); if (name) renameLayer(layer.id, name, sprite.id); }} title={`${layer.name} · double-click to rename`}>
                {layer.name}
              </button>
              <span className="layer-row-actions">
                <button onClick={(event) => { stop(event); moveLayer(layer.id, -1, sprite.id); }} disabled={layerIndex === 0} aria-label={`Move ${layer.name} down`} title="Move layer down">↓</button>
                <button onClick={(event) => { stop(event); moveLayer(layer.id, 1, sprite.id); }} disabled={layerIndex === layers.length - 1} aria-label={`Move ${layer.name} up`} title="Move layer up">↑</button>
                <button onClick={(event) => { stop(event); const id = duplicateLayer(layer.id, sprite.id); if (id) setActiveLayerId(id); }} aria-label={`Duplicate ${layer.name}`} title="Duplicate layer">＋</button>
                <button onClick={(event) => { stop(event); deleteLayer(layer.id, sprite.id); if (activeLayer.id === layer.id) setActiveLayerId(layers[Math.max(0, layerIndex - 1)]?.id ?? null); }} disabled={layers.length <= 1} aria-label={`Delete ${layer.name}`} title="Delete layer">×</button>
              </span>
            </div>
            <div className="timeline-cels">
              {layer.frames.map((frame, index) => (
                <div
                  className={layer.id === activeLayer.id && index === activeFrameIndex ? "timeline-cel active" : "timeline-cel"}
                  key={frame.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("application/x-pixel-frame-layer", layer.id);
                    event.dataTransfer.setData("application/x-pixel-frame-index", String(index));
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => handleFrameDrop(event, layer, index)}
                >
                  <button className="timeline-cel-button" onClick={() => selectLayer(layer, index)} title={`${layer.name}, frame ${index + 1}`}>
                    <SpriteThumb sprite={sprite} frames={layer.frames} frameIndex={index} palette={palette} size={48} />
                    <span>{index + 1}</span>
                  </button>
                  {layer.frames.length > 1 && <button className="timeline-cel-delete" onClick={() => deleteFrame(index, sprite.id, layer.id)} title={`Delete ${layer.name} frame ${index + 1}`} aria-label={`Delete ${layer.name} frame ${index + 1}`}><Icon icon="mingcute:close-circle" /></button>}
                  {(index > 0 || frame.linkId) && (
                    <button
                      className={frame.linkId ? "timeline-cel-link linked" : "timeline-cel-link"}
                      onClick={() => frame.linkId ? unlinkFrame(index, sprite.id, layer.id) : linkFrame(index, index - 1, sprite.id, layer.id)}
                      title={frame.linkId ? `Unlink ${layer.name} frame ${index + 1}` : `Link ${layer.name} frame ${index + 1} to frame ${index}`}
                      aria-label={frame.linkId ? `Unlink ${layer.name} frame ${index + 1}` : `Link ${layer.name} frame ${index + 1}`}
                    >
                      ⛓
                    </button>
                  )}
                </div>
              ))}
              <button className="timeline-add-cell" onClick={() => { setActiveLayerId(layer.id); addFrame(sprite.id, Math.min(activeFrameIndex, layer.frames.length - 1), layer.id); }} title={`Duplicate ${layer.name} cel`}><Icon icon="mingcute:add" /></button>
            </div>
          </div>
        ))}
        <button className="timeline-add-layer" onClick={addNewLayer}><Icon icon="mingcute:add" /> New layer</button>
      </div>

      <div className="timeline-footer">
        <span><Icon icon="mingcute:mouse" /> Click a cel to edit</span>
        <span><kbd>←</kbd><kbd>→</kbd> step frames</span>
        <span className="timeline-meta">{sprite.name} · {playbackMode.replace("_", " ")}{playbackTagId ? " · tagged" : " · all frames"}</span>
      </div>
    </section>
  );
}
