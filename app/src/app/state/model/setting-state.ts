namespace SettingState {
  export type StoreValue = {
    monacoFontSize: number;
  };

  export const getInitial = (): StoreValue => {
    return {
      monacoFontSize: 18,
    };
  };
}

export default SettingState;
