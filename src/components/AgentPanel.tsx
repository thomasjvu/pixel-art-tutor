import { useEffect, useState } from "react";
import { useUi } from "../store/uiStore";
import { PetAvatar } from "./PetAvatar";
import { BUILT_IN_CODEX_PETS, DEFAULT_CODEX_PET } from "../pets/codexPets";

const EXAMPLE_PROMPTS = [
  "Draw a tiny knight",
  "Animate a soft bounce",
  "Build a lava tile",
];

export function AgentPanel() {
  const mcpStatus = useUi((s) => s.mcpStatus);
  const mcpError = useUi((s) => s.mcpError);
  const tools = useUi((s) => s.registeredTools);
  const log = useUi((s) => s.log);
  const agentPresence = useUi((s) => s.agentPresence);
  const selectedPet = useUi((s) => s.selectedPet);
  const petSource = useUi((s) => s.petSource);
  const petDiscovery = useUi((s) => s.petDiscovery);
  const setSelectedPet = useUi((s) => s.setSelectedPet);
  // Agent work happens in whichever window runs the tools; in a room the far
  // side only ever sees it through presence, so surface remembered remote
  // activity here (it persists after the action finishes).
  const agentActivity = useUi((s) => s.agentActivity);
  const hasActivity = log.length > 0 || agentActivity.length > 0 || agentPresence !== null;
  const [petPickerOpen, setPetPickerOpen] = useState(false);

  const petStatus =
    petDiscovery === "detected"
      ? "Loaded from Codex"
      : petDiscovery === "searching"
      ? "Checking for your Codex pet…"
      : petSource === "none"
        ? "Companion off"
        : selectedPet?.spriteSheet
          ? "Built-in Codex pet"
          : "Local companion";

  function choosePet(pet: typeof DEFAULT_CODEX_PET | null) {
    setSelectedPet(pet, pet ? "built-in" : "none");
    setPetPickerOpen(false);
  }

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

      <section className="pet-card" aria-labelledby="pet-card-heading">
        <div className="pet-card-heading">
          <div className="pet-card-identity">
            {selectedPet ? (
              <PetAvatar pet={selectedPet} size={32} />
            ) : (
              <span className="pet-avatar pet-avatar-empty" aria-hidden="true">—</span>
            )}
            <div>
              <strong id="pet-card-heading">{selectedPet?.name ?? "No companion"}</strong>
              <span>{petStatus}</span>
            </div>
          </div>
          <button
            className="text-btn pet-change-button"
            type="button"
            onClick={() => setPetPickerOpen((open) => !open)}
            aria-expanded={petPickerOpen}
          >
            {petPickerOpen ? "Close" : "Choose"}
          </button>
        </div>
        <p className="pet-card-description">
          {selectedPet?.description ?? "Keep the tutorial quiet, or choose a companion to speak for it."}
        </p>
        {petPickerOpen && (
          <div className="pet-picker" role="listbox" aria-label="Choose a studio companion">
            {BUILT_IN_CODEX_PETS.map((pet) => (
              <button
                className={selectedPet?.id === pet.id ? "pet-option active" : "pet-option"}
                type="button"
                role="option"
                aria-selected={selectedPet?.id === pet.id}
                key={pet.id}
                onClick={() => choosePet(pet)}
              >
                <PetAvatar pet={pet} size={26} />
                <span>{pet.name}</span>
              </button>
            ))}
            <button
              className={!selectedPet ? "pet-option active" : "pet-option"}
              type="button"
              role="option"
              aria-selected={!selectedPet}
              onClick={() => choosePet(null)}
            >
              <span className="pet-avatar pet-avatar-empty" aria-hidden="true">—</span>
              <span>No pet</span>
            </button>
          </div>
        )}
      </section>

      {agentPresence && (
        <div className="agent-live-card">
          <span className="agent-live-avatar">
            <PetAvatar pet={selectedPet ?? DEFAULT_CODEX_PET} size={26} />
          </span>
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
          <p>Open this app in ChatGPT's browser, or enable WebMCP in Chrome:</p>
          <ol>
            <li>Visit <code>chrome://flags/#enable-webmcp-testing</code></li>
            <li>Enable and relaunch</li>
            <li>Reload the page</li>
          </ol>
        </div>
      )}

      <h4>Quick start</h4>
      <div className="panel-row">
        <button
          className="primary-btn"
          onClick={() => useUi.getState().openTutorial(0)}
        >
          Start tutorial
        </button>
      </div>
      <ul className="prompt-list">
        {EXAMPLE_PROMPTS.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>

      <details className="panel-fold">
        <summary>
          <span>Available tools</span>
          <span className="fold-count">{tools.length}</span>
        </summary>
        <ul className="tool-list scrollable">
          {tools.map((t) => (
            <li key={t.name}>
              <code>{t.name}</code>
              <span className="tool-desc">{t.description}</span>
            </li>
          ))}
        </ul>
      </details>

      {hasActivity ? (
        <details className="panel-fold" open={Boolean(agentPresence)}>
          <summary>
            <span>Activity</span>
            <span className="fold-count">{agentActivity.length + log.length}</span>
          </summary>
          {agentActivity.map((entry, i) => (
            <div className="agent-live-card remote" key={`${entry.peerId}-${entry.tool}-${entry.message}-${i}`}>
              <span className="agent-live-avatar">
                <PetAvatar pet={selectedPet ?? DEFAULT_CODEX_PET} size={26} />
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
          <ul className="log-list">
            {log.map((e) => (
              <li key={e.id}>
                <span className="log-time">{e.time}</span>
                <code>{e.tool}</code>
                <span className="log-summary">{e.summary}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="hint empty-activity">No activity yet.</p>
      )}
    </div>
  );
}
