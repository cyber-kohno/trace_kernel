import DataUtil from '../../../../../../util/data/data-util';
import RuntimeUtil from '../../../runtime/runtime-util';
import RealFSWriter from '../real-fs-writer';
import TxPathValidate from './tx-path-validate';

export namespace OpenText {
  export const execute = async (
    vfs: RuntimeUtil.VFSState,
    filePath: string,
    encoding: 'utf8' | 'sjis',
  ) => {
    TxPathValidate.windowsPath(filePath);

    const { pathIndex, fileTable } = vfs;

    // ❗ 既に履歴があるなら即エラー
    if (pathIndex.has(filePath)) {
      const token = pathIndex.get(filePath)!;
      const state = fileTable.get(token);

      throw new Error(
        `cannot open file with existing transaction history: ${filePath} ` +
          `(intent=${state?.intent ?? 'unknown'})`,
      );
    }

    // 実FSから読む
    const { modifiedAt, size } = await RealFSWriter.assertTextReadSize(
      filePath,
      'openText',
    );
    const binary = await RealFSWriter.readBinary(filePath);
    const text = DataUtil.decodeBinary(binary, encoding);

    // token 作成
    const token = RuntimeUtil.createFileToken();
    pathIndex.set(filePath, token);

    fileTable.set(token, {
      path: filePath,
      snapshot: {
        mtimeMs: modifiedAt!,
        size,
      },
      textCache: {
        encoding,
        original: text,
        current: text,
      },
    });

    return { content: text, token };
  };
}
export default OpenText;
