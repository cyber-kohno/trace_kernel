import PathUtil from "../../../../../../util/data/pathUtil";
import RuntimeUtil from "../../../runtime/runtimeUtil";

namespace MakeDir {

    export const execute = (
        vfs: RuntimeUtil.VFSState,
        dirPath: string
    ): void => {
        const { pathIndex, reservedPaths, dirTable } = vfs;

        // 冪等性チェック
        const existing = dirTable.get(dirPath);
        if (existing) {
            if (existing.intent === "create") {
                return; // すでに作成予定ならスキップ
            }
            if (existing.intent === "delete") {
                throw new Error(`directory was deleted in this transaction: ${dirPath}`);
            }
        }


        for (const [path, entry] of dirTable.entries()) {
            if (entry.intent === "create") {
                // 既存が自分の祖先なら削除
                if (PathUtil.isAncestor(path, dirPath)) {
                    dirTable.delete(path);
                }
                // 子孫がすでにcreate予定なら不要
                if (PathUtil.isAncestor(dirPath, path)) {
                    return;
                }
            }
        }

        // 完全一致の競合チェック
        if (pathIndex.has(dirPath) || reservedPaths.has(dirPath)) {
            throw new Error(`Path already exists as a file in this transaction: ${dirPath}`);
        }

        // 親子関係の競合チェック（既存ファイルの配下階層でないか）
        const allVirtualFiles = [...pathIndex.keys(), ...reservedPaths];
        for (const filePath of allVirtualFiles) {
            if (PathUtil.isAncestor(filePath, dirPath)) {
                throw new Error(`Cannot create directory under a file: ${filePath}`);
            }
        }

        dirTable.set(dirPath, {
            path: dirPath,
            intent: "create"
        });
    };
}

export default MakeDir;
