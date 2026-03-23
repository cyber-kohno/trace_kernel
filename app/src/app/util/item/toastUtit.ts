import { get } from "svelte/store";
import { global } from "../../global";

namespace ToastUtil {

    export type Props = {
        text: string;
        sustainMs?: number;
    }

    export const disp = (props: Props) => {
        const g = get(global);
        if (g.toastDisp == undefined) throw new Error();
        g.toastDisp(props);
    }
}
export default ToastUtil;