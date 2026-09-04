export interface TutorialStep {
  id: string;
  title: string;
  body: string;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    title: "WELCOME TO THE STUDIO",
    body: "You and your companion share one canvas. This quick tour shows the parts you need to start drawing.",
  },
  {
    id: "canvas",
    title: "THE CANVAS",
    body: "This is your sprite. Use + / − to zoom; the grid and right-click erase are always nearby. New projects start at 64×64 and 7px per cell.",
  },
  {
    id: "tools",
    title: "DRAWING TOOLS (B E G I V)",
    body: "Choose a tool, pick a color, and draw. B pencil · E eraser · G fill · I picker · V select. Undo is Ctrl/Cmd+Z.",
  },
  {
    id: "select",
    title: "SELECT + MOVE",
    body: "Select pixels, drag to move them, and nudge with the arrow keys. Shift moves 8px; Delete clears; Escape cancels.",
  },
  {
    id: "frames",
    title: "ANIMATION CELS",
    body: "The timeline stores your cels. Duplicate one, make a small change, then press Preview. Onion skin shows neighboring frames.",
  },
  {
    id: "agent",
    title: "PIXEL BOT (AGENT TAB)",
    body: "Your companion can critique, paint, and animate through WebMCP. Watch its cursor and live activity in the Agent tab.",
  },
  {
    id: "follow",
    title: "FOLLOW MODE (ROOM TAB)",
    body: "In a shared room, Follow keeps your view with your companion’s work as it draws.",
  },
  {
    id: "room",
    title: "ROOMS + SHARING",
    body: "Create a room and share the link. Everyone sees the same edits, cursors, and animation live.",
  },
  {
    id: "finale",
    title: "FIRST PROJECT — TOGETHER",
    body: "You’re ready. Ask your companion for a first sprite, or start drawing together.",
  },
];

export function clampTutorialStep(step: unknown): number {
  const n = typeof step === "number" && Number.isFinite(step) ? Math.floor(step) : 0;
  return Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, n));
}
