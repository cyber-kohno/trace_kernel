import DeclareUtil from "./declareUtil";
import WorkerInvoke from "./workerInvoke";

namespace DclNet {

    export const getObject = () => {

        return {
            getHtml: (url: string) => {
                return WorkerInvoke.call("load_html_from_url", { url });
            }
        }
    }

    export const getDeclare = () => {

        const apis = [
            'getHtml: (url: string) => Promise<{url: string; html: string; fetchedAt: number;}>'
        ];
        return `{${apis.join(';')};}`;
    }
};
export default DclNet;