export type RestrictedGlobal = {
  name: string;
  message: string;
};

export const restrictedGlobals: RestrictedGlobal[] = [
  {
    name: 'fetch',
    message:
      'TraceKernel script runtime does not provide fetch. Use the provided network utilities instead.',
  },
  {
    name: 'console',
    message:
      'TraceKernel script runtime does not support console. Use $println or other TraceKernel output utilities instead.',
  },
  {
    name: 'window',
    message:
      'TraceKernel script runtime does not provide window because scripts run in a restricted worker environment.',
  },
  {
    name: 'document',
    message:
      'TraceKernel script runtime does not provide document because scripts run outside the browser DOM.',
  },
  {
    name: 'alert',
    message:
      'TraceKernel script runtime does not provide alert. Use TraceKernel output utilities instead.',
  },
  {
    name: 'localStorage',
    message:
      'TraceKernel script runtime does not provide localStorage because scripts run in a restricted worker environment.',
  },
  {
    name: 'sessionStorage',
    message:
      'TraceKernel script runtime does not provide sessionStorage because scripts run in a restricted worker environment.',
  },
  {
    name: 'navigator',
    message:
      'TraceKernel script runtime does not provide navigator because scripts run in a restricted worker environment.',
  },
  {
    name: 'location',
    message:
      'TraceKernel script runtime does not provide location because scripts run in a restricted worker environment.',
  },
];
