namespace LogicState {
  const INITIAL_SOURCE = `export default function () {
}`;

  export type Props = {
    name: string;
    source: string;
  };

  export const getInitial = (): Props => {
    return {
      name: '',
      source: INITIAL_SOURCE,
    };
  };
}
export default LogicState;
