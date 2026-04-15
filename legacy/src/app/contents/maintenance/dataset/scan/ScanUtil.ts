import type StoreDataset from "../../../../store/storeDataset";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ScanRequest } from "../../../../store/types";
import PathUtil from "../../../../util/data/pathUtil";

namespace ScanUtil {

    /**
     * スキャン開始
     */
    export const buildDirectoryTree = async (props: {
        setCouner: (n: number) => void;
        setScanningDispDir: (s: string[]) => void;
        setSearch: (b: boolean) => void;
        scanRequest: ScanRequest;
        endProc: (res: StoreDataset.UsableNode) => void;
    }) => {
        // Rustからの進捗イベントを受信
        const unlisten = await listen<any>("progress", (event) => {
            const res = event.payload;
            // console.log(res.path);
            props.setCouner(res.counter);
            const path: string = res.path;
            const rootPath = props.scanRequest.rootPath;
            const entryPath = path.replace(rootPath, PathUtil.basename(rootPath));
            props.setScanningDispDir(entryPath
                .split("\\")
                .map((s, i) => `${"_".repeat(i)}${s}`)
            )
        });

        const doneUnlisten = await listen("progress_done", () => {
            unlisten(); // 解除
            doneUnlisten();
            // console.log("complete!");
            props.setSearch(false);
        });

        try {
            const res: StoreDataset.ScanResponse = await invoke("scan_directory", {
                req: props.scanRequest
            });
            const rec = (
                n: StoreDataset.PayloadNode,
                path: string
            ): StoreDataset.UsableNode => {
                const curPath = path + "\\" + n.name;
                let child: StoreDataset.ChildProps | undefined = undefined;
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
            const entryPath = props.scanRequest.rootPath.split("\\").slice(0, -1).join("\\");
            const directoryTree = rec(
                res.node,
                entryPath
            );
            if(directoryTree.child == undefined) throw new Error();
            props.endProc(directoryTree);
        } catch (e) {
            alert(e);
            props.setSearch(false);
        }
    };
};

export default ScanUtil;