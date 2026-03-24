import PathUtil from "../../../../../../util/data/pathUtil";
import RuntimeUtil from "../../../runtime/runtimeUtil";

namespace SaveFile {

    export const execute = (
        vfs: RuntimeUtil.VFSState,
        filePath: string,
        content: string
    ): void => {
        const { pathIndex, fileTable, dirTable, reservedPaths } = vfs;

        // 既にこのパスに何らかの履歴がある場合はエラー
        let token = pathIndex.get(filePath);
        if (token) {
            const state = fileTable.get(token);

            if (!state) {
                throw new Error("internal state corruption");
            }

            switch (state.intent) {
                case "create":
                    throw new Error(`file already created: ${filePath}`);

                case "modify":
                    throw new Error(`file already opened; use updateFile: ${filePath}`);

                case "delete":
                    throw new Error(`file was deleted in this transaction: ${filePath}`);

                default:
                    // openText だけで intent 未設定のケース
                    throw new Error(`file already opened; use updateFile: ${filePath}`);
            }
        }
        if (reservedPaths.has(filePath)) {
            throw new Error("Destination path is already reserved.");
        }
        // 新規トークン発行
        token = RuntimeUtil.createFileToken();

        let existVirtualDir = false;
        const parent = PathUtil.normalize(PathUtil.dirname(filePath));

        for (const [path, entry] of dirTable.entries()) {

            // 親ディレクトリに対する祖先判定
            if (
                PathUtil.samePath(path, parent) ||
                PathUtil.isAncestor(path, parent)
            ) {
                if (entry.intent === "create") {
                    existVirtualDir = true;
                    break;
                } else if (entry.intent === "delete") {
                    throw new Error(`Ancestor directory is scheduled for deletion: ${path}`);
                }
            }
        }
        // FileState 作成
        fileTable.set(token, {
            path: filePath,
            intent: 'create',
            textCache: {
                encoding: "utf8", // saveFile は utf8 固定でよい
                original: '',
                current: content,
            },
            existVirtualDir
        });

        // パスとトークンを関連付け
        pathIndex.set(filePath, token);
    };
}

export default SaveFile;
