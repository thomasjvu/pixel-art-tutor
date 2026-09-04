import { useEffect, useState } from "react";
import { roomClient } from "../realtime/roomClient";
import { useStore } from "../store/projectStore";
import { useUi } from "../store/uiStore";
import { downloadText, spriteFileStem } from "../engine/exportImage";
import { Icon } from "./Icon";
import { PetAvatar } from "./PetAvatar";
import { DEFAULT_CODEX_PET } from "../pets/codexPets";

function statusLabel(status: ReturnType<typeof useUi.getState>["roomStatus"]): string {
  switch (status) {
    case "connected":
      return "Room live";
    case "connecting":
      return "Joining…";
    case "offline":
      return "Trying again…";
    case "disabled":
      return "Room unavailable";
    case "error":
      return "Room error";
    default:
      return "Solo studio";
  }
}

export function RoomPanel() {
  const roomId = useUi((state) => state.roomId);
  const roomStatus = useUi((state) => state.roomStatus);
  const roomError = useUi((state) => state.roomError);
  const roomSyncBlocked = useUi((state) => state.roomSyncBlocked);
  const roomPeers = useUi((state) => state.roomPeers);
  const peers = Object.values(roomPeers);
  const roomHost = useUi((state) => state.roomHost);
  const activeRooms = useUi((state) => state.activeRooms);
  const roomDirectoryStatus = useUi((state) => state.roomDirectoryStatus);
  const roomDirectoryError = useUi((state) => state.roomDirectoryError);
  const followAgent = useUi((state) => state.followAgent);
  const setFollowAgent = useUi((state) => state.setFollowAgent);
  const actAsAgent = useUi((state) => state.actAsAgent);
  const setActAsAgent = useUi((state) => state.setActAsAgent);
  const selectedPet = useUi((state) => state.selectedPet);
  const displayName = useUi((state) => state.roomDisplayName);
  const [roomDraft, setRoomDraft] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const roomInput = roomDraft ?? roomId ?? "";
  const nameInput = nameDraft ?? (displayName || roomClient.displayName);
  const companionName = selectedPet?.name ?? "Studio Guide";
  const companionPet = selectedPet ?? DEFAULT_CODEX_PET;

  useEffect(() => {
    void roomClient.refreshRooms();
    const refreshTimer = window.setInterval(() => void roomClient.refreshRooms(), 15_000);
    return () => {
      window.clearInterval(refreshTimer);
      roomClient.cancelRoomDirectoryRefresh();
    };
  }, []);

  useEffect(() => {
    if (roomStatus !== "connected") return;
    const refreshTimer = window.setTimeout(() => void roomClient.refreshRooms(), 200);
    return () => window.clearTimeout(refreshTimer);
  }, [roomStatus]);

  function downloadRoomBackup() {
    const state = useStore.getState();
    downloadText(
      state.exportProject(),
      spriteFileStem(state.project.name) + "-room-backup.pixeltutor.json",
    );
  }

  async function copyShareLink() {
    const link = roomClient.shareUrl();
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this room link", link);
    }
  }

  function join() {
    roomClient.setDisplayName(nameInput);
    setNameDraft(nameInput);
    if (roomInput.trim()) roomClient.joinRoom(roomInput);
    else roomClient.createRoom();
  }

  function create() {
    roomClient.setDisplayName(nameInput);
    const room = roomClient.createRoom();
    setRoomDraft(room);
  }

  function joinListedRoom(nextRoomId: string) {
    roomClient.setDisplayName(nameInput);
    setNameDraft(nameInput);
    setRoomDraft(nextRoomId);
    roomClient.joinRoom(nextRoomId);
  }

  return (
    <div className="panel room-panel">
      <div className={`room-status status-${roomStatus}`}>
        <span className="room-status-dot" />
        <strong>{statusLabel(roomStatus)}</strong>
        {roomStatus === "connected" && <span>· {peers.length + 1} here</span>}
      </div>

      <section className="active-rooms" aria-labelledby="active-rooms-heading">
        <div className="active-rooms-heading">
          <h4 id="active-rooms-heading">Active rooms</h4>
          <button
            className="room-refresh"
            type="button"
            onClick={() => void roomClient.refreshRooms()}
            disabled={roomDirectoryStatus === "loading"}
            title="Refresh active rooms"
            aria-label="Refresh active rooms"
          >
            <Icon icon="mingcute:refresh" />
          </button>
        </div>
        <p className="hint active-rooms-hint">Live rooms with someone drawing or browsing.</p>
        {roomDirectoryStatus === "loading" && activeRooms.length === 0 && (
          <p className="room-directory-message" role="status">Looking for live rooms…</p>
        )}
        {roomDirectoryStatus === "ready" && activeRooms.length === 0 && (
          <p className="room-directory-message">No live rooms yet. Create one above.</p>
        )}
        {roomDirectoryError && (
          <p className="room-directory-message error" role="alert">{roomDirectoryError}</p>
        )}
        {activeRooms.length > 0 && (
          <div className="active-room-list">
            {activeRooms.map((room) => (
              <button
                className={room.roomId === roomId ? "active-room-row current" : "active-room-row"}
                type="button"
                key={room.roomId}
                onClick={() => joinListedRoom(room.roomId)}
                title={`Join ${room.projectName}`}
              >
                <span className="active-room-dot" />
                <span className="active-room-copy">
                  <strong>{room.projectName}</strong>
                  <code>{room.roomId}</code>
                </span>
                <span className="active-room-meta">
                  {room.participantCount} {room.participantCount === 1 ? "person" : "people"}
                  <small>{room.roomId === roomId ? "here" : "join"}</small>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="room-form">
        <label className="field">
          <span>Your name</span>
          <input
            value={nameInput}
            maxLength={32}
            onChange={(event) => setNameDraft(event.target.value)}
            onBlur={() => roomClient.setDisplayName(nameInput)}
            placeholder="You"
          />
        </label>
        <label className="field">
          <span>Room name</span>
          <input
            value={roomInput}
            maxLength={48}
            onChange={(event) => setRoomDraft(event.target.value)}
            placeholder="tiny-world"
          />
        </label>
        <label className="field follow-row" title={`Show this window as ${companionName} to everyone in the room, even while idle.`}>
          <input
            type="checkbox"
            checked={actAsAgent}
            onChange={(event) => setActAsAgent(event.target.checked)}
          />
          <span>I'm an agent ({companionName})</span>
        </label>
        <div className="panel-row room-actions">
          <button className="primary-btn" onClick={join}>
            {roomStatus === "connected" ? "Switch room" : "Join room"}
          </button>
          <button className="text-btn" onClick={create}>New room</button>
          {roomId && <button className="text-btn" onClick={copyShareLink}>{copied ? "Copied" : "Share link"}</button>}
        </div>
      </div>

      {roomId && (
        <div className="room-card">
          <div className="room-card-heading">
            <code>{roomId}</code>
          </div>
          <p className="hint">
            Live edits and cursors are shared here.
          </p>
          <label className="field follow-row">
            <input
              type="checkbox"
              checked={followAgent}
              onChange={(event) => setFollowAgent(event.target.checked)}
            />
            <span>Follow {companionName}</span>
          </label>
          <button className="text-btn danger" onClick={() => roomClient.joinRoom(null)}>Leave room</button>
        </div>
      )}

      <div className="room-people">
        <h4>People here</h4>
        <div className="people-list">
          <div className="person-row self">
            <span className="person-avatar" style={{ background: actAsAgent ? companionPet.accent : "#4daa91" }}>
              {actAsAgent ? <PetAvatar pet={companionPet} size={20} /> : <Icon icon="mingcute:group" />}
            </span>
            <span className="person-meta">
              <span className="person-name">
                {actAsAgent ? companionName : nameInput.trim() || "You"}
                <span className={`kind-badge kind-${actAsAgent ? "agent" : "human"}`}>
                  {actAsAgent ? "AGENT" : "HUMAN"}
                </span>
              </span>
              <span className="person-detail">{actAsAgent ? "companion ready" : "browsing"}</span>
            </span>
            <span className="person-state" style={{ background: actAsAgent ? companionPet.accent : "#4daa91" }} />
          </div>
          {peers.map((peer) => (
            <div className="person-row" key={peer.id} title={`${peer.name} · ${peer.kind} · ${peer.status} · ${peer.tool}: ${peer.message}`}>
              <span className="person-avatar" style={{ background: peer.color }}>
                <Icon icon={peer.kind === "agent" ? "mingcute:bot" : "mingcute:group"} />
              </span>
              <span className="person-meta">
                <span className="person-name">
                  {peer.name}
                  <span className={`kind-badge kind-${peer.kind}`}>{peer.kind === "agent" ? "AGENT" : "HUMAN"}</span>
                </span>
                <span className="person-detail">
                  {peer.status === "idle" ? "browsing" : peer.status}
                  {peer.tool && peer.status !== "idle" ? ` · ${peer.tool}` : ""}
                  {peer.message && peer.status !== "idle" ? ` — ${peer.message}` : ""}
                  {peer.status !== "idle" && peer.progress > 0 ? ` (${Math.round(peer.progress * 100)}%)` : ""}
                </span>
              </span>
              <span className="person-state" style={{ background: peer.color }} />
            </div>
          ))}
        </div>
      </div>

      {!roomHost && (
        <p className="hint room-server-note">
          Room server off — edits stay local.
        </p>
      )}
      {roomSyncBlocked && (
        <div className="room-error" role="alert">
          <strong>Room sync is paused.</strong>{" "}
          This project is too large for a room message. Download a backup before leaving or reducing it.
          <div>
            <button className="text-btn" type="button" onClick={downloadRoomBackup}>
              Download current project
            </button>
          </div>
        </div>
      )}
      {roomError && !roomSyncBlocked && <p className="room-error">{roomError}</p>}
    </div>
  );
}
