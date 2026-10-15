import type {
  McpCompatibilityRejection,
  McpDiagnostics,
  McpSessionState,
} from './mcp-session-types';

export const rejectionKey = (rejection: McpCompatibilityRejection) =>
  JSON.stringify([
    rejection.code,
    rejection.expectedGeneration,
    rejection.actualGeneration,
  ]);

/** Keep the selected group stable while polling reorders the recent history. */
export const rejectionIndex = (
  rejections: McpCompatibilityRejection[],
  selectedKey: string,
) =>
  Math.max(
    0,
    rejections.findIndex((item) => rejectionKey(item) === selectedKey),
  );

export const emptyDiagnostics = (): McpDiagnostics => ({
  session: null,
  published: false,
  acceptedRequests: 0,
  rejectedRequests: 0,
  lastAcceptedAt: null,
  lastPeerGeneration: null,
  rejections: [],
});

export const diagnosticState = (snapshot: McpDiagnostics): McpSessionState => {
  if (!snapshot.published) return snapshot.session ? 'error' : 'stopped';
  return snapshot.lastAcceptedAt == null ? 'available' : 'verified';
};

export const rejectionExplanation = (code: string) => {
  switch (code) {
    case 'MCP_CONTRACT_REQUIRED':
      return {
        reason:
          'The requester did not send its MCP generation (legacy format).',
        action:
          'Update the MCP adapter to a supported generation, then restart its process in your AI client.',
      };
    case 'MCP_BRIDGE_GENERATION_MISMATCH':
      return {
        reason: 'The Desktop and requester MCP generations differ.',
        action:
          'Install a Desktop/MCP combination with the same MCP generation, then restart the updated apps and the MCP process in your AI client.',
      };
    case 'MCP_CONTRACT_INVALID':
    case 'MCP_BRIDGE_GENERATION_INVALID':
      return {
        reason: 'The requester sent invalid MCP generation information.',
        action:
          'Use a supported MCP adapter and restart its process in your AI client. If this continues, check the adapter build.',
      };
    default:
      return {
        reason: 'A compatibility check rejected the request.',
        action:
          'Check the Desktop/MCP generations and restart updated MCP processes.',
      };
  }
};

/** Bounded polling, with stale replies suppressed across start/stop/unmount. */
export const createDiagnosticMonitor = (
  read: () => Promise<McpDiagnostics>,
  apply: (value: McpDiagnostics) => void,
  failed: () => void,
  schedule: (callback: () => void) => () => void,
) => {
  let revision = 0;
  let disposed = false;
  let paused = false;
  let cancel: (() => void) | undefined;
  const poll = async () => {
    if (disposed || paused) return;
    const current = revision;
    try {
      const snapshot = await read();
      if (!disposed && !paused && current === revision) apply(snapshot);
    } catch {
      if (!disposed && !paused && current === revision) failed();
    } finally {
      if (!disposed && !paused && current === revision)
        cancel = schedule(() => {
          if (!disposed && !paused && current === revision) void poll();
        });
    }
  };
  void poll();
  return {
    pause() {
      paused = true;
      revision++;
      cancel?.();
    },
    resume() {
      if (disposed || !paused) return;
      paused = false;
      revision++;
      cancel?.();
      void poll();
    },
    dispose() {
      disposed = true;
      revision++;
      cancel?.();
    },
  };
};
