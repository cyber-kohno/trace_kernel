import { get } from "svelte/store";
import store from "./store";
import type StoreDataset from "./storeDataset";

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
        const map = get(store).cacheMap;
        const props = map.find(m => m.index === newProps.index && m.type === newProps.type)
        if (props == null) {
            map.push(newProps);
        } else {
            props.value = newProps.value;
        }
    }

    export const addDatasetChoose = (index: number, root: StoreDataset.UsableNode) => {
        add({ type: 'dataset-choose', index, value: root });
    }

    export const remove = (key: Key) => {
        const map = get(store).cacheMap;
        const remIndex = map.findIndex(m => m.index === key.index && m.type === key.type);
        if (remIndex === -1) throw new Error();
        map.splice(remIndex, 1);
    }

    export const getValue = (key: Key) => {
        const map = get(store).cacheMap;
        const props = map.find(m => m.index === key.index && m.type === key.type);
        return props == null ? null : props.value;
    }
    export const getDatasetChoose = (index: number): StoreDataset.UsableNode | null => {
        const value = getValue({ type: 'dataset-choose', index });
        return value;
    }
};

export default StoreCache;