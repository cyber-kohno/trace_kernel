import type RuntimeUtil from "../execution/runtime-cache";

import type TransactionModel from "./transaction-model";

namespace TxPlanNormalize {
  export type Order = TransactionModel.Order;
  export type CreateFileOrder = TransactionModel.CreateFileOrder;
  export type ModifyFileOrder = TransactionModel.ModifyFileOrder;
  export type DeleteFileOrder = TransactionModel.DeleteFileOrder;
  export type RenameFileOrder = TransactionModel.RenameFileOrder;
  export type CopyFileOrder = TransactionModel.CopyFileOrder;
  export type MakeDirOrder = TransactionModel.MakeDirOrder;
  export type DeleteDirOrder = TransactionModel.DeleteDirOrder;

  export const convertVfsToOrder = (vfs: RuntimeUtil.VFSState): Order[] => {
    const orders: Order[] = [];

    for (const [_, state] of vfs.dirTable.entries()) {
      orders.push({
        type: state.intent === "create" ? "create_dir" : "delete_dir",
        path: state.path,
      });
    }
    vfs.copyOps.forEach((op) => {
      orders.push({
        type: "copy_file",
        from: op.from,
        to: op.dest,
        existVirtualDir: op.existVirtualDir,
      });
    });

    for (const [_, state] of vfs.fileTable.entries()) {
      // ファイルをオープンしただけの記録は先に除外
      if (!state.intent && !state.renameTo) continue;

      if (state.intent) {
        switch (state.intent) {
          case "create":
            {
              if (!state.textCache) throw new Error();
              const { current, encoding } = state.textCache;
              const existVirtualDir = state.existVirtualDir;
              if (existVirtualDir == undefined) throw new Error();
              orders.push({
                type: "create_file",
                path: state.path,
                content: current,
                encoding,
                existVirtualDir,
              });
            }
            break;
          case "modify":
            {
              if (!state.textCache || !state.snapshot) throw new Error();
              const { original, current, encoding } = state.textCache;
              orders.push({
                type: "modify_file",
                path: state.path,
                original,
                current,
                encoding,
                snapshot: state.snapshot,
              });
            }
            break;
          case "delete":
            {
              orders.push({
                type: "delete_file",
                path: state.path,
              });
            }
            break;
        }
      }
      if (state.renameTo) {
        orders.push({
          type: "rename_file",
          from: state.path,
          to: state.renameTo,
        });
      }
    }

    return orders;
  };
}
export default TxPlanNormalize;
