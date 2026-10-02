export type McpSessionState =
  | 'stopped'
  | 'starting'
  | 'available'
  | 'connected'
  | 'stopping'
  | 'error';

export type McpSessionInfo = {
  sessionId: string;
  endpoint: string;
};

export type McpSessionSnapshot = {
  clients: number;
  requestCount: number;
  lastRequestAt: number | null;
};
