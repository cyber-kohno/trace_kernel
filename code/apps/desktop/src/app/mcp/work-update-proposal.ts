import { get, writable } from 'svelte/store';

export type WorkUpdateProposal = {
  proposalId: string;
  editorId: string;
  name: string;
  baselineSource: string;
  proposedSource: string;
};

export type WorkUpdateDecision = 'apply' | 'reject';
export type WorkUpdateResolution = WorkUpdateDecision | 'cancel' | 'timeout';

export const workUpdateProposalStore = writable<WorkUpdateProposal | null>(
  null,
);

const resolvers = new Map<string, (decision: WorkUpdateResolution) => void>();
const requestProposalIds = new Map<string, string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const WORK_PROPOSAL_TIMEOUT_MS = 10 * 60 * 1000 - 1000;

export const openWorkUpdateProposal = (
  proposal: WorkUpdateProposal,
  bridgeRequestId: string,
) => {
  if (resolvers.size > 0) {
    throw new Error('A Work update proposal is already awaiting a decision.');
  }

  const decision = new Promise<WorkUpdateResolution>((resolve) => {
    resolvers.set(proposal.proposalId, resolve);
    requestProposalIds.set(bridgeRequestId, proposal.proposalId);
    timers.set(
      proposal.proposalId,
      setTimeout(
        () => resolveWorkUpdateProposal(proposal.proposalId, 'timeout'),
        WORK_PROPOSAL_TIMEOUT_MS,
      ),
    );
  });
  workUpdateProposalStore.set(proposal);
  return decision;
};

export const resolveWorkUpdateProposal = (
  proposalId: string,
  value: WorkUpdateResolution,
) => {
  const resolve = resolvers.get(proposalId);
  if (!resolve) return false;

  resolvers.delete(proposalId);
  const timer = timers.get(proposalId);
  if (timer != null) clearTimeout(timer);
  timers.delete(proposalId);
  for (const [requestId, id] of requestProposalIds) {
    if (id === proposalId) requestProposalIds.delete(requestId);
  }
  resolve(value);
  return true;
};

export const cancelWorkUpdateProposalByRequestId = (requestId: string) => {
  const proposalId = requestProposalIds.get(requestId);
  if (!proposalId) return false;
  return resolveWorkUpdateProposal(proposalId, 'cancel');
};

export const clearWorkUpdateProposal = (proposalId: string) => {
  const timer = timers.get(proposalId);
  if (timer != null) clearTimeout(timer);
  timers.delete(proposalId);
  if (get(workUpdateProposalStore)?.proposalId === proposalId) {
    workUpdateProposalStore.set(null);
  }
  for (const [requestId, id] of requestProposalIds) {
    if (id === proposalId) requestProposalIds.delete(requestId);
  }
};
