import PathUtil from '../../../../../util/data/path-util';
import type TransactionIO from './transaction-io';
import type TransactionModel from './transaction-model';
import TransactionVerify from './transaction-verify';

namespace TransactionService {
  export type State =
    | 'idle'
    | 'verifying'
    | 'verification-failed'
    | 'committing'
    | 'succeeded'
    | 'commit-failed';

  export interface Operation {
    readonly order: TransactionModel.Order;
    readonly status: Readonly<TransactionModel.Status>;
  }

  export interface Snapshot {
    readonly state: State;
    readonly operations: readonly Operation[];
    readonly completedCount: number;
    readonly result?: TransactionModel.RunResult;
  }

  export interface Session {
    getSnapshot(): Snapshot;
    run(
      observe?: (snapshot: Snapshot) => void,
    ): Promise<TransactionModel.RunResult>;
  }

  const priority: Record<TransactionModel.Order['type'], number> = {
    create_dir: 0,
    copy_file: 1,
    delete_file: 2,
    create_file: 3,
    modify_file: 4,
    rename_file: 5,
    delete_dir: 6,
  };

  const copyOrder = (order: TransactionModel.Order): TransactionModel.Order =>
    Object.freeze(
      order.type === 'modify_file'
        ? { ...order, snapshot: Object.freeze({ ...order.snapshot }) }
        : { ...order },
    );

  export const create = (
    orders: readonly TransactionModel.Order[],
    io: TransactionIO.Port,
  ): Session => {
    const plan = orders.map(copyOrder);
    const execution = plan
      .map((order, index) => ({ order, index }))
      .sort((a, b) => priority[a.order.type] - priority[b.order.type]);
    const verify = TransactionVerify.create(io);
    let statuses: TransactionModel.Status[] = plan.map(() => ({}));
    let state: State = 'idle';
    let completedCount = 0;
    let result: TransactionModel.RunResult | undefined;

    const getSnapshot = (): Snapshot =>
      Object.freeze({
        state,
        completedCount,
        result,
        operations: Object.freeze(
          plan.map((order, index) =>
            Object.freeze({
              order,
              status: Object.freeze({
                ...(statuses[index].verify && {
                  verify: Object.freeze({ ...statuses[index].verify }),
                }),
                ...(statuses[index].commit && {
                  commit: Object.freeze({ ...statuses[index].commit }),
                }),
              }),
            }),
          ),
        ),
      });

    const check = async (
      order: TransactionModel.Order,
      reserveDirs: string[],
    ): Promise<TransactionModel.VerifyResult> => {
      switch (order.type) {
        case 'create_dir':
          return verify.checkCreateDir(order.path);
        case 'delete_dir': {
          const directory = PathUtil.normalize(order.path).toLowerCase();
          const conflict = plan.some((other) => {
            if (other === order) return false;
            const paths =
              'path' in other ? [other.path] : [other.from, other.to];
            return paths.some((path) => {
              const normalized = PathUtil.normalize(path).toLowerCase();
              return (
                PathUtil.samePath(directory, normalized) ||
                PathUtil.isAncestor(directory, normalized)
              );
            });
          });
          return conflict
            ? {
                kind: 'error',
                message: `Directory has conflicting transaction operations: ${order.path}`,
              }
            : verify.checkDeleteDir(order.path);
        }
        case 'copy_file':
          return verify.checkCopyFile(order.from, order.to, reserveDirs);
        case 'create_file':
          return verify.checkSaveFile(order.path, reserveDirs);
        case 'modify_file':
          return verify.checkModifyFile(order);
        case 'delete_file':
          return verify.checkExistsFile(order.path, true);
        case 'rename_file':
          return verify.checkRenameFile(order.from, order.to);
      }
    };

    const apply = async (
      order: TransactionModel.Order,
    ): Promise<TransactionModel.CommitResult> => {
      try {
        switch (order.type) {
          case 'create_dir':
            await io.makeDir(order.path);
            break;
          case 'delete_dir':
            await io.deleteDir(order.path);
            break;
          case 'copy_file':
            await io.copyFile(order.from, order.to);
            break;
          case 'create_file':
            await io.saveText(order.path, order.content, order.encoding);
            break;
          case 'modify_file': {
            const checked = await verify.checkModifyFile(order);
            if (checked.kind !== 'checked') {
              return { kind: 'error', detail: checked.message };
            }
            await io.saveText(order.path, order.current, order.encoding);
            break;
          }
          case 'delete_file':
            await io.deleteFile(order.path);
            break;
          case 'rename_file':
            await io.renameFile(order.from, order.to);
            break;
        }
        return { kind: 'success' };
      } catch (error: unknown) {
        return { kind: 'error', detail: String(error) };
      }
    };

    const run: Session['run'] = async (observe) => {
      if (state !== 'idle' && state !== 'verification-failed') {
        throw new Error(
          'This transaction is running or has entered commit and cannot be retried.',
        );
      }
      // Lock the session before I/O or observers can re-enter it.
      state = 'verifying';
      statuses = plan.map(() => ({}));
      completedCount = 0;
      result = undefined;
      const notify = () => {
        try {
          observe?.(getSnapshot());
        } catch {
          // Display failures must not interrupt or misreport native mutations.
        }
      };
      const finish = (value: TransactionModel.RunResult, terminal: State) => {
        const report = Object.freeze(value);
        result = report;
        state = terminal;
        notify();
        return report;
      };
      notify();
      const reserveDirs: string[] = [];
      for (const { order, index } of execution) {
        let checked: TransactionModel.VerifyResult;
        try {
          checked = await check(order, reserveDirs);
        } catch (error: unknown) {
          checked = { kind: 'error', message: String(error) };
        }
        statuses[index].verify = checked;
        if (order.type === 'create_dir' && checked.kind === 'checked') {
          reserveDirs.push(order.path);
        }
        notify();
      }
      const errorCount = statuses.filter(
        (s) => s.verify?.kind === 'error',
      ).length;
      const warningCount = statuses.filter(
        (s) => s.verify?.kind === 'warn',
      ).length;
      if (errorCount || warningCount) {
        return finish(
          { kind: 'verification-failed', errorCount, warningCount },
          'verification-failed',
        );
      }
      state = 'committing';
      notify();
      let committedCount = 0;
      for (const [position, { order, index }] of execution.entries()) {
        const committed = await apply(order);
        statuses[index].commit = committed;
        completedCount++;
        if (committed.kind !== 'success') {
          const remaining = execution.slice(position + 1);
          for (const next of remaining) {
            statuses[next.index].commit = {
              kind: 'skipped',
              detail: 'Not applied because an earlier operation failed.',
            };
          }
          return finish(
            {
              kind: 'commit-failed',
              committedCount,
              skippedCount: remaining.length,
              failedOrder: order,
            },
            'commit-failed',
          );
        }
        committedCount++;
        notify();
      }
      return finish({ kind: 'success', committedCount }, 'succeeded');
    };

    return { getSnapshot, run };
  };
}
export default TransactionService;
