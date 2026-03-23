import RuntimeUtil from "../../../runtime/runtimeUtil";

namespace UpdateFile {

    export const execute = (
        vfs: RuntimeUtil.VFSState,
        token: RuntimeUtil.FileToken,
        content: string
    ): void => {

        const { fileTable } = vfs;

        const state = fileTable.get(token);
        if (!state) {
            throw new Error("invalid file token");
        }

        if (!state.textCache) {
            throw new Error("file not materialized");
        }

        if (state.intent === "delete") {
            throw new Error("cannot update deleted file");
        }

        // 内容更新
        state.textCache.current = content;

        // create 以外は modify に昇格
        if (state.intent !== "create") {
            state.intent = "modify";
        }
    };

}
export default UpdateFile;