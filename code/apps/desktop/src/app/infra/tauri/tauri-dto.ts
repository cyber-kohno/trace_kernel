import type FileTypes from '../../../../../../packages/runtime-core/src/data/file-types';
import type DatasetState from '../../state/model/workspace/dataset-state';

namespace TauriDto {
  export const namespaceName = 'TauriDto';

  export type FileStat = FileTypes.FileStat;

  export interface ScanRequest extends DatasetState.ScanOption {
    rootPath: string;
  }

  export type KeyValue = {
    key: string;
    value: string;
  };

  export type TextEncoding = FileTypes.TextEncoding;

  export type FileRequest = FileTypes.FileRequest;

  export type DirBelong = {
    name: string;
    isDir: boolean;
  };

  export type HtmlSource = {
    url: string;
    html: string;
    fetchedAt: number;
  };
}

export default TauriDto;
