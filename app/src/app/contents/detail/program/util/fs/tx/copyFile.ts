import RuntimeUtil from "../../../runtime/runtimeUtil";

namespace CopyFile {

    export const execute = (
        vfs: RuntimeUtil.VFSState,
        from: string,
        dest: string
    ): void => {

        const { fileTable, pathIndex, reservedPaths, copyOps } = vfs;

        if (reservedPaths.has(dest)) {
            throw new Error("Destination path is already reserved.");
        }

        if (pathIndex.has(dest)) {
            throw new Error("Destination path is already used in transaction.");
        }

        const token = pathIndex.get(from);
        if (!token) {
            throw new Error("Source file is not opened.");
        }

        const state = fileTable.get(token);
        if (!state) {
            throw new Error("Invalid source file state.");
        }

        if (state.intent != null) {
            throw new Error("Cannot copy a file that has pending changes.");
        }

        // 予約
        reservedPaths.add(dest);

        copyOps.push({ from, dest });
    };


}
export default CopyFile;