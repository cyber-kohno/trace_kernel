import loader from "@monaco-editor/loader";

namespace MonacoFactory {
    let worker: any = null;
    const getWorker = async (monaco: any) => {
        if (worker == null) {
            worker = await monaco.languages.typescript.getTypeScriptWorker();
        }
        return worker;
    }

    let service: any = null;
    export const getService = async (monaco: any, uri: string) => {
        // console.log(service);
        const worker = await getWorker(monaco);
        // console.log(worker);
        // if (service == null) {
            service = await worker(uri);
        // }
        return service;
    }

    // let tsWorkerPromise: Promise<any> | null = null;

    // export async function getTsService(monaco: any, uri: string) {
    //     if (!tsWorkerPromise) {
    //         tsWorkerPromise = monaco.languages.typescript
    //             .getTypeScriptWorker()
    //             .then((worker: any) => worker(uri));
    //     }
    //     return tsWorkerPromise;
    // }
    let monaco: any = null;
    export const createMonaco = async () => {
        if (monaco == null) {
            loader.config({
                paths: {
                    vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs",
                },
            });
            monaco = await loader.init();
        }
        return monaco;
    }


    let userModel: any = null;

    export const getUserModel = (userUri: string, code: string) => {
        // if (userModel == null) {
            userModel = monaco.editor.createModel(code, 'typescript', userUri);
        // }
        return userModel;
    }

    let analysisModel: any = null;

    export const getAnalysisModel = (makeWrapped: (code: string) => string, analysisUri: string, value: string) => {
        // if (analysisModel == null) {
            analysisModel = monaco.editor.createModel(
                makeWrapped(value),
                'typescript',
                analysisUri,
            );
        // }
        return analysisModel;
    }

}
export default MonacoFactory;