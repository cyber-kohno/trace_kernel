import type StoreDataset from "./storeDataset";
import type StoreResource from "./StoreResource";
import type StoreWork from "./StoreWork";
import store, { type Store } from "./store";
import { get } from "svelte/store";
import type StoreProcess from "./StoreProcess";
import FileUtil from "../util/data/fileUtil";
import type StoreEnv from "./storeEnv";
import ValidateUtil from "../util/data/validateUtil";
import type StoreDeclare from "./StoreDeclare";

namespace StoreWorkspace {

    export type Props = {
        version: string;
        envs: StoreEnv.Props[];
        resources: StoreResource.Props[];
        datasets: StoreDataset.Props[];
        processes: StoreProcess.Props[];
        declare: StoreDeclare.Props;
        works: StoreWork.Props[];
    };

    export const getInitial = (): Props => {

        return {
            version: FileUtil.VERSION,
            envs: [],
            resources: [],
            datasets: [],
            processes: [],
            declare: {source: ''},
            works: []
        }
    }

    export const getWorkspace = (store: Store) => {
        const project = store.workspace;
        if (project == null) throw new Error();
        return project;
    }

    export const getTarget = (store: Store) => {
        const target = store.target;
        if (target == null) throw new Error();
        return target;
    }

    export type Category = 'env' | 'resource' | 'dataset' | 'process' | 'work';
    export type Target = {
        cat: Category;
        index: number;
    }

    export const validate = (target: Target) => {
        const { disables, workspace } = get(store);
        if (workspace != null) {
            const { envs, resources, datasets, processes, works } = workspace;

            const setEnable = (target: Target, enable: boolean) => {
                const disableIndex = disables.findIndex(d => d.cat === target.cat && d.index === target.index);
                if (enable && disableIndex !== -1) disables.splice(disableIndex, 1);
                else if (!enable && disableIndex === -1) disables.push({ ...target });
            }

            const checkDuplicate = () => {
                const [list, nameKey]: [any[], string] = (() => {
                    switch (target.cat) {
                        case 'env': return [envs, 'varName'];
                        case 'resource': return [resources, 'varName'];
                        case 'dataset': return [datasets, 'varName'];
                        case 'process': return [processes, 'funcName'];
                        case 'work': return [works, 'name'];
                    }
                })();
                // 自身（target）が重複していないか
                let selfEnable = false;
                list.forEach((obj, index) => {
                    const isUnique = !list.find((o, i) => index !== i && o[nameKey] === obj[nameKey]);
                    if (index === target.index) selfEnable = isUnique;
                    else setEnable({ cat: target.cat, index }, isUnique);
                });
                return selfEnable;
            }

            switch (target.cat) {
                case 'env': {
                    const env = envs[target.index];
                    const isNameBlank = env.varName === '';
                    const isUpperCase = ValidateUtil.UpperCase.test(env.varName);
                    const isValueBlank = env.value === '';
                    // 名前重複チェック
                    const isUnique = checkDuplicate();
                    setEnable(target, !isNameBlank && isUpperCase && !isValueBlank && isUnique);
                } break;
                case 'resource': {
                    const resource = resources[target.index];
                    const isBlank = resource.varName === '';
                    // 名前重複チェック
                    const isUnique = checkDuplicate();
                    setEnable(target, !isBlank && isUnique);
                } break;
                case 'dataset': {
                    const dataset = datasets[target.index];
                    const isNameBlank = dataset.varName === '';
                    const isRootBlank = dataset.rootPath === '';
                    const targetEnable = dataset.targets == null ? (
                        dataset.scanOption.dirConds.find(c => c.pattern === '') == undefined &&
                        dataset.scanOption.fileConds.find(c => c.pattern === '') == undefined
                    ) : dataset.targets.length > 0;

                    // 名前重複チェック
                    const isUnique = checkDuplicate();
                    setEnable(target, !isNameBlank && !isRootBlank && targetEnable && isUnique);
                } break;
                case 'process': {
                    const process = processes[target.index];
                    const isNameBlank = process.funcName === '';
                    const isPrgPathBlank = process.prgPath === '';
                    const isEnableScriptArgDefs = !process.scriptArgs.find((arg, index) => {
                        const isDuplicate = process.scriptArgs.find((a, i) => i !== index && a.name === arg.name);
                        return arg.name === '' || isDuplicate;
                    });
                    const isEnableCommandArgValues = !process.cmdArgs.find(arg => {
                        return arg === '';
                    });
                    // 名前重複チェック
                    const isUnique = checkDuplicate();
                    setEnable(target, !isNameBlank && !isPrgPathBlank
                        && isEnableScriptArgDefs && isEnableCommandArgValues && isUnique);
                } break;
                case 'work': {
                    const work = works[target.index];
                    const isBlank = work.name === '';
                    // 名前重複チェック
                    const isUnique = checkDuplicate();
                    setEnable(target, !isBlank && isUnique);
                } break;
            }
        }
    }

    export const hasDisable = (target: Target) => {
        const { disables } = get(store);
        return disables.find(d => d.cat === target.cat && d.index === target.index) != undefined;
    }

    export const validateAll = () => {
        const { workspace: project } = get(store);
        if (project == null) throw new Error();
        project.envs.forEach((_, index) => validate({ cat: 'env', index }));
        project.resources.forEach((_, index) => validate({ cat: 'resource', index }));
        project.datasets.forEach((_, index) => validate({ cat: 'dataset', index }));
        project.processes.forEach((_, index) => validate({ cat: 'process', index }));
        project.works.forEach((_, index) => validate({ cat: 'work', index }));
    }
};
export default StoreWorkspace;