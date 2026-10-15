import { createContext, useContext } from "react";
import type { Workspace, Capability } from "../../shared/workspaces";
export interface WorkspaceState {
  current: Workspace;
  items: Workspace[];
  refresh(): Promise<void>;
  path(suffix?: string): string;
  can(capability: Capability): boolean;
}
export const WorkspaceContext = createContext<WorkspaceState | null>(null);
export function useOptionalWorkspace() {
  return useContext(WorkspaceContext);
}
export function useWorkspace() {
  const value = useOptionalWorkspace();
  if (!value) throw new Error("Workspace context is missing");
  return value;
}
