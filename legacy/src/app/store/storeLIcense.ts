import { get } from "svelte/store";
import store from "./store";

namespace StoreLicense {
    export type Props = {
        displayId: string;
        date: string;
    }
    export const isPro = () => {
        const permission = get(store).license;
        return permission != null;
    }
};
export default StoreLicense;