import { invoke } from "@tauri-apps/api/core";
import type { FileStat } from "../../../../../../store/types";
import PathUtil from "../../../../../../util/data/pathUtil";
import type TxExecuter from "./txExecuter";

namespace TxVerifyUtil {

    export const existsPath = (path: string) => {
        return invoke<boolean>("exists_path", { path });
    }

    export const stat = (path: string) => {
        return invoke<FileStat>("stat", { path });
    }

    export const checkSaveFile = async (
        filePath: string
    ): Promise<TxExecuter.VerifyResult> => {

        // 1. 親ディレクトリ取得（Windows前提）
        const lastSlash = filePath.lastIndexOf("\\");
        if (lastSlash === -1) {
            return {
                kind: "error",
                message: `Invalid path: ${filePath}`
            };
        }

        const dirPath = filePath.slice(0, lastSlash);

        // 2. ディレクトリ存在確認
        if (!(await existsPath(dirPath))) {
            return {
                kind: "error",
                message: `Directory does not exist: ${dirPath}`
            };
        }

        const dirStat = await stat(dirPath);

        if (!dirStat.isDir) {
            return {
                kind: "error",
                message: `Parent is not a directory: ${dirPath}`
            };
        }

        // 3. 書き込み可否（簡易判定）
        if (dirStat.readonly) {
            return {
                kind: "error",
                message: `Directory is readonly: ${dirPath}`
            };
        }

        // 4. 既存ファイルチェック（警告）
        if (await existsPath(filePath)) {
            return {
                kind: "warn",
                message: `File already exists: ${filePath}`
            };
        }

        return { kind: "checked" };
    };


    export const checkExistsFile = async (filePath: string, permitNone: boolean): Promise<TxExecuter.VerifyResult> => {
        if (!await existsPath(filePath)) {
            return {
                kind: permitNone ? 'warn' : 'error',
                message: `File does not exist: ${filePath}`
            };
        }

        const fileStat = await stat(filePath);

        if (!fileStat.isFile) {
            return {
                kind: 'error',
                message: `Path is not a file: ${filePath}`
            };
        }

        if (fileStat.readonly) {
            return {
                kind: 'error',
                message: `File is readonly: ${filePath}`
            };
        }

        return { kind: 'checked' };
    };

    const buildNewPath = (fromFilePath: string, newName: string): string => {
        const dir = PathUtil.dirname(fromFilePath);
        return `${dir}\\${newName}`;
    };

    export const checkRenameFile = async (
        fromFilePath: string,
        newName: string
    ): Promise<TxExecuter.VerifyResult> => {

        // 1. 元ファイル存在＆file保証
        const baseCheck = await checkExistsFile(fromFilePath, false);
        if (baseCheck.kind === "error") {
            return baseCheck;
        }

        // 4. 新パス生成
        const newPath = buildNewPath(fromFilePath, newName);

        // 5. 同名ファイル存在チェック
        if (await existsPath(newPath)) {
            return {
                kind: "error",
                message: `File already exists: ${newPath}`
            };
        }

        return { kind: "checked" };
    };

};
export default TxVerifyUtil;