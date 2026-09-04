import { useEffect } from "react";
import { Icon } from "./Icon";
import { useStore } from "../store/projectStore";
import { useWorkspace } from "../store/workspaceStore";
import { useUi } from "../store/uiStore";
import { closeProjectTab, openProjectTab } from "../store/workspaceActions";

export function ProjectTabs() {
  const tabs = useWorkspace((state) => state.tabs);
  const activeTabId = useWorkspace((state) => state.activeTabId);

  useEffect(() => {
    useWorkspace.getState().initialize(useStore.getState().project);
    return useStore.subscribe((state, previous) => {
      if (state.project !== previous.project) useWorkspace.getState().syncActive(state.project);
    });
  }, []);

  return (
    <div className="project-tabs" aria-label="Open projects">
      <div className="project-tabs-scroll" role="tablist" aria-label="Project tabs">
        {tabs.map((tab) => (
          <div className={tab.id === activeTabId ? "project-tab active" : "project-tab"} key={tab.id}>
            <button
              className="project-tab-button"
              role="tab"
              aria-selected={tab.id === activeTabId}
              onClick={() => openProjectTab(tab.id)}
              title={`Open ${tab.name}`}
            >
              <Icon icon="mingcute:file-new" />
              <span>{tab.name}</span>
            </button>
            {tabs.length > 1 && (
              <button
                className="project-tab-close"
                onClick={(event) => {
                  event.stopPropagation();
                  closeProjectTab(tab.id);
                }}
                title={`Close ${tab.name}`}
                aria-label={`Close ${tab.name}`}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      <button className="project-tab-new" onClick={() => useUi.getState().setNewProjectOpen(true)} title="New project" aria-label="New project">
        <Icon icon="mingcute:add" />
      </button>
    </div>
  );
}
