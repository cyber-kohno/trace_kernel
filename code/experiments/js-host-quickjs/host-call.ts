declare const __invoke: (command: string, args: string) => Promise<string>;

namespace HostCall {
  export const call = async <T>(command: string, args: unknown): Promise<T> => {
    const response = JSON.parse(await __invoke(command, JSON.stringify(args)));
    if (!response.ok) throw new Error(response.error);
    return response.value;
  };
}
export default HostCall;
