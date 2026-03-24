import PathUtil from "../../../../../../util/data/pathUtil";
import RuntimeUtil from "../../../runtime/runtimeUtil";

namespace CopyFile {

    export const byPath = (
        vfs: RuntimeUtil.VFSState,
        from: string,
        dest: string
    ): void => {

        const { fileTable, pathIndex, reservedPaths } = vfs;

        if (reservedPaths.has(dest)) {
            throw new Error("Destination path is already reserved.");
        }

        if (pathIndex.has(dest)) {
            throw new Error("Destination path is already used in transaction.");
        }

        const token = pathIndex.get(from);
        if (token) {
            let state: RuntimeUtil.FileState | undefined;
            state = fileTable.get(token);
            if (!state) {
                throw new Error("corrupted transaction state");
            }

            // open済み（snapshotあり）は token経由のみ許可
            if (state.snapshot) {
                throw new Error(
                    `opened file must be copied via token: ${from}`
                );
            }
        }

        core(vfs, from, dest);
    };

    export const byToken = (
        vfs: RuntimeUtil.VFSState,
        token: RuntimeUtil.FileToken,
        dest: string
    ): void => {
        const { fileTable } = vfs;

        const state = fileTable.get(token);

        if (!state) {
            throw new Error("invalid file token");
        }

        if (state.intent != null) {
            throw new Error("Cannot copy a file that has pending changes.");
        }
        core(vfs, state.path, dest);
    };

    export const core = (
        vfs: RuntimeUtil.VFSState,
        from: string,
        dest: string
    ): void => {
        const { pathIndex, reservedPaths, copyOps, dirTable } = vfs;


        let existVirtualDir = false;
        const parent = PathUtil.normalize(PathUtil.dirname(dest));

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

        if (reservedPaths.has(dest)) {
            throw new Error("Destination path is already reserved.");
        }

        if (pathIndex.has(dest)) {
            throw new Error("Destination path is already used in transaction.");
        }

        // 予約
        reservedPaths.add(dest);

        copyOps.push({ from, dest, existVirtualDir });
    };
}
export default CopyFile;