import { VERSION } from './workspace-version.js';

/**
 * @returns {import('../store/store-workspace').default.Props}
 */
export const createMinimalWorkspace = () => {
  return {
    version: VERSION,
    envs: [],
    resources: [],
    datasets: [],
    processes: [],
    logics: [],
    declare: { source: '' },
    works: [],
  };
};
