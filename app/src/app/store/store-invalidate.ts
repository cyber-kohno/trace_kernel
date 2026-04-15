import { get } from "svelte/store";
import invalidateStore from "./invalidate-store";

namespace StoreInvalidate {

    type Key = 'dataset';

    export type Props = {
        key: Key,
        callback: () => void
    }

    export const set = (unit: Props) => {
        const units = get(invalidateStore).invUnits;
        const index = units.findIndex(u => u.key === unit.key);
        invalidateStore.update((state) => {
            if (index !== -1) {
                return {
                    ...state,
                    invUnits: state.invUnits.map((item, itemIndex) =>
                        itemIndex === index ? unit : item,
                    ),
                };
            }

            return {
                ...state,
                invUnits: [...state.invUnits, unit],
            };
        });
    }
    export const invalidate = (key: Key) => {
        const units = get(invalidateStore).invUnits;
        const unit = units.find(u => u.key === key);
        if (unit == undefined) throw new Error();
        unit.callback();
    }
    export const remove = (key: Key) => {
        const units = get(invalidateStore).invUnits;
        const remIndex = units.findIndex(u => u.key === key);
        if (remIndex === -1) throw new Error();
        invalidateStore.update((state) => ({
            ...state,
            invUnits: state.invUnits.filter((_, index) => index !== remIndex),
        }));
    }
};
export default StoreInvalidate;
