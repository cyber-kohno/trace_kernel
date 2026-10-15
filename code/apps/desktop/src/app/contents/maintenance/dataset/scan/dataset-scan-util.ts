import type DatasetState from '../../../../state/model/workspace/dataset-state';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type TauriDto from '../../../../infra/tauri/tauri-dto';
import PathUtil from '../../../../util/data/path-util';

namespace DatasetScanUtil {
  type ScanProgress = { scanId: string; path: string; counter: number };
  export const buildDirectoryTree = async (props: {
    setCounter: (n: number) => void;
    setScanningDispDir: (s: string[]) => void;
    setSearch: (b: boolean) => void;
    scanRequest: TauriDto.ScanRequest;
    endProc: (res: DatasetState.UsableNode) => void;
    signal?: AbortSignal;
  }) => {
    let unlisten: UnlistenFn | undefined;
    let observing = true;
    const cancelled = () => props.signal?.aborted ?? false;
    const cleanup = () => {
      observing = false;
      const remove = unlisten;
      unlisten = undefined;
      remove?.();
    };
    props.signal?.addEventListener('abort', cleanup, { once: true });
    try {
      if (cancelled()) return;
      const scanId = crypto.randomUUID();
      unlisten = await listen<ScanProgress>('progress', ({ payload }) => {
        if (!observing || cancelled() || payload.scanId !== scanId) return;
        props.setCounter(payload.counter);
        const rootPath = props.scanRequest.rootPath;
        const label = PathUtil.basename(rootPath) || rootPath;
        const entryPath = payload.path.replace(rootPath, label);
        props.setScanningDispDir(
          entryPath
            .split(/[\\/]/)
            .filter(Boolean)
            .map((s, i) => `${'_'.repeat(i)}${s}`),
        );
      });
      if (cancelled()) return;
      const res = await invoke<DatasetState.ScanResponse>('scan_directory', {
        req: props.scanRequest,
        scanId,
      });
      if (cancelled()) return;
      if (res.node.children == null)
        throw new Error('Scan root must be a directory.');
      const rec = (
        node: DatasetState.PayloadNode,
        path: string,
      ): DatasetState.UsableNode => ({
        name: node.name,
        path,
        child:
          node.children == null
            ? undefined
            : {
                fileCnt: 0,
                isOpen: false,
                selectCnt: 0,
                nodes: node.children.map((child) =>
                  rec(child, PathUtil.joinPath(path, child.name)),
                ),
              },
        isSelected: false,
      });
      props.endProc(rec(res.node, props.scanRequest.rootPath));
    } catch (error) {
      if (!cancelled()) alert(error);
    } finally {
      props.signal?.removeEventListener('abort', cleanup);
      try {
        cleanup();
      } finally {
        if (!cancelled()) props.setSearch(false);
      }
    }
  };
}
export default DatasetScanUtil;
