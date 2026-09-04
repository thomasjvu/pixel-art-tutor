import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Icon } from "./components/Icon";
import { CanvasStage } from "./components/CanvasStage";
import { Toolbar } from "./components/Toolbar";
import { PalettePanel } from "./components/PalettePanel";
import { FramesPanel } from "./components/FramesPanel";
import { SpritesPanel } from "./components/SpritesPanel";
import { TilemapPanel } from "./components/TilemapPanel";
import { AgentPanel } from "./components/AgentPanel";
import { CritiquePanel } from "./components/CritiquePanel";
import { TimelinePanel } from "./components/TimelinePanel";
import { ProjectMenu } from "./components/ProjectMenu";
import { ProjectTabs } from "./components/ProjectTabs";
import { StatusBar } from "./components/StatusBar";
import { PreferencesDialog } from "./components/PreferencesDialog";
import { ShareDialog } from "./components/ShareDialog";
import { RoomBridge } from "./components/RoomBridge";
import { RoomPanel } from "./components/RoomPanel";
import { TutorialOverlay } from "./components/TutorialOverlay";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { NewProjectDialog } from "./components/NewProjectDialog";
import { decodeProjectFromHashParam } from "./engine/share";
import { downloadText, spriteFileStem } from "./engine/exportImage";
import { registerTutorTools } from "./webmcp/registerTools";
import { useUi } from "./store/uiStore";
import { useEditor } from "./store/editorStore";
import { useStore } from "./store/projectStore";
import { redoProject, undoProject } from "./realtime/roomClient";
import { matchesShortcut, usePreferences } from "./store/preferencesStore";
import { spriteLayers } from "./types";
import { subscribeToCodexPet } from "./pets/codexPets";

type Tab = "sprites" | "palette" | "frames" | "map" | "critique" | "agent" | "room";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "sprites", label: "Sprites", icon: "mingcute:picture" },
  { id: "palette", label: "Colors", icon: "mingcute:palette" },
  { id: "frames", label: "Frames", icon: "mingcute:movie" },
  { id: "map", label: "Map", icon: "mingcute:map" },
  { id: "critique", label: "Tutor", icon: "mingcute:bulb" },
  { id: "agent", label: "Agent", icon: "mingcute:bot" },
  { id: "room", label: "Room", icon: "mingcute:group" },
];

