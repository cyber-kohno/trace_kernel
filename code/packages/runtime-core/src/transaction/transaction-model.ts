import type { TextEncoding as WorkspaceTextEncoding } from "../model/workspace";

namespace TransactionModel {
  export type Order =
    | CreateFileOrder
    | ModifyFileOrder
    | DeleteFileOrder
    | RenameFileOrder
    | CopyFileOrder
    | MakeDirOrder
    | DeleteDirOrder;

  type Snapshot = {
    readonly mtimeMs: number;
    readonly size: number;
  };
  export interface CreateFileOrder {
    readonly type: "create_file";
    readonly path: string;
    readonly content: string;
    readonly encoding: TextEncoding;
    readonly existVirtualDir: boolean;
  }

  export interface ModifyFileOrder {
    readonly type: "modify_file";
    readonly path: string;
    readonly snapshot: Snapshot;
    readonly original: string;
    readonly current: string;
    readonly encoding: TextEncoding;
  }

  export interface DeleteFileOrder {
    readonly type: "delete_file";
    readonly path: string;
  }
  export interface RenameFileOrder {
    readonly type: "rename_file";
    readonly from: string;
    readonly to: string;
  }
  export interface CopyFileOrder {
    readonly type: "copy_file";
    readonly from: string;
    readonly to: string;
    readonly existVirtualDir: boolean;
  }
  export interface MakeDirOrder {
    readonly type: "create_dir";
    readonly path: string;
  }

  export interface DeleteDirOrder {
    readonly type: "delete_dir";
    readonly path: string;
  }

  export type TextEncoding = WorkspaceTextEncoding;
  export type VerifyResult = Readonly<
    | { kind: "checked" }
    | { kind: "warn"; message: string }
    | { kind: "error"; message: string }
  >;
  export type CommitResult = Readonly<
    | { kind: "success" }
    | { kind: "error"; detail: string }
    | { kind: "skipped"; detail: string }
  >;
  export interface Status {
    verify?: VerifyResult;
    commit?: CommitResult;
  }
  export type RunResult = Readonly<
    | { kind: "success"; committedCount: number }
    | { kind: "verification-failed"; errorCount: number; warningCount: number }
    | {
        kind: "commit-failed";
        committedCount: number;
        skippedCount: number;
        failedOrder: Order;
      }
  >;
}
export type { TransactionModel as default };
