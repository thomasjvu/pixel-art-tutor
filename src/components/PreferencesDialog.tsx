import { useCallback, useEffect, useState } from "react";
import { Icon } from "./Icon";
import { KEYMAP_ACTIONS, formatShortcut, shortcutFromKeyboardEvent, usePreferences, type KeymapAction } from "../store/preferencesStore";
import { useUi } from "../store/uiStore";

export function PreferencesDialog() {
  const open = useUi((state) => state.preferencesOpen);
  const setOpen = useUi((state) => state.setPreferencesOpen);
  const keymap = usePreferences((state) => state.keymap);
  const setShortcut = usePreferences((state) => state.setShortcut);
  const clearShortcut = usePreferences((state) => state.clearShortcut);
  const resetShortcut = usePreferences((state) => state.resetShortcut);
  const resetKeymap = usePreferences((state) => state.resetKeymap);
  const [recording, setRecording] = useState<KeymapAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const closeDialog = useCallback(() => {
    setRecording(null);
    setNotice(null);
    setOpen(false);
  }, [setOpen]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, closeDialog]);

  if (!open) return null;

  function recordShortcut(action: KeymapAction, event: React.KeyboardEvent<HTMLInputElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      setRecording(null);
      return;
    }
    const shortcut = shortcutFromKeyboardEvent(event.nativeEvent);
    if (!shortcut) return;
    const result = setShortcut(action, shortcut);
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    setNotice(`${formatShortcut(shortcut)} assigned.`);
    setRecording(null);
  }

  return (
    <div
      className="dialog-veil"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) closeDialog();
      }}
    >
      <section className="preferences-dialog" role="dialog" aria-modal="true" aria-labelledby="preferences-title">
        <div className="dialog-heading">
          <div>
            <span className="dialog-kicker">STUDIO SETTINGS</span>
            <h2 id="preferences-title">Preferences</h2>
          </div>
          <button className="dialog-close" onClick={closeDialog} aria-label="Close preferences" title="Close preferences">
            <Icon icon="mingcute:close-circle" />
          </button>
        </div>
        <p className="dialog-intro">Make the editor feel like yours. Click a shortcut, then press a key or key combination.</p>

        <div className="preferences-section-heading">
          <h3>Keyboard shortcuts</h3>
          <button className="text-btn" onClick={() => { resetKeymap(); setNotice("Default shortcuts restored."); }}>
            Reset all
          </button>
        </div>
        <div className="keymap-list">
          {KEYMAP_ACTIONS.map((definition) => {
            const active = recording === definition.id;
            return (
              <div className="keymap-row" key={definition.id}>
                <div className="keymap-copy">
                  <strong>{definition.label}</strong>
                  <span>{definition.description}</span>
                </div>
                <input
                  className={active ? "keymap-input recording" : "keymap-input"}
                  value={active ? "Press a key…" : formatShortcut(keymap[definition.id])}
                  readOnly
                  onFocus={() => { setRecording(definition.id); setNotice(null); }}
                  onBlur={() => setRecording(null)}
                  onKeyDown={(event) => recordShortcut(definition.id, event)}
                  aria-label={`Shortcut for ${definition.label}`}
                />
                <button
                  className="keymap-reset"
                  onClick={() => { resetShortcut(definition.id); setNotice(`${definition.label} reset.`); }}
                  title={`Reset ${definition.label} shortcut`}
                  aria-label={`Reset ${definition.label} shortcut`}
                >
                  ↺
                </button>
                <button
                  className="keymap-clear"
                  onClick={() => { clearShortcut(definition.id); setNotice(`${definition.label} unassigned.`); }}
                  title={`Clear ${definition.label} shortcut`}
                  aria-label={`Clear ${definition.label} shortcut`}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
        <div className="dialog-footer">
          <p className={notice?.includes("already") ? "dialog-notice error" : "dialog-notice"} role={notice?.includes("already") ? "alert" : "status"}>
            {notice ?? "Shortcuts are saved in this browser."}
          </p>
          <button className="primary-btn" onClick={closeDialog}>Done</button>
        </div>
      </section>
    </div>
  );
}