function AppContent() {
  const [tab, setTab] = useState<Tab>("sprites");
  const mcpStatus = useUi((s) => s.mcpStatus);
  const theme = useUi((s) => s.theme);
  const projectName = useStore((s) => s.project.name);
  const toolbarOpen = useEditor((s) => s.toolbarOpen);
  const sidebarOpen = useEditor((s) => s.sidebarOpen);
  const timelineOpen = useEditor((s) => s.timelineOpen);
  const timelineHeight = useEditor((s) => s.timelineHeight);
  const hydratedShareParam = useRef<string | null>(null);

  useEffect(() => {
    const m = location.hash.match(/^#p=(.+)$/);
    const param = m?.[1];
    if (!param || hydratedShareParam.current === param) return;
    hydratedShareParam.current = param;
    const parsed = decodeProjectFromHashParam(param);
    if (!parsed) return;
    const result = useStore.getState().loadProject(parsed);
    if (!result.ok) console.warn("[share] ignoring bad permalink:", result.error);
  }, []);

  useEffect(() => {
    const controller = registerTutorTools();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let detected = false;
    const unsubscribe = subscribeToCodexPet((pet) => {
      detected = true;
      useUi.getState().adoptCodexPet(pet);
    });
    const fallbackTimer = window.setTimeout(() => {
      if (detected) return;
      const state = useUi.getState();
      state.setPetDiscovery(state.selectedPet ? "fallback" : "none");
    }, 800);
    return () => {
      window.clearTimeout(fallbackTimer);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    document.title = `${projectName} · Pixel Art Tutor`;
  }, [projectName]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const command = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (command && key === "s") {
        event.preventDefault();
        const state = useStore.getState();
        downloadText(state.exportProject(), `${spriteFileStem(state.project.name)}.pixeltutor.json`);
        return;
      }
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (command && key === "1") {
        event.preventDefault();
        useStore.getState().resetProject("starter");
        return;
      }
      if (command && key === "n") {
        event.preventDefault();
        useUi.getState().setNewProjectOpen(true);
        return;
      }
      if (command && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redoProject();
        else undoProject();
        return;
      }
      if (command && key === "y") {
        event.preventDefault();
        redoProject();
        return;
      }
      const editor = useEditor.getState();
      const keymap = usePreferences.getState().keymap;
      if (matchesShortcut(event, keymap.pencil)) {
        event.preventDefault();
        editor.setTool("pencil");
        return;
      }
      if (matchesShortcut(event, keymap.eraser)) {
        event.preventDefault();
        editor.setTool("eraser");
        return;
      }
      if (matchesShortcut(event, keymap.fill)) {
        event.preventDefault();
        editor.setTool("fill");
        return;
      }
      if (matchesShortcut(event, keymap.picker)) {
        event.preventDefault();
        editor.setTool("picker");
        return;
      }
      if (matchesShortcut(event, keymap.select)) {
        event.preventDefault();
        editor.setTool("select");
        return;
      }
      if (!event.repeat && matchesShortcut(event, keymap.toggleGrid)) {
        event.preventDefault();
        editor.setShowGrid(!editor.showGrid);
        return;
      }
      if (!event.repeat && matchesShortcut(event, keymap.toggleOnion)) {
        const onionAvailable = (useStore.getState().activeSprite()?.frames.length ?? 0) > 1;
        if (onionAvailable) {
          event.preventDefault();
          editor.toggleOnion();
        }
        return;
      }
      if (!event.repeat && matchesShortcut(event, keymap.togglePixelPerfect)) {
        event.preventDefault();
        editor.setPixelPerfect(!editor.pixelPerfect);
        return;
      }
      if (!event.repeat && matchesShortcut(event, keymap.toggleShading)) {
        event.preventDefault();
        editor.setShadingMode(!editor.shadingMode);
        return;
      }
      if (!event.repeat && matchesShortcut(event, keymap.toggleTiled)) {
        event.preventDefault();
        editor.setTiledMode(!editor.tiledMode);
        return;
      }
      if (!event.repeat && matchesShortcut(event, keymap.toggleBrush)) {
        event.preventDefault();
        editor.setBrushMode(editor.brushMode === "solid" ? "checker" : "solid");
        return;
      }
      switch (event.key.toLowerCase()) {
        case "escape": {
          if (editor.selection) {
            editor.setSelection(null);
            break;
          }
          return;
        }
        case "delete":
        case "backspace": {
          const sel = editor.selection;
          if (sel && !editor.layerLocked) {
            event.preventDefault();
            useStore.getState().fillRegion(sel.x, sel.y, sel.width, sel.height, null, sel.spriteId, sel.frameIndex, false, sel.layerId);
          }
          return;
        }
        case "arrowleft":
        case "arrowright":
        case "arrowup":
          case "arrowdown": {
            const sel = editor.tool === "select" ? editor.selection : null;
          if (sel && !editor.layerLocked) {
            event.preventDefault();
            const step = event.shiftKey ? 8 : 1;
            const dx = key === "arrowleft" ? -step : key === "arrowright" ? step : 0;
            const dy = key === "arrowup" ? -step : key === "arrowdown" ? step : 0;
            const store = useStore.getState();
            const sprite = store.project.sprites.find((s) => s.id === sel.spriteId);
            if (sprite && store.movePixels(sel, dx, dy) >= 0) {
              editor.setSelection({
                ...sel,
                x: Math.max(0, Math.min(sprite.width - sel.width, sel.x + dx)),
                y: Math.max(0, Math.min(sprite.height - sel.height, sel.y + dy)),
              });
            }
            return;
          }
          if (key === "arrowleft") {
            useStore.getState().selectFrame(Math.max(0, useStore.getState().activeFrameIndex - 1));
            break;
          }
          if (key === "arrowright") {
            const state = useStore.getState();
            const sprite = state.activeSprite();
            const layer = sprite ? spriteLayers(sprite).find((entry) => entry.id === editor.activeLayerId) ?? spriteLayers(sprite)[0] : null;
            if (layer) state.selectFrame(Math.min(layer.frames.length - 1, state.activeFrameIndex + 1));
          }
          break;
        }
        case "+":
        case "=": editor.setZoom(editor.zoom + 1); break;
        case "-": editor.setZoom(editor.zoom - 1); break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={`app theme-${theme} ${toolbarOpen ? "" : "toolbar-collapsed"} ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
      <RoomBridge />

      <ProjectMenu />
      <ProjectTabs />

      <main className={`workspace ${toolbarOpen ? "" : "toolbar-collapsed"} ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
        {!toolbarOpen ? (
          <button
            className="rail-tab"
            onClick={() => useEditor.getState().setToolbarOpen(true)}
            title="Show tools"
            aria-label="Show tools"
          >
            <Icon icon="mingcute:forward-2" />
          </button>
        ) : (
          <Toolbar />
        )}
        <section
          className={timelineOpen ? "editor-column" : "editor-column timeline-collapsed"}
          style={{ "--timeline-height": `${timelineOpen ? timelineHeight : 42}px` } as CSSProperties}
        >
          <CanvasStage />
          <TimelinePanel />
        </section>
        {sidebarOpen ? (
        <aside className="sidebar">
          <div className="sidebar-heading">
            <div>
              <strong>Inspector</strong>
            </div>
            <button
              className="rail-hide"
              onClick={() => useEditor.getState().setSidebarOpen(false)}
              title="Hide inspector"
              aria-label="Hide inspector"
            >
              <Icon icon="mingcute:forward-2" />
            </button>
            <span className="dock-grip" aria-hidden="true"><Icon icon="mingcute:more-2" /></span>
          </div>
          <nav className="tabs" role="tablist" aria-label="Studio panels">
            {TABS.map((item) => (
              <button
                key={item.id}
                role="tab"
                aria-selected={tab === item.id}
                className={tab === item.id ? "tab active" : "tab"}
                onClick={() => setTab(item.id)}
              >
                <Icon icon={item.icon} />
                <span>{item.label}</span>
                {item.id === "agent" && (
                  <span
                    className={
                      "tab-dot " +
                      (mcpStatus === "ready" ? "ok" : mcpStatus === "registering" ? "" : "err")
                    }
                  />
                )}
              </button>
            ))}
          </nav>
          <div className={tab === "palette" ? "tab-body" : "tab-body hidden"}>
            <PalettePanel />
          </div>
          <div className={tab === "frames" ? "tab-body" : "tab-body hidden"}>
            <FramesPanel />
          </div>
          <div className={tab === "sprites" ? "tab-body" : "tab-body hidden"}>
            <SpritesPanel />
          </div>
          <div className={tab === "map" ? "tab-body" : "tab-body hidden"}>
            <TilemapPanel />
          </div>
          <div className={tab === "critique" ? "tab-body" : "tab-body hidden"}>
            <CritiquePanel />
          </div>
          <div className={tab === "agent" ? "tab-body" : "tab-body hidden"}>
            <AgentPanel />
          </div>
          <div className={tab === "room" ? "tab-body" : "tab-body hidden"}>
            <RoomPanel />
          </div>
          <div className="sidebar-footnote">
            <span className="pixel-heart"><Icon icon="mingcute:heart" /></span>
            <span>made for tiny worlds</span>
          </div>
        </aside>
        ) : (
          <button
            className="rail-tab"
            onClick={() => useEditor.getState().setSidebarOpen(true)}
            title="Show inspector"
            aria-label="Show inspector"
          >
            «
          </button>
        )}
      </main>

      <StatusBar onOpenAgent={() => setTab("agent")} />
      <PreferencesDialog />
      <NewProjectDialog />
      <ShareDialog />
      <TutorialOverlay />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
