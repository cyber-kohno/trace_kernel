import type DatasetState from '../../../../state/model/workspace/dataset-state';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type TauriDto from '../../../../infra/tauri/tauri-dto';
import PathUtil from '../../../../util/data/path-util';

namespace DatasetScanUtil {
  /**
   * スキャン開始
   */
  export const buildDirectoryTree = async (props: {
    setCounter: (n: number) => void;
    setScanningDispDir: (s: string[]) => void;
    setSearch: (b: boolean) => void;
    scanRequest: TauriDto.ScanRequest;
    endProc: (res: DatasetState.UsableNode) => void;
  }) => {
    // Rustからの進捗イベントを受信
    const unlisten = await listen<any>('progress', (event) => {
      const res = event.payload;
      // console.log(res.path);
      props.setCounter(res.counter);
      const path: string = res.path;
      const rootPath = props.scanRequest.rootPath;
      const entryPath = path.replace(rootPath, PathUtil.basename(rootPath));
      props.setScanningDispDir(
        entryPath.split('\\').map((s, i) => `${'_'.repeat(i)}${s}`),
      );
    });

    const doneUnlisten = await listen('progress_done', () => {
      unlisten(); // 解除
      doneUnlisten();
      // console.log("complete!");
      props.setSearch(false);
    });

    try {
      const res: DatasetState.ScanResponse = await invoke('scan_directory', {
        req: props.scanRequest,
      });
      const rec = (
        n: DatasetState.PayloadNode,
        path: string,
      ): DatasetState.UsableNode => {
        const curPath = path + '\\' + n.name;
        let child: DatasetState.ChildProps | undefined = undefined;
        if (n.children != null) {
          const nodes = n.children.map((c) => rec(c, curPath));
          child = {
            fileCnt: 0,
            isOpen: false,
            selectCnt: 0,
            nodes,
          };
        }
        return {
          name: n.name,
          path: curPath,
          child,
          isSelected: false,
        };
      };
      // ルートパスのフォルダ名をパスから消す（関数に入ってすぐ付与するため）
      const entryPath = props.scanRequest.rootPath
        .split('\\')
        .slice(0, -1)
        .join('\\');
      const directoryTree = rec(res.node, entryPath);
      if (directoryTree.child == undefined) throw new Error();
      props.endProc(directoryTree);
    } catch (e) {
      alert(e);
      props.setSearch(false);
    }
  };
}

export default DatasetScanUtil;
