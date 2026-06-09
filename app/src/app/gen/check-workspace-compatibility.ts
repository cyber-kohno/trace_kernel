import type WorkspaceState from '../state/model/workspace/workspace-state';

type Props = {
  currentGen: WorkspaceState.Gen;
  fileGen: WorkspaceState.Gen | undefined;
};

export type WorkspaceCompatibilityResult =
  | {
      status: 'ok';
    }
  | {
      status: 'warn-api';
      apiDiff: {
        from: string;
        to: string;
      };
      message: string;
    }
  | {
      status: 'needs-workspace-migration';
      workspaceDiff: {
        from: string;
        to: string;
      };
      message: string;
    }
  | {
      status: 'reject-missing-gen';
      message: string;
    }
  | {
      status: 'reject-workspace-ahead';
      workspaceDiff: {
        from: string;
        to: string;
      };
      message: string;
    }
  | {
      status: 'reject-api-ahead';
      apiDiff: {
        from: string;
        to: string;
      };
      message: string;
    };

const checkWorkspaceCompatibility = ({
  currentGen,
  fileGen,
}: Props): WorkspaceCompatibilityResult => {
  if (fileGen == undefined) {
    return {
      status: 'reject-missing-gen',
      message: 'Workspace generation data is missing.',
    };
  }

  if (Number(fileGen.workspace) > Number(currentGen.workspace)) {
    return {
      status: 'reject-workspace-ahead',
      workspaceDiff: {
        from: fileGen.workspace,
        to: currentGen.workspace,
      },
      message: `Workspace generation is newer than the app. File/App workspace generation: ${fileGen.workspace} -> ${currentGen.workspace}.`,
    };
  }

  if (Number(fileGen.api) > Number(currentGen.api)) {
    return {
      status: 'reject-api-ahead',
      apiDiff: {
        from: fileGen.api,
        to: currentGen.api,
      },
      message: `API generation is newer than the app. File/App API generation: ${fileGen.api} -> ${currentGen.api}.`,
    };
  }

  if (Number(fileGen.workspace) < Number(currentGen.workspace)) {
    return {
      status: 'needs-workspace-migration',
      workspaceDiff: {
        from: fileGen.workspace,
        to: currentGen.workspace,
      },
      message: `Workspace generation is older than the app. File/App workspace generation: ${fileGen.workspace} -> ${currentGen.workspace}.`,
    };
  }

  if (Number(fileGen.api) < Number(currentGen.api)) {
    return {
      status: 'warn-api',
      apiDiff: {
        from: fileGen.api,
        to: currentGen.api,
      },
      message: `API generation is older than the app. File/App API generation: ${fileGen.api} -> ${currentGen.api}.`,
    };
  }

  return {
    status: 'ok',
  };
};

export default checkWorkspaceCompatibility;
