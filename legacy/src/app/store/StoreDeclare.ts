namespace StoreDeclare {

    export type Props = {
        source: string;
    }

    export const getInitial = (): Props => {
        return { source: '' };
    }
};
export default StoreDeclare;