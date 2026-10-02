namespace WorkState {
  export type Props = {
    name: string;
    method: OutputMethod;
    source: string;
    origin?: 'user' | 'ai';
  };

  export type OutputMethod = 'plain' | 'channel';

  export const getInitial = (name: string): Props => {
    return {
      name,
      method: 'plain',
      source: '',
      origin: 'user',
    };
  };
}
export default WorkState;
