export interface TutorialStep {
  id: string;
  title: string;
  body: string;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    title: "WELCOME TO THE STUDIO",
    body: "This is a shared canvas: you and Pixel Bot draw on the same sprites at the same time. Everything below takes about two minutes, then we make our first project together.",
  },
  {
    id: "canvas",
    title: "THE CANVAS",
    body: "The big grid is your sprite. Zoom with the + / − buttons, toggle the pixel grid from the toolbar or View menu. Right-click always erases. Fresh canvases start blank at 64×64.",
  },
  {
    id: "tools",
    title: "DRAWING TOOLS (B E G I V)",
    body: "Pencil (B), Eraser (E), Fill bucket (G), color Picker (I), and Select (V). Pick a color from the Palette tab, then paint. Undo is Ctrl/Cmd+Z and works on agent edits too.",
  },
  {
    id: "select",
    title: "SELECT + MOVE",
    body: "Press V and drag a box to select pixels. Drag inside the box to move them, nudge with arrow keys (Shift = 8px), Delete clears the area, Escape drops the selection.",
  },
  {
    id: "frames",
    title: "ANIMATION CELS",
    body: "The timeline holds animation frames. Duplicate a cel, nudge pixels, press Preview to play at your FPS. Onion skin ghosts the neighboring cels so you can trace motion.",
  },
  {
    id: "agent",
    title: "PIXEL BOT (AGENT TAB)",
    body: "The Agent tab lists every WebMCP tool and a live activity feed. Ask your agent to critique, paint, or animate — its cursor appears on your canvas as it works.",
  },
  {
    id: "follow",
    title: "FOLLOW MODE (ROOM TAB)",
    body: "In a shared room, tick “Follow Pixel Bot's view” and your editor jumps to whatever the agent is drawing, so you watch edits happen instead of finding them later.",
  },
  {
    id: "room",
    title: "ROOMS + SHARING",
    body: "Create a room, share the link, and everyone sees edits, cursors, and Pixel Bot live. Use the share-link button for a one-click snapshot, or Save JSON for a backup file.",
  },
  {
    id: "finale",
    title: "FIRST PROJECT — TOGETHER",
    body: "Tour complete! Pixel Bot starts a fresh canvas, names it (guided-tutorial-01?), draws the first sprite with you watching, and saves it to the project library. You paint beside it — one canvas, two artists.",
  },
];

export function clampTutorialStep(step: unknown): number {
  const n = typeof step === "number" && Number.isFinite(step) ? Math.floor(step) : 0;
  return Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, n));
}
