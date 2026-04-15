import { get } from "svelte/store";
import cacheStore from "./cache-store";
import type StoreDataset from "./store-dataset";

namespace StoreCache {
    export type Type = 'dataset-choose';

    export interface Key {
        type: Type;
        index: number;
    }
    export interface Props extends Key {
        value: any;
    }
    export const add = (newProps: Props) => {
        cacheStore.update((state) => {
            const props = state.cacheMap.find(
                (m) => m.index === newProps.index && m.type === newProps.type,
            );
            if (props == null) {
                return {
                    ...state,
                    cacheMap: [...state.cacheMap, newProps],
                };
            }

            return {
                ...state,
                cacheMap: state.cacheMap.map((item) =>
                    item.index === newProps.index && item.type === newProps.type
                        ? { ...item, value: newProps.value }
                        : item,
                ),
            };
        });
    }

    export const addDatasetChoose = (index: number, root: StoreDataset.UsableNode) => {
        add({ type: 'dataset-choose', index, value: root });
    }

    export const remove = (key: Key) => {
        const map = get(cacheStore).cacheMap;
        const remIndex = map.findIndex(m => m.index === key.index && m.type === key.type);
        if (remIndex === -1) throw new Error();
        cacheStore.update((state) => ({
            ...state,
            cacheMap: state.cacheMap.filter((_, index) => index !== remIndex),
        }));
    }

    export const getValue = (key: Key) => {
        const map = get(cacheStore).cacheMap;
        const props = map.find(m => m.index === key.index && m.type === key.type);
        return props == null ? null : props.value;
    }
    export const getDatasetChoose = (index: number): StoreDataset.UsableNode | null => {
        const value = getValue({ type: 'dataset-choose', index });
        return value;
    }
};

export default StoreCache;
