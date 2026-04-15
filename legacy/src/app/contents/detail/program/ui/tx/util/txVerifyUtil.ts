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

    export const checkCopyFile = async (
        from: string,
        to: string,
        reserveDirs: string[]
    ): Promise<TxExecuter.VerifyResult> => {

        // 0. 同一パスチェック
        if (from === to) {
            return {
                kind: "error",
                message: `Source and destination are the same: ${from}`
            };
        }

        // 1. コピー元チェック
        const fromCheck = await checkExistsFile(from, false);
        if (fromCheck.kind === "error") {
            return fromCheck;
        }

        // 2. コピー先チェック（基本）
        const toCheck = await checkSaveFile(to, reserveDirs);
        if (toCheck.kind === "error") {
            return toCheck;
        }

        // 3. コピー先がディレクトリでないか
        if (await existsPath(to)) {
            const st = await stat(to);
            if (st.isDir) {
                return {
                    kind: "error",
                    message: `Destination is a directory: ${to}`
                };
            }
        }

        // 4. warnはそのまま返す
        if (toCheck.kind === "warn") {
            return toCheck;
        }

        return { kind: "checked" };
    };

    export const checkSaveFile = async (
        filePath: string,
        reserveDirs: string[]
    ): Promise<TxExecuter.VerifyResult> => {

        // 1. 親ディレクトリ取得
        const lastSlash = filePath.lastIndexOf("\\");
        if (lastSlash === -1) {
            return {
                kind: "error",
                message: `Invalid path: ${filePath}`
            };
        }

        const dirPath = filePath.slice(0, lastSlash);
        const normalizedDir = PathUtil.normalize(dirPath);

        const existsReal = await existsPath(dirPath);

        if (!existsReal) {
            // 2. 仮想FS（reserveDirs）で補完
            const existsInReserve = reserveDirs.some(reserved =>
                PathUtil.samePath(reserved, normalizedDir) ||
                PathUtil.isAncestor(normalizedDir, reserved)
            );

            if (!existsInReserve) {
                return {
                    kind: "error",
                    message: `Directory does not exist: ${dirPath}`
                };
            }

            // ★ 仮想ディレクトリの場合は stat 不要
            // → 書き込み可否もチェック不可なのでスキップ
        } else {
            // 3. 実FSにある場合のみ stat
            const dirStat = await stat(dirPath);

            if (!dirStat.isDir) {
                return {
                    kind: "error",
                    message: `Parent is not a directory: ${dirPath}`
                };
            }

            // 4. 書き込み可否（実FSのみ）
            if (dirStat.readonly) {
                return {
                    kind: "error",
                    message: `Directory is readonly: ${dirPath}`
                };
            }
        }

        // 5. 既存ファイルチェック（これは実FSのみ意味がある）
        if (await existsPath(filePath)) {
            return {
                kind: "warn",
                message: `File already exists: ${filePath}`
            };
        }

        return { kind: "checked" };
    };

    export const checkCreateDir = async (
        dirPath: string
    ): Promise<TxExecuter.VerifyResult> => {

        // 0. normalize
        const path = PathUtil.normalize(dirPath);

        // 1. 絶対パスチェック
        if (!PathUtil.isAbsolute(path)) {
            return {
                kind: "error",
                message: `Path must be absolute: ${dirPath}`
            };
        }

        // 2. ルートチェック
        const parent = PathUtil.dirname(path);
        if (PathUtil.samePath(path, parent)) {
            return {
                kind: "error",
                message: `Cannot create root directory: ${path}`
            };
        }

        // 3. 既に存在する場合
        if (await existsPath(path)) {
            const st = await stat(path);

            if (st.isDir) {
                return { kind: "checked" }; // 目的達成済み（冪等）
            }

            return {
                kind: "error",
                message: `Path exists and is not a directory: ${path}`
            };
        }

        // 4. 祖先を遡って「ファイルが混ざっていないか」チェック
        let current = parent;

        while (current) {

            if (await existsPath(current)) {
                const st = await stat(current);

                if (!st.isDir) {
                    return {
                        kind: "error",
                        message: `Ancestor is not a directory: ${current}`
                    };
                }

                // ここまで来れば、この祖先より上は必ず問題ない
                break;
            }

            const next = PathUtil.dirname(current);

            // ルート到達（安全終了）
            if (PathUtil.samePath(current, next)) {
                break;
            }

            current = next;
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