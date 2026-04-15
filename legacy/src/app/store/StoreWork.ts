import type StoreResource from "./StoreResource";
import type { KeyValue } from "./types";

namespace StoreWork {

    export type Props = {
        name: string;
        method: OutputMethod;
        source: string;
    }

    export type OutputMethod = 'plain' | 'channel';

    export const getInitial = (name: string): Props => {
        return {
            name,
            method: 'plain',
            source: ''
        }
    }
}
export default StoreWork;