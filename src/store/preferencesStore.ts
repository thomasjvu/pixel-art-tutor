import { create } from "zustand";

export type KeymapAction =
  | "pencil"
  | "eraser"
  | "fill"
  | "picker"
  | "select"
  | "toggleGrid"
  | "toggleOnion"
  | "togglePixelPerfect"
  | "toggleShading"
  | "toggleTiled"
  | "toggleBrush";

export type Keymap = Record<KeymapAction, string>;

export interface KeymapDefinition {
  id: KeymapAction;
  label: string;
  description: string;
  group: "Tools" | "View" | "Brushes";
  defaultShortcut: string;
}

export const KEYMAP_ACTIONS: readonly KeymapDefinition[] = [
  { id: "pencil", label: "Pencil", description: "Choose the pencil tool", group: "Tools", defaultShortcut: "b" },
  { id: "eraser", label: "Eraser", description: "Choose the eraser tool", group: "Tools", defaultShortcut: "e" },
  { id: "fill", label: "Fill", description: "Choose the fill tool", group: "Tools", defaultShortcut: "g" },
  { id: "picker", label: "Color picker", description: "Choose the color picker", group: "Tools", defaultShortcut: "i" },
  { id: "select", label: "Select", description: "Choose the select tool", group: "Tools", defaultShortcut: "v" },
  { id: "toggleGrid", label: "Pixel grid", description: "Show or hide the pixel grid", group: "View", defaultShortcut: "shift+g" },
  { id: "toggleOnion", label: "Onion skin", description: "Show or hide neighboring cels", group: "View", defaultShortcut: "o" },
  { id: "togglePixelPerfect", label: "Pixel-perfect stroke", description: "Toggle connected pixel cleanup", group: "Brushes", defaultShortcut: "p" },
  { id: "toggleShading", label: "Shading ink", description: "Choose nearby palette shades while painting", group: "Brushes", defaultShortcut: "s" },
  { id: "toggleTiled", label: "Tiled preview", description: "Show the canvas as a repeating tile", group: "View", defaultShortcut: "t" },
  { id: "toggleBrush", label: "Dither brush", description: "Toggle the checker/dot brush", group: "Brushes", defaultShortcut: "d" },
];

const DEFAULT_KEYMAP: Keymap = {
  pencil: "b",
  eraser: "e",
  fill: "g",
  picker: "i",
  select: "v",
  toggleGrid: "shift+g",
  toggleOnion: "o",
  togglePixelPerfect: "p",
  toggleShading: "s",
  toggleTiled: "t",
  toggleBrush: "d",
};

const KEYMAP_STORAGE_KEY = "pixel-art-tutor.keymap.v1";
const MODIFIER_ORDER = ["ctrl", "meta", "alt", "shift"] as const;
const MODIFIER_SET = new Set<string>(MODIFIER_ORDER);
const KEY_ALIASES: Record<string, string> = {
  " ": "space",
  spacebar: "space",
  esc: "escape",
  return: "enter",
  cmd: "meta",
  command: "meta",
  option: "alt",
  control: "ctrl",
};

function normalizeKey(value: string): string {
  const key = value.trim().toLowerCase();
  if (!key) return "";
  return KEY_ALIASES[key] ?? (key.length === 1 ? key : key.replace(/\s+/g, "-"));
}

export function normalizeShortcut(shortcut: string): string {
  const parts = shortcut.split("+").map((part) => normalizeKey(part)).filter(Boolean);
  const key = parts.at(-1) ?? "";
  if (!key || MODIFIER_SET.has(key)) return "";
  const modifiers = new Set(parts.slice(0, -1).filter((part) => MODIFIER_SET.has(part)));
  return [...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)), key].join("+");
}

export function shortcutFromKeyboardEvent(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">,
): string | null {
  const key = normalizeKey(event.key);
  if (!key || MODIFIER_SET.has(key)) return null;
  const modifiers = [
    event.ctrlKey ? "ctrl" : "",
    event.metaKey ? "meta" : "",
    event.altKey ? "alt" : "",
    event.shiftKey ? "shift" : "",
  ].filter(Boolean);
  return normalizeShortcut([...modifiers, key].join("+"));
}

export function matchesShortcut(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">,
  shortcut: string,
): boolean {
  const pressed = shortcutFromKeyboardEvent(event);
  return Boolean(pressed && normalizeShortcut(shortcut) === pressed);
}

export function formatShortcut(shortcut: string): string {
  const labels: Record<string, string> = {
    ctrl: "Ctrl",
    meta: "⌘",
    alt: "Alt",
    shift: "Shift",
    space: "Space",
    enter: "Enter",
    escape: "Esc",
    backspace: "Backspace",
    delete: "Delete",
    arrowleft: "←",
    arrowright: "→",
    arrowup: "↑",
    arrowdown: "↓",
  };
  const normalized = normalizeShortcut(shortcut);
  return normalized
    ? normalized.split("+").map((part) => labels[part] ?? part.toUpperCase()).join("+")
    : "Unassigned";
}

function readStoredKeymap(): Keymap {
  const next = { ...DEFAULT_KEYMAP };
  try {
    const raw = localStorage.getItem(KEYMAP_STORAGE_KEY);
    if (!raw) return next;
    const stored = JSON.parse(raw) as Record<string, unknown>;
    for (const definition of KEYMAP_ACTIONS) {
      const value = stored[definition.id];
      if (typeof value === "string") {
        next[definition.id] = normalizeShortcut(value);
      }
    }
  } catch {
    /* Preferences are optional; fall back to the safe defaults. */
  }
  return next;
}

function persistKeymap(keymap: Keymap): void {
  try {
    localStorage.setItem(KEYMAP_STORAGE_KEY, JSON.stringify(keymap));
  } catch {
    /* localStorage may be unavailable in a private or embedded browser */
  }
}

export type SetShortcutResult =
  | { ok: true; shortcut: string }
  | { ok: false; error: string };

interface PreferencesState {
  keymap: Keymap;
  setShortcut(action: KeymapAction, shortcut: string): SetShortcutResult;
  clearShortcut(action: KeymapAction): void;
  resetShortcut(action: KeymapAction): void;
  resetKeymap(): void;
}

export const usePreferences = create<PreferencesState>()((set, get) => ({
  keymap: readStoredKeymap(),
  setShortcut: (action, shortcut) => {
    const normalized = normalizeShortcut(shortcut);
    if (!normalized) return { ok: false, error: "Choose a key plus optional modifiers." };
    const conflict = KEYMAP_ACTIONS.find(
      (definition) => definition.id !== action && normalizeShortcut(get().keymap[definition.id]) === normalized,
    );
    if (conflict) {
      return { ok: false, error: `${formatShortcut(normalized)} is already assigned to ${conflict.label}.` };
    }
    const keymap = { ...get().keymap, [action]: normalized };
    persistKeymap(keymap);
    set({ keymap });
    return { ok: true, shortcut: normalized };
  },
  clearShortcut: (action) => {
    const keymap = { ...get().keymap, [action]: "" };
    persistKeymap(keymap);
    set({ keymap });
  },
  resetShortcut: (action) => {
    const definition = KEYMAP_ACTIONS.find((entry) => entry.id === action);
    if (!definition) return;
    const keymap = { ...get().keymap, [action]: definition.defaultShortcut };
    persistKeymap(keymap);
    set({ keymap });
  },
  resetKeymap: () => {
    const keymap = { ...DEFAULT_KEYMAP };
    persistKeymap(keymap);
    set({ keymap });
  },
}));
