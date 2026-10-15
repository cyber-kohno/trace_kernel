import type { Workspace, WorkspaceGeneration } from "../model/workspace";
import checkWorkspaceCompatibility, {
  type WorkspaceCompatibilityResult,
} from "./check-workspace-compatibility";

export type PreparedWorkspaceLoad = WorkspaceCompatibilityResult & {
  workspace: Workspace;
};

/** Parse a workspace and decide how it can be opened without changing UI state. */
const prepareWorkspaceLoad = (
  source: string,
  currentGen: WorkspaceGeneration,
): PreparedWorkspaceLoad => {
  const workspace = JSON.parse(source) as Workspace;
  const compatibility = checkWorkspaceCompatibility({
    currentGen,
    fileGen: workspace.gen,
  });
  return { workspace, ...compatibility };
};

export default prepareWorkspaceLoad;
