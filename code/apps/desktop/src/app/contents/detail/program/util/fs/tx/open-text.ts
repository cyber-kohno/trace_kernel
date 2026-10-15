import Core from '../../../../../../../../../../packages/runtime-core/src/api/fs/tx/open-text';
import type RuntimeUtil from '../../../runtime/runtime-util';
import RealFSWriter from '../real-fs-writer';
export namespace OpenText {
  export const execute = (
    vfs: RuntimeUtil.VFSState,
    filePath: string,
    encoding: 'utf8' | 'sjis',
  ) => Core.execute(vfs, filePath, encoding, RealFSWriter);
}
export default OpenText;
