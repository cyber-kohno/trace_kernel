import PathUtil from "../../../../../../util/data/pathUtil";
import RuntimeUtil from "../../../runtime/runtimeUtil";

namespace DeleteDir {

    export const execute = (
        vfs: RuntimeUtil.VFSState,
        dirPath: string
    ): void => {
        const { dirTable, fileTable } = vfs;

        // -------------------------
        // 1. 同一パスチェック
        // -------------------------
        const existing = dirTable.get(dirPath);
        if (existing) {
            if (existing.intent === "delete") {
                throw new Error(
                    `directory already deleted: ${dirPath}`
                );
            }
            if (existing.intent === "create") {
                throw new Error(
                    `cannot delete newly created directory: ${dirPath}`
                );
            }
        }

        // -------------------------
        // 2. 配下にファイル操作があればエラー
        // -------------------------
        for (const [, file] of fileTable.entries()) {
            const filePath = file.renameTo ?? file.path;

            // intentがあるものだけ対象（openTextは除外）
            if (!file.intent) continue;

            if (PathUtil.isAncestor(dirPath, filePath)) {
                throw new Error(
                    `Cannot delete directory because file operation exists under it: ${filePath}`
                );
            }
        }

        // -------------------------
        // 3. 配下にディレクトリ操作があればエラー
        // -------------------------
        for (const [path] of dirTable.entries()) {

            if (PathUtil.isAncestor(dirPath, path)) {
                throw new Error(
                    `Cannot delete directory because directory operation exists under it: ${path}`
                );
            }
        }

        // -------------------------
        // 4. 削除登録
        // -------------------------
        dirTable.set(dirPath, {
            path: dirPath,
            intent: "delete"
        });
    };
}

export default DeleteDir;
