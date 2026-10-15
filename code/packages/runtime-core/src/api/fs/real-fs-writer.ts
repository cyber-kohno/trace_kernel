import type FileTypes from "../../data/file-types";
import PathUtil from "../../data/path-util";
import type { NativeCall } from "../native-call";

export namespace RealFSWriter {
  const TEXT_READ_LIMIT_BYTES = 50 * 1024 * 1024;

  export const create = (native: NativeCall) => {
    const assertAbsolutePath = (path: string, label: string) => {
      if (!PathUtil.isAbsolute(path)) {
        throw new Error(`${label} must be absolute path.`);
      }
    };

    const formatBytes = (bytes: number) => {
      const mib = bytes / 1024 / 1024;
      return `${mib.toFixed(1)} MB`;
    };

    const readBinary = async (filePath: string) => {
      assertAbsolutePath(filePath, "path");
      const raw = await native.call<number[]>("read_binary", { filePath });
      return new Uint8Array(raw);
    };

    const existsPath = (path: string) => {
      return native.call<boolean>("exists_path", { path });
    };
    const stat = async (path: string) => {
      const stat = await native.call<FileTypes.FileStat>("stat", { path });
      return stat;
    };

    const assertTextReadSize = async (filePath: string, apiName: string) => {
      assertAbsolutePath(filePath, "filePath");
      const fileStat = await stat(filePath);

      if (!fileStat.isFile) {
        throw new Error(`${apiName}() target is not a file: ${filePath}`);
      }

      if (fileStat.size > TEXT_READ_LIMIT_BYTES) {
        throw new Error(
          `${apiName}() cannot read files larger than ${formatBytes(
            TEXT_READ_LIMIT_BYTES,
          )}. ` +
            `File size: ${formatBytes(fileStat.size)}. ` +
            `Path: ${filePath}`,
        );
      }

      return fileStat;
    };

    const saveText = async (path: string, content: string) => {
      assertAbsolutePath(path, "path");
      return native.call<void>("save_text", { path, content });
    };

    const copyFile = async (src: string, dest: string): Promise<void> => {
      assertAbsolutePath(src, "src");

      assertAbsolutePath(dest, "dest");

      const srcStat = await stat(src);

      if (srcStat.isDir) {
        throw new Error(`Source is not a file: ${src}`);
      }

      return native.call<void>("copy_file", { src, dest });
    };

    const makeDir = async (dirPath: string): Promise<void> => {
      assertAbsolutePath(dirPath, "dirPath");

      if (await existsPath(dirPath)) {
        const st = await stat(dirPath);
        if (!st.isDir) {
          throw new Error(`A file already exists at the path: ${dirPath}`);
        }
        // 既存ディレクトリなら何もしない
        return;
      }

      return native.call<void>("make_dir", { dirPath });
    };

    const deleteFile = async (path: string) => {
      assertAbsolutePath(path, "file path");
      return native.call<void>("delete_file", { path });
    };
    const deleteDir = async (path: string) => {
      assertAbsolutePath(path, "file dir");
      return native.call<void>("delete_dir", { path });
    };

    const renameWithinDirectory = async (
      targetPath: string,
      newName: string,
      target: "directory" | "file",
    ) => {
      // 絶対パス検証（既存ユーティリティ）
      assertAbsolutePath(targetPath, "targetPath");

      if (newName.includes("/") || newName.includes("\\")) {
        throw new Error("newName must not contain path separators");
      }

      // 正規化
      const from = PathUtil.normalize(targetPath);

      // 存在確認
      if (!(await existsPath(from))) {
        throw new Error(`${target} does not exist: ${from}`);
      }

      const fromStat = await stat(from);
      const expectedIsDirectory = target === "directory";

      if (fromStat.isDir !== expectedIsDirectory) {
        throw new Error(`Target is not a ${target}: ${from}`);
      }

      // 親ディレクトリ
      const parentDir = PathUtil.dirname(from);

      // 新パス生成
      const to = PathUtil.normalize(PathUtil.joinPath(parentDir, newName));

      // 同一ディレクトリ保証（Windows大小文字問題対応）
      const toParent = PathUtil.dirname(to);

      if (!PathUtil.samePath(parentDir, toParent)) {
        throw new Error("Cross-directory rename is not allowed");
      }

      // 既存チェック
      if (await existsPath(to)) {
        throw new Error(`${target} already exists: ${to}`);
      }

      return native.call<void>("rename", {
        from,
        to,
      });
    };
    return {
      assertAbsolutePath,
      readBinary,
      existsPath,
      stat,
      assertTextReadSize,
      saveText,
      copyFile,
      makeDir,
      deleteFile,
      deleteDir,
      renameWithinDirectory,
    };
  };
  export type Port = ReturnType<typeof create>;
}
export default RealFSWriter;
