import RuntimeUtil from "../../../runtime/runtimeUtil";

namespace DeleteFile {

    // ==========================
    // Public API
    // ==========================

    export const executeByPath = (
        vfs: RuntimeUtil.VFSState,
        filePath: string
    ) => {

        const { pathIndex, fileTable } = vfs;

        let state: RuntimeUtil.FileState | undefined;

        const token = pathIndex.get(filePath);

        if (!token) {
            // 未touch → 削除意図登録
            const newToken = RuntimeUtil.createFileToken();

            state = {
                path: filePath,
                intent: "delete"
            };

            fileTable.set(newToken, state);
            pathIndex.set(filePath, newToken);
            return;
        }

        state = fileTable.get(token);
        if (!state) {
            throw new Error("corrupted transaction state");
        }

        // open済み（snapshotあり）は token経由のみ許可
        if (state.snapshot) {
            throw new Error(
                `opened file must be deleted via token: ${filePath}`
            );
        }

        deleteCore(state, filePath);
    };


    export const executeByToken = (
        vfs: RuntimeUtil.VFSState,
        token: RuntimeUtil.FileToken
    ) => {

        const { fileTable } = vfs;

        const state = fileTable.get(token);

        if (!state) {
            throw new Error("invalid file token");
        }

        const filePath = state.path;

        deleteCore(state, filePath);
    };


    // ==========================
    // Internal Shared Logic
    // ==========================

    const deleteCore = (
        state: RuntimeUtil.FileState,
        filePath: string
    ) => {

        if (state.intent === "delete") {
            throw new Error(`file already deleted: ${filePath}`);
        }

        if (state.intent === "create") {
            throw new Error(
                `cannot delete newly created file: ${filePath}`
            );
        }

        state.intent = "delete";
    };
}


export default DeleteFile;
