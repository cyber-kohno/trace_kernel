import type { FileStat } from "../../../../../store/types";
import PathUtil from "../../../../../util/data/pathUtil";
import WorkerInvoke from "../workerInvoke";

export namespace RealFSWriter {

    const assertAbsolutePath = async (path: string, label: string) => {
        if (!(await PathUtil.isAbsolute(path))) {
            throw new Error(`${label} must be absolute path.`);
        }
    }

    export const readBinary = async (filePath: string) => {
        assertAbsolutePath(filePath, 'path');
        const raw = await WorkerInvoke.call<number[]>("read_binary", { filePath });
        return new Uint8Array(raw);
    }

    export const existsPath = (path: string) => {
        return WorkerInvoke.call<boolean>("exists_path", { path });
    }
    export const stat = async (path: string) => {
        const stat = await WorkerInvoke.call<FileStat>("stat", { path });
        return stat;
    }

    export const saveText = async (path: string, content: string) => {
        assertAbsolutePath(path, 'path');
        return WorkerInvoke.call<void>("save_text", { path, content });
    }

    export const copyFile = async (src: string, dest: string): Promise<void> => {

        assertAbsolutePath(src, 'src');

        assertAbsolutePath(dest, 'dest');

        const srcStat = await stat(src);

        if (srcStat.isDir) {
            throw new Error(`Source is not a file: ${src}`);
        }

        return WorkerInvoke.call<void>("copy_file", { src, dest });
    };

    export const makeDir = async (dirPath: string): Promise<void> => {
        assertAbsolutePath(dirPath, 'dirPath');

        if (await existsPath(dirPath)) {
            const st = await stat(dirPath);
            if (!st.isDir) {
                throw new Error(`A file already exists at the path: ${dirPath}`);
            }
            // 既存ディレクトリなら何もしない
            return;
        }

        return WorkerInvoke.call<void>("make_dir", { dirPath });
    };

    export const deletePath = async (path: string, target: 'directory' | 'file') => {
        assertAbsolutePath(path, `${target} path`);
        return WorkerInvoke.call<void>("delete_path", {
            path,
            target
        });
    }

    export const renameWithinDirectory = async (
        targetPath: string,
        newName: string,
        target: 'directory' | 'file'
    ) => {

        // 絶対パス検証（既存ユーティリティ）
        assertAbsolutePath(targetPath, 'targetPath');

        if (newName.includes("/") || newName.includes("\\")) {
            throw new Error("newName must not contain path separators");
        }

        // 正規化
        const from = PathUtil.normalize(targetPath);

        // 存在確認
        if (!await existsPath(from)) {
            throw new Error(`${target} does not exist: ${from}`);
        }

        const fromStat = await stat(from);
        const expectedIsDirectory = target === 'directory';

        if (fromStat.isDir !== expectedIsDirectory) {
            throw new Error(`Target is not a ${target}: ${from}`);
        }

        // 親ディレクトリ
        const parentDir = PathUtil.dirname(from);

        // 新パス生成
        const to = PathUtil.normalize(
            PathUtil.joinPath(parentDir, newName)
        );

        // 同一ディレクトリ保証（Windows大小文字問題対応）
        const toParent = PathUtil.dirname(to);

        if (!PathUtil.samePath(parentDir, toParent)) {
            throw new Error("Cross-directory rename is not allowed");
        }

        // 既存チェック
        if (await existsPath(to)) {
            throw new Error(`${target} already exists: ${to}`);
        }

        return WorkerInvoke.call<void>("rename", {
            from,
            to
        });
    };

}
export default RealFSWriter;