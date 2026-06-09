import { get } from 'svelte/store';
import ValidationState from '../state/model/validation-state';
import WorkspaceState from '../state/model/workspace/workspace-state';
import { validationStore, workspaceStore } from '../state/store';
import ValidateUtil from '../util/data/validate-util';

namespace ValidationService {
  const setEnable = (target: ValidationState.Target, enable: boolean) => {
    validationStore.update((state) => {
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
    target: ValidationState.Target,
    workspace: WorkspaceState.Props,
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
        case 'logic':
          return [workspace.logics, 'name'];
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

  export const validate = (target: ValidationState.Target) => {
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
        const isParseValid =
          resource.parse == undefined || resource.parseValidated === true;
        setEnable(target, resource.varName !== '' && isUnique && isParseValid);
        break;
      }
      case 'dataset': {
        const dataset = workspace.datasets[target.index];
        const targetEnable =
          dataset.targets == null
            ? dataset.scanOption.dirConds.find((item) => item.pattern === '') ==
                undefined &&
              dataset.scanOption.fileConds.find(
                (item) => item.pattern === '',
              ) == undefined
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
        const isEnableScriptArgDefs = !process.scriptArgs.find(
          (arg, index) => {
            const isDuplicate = process.scriptArgs.find(
              (item, itemIndex) =>
                itemIndex !== index && item.name === arg.name,
            );
            return arg.name === '' || isDuplicate;
          },
        );
        const isEnableCommandArgValues = !process.cmdArgs.some(
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
      case 'logic': {
        const logic = workspace.logics[target.index];
        const isUnique = checkDuplicate(target, workspace);
        setEnable(target, logic.name !== '' && isUnique);
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

  export const hasDisable = (target: ValidationState.Target) => {
    return (
      get(validationStore).disables.find(
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
    workspace.datasets.forEach((_, index) =>
      validate({ cat: 'dataset', index }),
    );
    workspace.processes.forEach((_, index) =>
      validate({ cat: 'process', index }),
    );
    workspace.logics.forEach((_, index) => validate({ cat: 'logic', index }));
    workspace.works.forEach((_, index) => validate({ cat: 'work', index }));
  };
}

export default ValidationService;
