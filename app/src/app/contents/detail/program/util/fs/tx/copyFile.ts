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
        const { pathIndex, reservedPaths, copyOps } = vfs;

        if (reservedPaths.has(dest)) {
            throw new Error("Destination path is already reserved.");
        }

        if (pathIndex.has(dest)) {
            throw new Error("Destination path is already used in transaction.");
        }

        // 予約
        reservedPaths.add(dest);

        copyOps.push({ from, dest });
    };

}
export default CopyFile;