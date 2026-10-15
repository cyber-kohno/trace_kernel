export type McpSessionState =
  | 'stopped'
  | 'starting'
  | 'available'
  | 'verified'
  | 'stopping'
  | 'error';

export type McpSessionInfo = {
  sessionId: string;
  endpoint: string;
};

export type McpCompatibilityRejection = {
  code: string;
  expectedGeneration: number;
  actualGeneration: number | null;
  firstSeenAt: number;
  lastSeenAt: number;
  count: number;
};

export type McpDiagnostics = {
  session: McpSessionInfo | null;
  published: boolean;
  acceptedRequests: number;
  rejectedRequests: number;
  lastAcceptedAt: number | null;
  lastPeerGeneration: number | null;
  rejections: McpCompatibilityRejection[];
};
