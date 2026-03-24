import { invoke } from "@tauri-apps/api/core";
import type TxPlanUtil from "./txPlanUtil";
import type { TextEncoding } from "../../../../../../store/types";
import DataUtil from "../../../../../../util/data/dataUtil";

namespace TxCommitRunner {

    export const saveText = async (
        path: string, content: string, encoding: TextEncoding
    ): Promise<TxPlanUtil.CommitResult> => {
        const bytes = DataUtil.encodeText(content, encoding);
        try {
            await invoke<void>("save_binary", { path, bytes });
            return { kind: "success" };
        } catch (e: any) {
            return {
                kind: "error",
                detail: String(e),
            };
        }
    }

    export const deleteFile = async (
        path: string
    ): Promise<TxPlanUtil.CommitResult> => {
        try {
            await invoke<void>("delete_path", {
                path,
                target: 'file'
            });
            return { kind: 'success' };
        } catch (e: any) {
            return {
                kind: "error",
                detail: String(e),
            };
        }
    }

    export const renameFile = async (
        from: string,
        to: string
    ): Promise<TxPlanUtil.CommitResult> => {
        console.log(`[from: '${from}]', to: '${to}'`);
        try {
            await invoke<void>("rename", { from, to });
            return { kind: 'success' };
        } catch (e: any) {
            return {
                kind: "error",
                detail: String(e) + `[from: '${from}]', to: '${to}'`,
            };
        }
    }

    export const copyFile = async (
        src: string,
        dest: string
    ): Promise<TxPlanUtil.CommitResult> => {
        try {
            await invoke<void>("copy_file", { src, dest });
            return { kind: 'success' };
        } catch (e: any) {
            return {
                kind: "error",
                detail: String(e),
            };
        }
    }

    export const makeDir = async (
        dirPath: string,
    ): Promise<TxPlanUtil.CommitResult> => {
        try {
            await invoke<void>("make_dir", { dirPath });
            return { kind: 'success' };
        } catch (e: any) {
            return {
                kind: "error",
                detail: String(e),
            };
        }
    }
}
export default TxCommitRunner;