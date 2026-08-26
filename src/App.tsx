import { useEffect, useState } from "react";
import { CanvasStage } from "./components/CanvasStage";
import { Toolbar } from "./components/Toolbar";
import { PalettePanel } from "./components/PalettePanel";
import { FramesPanel } from "./components/FramesPanel";
import { SpritesPanel } from "./components/SpritesPanel";
import { TilemapPanel } from "./components/TilemapPanel";
import { AgentPanel } from "./components/AgentPanel";
import { StatusBar } from "./components/StatusBar";
import { registerTutorTools } from "./webmcp/registerTools";
import { useUi } from "./store/uiStore";
import { useEditor } from "./store/editorStore";
import { useStore } from "./store/projectStore";

type Tab = "sprites" | "palette" | "frames" | "map" | "agent";

const TABS: { id: Tab; label: string }[] = [
  { id: "palette", label: "Palette" },
  { id: "frames", label: "Frames" },
  { id: "sprites", label: "Sprites" },
  { id: "map", label: "Map" },
  { id: "agent", label: "Agent" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("agent");
  const mcpStatus = useUi((s) => s.mcpStatus);
  const projectName = useStore((s) => s.project.name);

  // register WebMCP tools once; aborting unregisters them on teardown
  useEffect(() => {
    const controller = registerTutorTools();
    return () => controller.abort();
  }, []);

  // keep the project name input in sync
  useEffect(() => {
    document.title = `${projectName} · Pixel Art Tutor`;
  }, [projectName]);

  // keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) useStore.getState().redo();
        else useStore.getState().undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        useStore.getState().redo();
        return;
      }
      const ed = useEditor.getState();
      switch (e.key.toLowerCase()) {
        case "b": ed.setTool("pencil"); break;
        case "e": ed.setTool("eraser"); break;
        case "g": ed.setTool("fill"); break;
        case "i": ed.setTool("picker"); break;
        case "+": case "=": ed.setZoom(ed.zoom + 4); break;
        case "-": ed.setZoom(ed.zoom - 4); break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <span className="logo" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 8 8" shapeRendering="crispEdges" aria-label="logo">
            <rect width="8" height="8" fill="#1a1c2c" />
            <rect x="1" y="1" width="2" height="2" fill="#38b764" />
            <rect x="5" y="1" width="2" height="2" fill="#ffcd75" />
            <rect x="3" y="3" width="2" height="2" fill="#41a6f6" />
            <rect x="1" y="5" width="2" height="2" fill="#b13e53" />
            <rect x="5" y="5" width="2" height="2" fill="#f4f4f4" />
          </svg>
        </span>
        <h1>
          Pixel Art Tutor
          <small>human ✦ agent co-creation via WebMCP</small>
        </h1>
      </header>

      <main className="app-main">
        <Toolbar />
        <CanvasStage />
        <aside className="sidebar">
          <nav className="tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={tab === t.id ? "tab active" : "tab"}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {t.id === "agent" && (
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
          <div className={tab === "agent" ? "tab-body" : "tab-body hidden"}>
            <AgentPanel />
          </div>
        </aside>
      </main>

      <StatusBar />
    </div>
  );
}
