import { invoke } from '@tauri-apps/api/core';
import DataUtil from '../../util/data/data-util';
import type TransactionIO from '../../contents/detail/program/runtime/transaction/transaction-io';

const TransactionTauriIO: TransactionIO.Port = {
  existsPath: (path) => invoke<boolean>('exists_path', { path }),
  stat: (path) => invoke<TransactionIO.FileStat>('stat', { path }),
  readDirectory: (dir) =>
    invoke<TransactionIO.DirectoryEntry[]>('read_dir', { dir }),
  readText: async (filePath, encoding) => {
    const bytes = await invoke<number[]>('read_binary', { filePath });
    return DataUtil.decodeBinary(new Uint8Array(bytes), encoding);
  },
  saveText: async (path, content, encoding) => {
    const bytes = DataUtil.encodeText(content, encoding);
    await invoke<void>('save_binary', { path, bytes });
  },
  deleteFile: (path) => invoke<void>('delete_file', { path }),
  deleteDir: (path) => invoke<void>('delete_dir', { path }),
  renameFile: (from, to) => invoke<void>('rename', { from, to }),
  copyFile: (src, dest) => invoke<void>('copy_file', { src, dest }),
  makeDir: (dirPath) => invoke<void>('make_dir', { dirPath }),
};
export default TransactionTauriIO;
