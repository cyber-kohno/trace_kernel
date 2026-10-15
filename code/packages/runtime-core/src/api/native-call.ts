/** A host supplies transport and execution ownership. Shared APIs never select a host. */
export type NativeCall = {
  call<T>(
    command: string,
    args: unknown,
    timeoutMs?: number | null,
  ): Promise<T>;
};
