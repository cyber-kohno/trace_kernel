import type { FileRequest, FileStat } from "../../../../../store/types";
import type RuntimeUtil from "../../runtime/runtimeUtil";
import WorkerInvoke from "../workerInvoke";
import RealFSWriter from "./realFSWriter";
import DclFSTransaction from "./tx/dclFSTransaction";

namespace DclFileSystem {

    type FileSystemAPI = {
        exists: (path: string) => Promise<boolean>;
        glob: (pattern: string) => Promise<string[]>;
        stat: (path: string) => Promise<FileStat>;
        readDir: (dir: string) => Promise<{ name: string; isDir: boolean; }[]>;
        readBinary: (filePath: string) => Promise<ArrayBuffer>;
        readText: (filePath: string, encoding: 'utf8' | 'sjis') => Promise<string>;
        saveText: (filePath: string, content: string) => Promise<void>;
        copyFile: (src: string, dest: string) => Promise<void>;
        makeDir: (dirPath: string) => Promise<void>;
        deleteFile: (filePath: string) => Promise<void>;
        deleteDir: (dirPath: string) => Promise<void>;
        renameFile: (targetFilePath: string, newFileName: string) => Promise<void>;
        renameDir: (targetDirPath: string, newDirName: string) => Promise<void>;

        useTransaction: () => DclFSTransaction.TransactionAPI;
    }

    export const getTypeDeclare = () => `
        type FileToken = { readonly __fileTokenBrand: unique symbol }
        type FileStat = {
            size: number;
            isFile: boolean;
            isDir: boolean;
            createdAt?: number;
            modifiedAt?: number;
        }
        type TransactionAPI = {
            makeDir: (dirPath: string) => void;
            openText: (filePath: string, encorde?: "utf8" | "sjis") => Promise<{ token: FileToken; content: string; }>;
            saveText: (filePath: string, content: string) => void;
            updateText: (token: FileToken, content: string) => void;
            copyFile: (from: string, dest: string) => void;
            copyFileByToken: (token: FileToken, dest: string) => void;
            deleteFile: (filePath: string) => void;
            deleteFileByToken: (token: FileToken) => void;
            renameFile: (targetFilePath: string, newFileName: string) => void;
            renameFileByToken: (token: FileToken, newName: string) => void;
        }
        type FileSystemAPI = {
            exists: (path: string) => Promise<boolean>,
            glob: (pattern: string) => Promise<string[]>,
            stat: (path: string) => Promise<FileStat>,
            readDir: (dir: string) => Promise<{ name: string; isDir: boolean; }[]>,
            readBinary: (filePath: string) => Promise<ArrayBuffer>,
            readText: (filePath: string, encoding?: 'utf8' | 'sjis') => Promise<string>;
            saveText: (filePath: string, content: string) => Promise<void>;
            copyFile: (src: string, dest: string) => Promise<void>;
            makeDir: (dirPath: string) => Promise<void>;
            deleteFile: (filePath: string) => Promise<void>;
            deleteDir: (dirPath: string) => Promise<void>;
            renameFile: (targetFilePath: string, newFileName: string) => Promise<void>;
            renameDir: (targetDirPath: string, newDirName: string) => Promise<void>;
            useTransaction: () => TransactionAPI;
        }
    `;
    export const getValueDeclare = () => `FileSystemAPI`;

    export const getObject = (workerCache: RuntimeUtil.WorkerCache): FileSystemAPI => {

        return {
            exists: (path: string) => {
                return WorkerInvoke.call("exists_path", { path });
            },
            glob: (pattern: string) => {
                return WorkerInvoke.call("glob_path", { pattern });
            },
            stat: (path: string) => {
                return RealFSWriter.stat(path);
            },
            readDir: (dir: string) => {
                return WorkerInvoke.call("read_dir", { dir });
            },
            readBinary: async (filePath: string) => {
                const bytes = await RealFSWriter.readBinary(filePath);
                return bytes.buffer;
            },
            readText: async (filePath: string, encoding?: 'utf8' | 'sjis') => {
                const req: FileRequest = { filePath, encoding: encoding ?? 'utf8' };
                return WorkerInvoke.call<string>("read_file", { req });
            },
            saveText: async (filePath: string, content: string) => {
                return RealFSWriter.saveText(filePath, content);
            },
            copyFile: (src: string, dest: string) => {
                return RealFSWriter.copyFile(src, dest);
            },
            makeDir: (dirPath: string) => {
                return RealFSWriter.makeDir(dirPath);
            },
            deleteFile: (filePath: string) => {
                return RealFSWriter.deletePath(filePath, 'file');
            },
            deleteDir: (dirPath: string) => {
                return RealFSWriter.deletePath(dirPath, 'directory');
            },
            renameFile: (targetFilePath: string, newFileName: string) => {
                return RealFSWriter.renameWithinDirectory(
                    targetFilePath,
                    newFileName,
                    'file'
                );
            },
            renameDir: (targetDirPath: string, newDirName: string) => {
                return RealFSWriter.renameWithinDirectory(
                    targetDirPath,
                    newDirName,
                    'directory'
                );
            },
            useTransaction: () => {
                // 2回呼ばれたらランタイムエラー
                if (workerCache.vfs != null)
                    throw new Error('useTransaction() may only be called once per worker session.');
                const txCache = workerCache.createVFS();
                return DclFSTransaction.getObject(txCache);
            }
        }
    };
};
export default DclFileSystem;