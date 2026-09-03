import { useState } from "react";
import { roomClient } from "../realtime/roomClient";
import { useStore } from "../store/projectStore";
import { useUi } from "../store/uiStore";
import { downloadText, spriteFileStem } from "../engine/exportImage";
import { Icon } from "./Icon";

function statusLabel(status: ReturnType<typeof useUi.getState>["roomStatus"]): string {
  switch (status) {
    case "connected":
      return "Room live";
    case "connecting":
      return "Joining…";
    case "offline":
      return "Trying again…";
    case "disabled":
      return "Room server not configured";
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
  const displayName = useUi((state) => state.roomDisplayName);
  const [roomDraft, setRoomDraft] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const roomInput = roomDraft ?? roomId ?? "";
  const nameInput = nameDraft ?? (displayName || roomClient.displayName);

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

  return (
    <div className="panel room-panel">
      <div className={`room-status status-${roomStatus}`}>
        <span className="room-status-dot" />
        <strong>{statusLabel(roomStatus)}</strong>
        {roomStatus === "connected" && <span>· {peers.length + 1} here</span>}
      </div>

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
            Everyone in this room sees edits, cursors, and Pixel Bot actions as they happen.
          </p>
          <button className="text-btn danger" onClick={() => roomClient.joinRoom(null)}>Leave room</button>
        </div>
      )}

      <div className="room-people">
        <h4>In the studio</h4>
        <div className="people-list">
          <div className="person-row self">
            <span className="person-avatar" style={{ background: "#4daa91" }}><Icon icon="mingcute:group" /></span>
            <span className="person-name">{nameInput.trim() || "You"}</span>
            <span className="person-state">you</span>
          </div>
          {peers.map((peer) => (
            <div className="person-row" key={peer.id}>
              <span className="person-avatar" style={{ background: peer.color }}>
                <Icon icon={peer.kind === "agent" ? "mingcute:bot" : "mingcute:group"} />
              </span>
              <span className="person-name">{peer.name}</span>
              <span className="person-state">{peer.status === "idle" ? "here" : peer.status}</span>
            </div>
          ))}
        </div>
      </div>

      {!roomHost && (
        <p className="hint room-server-note">
          Local cursor mode is on. Start the room server with <code>npm run room:dev</code>, then set
          <code>VITE_PARTY_HOST=http://127.0.0.1:1999</code> for shared rooms.
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
