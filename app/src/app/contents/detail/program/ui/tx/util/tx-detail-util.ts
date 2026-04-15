namespace TxDetailUtil {

    export type Props = DiffProps | SingleProps;

    export type SingleProps = {
        kind: 'single';
        content: string;
    }
    export type DiffProps = {
        kind: 'diff';
        original: string;
        current: string;
    }

    export const createSingleProps = (content: string): SingleProps => ({
        kind: 'single', content
    });
    export const createDiffProps = (original: string, current: string): DiffProps => ({
        kind: 'diff', original, current
    });
};
export default TxDetailUtil;