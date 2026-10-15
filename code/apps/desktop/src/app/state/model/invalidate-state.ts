import { get } from 'svelte/store';
import { invalidateStore } from '../store';

namespace InvalidateState {
  type Key = 'dataset';

  export type Unit = {
    key: Key;
    callback: () => void;
  };

  export type StoreValue = {
    units: Unit[];
  };

  export const getInitial = (): StoreValue => ({
    units: [],
  });

  export const set = (unit: Unit) => {
    const units = get(invalidateStore).units;
    const index = units.findIndex((u) => u.key === unit.key);
    invalidateStore.update((state) => {
      if (index !== -1) {
        return {
          ...state,
          units: state.units.map((item, itemIndex) =>
            itemIndex === index ? unit : item,
          ),
        };
      }

      return {
        ...state,
        units: [...state.units, unit],
      };
    });
  };

  export const invalidate = (key: Key) => {
    const units = get(invalidateStore).units;
    const unit = units.find((u) => u.key === key);
    if (unit == undefined) throw new Error();
    unit.callback();
  };

  export const remove = (key: Key) => {
    const units = get(invalidateStore).units;
    const remIndex = units.findIndex((u) => u.key === key);
    if (remIndex === -1) throw new Error();
    invalidateStore.update((state) => ({
      ...state,
      units: state.units.filter((_, index) => index !== remIndex),
    }));
  };
}

export default InvalidateState;
