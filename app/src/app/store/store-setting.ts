namespace StoreSetting {

    export type Props = {
        monacoFontSize: number;
    }

    export const getInitial = (): Props => {

        return {
            monacoFontSize: 18
        };
    }
};
export default StoreSetting;