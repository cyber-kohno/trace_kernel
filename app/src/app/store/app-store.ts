import { writable } from "svelte/store";
import type StoreLicense from "./store-license";
import StoreSetting from "./store-setting";

const appStore = writable<AppState>({
  license: null,
  setting: StoreSetting.getInitial(),
});

export type AppState = {
  license: StoreLicense.Props | null;
  setting: StoreSetting.Props;
};

export default appStore;
