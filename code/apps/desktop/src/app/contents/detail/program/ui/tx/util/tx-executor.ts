import type TxPlanNormalize from './tx-plan-normalize';
import type TransactionModel from '../../../runtime/transaction/transaction-model';
import TransactionService from '../../../runtime/transaction/transaction-service';
import TransactionTauriIO from '../../../../../../infra/tauri/transaction-io';

namespace TxExecutor {
  export type Phase = 'confirm' | 'verify' | 'commit';
  export type CommitResult = TransactionModel.CommitResult;
  export type VerifyResult = TransactionModel.VerifyResult;
  export type RunResult = TransactionModel.RunResult;
  export type Status = TransactionModel.Status;
  export interface OrderRow {
    order: TxPlanNormalize.Order;
    status: Status;
  }
  export const createSession = (orders: readonly TxPlanNormalize.Order[]) =>
    TransactionService.create(orders, TransactionTauriIO);
}
export default TxExecutor;
