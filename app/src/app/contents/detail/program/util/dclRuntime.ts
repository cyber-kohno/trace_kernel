namespace DclRuntime {

    export const getObject = () => {

        return {
            'exit': () => {
            },
            'sleep': (ms: number) => {
                return new Promise((resolve) => setTimeout(resolve, ms));
            }
        }
    }

    export const getDeclare = () => {
        const apis = [
            'exit: () => void',
            'sleep: (ms: number) => Promise<void>',
        ];
        return `{${apis.join(';')};}`;
    }
};
export default DclRuntime;