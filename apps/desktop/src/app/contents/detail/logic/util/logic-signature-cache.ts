import LogicSourceUtil from './logic-source-util';

namespace LogicSignatureCache {
  const cache = new Map<string, LogicSourceUtil.SignatureInfo | null>();

  type Props = LogicSourceUtil.AnalyzeOptions & { source: string };
  const createKey = (props: Props) =>
    JSON.stringify([
      props.source,
      props.declareSource ?? '',
      props.injectionDefs ?? [],
      props.logicSources ?? [],
      props.currentLogicName ?? '',
    ]);

  export const get = (props: Props): LogicSourceUtil.SignatureInfo | null => {
    const key = createKey(props);
    if (!cache.has(key)) {
      cache.set(key, LogicSourceUtil.getSignatureInfo(props.source, props));
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
