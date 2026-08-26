import type { Project } from "../types";

export type ProjectChangeSource = "local" | "remote" | "undo" | "redo";

export interface ProjectChange {
  project: Project;
  previousProject: Project;
  source: ProjectChangeSource;
  label: string;
}
