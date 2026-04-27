import type StoreWork from '../../../../store/store-work';
import type StoreWorkspace from '../../../../store/store-workspace';
import ContextDataUtil from '../../../detail/program/util/context-data-util';
import DeclareUtil from '../../../detail/program/util/declare-util';

namespace ProgramInjectionUtil {
  export type ContextItem = {
    prefix: '$env' | '$resource' | '$dataset' | '$process' | '$logic';
    item: string;
  };

  const getBaseContextItems = (
    workspace: StoreWorkspace.Props,
    disables: StoreWorkspace.Target[],
  ): ContextItem[] => {
    const contexts = ContextDataUtil.getUsableData(workspace, disables);
    return [
      ...contexts.envs.map((env) => ({
        prefix: '$env' as const,
        item: env.varName,
      })),
      ...contexts.resources.map((resource) => ({
        prefix: '$resource' as const,
        item: resource.varName,
      })),
      ...contexts.datasets.map((dataset) => ({
        prefix: '$dataset' as const,
        item: dataset.varName,
      })),
      ...contexts.processes.map((process) => ({
        prefix: '$process' as const,
        item: process.funcName,
      })),
    ];
  };

  export const getWorkContextItems = (
    workspace: StoreWorkspace.Props,
    disables: StoreWorkspace.Target[],
  ): ContextItem[] => {
    const isDisable = (cat: StoreWorkspace.Category, index: number) =>
      disables.find((item) => item.cat === cat && item.index === index) !=
      undefined;

    const logicItems = workspace.logics
      .filter((logic, index) => !isDisable('logic', index) && logic.name !== '')
      .map((logic) => ({
        prefix: '$logic' as const,
        item: logic.name,
      }));

    return [...getBaseContextItems(workspace, disables), ...logicItems];
  };

  export const getLogicContextItems = (
    workspace: StoreWorkspace.Props,
    disables: StoreWorkspace.Target[],
    options?: {
      excludeName?: string;
    },
  ): ContextItem[] => {
    const isDisable = (cat: StoreWorkspace.Category, index: number) =>
      disables.find((item) => item.cat === cat && item.index === index) !=
      undefined;

    const logicItems = workspace.logics
      .filter((logic, index) => {
        if (isDisable('logic', index)) return false;
        if (options?.excludeName && logic.name === options.excludeName) {
          return false;
        }
        return logic.name !== '';
      })
      .map((logic) => ({
        prefix: '$logic' as const,
        item: logic.name,
      }));

    return [...getBaseContextItems(workspace, disables), ...logicItems];
  };

  export const getWorkApiItems = (method: StoreWork.OutputMethod): string[] => {
    return DeclareUtil.getUsableReserveList({
      method,
    }).map((res) => `$${res}`);
  };

  export const getLogicApiItems = (): string[] => {
    return [];
  };
}

export default ProgramInjectionUtil;
