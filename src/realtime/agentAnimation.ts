import type { PixelPoint, PresenceStatus } from "./protocol";
import { useUi, type AgentPreviewPixel } from "../store/uiStore";

export interface AgentPaintCell extends PixelPoint {
  color: string | null;
}

export interface AgentActionOptions {
  name?: string;
  tool: string;
  spriteId: string | null;
  frameIndex: number;
  message: string;
  status?: PresenceStatus;
}

export interface AgentAnimationOptions {
  /** Apply each visible step to the real project before showing it. */
  onChunk?: (chunk: AgentPaintCell[]) => void;
}

function actionId(): string {
  return `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function defaultStatus(tool: string): PresenceStatus {
  if (tool.includes("fill")) return "filling";
  if (tool.includes("transform") || tool.includes("replace") || tool.includes("clear")) {
    return "transforming";
  }
  if (tool.includes("critique") || tool.includes("read")) return "reviewing";
  return "drawing";
}

export function beginAgentAction(options: AgentActionOptions): string {
  const id = actionId();
  useUi.getState().beginAgentAction({
    actionId: id,
    name: options.name ?? useUi.getState().selectedPet?.name ?? "Studio Guide",
    tool: options.tool,
    status: options.status ?? defaultStatus(options.tool),
    spriteId: options.spriteId,
    frameIndex: options.frameIndex,
    cursor: null,
    progress: 0,
    message: options.message,
    preview: [],
  });
  return id;
}

export async function animateAgentPixels(
  actionId: string,
  cells: AgentPaintCell[],
  options: AgentAnimationOptions = {},
): Promise<void> {
  const ui = useUi.getState();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // A normal set_pixels call is a sequence of actual one-cell edits. Keep a
  // deliberate ~90ms rhythm so the page and room presence can show each cell;
  // reduced-motion users still get one immediate batch.
  const chunkSize = reducedMotion ? Math.max(1, cells.length) : 1;
  const delay = reducedMotion ? 0 : 76;
  const preview: AgentPreviewPixel[] = [];

  for (let index = 0; index < cells.length; index += chunkSize) {
    const chunk = cells.slice(index, index + chunkSize);
    preview.push(...chunk);
    const cursor = chunk[chunk.length - 1];
    options.onChunk?.(chunk);
    ui.updateAgentAction(actionId, {
      cursor: cursor ? { x: cursor.x, y: cursor.y } : null,
      progress: cells.length ? Math.min(1, (index + chunk.length) / cells.length) : 1,
      preview: [...preview],
    });
    await nextFrame();
    if (delay > 0 && index + chunk.length < cells.length) await wait(delay);
  }
}

export async function showAgentAction(actionId: string, cursor: PixelPoint | null = null): Promise<void> {
  useUi.getState().updateAgentAction(actionId, { cursor });
  await nextFrame();
}

export function finishAgentAction(actionId: string, message: string): void {
  useUi.getState().finishAgentAction(actionId, message);
  window.setTimeout(() => useUi.getState().clearAgentAction(actionId), 650);
}

export function failAgentAction(actionId: string, message: string): void {
  useUi.getState().updateAgentAction(actionId, {
    status: "done",
    progress: 1,
    message,
    preview: [],
  });
  window.setTimeout(() => useUi.getState().clearAgentAction(actionId), 900);
}
