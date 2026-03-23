import { get } from "svelte/store";
import store from "./store";

namespace StoreInvalidate {

    type Key = 'dataset';

    export type Props = {
        key: Key,
        callback: () => void
    }

    export const set = (unit: Props) => {
        const units = get(store).invUnits;
        const index = units.findIndex(u => u.key === unit.key);
        if (index !== -1) units[index] = unit;
        else units.push(unit);
    }
    export const invalidate = (key: Key) => {
        const units = get(store).invUnits;
        const unit = units.find(u => u.key === key);
        if (unit == undefined) throw new Error();
        unit.callback();
    }
    export const remove = (key: Key) => {
        const units = get(store).invUnits;
        const remIndex = units.findIndex(u => u.key === key);
        if (remIndex === -1) throw new Error();
        units.splice(remIndex, 1);
    }
};
export default StoreInvalidate;