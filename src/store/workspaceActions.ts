import { useStore } from "./projectStore";
import { useWorkspace, type NewProjectOptions } from "./workspaceStore";

function syncCurrentTab(): void {
  useWorkspace.getState().syncActive(useStore.getState().project);
}

export function createBlankProjectTab(options?: NewProjectOptions): void {
  syncCurrentTab();
  const tab = useWorkspace.getState().createBlankTab(options);
  useStore.getState().loadProject(tab.project);
}

export function openProjectTab(id: string): void {
  if (id === useWorkspace.getState().activeTabId) return;
  syncCurrentTab();
  const tab = useWorkspace.getState().getTab(id);
  if (!tab) return;
  useWorkspace.getState().activateTab(id);
  useStore.getState().loadProject(tab.project);
}

export function closeProjectTab(id: string): void {
  syncCurrentTab();
  const wasActive = id === useWorkspace.getState().activeTabId;
  const next = useWorkspace.getState().closeTab(id);
  if (wasActive && next) useStore.getState().loadProject(next.project);
}
