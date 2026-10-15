import type WorkspaceState from '../../state/model/workspace/workspace-state';

namespace DirtyUtil {
  export async function getHash(source: string) {
    const buf = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(source),
    );
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  export const isMatch = (
    a: WorkspaceState.SnapshotLog,
    b: WorkspaceState.SnapshotLog,
  ) => {
    return (
      a.gen === b.gen &&
      a.env === b.env &&
      a.resource === b.resource &&
      a.dataset === b.dataset &&
      a.process === b.process &&
      a.logic === b.logic &&
      a.declare === b.declare &&
      a.work === b.work
    );
  };

  export const getSnapshot = async (
    workspace: WorkspaceState.Props,
  ): Promise<WorkspaceState.SnapshotLog> => {
    const {
      gen,
      envs,
      resources,
      datasets,
      processes,
      logics,
      declare,
      works,
    } = workspace;
    return {
      gen: await getHash(JSON.stringify(gen)),
      env: await getHash(JSON.stringify(envs)),
      resource: await getHash(JSON.stringify(resources)),
      dataset: await getHash(JSON.stringify(datasets)),
      process: await getHash(JSON.stringify(processes)),
      logic: await getHash(JSON.stringify(logics)),
      declare: await getHash(JSON.stringify(declare)),
      work: await getHash(JSON.stringify(works)),
    };
  };
}

export default DirtyUtil;
