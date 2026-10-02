namespace EnvState {
  export type Purpose = 'dir' | 'file';
  export type Props = {
    varName: string;
    value: string;
    purpose?: Purpose;
  };

  export const getInitial = (): Props => ({ varName: '', value: '' });
}
export default EnvState;
