namespace DclRuntime {
  export class ExitSignal extends Error {
    constructor() {
      super('Runtime exited.');
      this.name = 'DclRuntimeExitSignal';
    }
  }

  export const isExitSignal = (value: unknown): value is ExitSignal => {
    return (
      value instanceof ExitSignal ||
      (value instanceof Error && value.name === 'DclRuntimeExitSignal')
    );
  };

  export const getObject = () => {
    return {
      exit: () => {
        throw new ExitSignal();
      },
      sleep: (ms: number) => {
        return new Promise((resolve) => setTimeout(resolve, ms));
      },
    };
  };

  export const getDeclare = () => {
    const apis = ['exit: () => void', 'sleep: (ms: number) => Promise<void>'];
    return `{${apis.join(';')};}`;
  };
}
export default DclRuntime;
