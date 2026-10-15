declare module 'virtual:trace-kernel-ts-libs' {
  const url: string;
  export default url;
}

declare module 'virtual:trace-kernel-product-info' {
  const identity: {
    releaseVersion: string;
    bridgeProtocolGen: number;
    apiGen: string;
    workspaceGen: string;
  };
  export default identity;
}
