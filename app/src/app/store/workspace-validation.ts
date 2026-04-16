import { get } from 'svelte/store';
import workspaceStore from './workspace-store';
import workspaceValidationStore from './workspace-validation-store';
import type StoreWorkspace from './store-workspace';
import ValidateUtil from '../util/data/validate-util';

const setEnable = (target: StoreWorkspace.Target, enable: boolean) => {
  workspaceValidationStore.update((state) => {
    const disableIndex = state.disables.findIndex(
      (item) => item.cat === target.cat && item.index === target.index,
    );

    if (enable && disableIndex !== -1) {
      return {
        ...state,
        disables: state.disables.filter((_, index) => index !== disableIndex),
      };
    }

    if (!enable && disableIndex === -1) {
      return {
        ...state,
        disables: [...state.disables, { ...target }],
      };
    }

    return state;
  });
};

const checkDuplicate = (
  target: StoreWorkspace.Target,
  workspace: StoreWorkspace.Props,
) => {
  const [list, nameKey]: [any[], string] = (() => {
    switch (target.cat) {
      case 'env':
        return [workspace.envs, 'varName'];
      case 'resource':
        return [workspace.resources, 'varName'];
      case 'dataset':
        return [workspace.datasets, 'varName'];
      case 'process':
        return [workspace.processes, 'funcName'];
      case 'work':
        return [workspace.works, 'name'];
    }
  })();

  let selfEnable = false;
  list.forEach((obj, index) => {
    const isUnique = !list.find(
      (item, itemIndex) =>
        index !== itemIndex && item[nameKey] === obj[nameKey],
    );
    if (index === target.index) selfEnable = isUnique;
    else setEnable({ cat: target.cat, index }, isUnique);
  });
  return selfEnable;
};

export const validate = (target: StoreWorkspace.Target) => {
  const { workspace } = get(workspaceStore);
  if (workspace == null) return;

  switch (target.cat) {
    case 'env': {
      const env = workspace.envs[target.index];
      const isUnique = checkDuplicate(target, workspace);
      setEnable(
        target,
        env.varName !== '' &&
          ValidateUtil.UpperCase.test(env.varName) &&
          env.value !== '' &&
          isUnique,
      );
      break;
    }
    case 'resource': {
      const resource = workspace.resources[target.index];
      const isUnique = checkDuplicate(target, workspace);
      setEnable(target, resource.varName !== '' && isUnique);
      break;
    }
    case 'dataset': {
      const dataset = workspace.datasets[target.index];
      const targetEnable =
        dataset.targets == null
          ? dataset.scanOption.dirConds.find((item) => item.pattern === '') ==
              undefined &&
            dataset.scanOption.fileConds.find((item) => item.pattern === '') ==
              undefined
          : dataset.targets.length > 0;
      const isUnique = checkDuplicate(target, workspace);
      setEnable(
        target,
        dataset.varName !== '' &&
          dataset.rootPath !== '' &&
          targetEnable &&
          isUnique,
      );
      break;
    }
    case 'process': {
      const process = workspace.processes[target.index];
      const isEnableScriptArgDefs = !process.scriptArgs.find((arg, index) => {
        const isDuplicate = process.scriptArgs.find(
          (item, itemIndex) => itemIndex !== index && item.name === arg.name,
        );
        return arg.name === '' || isDuplicate;
      });
      const isEnableCommandArgValues = !process.cmdArgs.find(
        (arg) => arg === '',
      );
      const isUnique = checkDuplicate(target, workspace);
      setEnable(
        target,
        process.funcName !== '' &&
          process.prgPath !== '' &&
          isEnableScriptArgDefs &&
          isEnableCommandArgValues &&
          isUnique,
      );
      break;
    }
    case 'work': {
      const work = workspace.works[target.index];
      const isUnique = checkDuplicate(target, workspace);
      setEnable(target, work.name !== '' && isUnique);
      break;
    }
  }
};

export const hasDisable = (target: StoreWorkspace.Target) => {
  return (
    get(workspaceValidationStore).disables.find(
      (item) => item.cat === target.cat && item.index === target.index,
    ) != undefined
  );
};

export const validateAll = () => {
  const { workspace } = get(workspaceStore);
  if (workspace == null) throw new Error();
  workspace.envs.forEach((_, index) => validate({ cat: 'env', index }));
  workspace.resources.forEach((_, index) =>
    validate({ cat: 'resource', index }),
  );
  workspace.datasets.forEach((_, index) => validate({ cat: 'dataset', index }));
  workspace.processes.forEach((_, index) =>
    validate({ cat: 'process', index }),
  );
  workspace.works.forEach((_, index) => validate({ cat: 'work', index }));
};
