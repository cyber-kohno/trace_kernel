import PathUtil from "../data/path-util";
import type TransactionIO from "./transaction-io";
import type TransactionModel from "./transaction-model";

namespace TransactionVerify {
  export const create = (io: TransactionIO.Port) => {
    const existsPath = (path: string) => io.existsPath(path);
    const stat = (path: string) => io.stat(path);
    const checkCopyFile = async (
      from: string,
      to: string,
      reserveDirs: string[],
    ): Promise<TransactionModel.VerifyResult> => {
      // 0. 同一パスチェック
      if (from === to) {
        return {
          kind: "error",
          message: `Source and destination are the same: ${from}`,
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
            message: `Destination is a directory: ${to}`,
          };
        }
      }

      // 4. warnはそのまま返す
      if (toCheck.kind === "warn") {
        return toCheck;
      }

      return { kind: "checked" };
    };

    const checkSaveFile = async (
      filePath: string,
      reserveDirs: string[],
    ): Promise<TransactionModel.VerifyResult> => {
      // 1. 親ディレクトリ取得
      const lastSlash = filePath.lastIndexOf("\\");
      if (lastSlash === -1) {
        return {
          kind: "error",
          message: `Invalid path: ${filePath}`,
        };
      }

      const dirPath = filePath.slice(0, lastSlash);
      const normalizedDir = PathUtil.normalize(dirPath);

      const existsReal = await existsPath(dirPath);

      if (!existsReal) {
        // 2. 仮想FS（reserveDirs）で補完
        const existsInReserve = reserveDirs.some(
          (reserved) =>
            PathUtil.samePath(reserved, normalizedDir) ||
            PathUtil.isAncestor(normalizedDir, reserved),
        );

        if (!existsInReserve) {
          return {
            kind: "error",
            message: `Directory does not exist: ${dirPath}`,
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
            message: `Parent is not a directory: ${dirPath}`,
          };
        }

        // 4. 書き込み可否（実FSのみ）
        if (dirStat.readonly) {
          return {
            kind: "error",
            message: `Directory is readonly: ${dirPath}`,
          };
        }
      }

      // 5. 既存ファイルチェック（これは実FSのみ意味がある）
      if (await existsPath(filePath)) {
        return {
          kind: "warn",
          message: `File already exists: ${filePath}`,
        };
      }

      return { kind: "checked" };
    };

    const checkCreateDir = async (
      dirPath: string,
    ): Promise<TransactionModel.VerifyResult> => {
      // 0. normalize
      const path = PathUtil.normalize(dirPath);

      // 1. 絶対パスチェック
      if (!PathUtil.isAbsolute(path)) {
        return {
          kind: "error",
          message: `Path must be absolute: ${dirPath}`,
        };
      }

      // 2. ルートチェック
      const parent = PathUtil.dirname(path);
      if (PathUtil.samePath(path, parent)) {
        return {
          kind: "error",
          message: `Cannot create root directory: ${path}`,
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
          message: `Path exists and is not a directory: ${path}`,
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
              message: `Ancestor is not a directory: ${current}`,
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

    const checkExistsFile = async (
      filePath: string,
      permitNone: boolean,
    ): Promise<TransactionModel.VerifyResult> => {
      if (!(await existsPath(filePath))) {
        return {
          kind: permitNone ? "warn" : "error",
          message: `File does not exist: ${filePath}`,
        };
      }

      const fileStat = await stat(filePath);

      if (!fileStat.isFile) {
        return {
          kind: "error",
          message: `Path is not a file: ${filePath}`,
        };
      }

      if (fileStat.readonly) {
        return {
          kind: "error",
          message: `File is readonly: ${filePath}`,
        };
      }

      return { kind: "checked" };
    };

    const checkModifyFile = async (
      order: TransactionModel.ModifyFileOrder,
    ): Promise<TransactionModel.VerifyResult> => {
      const baseCheck = await checkExistsFile(order.path, false);
      if (baseCheck.kind !== "checked") return baseCheck;
      const matchesSnapshot = (fileStat: TransactionIO.FileStat) =>
        fileStat.modifiedAt === order.snapshot.mtimeMs &&
        fileStat.size === order.snapshot.size;
      const changed: TransactionModel.VerifyResult = {
        kind: "error",
        message: `File changed since it was opened: ${order.path}`,
      };
      if (!matchesSnapshot(await stat(order.path))) return changed;
      const current = await io.readText(order.path, order.encoding);
      if (
        current !== order.original ||
        !matchesSnapshot(await stat(order.path))
      ) {
        return changed;
      }
      return { kind: "checked" };
    };

    const checkDeleteDir = async (
      dirPath: string,
    ): Promise<TransactionModel.VerifyResult> => {
      const path = PathUtil.normalize(dirPath);
      const isRoot = /^[A-Za-z]:[\\/]?$/.test(path) || path === "/";
      if (!PathUtil.isAbsolute(path) || isRoot) {
        return {
          kind: "error",
          message: `Cannot delete a root or relative directory: ${dirPath}`,
        };
      }
      if (!(await existsPath(path))) {
        return {
          kind: "warn",
          message: `Directory does not exist: ${dirPath}`,
        };
      }
      const dirStat = await stat(path);
      if (!dirStat.isDir) {
        return {
          kind: "error",
          message: `Path is not a directory: ${dirPath}`,
        };
      }
      const children = await io.readDirectory(path);
      if (children.length > 0) {
        return { kind: "error", message: `Directory is not empty: ${dirPath}` };
      }
      return { kind: "checked" };
    };

    const checkRenameFile = async (
      fromFilePath: string,
      toFilePath: string,
    ): Promise<TransactionModel.VerifyResult> => {
      if (PathUtil.samePath(fromFilePath, toFilePath)) {
        return {
          kind: "error",
          message: `Source and destination are the same: ${fromFilePath}`,
        };
      }
      if (
        !PathUtil.isAbsolute(toFilePath) ||
        !PathUtil.samePath(
          PathUtil.dirname(fromFilePath),
          PathUtil.dirname(toFilePath),
        )
      ) {
        return {
          kind: "error",
          message: `Rename destination must be in the same directory: ${toFilePath}`,
        };
      }
      // 1. 元ファイル存在＆file保証
      const baseCheck = await checkExistsFile(fromFilePath, false);
      if (baseCheck.kind === "error") {
        return baseCheck;
      }

      // 5. 同名ファイル存在チェック
      if (await existsPath(toFilePath)) {
        return {
          kind: "error",
          message: `File already exists: ${toFilePath}`,
        };
      }

      return { kind: "checked" };
    };
    return {
      checkCopyFile,
      checkSaveFile,
      checkCreateDir,
      checkExistsFile,
      checkModifyFile,
      checkDeleteDir,
      checkRenameFile,
    };
  };
}
export default TransactionVerify;
