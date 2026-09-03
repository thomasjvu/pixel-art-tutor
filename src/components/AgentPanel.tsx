import { useEffect } from "react";
import { useUi } from "../store/uiStore";
import { Icon } from "./Icon";

const EXAMPLE_PROMPTS = [
  "Read my slime sprite and critique it, then fix the issues you find.",
  "Draw a 16×16 knight character with a helmet and sword.",
  "Add an idle bounce animation to the active sprite.",
  "Create a lava tile and paint a danger zone in the map.",
  "Remap every dark green pixel to teal and add a highlight color.",
];

export function AgentPanel() {
  const mcpStatus = useUi((s) => s.mcpStatus);
  const mcpError = useUi((s) => s.mcpError);
  const tools = useUi((s) => s.registeredTools);
  const log = useUi((s) => s.log);
  const agentPresence = useUi((s) => s.agentPresence);
  // Agent work happens in whichever window runs the tools; in a room the far
  // side only ever sees it through presence, so surface remembered remote
  // activity here (it persists after the action finishes).
  const agentActivity = useUi((s) => s.agentActivity);
  const hasActivity = log.length > 0 || agentActivity.length > 0 || agentPresence !== null;

  // keep inspector in sync with live tool registry
  useEffect(() => {
    const mc = document.modelContext;
    if (!mc) return;
    const refresh = () => {
      mc.getTools()
        .then((all) =>
          useUi
            .getState()
            .setTools(
              all
                .filter((t) => t.origin === location.origin)
                .map((t) => ({ name: t.name, description: t.description })),
            ),
        )
        .catch(() => undefined);
    };
    refresh();
    mc.addEventListener("toolchange", refresh);
    return () => mc.removeEventListener("toolchange", refresh);
  }, []);

  return (
    <div className="panel agent-panel">
      <div className={`mcp-chip status-${mcpStatus}`}>
        <span className="dot" />
        {mcpStatus === "ready" && `WebMCP live · ${tools.length} tools exposed`}
        {mcpStatus === "registering" && "Registering WebMCP tools…"}
        {mcpStatus === "unsupported" && "WebMCP unavailable in this browser"}
        {mcpStatus === "error" && (mcpError ?? "WebMCP error")}
      </div>

      {agentPresence && (
        <div className="agent-live-card">
          <span className="agent-live-avatar"><Icon icon="mingcute:bot" /></span>
          <div className="agent-live-copy">
            <strong>{agentPresence.name} · {agentPresence.status}</strong>
            <span>{agentPresence.message}</span>
          </div>
          <span className="agent-progress" aria-label={`${Math.round(agentPresence.progress * 100)}% complete`}>
            <i style={{ width: `${Math.round(agentPresence.progress * 100)}%` }} />
          </span>
        </div>
      )}

      {mcpStatus === "unsupported" && (
        <div className="callout">
          <p>
            Open this app in <strong>ChatGPT's in-app browser</strong>, or in Chrome with WebMCP
            enabled:
          </p>
          <ol>
            <li>Visit <code>chrome://flags/#enable-webmcp-testing</code></li>
            <li>Enable and relaunch</li>
            <li>Reload this page — your agent can now see the canvas</li>
          </ol>
          <p>The app itself works fine without it; your agent just can't see pixels.</p>
        </div>
      )}

      <h4>Try asking your agent</h4>
      <div className="panel-row">
        <button
          className="primary-btn"
          onClick={() => useUi.getState().openTutorial(0)}
        >
          Start guided tutorial
        </button>
      </div>
      <ul className="prompt-list">
        {EXAMPLE_PROMPTS.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>

      <h4>Exposed tools ({tools.length})</h4>
      <ul className="tool-list scrollable">
        {tools.map((t) => (
          <li key={t.name}>
            <code>{t.name}</code>
            <span className="tool-desc">{t.description}</span>
          </li>
        ))}
      </ul>

      <h4>Agent activity</h4>
      {agentActivity.map((entry, i) => (
        <div className="agent-live-card remote" key={`${entry.peerId}-${entry.tool}-${entry.message}-${i}`}>
          <span className="agent-live-avatar">
            <Icon icon="mingcute:bot" />
          </span>
          <div className="agent-live-copy">
            <strong>{entry.name} · {entry.status}</strong>
            <span>{entry.message}{entry.tool && entry.status !== "idle" ? ` (${entry.tool})` : ""}</span>
          </div>
          <span className="agent-progress" aria-label={`${Math.round(entry.progress * 100)}% complete`}>
            <i style={{ width: `${Math.round(entry.progress * 100)}%` }} />
          </span>
        </div>
      ))}
      {!hasActivity && <p className="hint">No agent calls yet. They'll appear here as they happen.</p>}
      <ul className="log-list">
        {log.map((e) => (
          <li key={e.id}>
            <span className="log-time">{e.time}</span>
            <code>{e.tool}</code>
            <span className="log-summary">{e.summary}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
