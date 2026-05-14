import LogicSourceUtil from './logic-source-util';

namespace LogicSignatureCache {
  const cache = new Map<string, LogicSourceUtil.SignatureInfo | null>();

  const createKey = (props: {
    source: string;
    injectionDefs?: string[];
    declareSource?: string;
  }) =>
    [
      props.source,
      props.declareSource ?? '',
      ...(props.injectionDefs ?? []),
    ].join('\u0001');

  export const get = (props: {
    source: string;
    injectionDefs?: string[];
    declareSource?: string;
  }): LogicSourceUtil.SignatureInfo | null => {
    const key = createKey(props);
    if (!cache.has(key)) {
      cache.set(
        key,
        LogicSourceUtil.getSignatureInfo(props.source, {
          injectionDefs: props.injectionDefs,
          declareSource: props.declareSource,
        }),
      );
    }
    return cache.get(key) ?? null;
  };

  export const formatFunctionType = (
    signature: LogicSourceUtil.SignatureInfo | null,
  ) => {
    if (signature == null) return '(...args: any[]) => any';
    return `(${signature.args.join(', ')}) => ${signature.returnType}`;
  };

  export const clear = () => {
    cache.clear();
  };
}

export default LogicSignatureCache;
