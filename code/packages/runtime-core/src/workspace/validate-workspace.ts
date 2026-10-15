import type {
  Workspace,
  ValidationTarget,
  ValidationCategory,
} from "../model/workspace";
import ValidateUtil from "../data/validate-util";
import { validateWorkName } from "../data/work-name-validation";

const categories: ValidationCategory[] = [
  "env",
  "resource",
  "dataset",
  "process",
  "logic",
  "work",
];

const isUnique = <T>(
  items: readonly T[],
  index: number,
  name: (item: T) => string,
): boolean =>
  !items.some(
    (item, itemIndex) =>
      itemIndex !== index && name(item) === name(items[index]),
  );

export const validateWorkspaceCategory = (
  workspace: Workspace,
  cat: ValidationCategory,
): ValidationTarget[] => {
  const disables: ValidationTarget[] = [];
  const addIfInvalid = (index: number, valid: boolean) => {
    if (!valid) disables.push({ cat, index });
  };

  switch (cat) {
    case "env":
      workspace.envs.forEach((env, index) =>
        addIfInvalid(
          index,
          env.varName !== "" &&
            ValidateUtil.UpperCase.test(env.varName) &&
            env.value !== "" &&
            isUnique(workspace.envs, index, (item) => item.varName),
        ),
      );
      break;
    case "resource":
      workspace.resources.forEach((resource, index) =>
        addIfInvalid(
          index,
          resource.varName !== "" &&
            (resource.parse == undefined || resource.parseValidated === true) &&
            isUnique(workspace.resources, index, (item) => item.varName),
        ),
      );
      break;
    case "dataset":
      workspace.datasets.forEach((dataset, index) => {
        const targetEnable =
          dataset.targets == null
            ? dataset.scanOption.dirConds.every(
                (item) => item.pattern !== "",
              ) &&
              dataset.scanOption.fileConds.every((item) => item.pattern !== "")
            : dataset.targets.length > 0;
        addIfInvalid(
          index,
          dataset.varName !== "" &&
            dataset.rootPath !== "" &&
            targetEnable &&
            isUnique(workspace.datasets, index, (item) => item.varName),
        );
      });
      break;
    case "process":
      workspace.processes.forEach((process, index) => {
        const scriptArgsValid = !process.scriptArgs.some(
          (arg, argIndex) =>
            arg.name === "" ||
            process.scriptArgs.some(
              (other, otherIndex) =>
                otherIndex !== argIndex && other.name === arg.name,
            ),
        );
        addIfInvalid(
          index,
          process.funcName !== "" &&
            process.prgPath !== "" &&
            scriptArgsValid &&
            process.cmdArgs.every((arg) => arg !== "") &&
            isUnique(workspace.processes, index, (item) => item.funcName),
        );
      });
      break;
    case "logic":
      workspace.logics.forEach((logic, index) =>
        addIfInvalid(
          index,
          logic.name !== "" &&
            isUnique(workspace.logics, index, (item) => item.name),
        ),
      );
      break;
    case "work": {
      const names = workspace.works.map((work) => work.name);
      names.forEach((name, index) =>
        addIfInvalid(index, validateWorkName(name, names, index).length === 0),
      );
      break;
    }
  }
  return disables;
};

const validateWorkspace = (workspace: Workspace): ValidationTarget[] =>
  categories.flatMap((cat) => validateWorkspaceCategory(workspace, cat));

export default validateWorkspace;
