import {
  validateWorkTypes as validate,
  type WorkDeclarations,
} from '../../../../../packages/runtime-core/src/compiler/semantic-work-validator';
import type WorkState from '../state/model/workspace/work-state';
export type { WorkTypeDiagnostic } from '../../../../../packages/runtime-core/src/compiler/semantic-work-validator';

let libFilesPromise: Promise<Record<string, string>> | null = null;
const loadLibFiles = async () => {
  libFilesPromise ??= import('virtual:trace-kernel-ts-libs').then(
    async (module) => {
      const response = await fetch(module.default);
      if (!response.ok)
        throw new Error(
          'Could not load local TypeScript libraries (' +
            response.status +
            ').',
        );
      return (await response.json()) as Record<string, string>;
    },
  );
  return libFilesPromise;
};
export const validateWorkTypes = async (
  work: WorkState.Props,
  declarations: WorkDeclarations,
) => validate(work, declarations, await loadLibFiles());
