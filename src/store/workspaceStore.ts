import { create } from "zustand";
import { blankProject } from "../engine/seed";
import type { Project } from "../types";
import { createUniqueId } from "./projectIds";

export interface ProjectTab {
  id: string;
  name: string;
  project: Project;
}

interface WorkspaceState {
  tabs: ProjectTab[];
  activeTabId: string | null;
  initialize(project: Project): void;
  syncActive(project: Project): void;
  createBlankTab(): ProjectTab;
  getTab(id: string): ProjectTab | null;
  activateTab(id: string): void;
  closeTab(id: string): ProjectTab | null;
}

function cloneProject(project: Project): Project {
  return {
    ...project,
    palette: [...project.palette],
    paletteAlpha: project.paletteAlpha ? [...project.paletteAlpha] : undefined,
    sprites: project.sprites.map((sprite) => ({
      ...sprite,
      frames: sprite.frames.map((frame) => ({
        ...frame,
        pixels: [...frame.pixels],
      })),
      layers: sprite.layers?.map((layer) => ({
        ...layer,
        frames: layer.frames.map((frame) => ({ ...frame, pixels: [...frame.pixels] })),
      })),
      frameTags: sprite.frameTags?.map((tag) => ({ ...tag })),
    })),
    tilemap: project.tilemap ? { ...project.tilemap, cells: [...project.tilemap.cells] } : null,
  };
}

function tabName(project: Project): string {
  const name = typeof project.name === "string" ? project.name.trim() : "";
  return name || "Untitled";
}

function untitledName(tabs: ProjectTab[]): string {
  const names = new Set(tabs.map((tab) => tab.name));
  if (!names.has("Untitled")) return "Untitled";
  let suffix = 2;
  while (names.has(`Untitled ${suffix}`)) suffix += 1;
  return `Untitled ${suffix}`;
}

function newTabId(tabs: ProjectTab[]): string {
  return createUniqueId("project-tab", new Set(tabs.map((tab) => tab.id)));
}

export const useWorkspace = create<WorkspaceState>()((set, get) => ({
  tabs: [],
  activeTabId: null,

  initialize(project) {
    if (get().tabs.length > 0) return;
    const tab: ProjectTab = {
      id: "project-tab-current",
      name: tabName(project),
      project: cloneProject(project),
    };
    set({ tabs: [tab], activeTabId: tab.id });
  },

  syncActive(project) {
    const { tabs, activeTabId } = get();
    if (!activeTabId || !tabs.some((tab) => tab.id === activeTabId)) {
      get().initialize(project);
      return;
    }
    set({
      tabs: tabs.map((tab) =>
        tab.id === activeTabId
          ? { ...tab, name: tabName(project), project: cloneProject(project) }
          : tab,
      ),
    });
  },

  createBlankTab() {
    const project = blankProject();
    const { tabs } = get();
    const name = untitledName(tabs);
    project.name = name;
    const tab: ProjectTab = { id: newTabId(tabs), name, project };
    set({ tabs: [...tabs, tab], activeTabId: tab.id });
    return tab;
  },

  getTab(id) {
    return get().tabs.find((tab) => tab.id === id) ?? null;
  },

  activateTab(id) {
    if (get().tabs.some((tab) => tab.id === id)) set({ activeTabId: id });
  },

  closeTab(id) {
    const { tabs, activeTabId } = get();
    if (tabs.length <= 1) return null;
    const index = tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return null;
    const nextTabs = tabs.filter((tab) => tab.id !== id);
    if (activeTabId !== id) {
      set({ tabs: nextTabs });
      return null;
    }
    const nextTab = nextTabs[Math.max(0, index - 1)] ?? nextTabs[0];
    set({ tabs: nextTabs, activeTabId: nextTab.id });
    return nextTab;
  },
}));
