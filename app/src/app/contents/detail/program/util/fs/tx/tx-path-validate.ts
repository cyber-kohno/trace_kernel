import PathUtil from '../../../../../../util/data/path-util';

namespace TxPathValidate {
  export const windowsPath = (path: string): void => {
    const result = PathUtil.validateWindowsPath(path);
    if (!result.valid) {
      throw new Error(result.message);
    }
  };

  export const windowsFileName = (name: string): void => {
    const result = PathUtil.validateWindowsFileName(name);
    if (!result.valid) {
      throw new Error(result.message);
    }
  };
}

export default TxPathValidate;
