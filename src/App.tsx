import { useEffect, useRef, useState } from "react";
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
import { StatusBar } from "./components/StatusBar";
import { RoomBridge } from "./components/RoomBridge";
import { RoomPanel } from "./components/RoomPanel";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { registerTutorTools } from "./webmcp/registerTools";
import { useUi } from "./store/uiStore";
import { useEditor } from "./store/editorStore";
import { useStore } from "./store/projectStore";
import { redoProject, undoProject } from "./realtime/roomClient";

type Tab = "sprites" | "palette" | "frames" | "map" | "critique" | "agent" | "room";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "sprites", label: "Sprites", icon: "mingcute:picture" },
  { id: "palette", label: "Palette", icon: "mingcute:palette" },
  { id: "frames", label: "Cels", icon: "mingcute:movie" },
  { id: "map", label: "Map", icon: "mingcute:map" },
  { id: "critique", label: "Tutor", icon: "mingcute:bulb" },
  { id: "agent", label: "Agent", icon: "mingcute:bot" },
  { id: "room", label: "Room", icon: "mingcute:group" },
];

function AppContent() {
  const [tab, setTab] = useState<Tab>("sprites");
  const projectTitleRef = useRef<HTMLInputElement>(null);
  const mcpStatus = useUi((s) => s.mcpStatus);
  const roomStatus = useUi((s) => s.roomStatus);
  const roomPeers = useUi((s) => Object.keys(s.roomPeers).length);
  const projectName = useStore((s) => s.project.name);
  const spriteCount = useStore((s) => s.project.sprites.length);
  const renameProject = useStore((s) => s.renameProject);

  useEffect(() => {
    const controller = registerTutorTools();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    document.title = `${projectName} · Pixel Art Tutor`;
    if (projectTitleRef.current && document.activeElement !== projectTitleRef.current) {
      projectTitleRef.current.value = projectName;
    }
  }, [projectName]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redoProject();
        else undoProject();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redoProject();
        return;
      }
      const editor = useEditor.getState();
      switch (event.key.toLowerCase()) {
        case "b": editor.setTool("pencil"); break;
        case "e": editor.setTool("eraser"); break;
        case "g": editor.setTool("fill"); break;
        case "i": editor.setTool("picker"); break;
        case "arrowleft":
          useStore.getState().selectFrame(Math.max(0, useStore.getState().activeFrameIndex - 1));
          break;
        case "arrowright": {
          const state = useStore.getState();
          const sprite = state.activeSprite();
          if (sprite) state.selectFrame(Math.min(sprite.frames.length - 1, state.activeFrameIndex + 1));
          break;
        }
        case "+":
        case "=": editor.setZoom(editor.zoom + 4); break;
        case "-": editor.setZoom(editor.zoom - 4); break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function finishProjectTitle(input: HTMLInputElement) {
    const next = input.value.trim();
    if (next) renameProject(next);
    else input.value = projectName;
  }

  return (
    <div className="app">
      <RoomBridge />
      <header className="app-header">
        <div className="window-dots" aria-hidden="true">
          <span className="window-dot pink" />
          <span className="window-dot yellow" />
          <span className="window-dot mint" />
        </div>
        <div className="brand-mark" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 8 8" shapeRendering="crispEdges">
            <rect width="8" height="8" fill="#20233b" />
            <rect x="1" y="1" width="2" height="2" fill="#ff8fab" />
            <rect x="5" y="1" width="2" height="2" fill="#ffd166" />
            <rect x="3" y="3" width="2" height="2" fill="#79d6c0" />
            <rect x="1" y="5" width="2" height="2" fill="#6ea8fe" />
            <rect x="5" y="5" width="2" height="2" fill="#fff4dc" />
          </svg>
        </div>
        <div className="brand-copy">
          <strong>PIXEL PATCH</strong>
          <span>tiny art studio</span>
        </div>
        <div className="header-divider" />
        <div className="project-title-wrap">
          <span className="eyebrow">Project</span>
          <input
            className="project-title"
            ref={projectTitleRef}
            defaultValue={projectName}
            onBlur={(event) => finishProjectTitle(event.currentTarget)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
              if (event.key === "Escape") {
                event.currentTarget.value = projectName;
                event.currentTarget.blur();
              }
            }}
            aria-label="Project name"
          />
          <span className="project-subtitle">{spriteCount} sprites · local workspace</span>
        </div>
        <div className="header-spacer" />
        <div className="header-status">
          <span className={`status-light ${mcpStatus === "ready" ? "ready" : ""}`} />
          <span>{mcpStatus === "ready" ? "AGENT ONLINE" : "LOCAL MODE"}</span>
          <span className="header-status-divider" />
          <span className={`status-light room-light ${roomStatus === "connected" ? "ready" : ""}`} />
          <span>
            {roomStatus === "connected"
              ? `${roomPeers + 1} IN ROOM`
              : roomStatus === "connecting"
                ? "JOINING ROOM"
                : "SOLO STUDIO"}
          </span>
        </div>
        <button className="header-icon-btn" title="Open help" aria-label="Open help">
          <Icon icon="mingcute:question" />
        </button>
      </header>

      <ProjectMenu />

      <main className="workspace">
        <Toolbar />
        <section className="editor-column">
          <CanvasStage />
          <TimelinePanel />
        </section>
        <aside className="sidebar">
          <div className="sidebar-heading">
            <div>
              <span className="eyebrow">Panels</span>
              <strong>Inspector</strong>
            </div>
            <span className="dock-grip" aria-hidden="true">•••</span>
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
            <span className="pixel-heart">♥</span>
            <span>made for tiny worlds</span>
          </div>
        </aside>
      </main>

      <StatusBar />
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
