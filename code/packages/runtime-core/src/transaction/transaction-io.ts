import type TransactionModel from "./transaction-model";

namespace TransactionIO {
  export interface FileStat {
    size: number;
    isFile: boolean;
    isDir: boolean;
    readonly: boolean;
    modifiedAt?: number;
  }

  export interface DirectoryEntry {
    name: string;
    isDir: boolean;
  }

  // Failures reject. A resolved mutation means the native operation completed.
  export interface Port {
    existsPath(path: string): Promise<boolean>;
    stat(path: string): Promise<FileStat>;
    readDirectory(path: string): Promise<DirectoryEntry[]>;
    readText(
      path: string,
      encoding: TransactionModel.TextEncoding,
    ): Promise<string>;
    saveText(
      path: string,
      content: string,
      encoding: TransactionModel.TextEncoding,
    ): Promise<void>;
    deleteFile(path: string): Promise<void>;
    deleteDir(path: string): Promise<void>;
    renameFile(from: string, to: string): Promise<void>;
    copyFile(from: string, to: string): Promise<void>;
    makeDir(path: string): Promise<void>;
  }
}
export type { TransactionIO as default };
