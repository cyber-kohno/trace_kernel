import RuntimeUtil from "../../../runtime/runtimeUtil";
namespace RenameFile {

    // ==========================
    // Public API
    // ==========================

    export const byPath = (
        vfs: RuntimeUtil.VFSState,
        filePath: string,
        newName: string
    ) => {

        if (newName.includes("/") || newName.includes("\\")) {
            throw new Error(
                "rename cannot change directory (filename only)"
            );
        }

        const { pathIndex, fileTable } = vfs;

        let state: RuntimeUtil.FileState;

        const existingToken = pathIndex.get(filePath);

        if (existingToken) {
            state = fileTable.get(existingToken)!;
        } else {
            // 未touch → rename intent 登録
            const newToken = RuntimeUtil.createFileToken();

            state = {
                path: filePath
            };

            fileTable.set(newToken, state);
            pathIndex.set(filePath, newToken);
        }

        core(vfs, state, filePath, newName);
    };


    export const byToken = (
        vfs: RuntimeUtil.VFSState,
        token: RuntimeUtil.FileToken,
        newName: string
    ) => {

        if (newName.includes("/") || newName.includes("\\")) {
            throw new Error(
                "rename cannot change directory (filename only)"
            );
        }

        const { fileTable } = vfs;

        const state = fileTable.get(token);

        if (!state) {
            throw new Error("invalid file token");
        }

        core(vfs, state, state.path, newName);
    };


    // ==========================
    // Internal Shared Logic
    // ==========================

    const core = (
        vfs: RuntimeUtil.VFSState,
        state: RuntimeUtil.FileState,
        oldPath: string,
        newName: string
    ) => {

        const { pathIndex, reservedPaths, fileTable } = vfs;

        if (state.intent === "create") {
            throw new Error(
                `cannot rename newly created file: ${oldPath}`
            );
        }

        if (state.intent === "delete") {
            throw new Error(
                `cannot rename deleted file: ${oldPath}`
            );
        }

        if (state.renameTo) {
            throw new Error(
                `file already renamed: ${oldPath} → ${state.renameTo}`
            );
        }

        // ★ ディレクトリ抽出
        const lastSlash = Math.max(
            oldPath.lastIndexOf("/"),
            oldPath.lastIndexOf("\\")
        );

        const dir =
            lastSlash >= 0
                ? oldPath.substring(0, lastSlash + 1)
                : "";

        const newPath = dir + newName;

        if (newPath === oldPath) {
            throw new Error("new name is identical to current name");
        }

        if (reservedPaths.has(newPath)) {
            throw new Error(
                `rename target already reserved: ${newPath}`
            );
        }

        if (pathIndex.has(newPath)) {
            throw new Error(
                `rename target already touched in transaction: ${newPath}`
            );
        }

        for (const s of fileTable.values()) {
            if (s.renameTo === newPath) {
                throw new Error(
                    `rename target already used by another rename: ${newPath}`
                );
            }
        }

        state.renameTo = newPath;
        reservedPaths.add(newPath);
    };
}

export default RenameFile;