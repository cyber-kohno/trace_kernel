import type { Workspace, WorkspaceGeneration } from "../model/workspace";

namespace WorkspaceMigration {
  export type Status = "idle" | "running" | "succeeded" | "failed";

  export type Diff = {
    from: string;
    to: string;
  };

  export type State = {
    handlePath: string;
    workspace: Workspace;
    diff: Diff;
    status: Status;
    migrated: Workspace | null;
    errorMessage: string | null;
  };

  export const create = ({
    handlePath,
    workspace,
    diff,
  }: {
    handlePath: string;
    workspace: Workspace;
    diff: Diff;
  }): State => {
    return {
      handlePath,
      workspace,
      diff,
      status: "idle",
      migrated: null,
      errorMessage: null,
    };
  };

  export const start = async (
    state: State,
    currentGen: WorkspaceGeneration,
  ): Promise<State> => {
    return {
      ...state,
      status: "succeeded",
      migrated: {
        ...state.workspace,
        gen: { ...currentGen },
      },
      errorMessage: null,
    };
  };
}
export default WorkspaceMigration;
