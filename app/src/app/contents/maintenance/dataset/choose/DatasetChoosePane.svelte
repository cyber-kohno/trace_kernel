<script lang="ts">
  import DatasetChooseRow from './DatasetChooseRow.svelte';
  import { writable } from 'svelte/store';
  import DatasetChooseUtil from './dataset-choose-util';
  import OperationButton from '../../../../util/button/OperationButton.svelte';
  import { uiStore, workspaceStore } from '../../../../state/store';
  import DatasetState from '../../../../state/model/workspace/dataset-state';
  import CacheState from '../../../../state/model/cache-state';
  import Record from '../../../../util/layout/RecordDiv.svelte';
  import WorkspaceState from '../../../../state/model/workspace/workspace-state';
  import ToastService from '../../../../service/toast-service';

  let ref: HTMLDivElement | undefined = undefined;

  export let dataset: DatasetState.Props;
  export let setPhase: (phase: DatasetState.DatasetPhase) => void;
  export let validate: () => void;

  let root = writable<DatasetState.UsableNode>(
    (() => {
      const ret = CacheState.getDatasetChoose($uiStore.target?.index ?? -1);
      if (ret == null) throw new Error();
      return ret;
    })(),
  );

  $: invalidate = () => (root = { ...root });

  let scrollTop = 0;

  const isFlat = writable<boolean>(false);

  $: baseRecords = (() => {
    const list = DatasetChooseUtil.getDispRecords($root, $isFlat);
    return list;
  })();

  $: dispRecords = (() => {
    if (!ref) return [];

    const ITEM_HEIGHT = 25;

    const rect = ref.getBoundingClientRect();
    const start = Math.floor(scrollTop / ITEM_HEIGHT);
    const count = Math.ceil(rect.height / ITEM_HEIGHT) + 1;
    const end = Math.min(start + count, baseRecords.length);

    return baseRecords.slice(start, end);
  })();

  $: cancel = () => {
    setPhase('scan');
    CacheState.remove({
      type: 'dataset-choose',
      index: $uiStore.target?.index ?? -1,
    });
    $workspaceStore = { ...$workspaceStore };
    validate();
  };
  $: toggleView = () => {
    $isFlat = !$isFlat;
  };

  /**
   * 繝ｫ繝ｼ繝医°繧峨・蟾ｮ蛻・ヱ繧ｹ縺ｫ螟画鋤縺励※縲・∈謚槭Μ繧ｹ繝医↓霆｢騾・   */
  $: transfer = () => {
    const selectedNodes = DatasetChooseUtil.getDispRecords($root, true)
      // 驕ｸ謚樔ｸｭ縺ｮ隕∫ｴ縺ｧ繝輔ぅ繝ｫ繧ｿ繝ｼ
      .filter((r) => r.node.isSelected);

    const workspace = WorkspaceState.getWorkspace($workspaceStore);
    const rootPath = workspace.envs.reduce(
      (ret, cur) => ret.replaceAll(`%${cur.varName}%`, cur.value),
      dataset.rootPath,
    );
    // 繧ｹ繧ｭ繝｣繝ｳ蠕後↓繝ｫ繝ｼ繝医ヱ繧ｹ縺悟､画峩縺輔ｌ縺ｦ縺・↑縺・°繝√ぉ繝・け
    const isPathCheck = selectedNodes.some((r) => {
      if (r.node.path.indexOf(rootPath) === -1) return false;
      return true;
    });
    if (!isPathCheck) {
      ToastService.show({
        text: 'The root path has changed since the scan. Please try scanning again.',
      });
      return;
    }
    dataset.targets = selectedNodes
      // 邨ｶ蟇ｾ繝代せ縺九ｉ繝ｫ繝ｼ繝医ヱ繧ｹ繧帝勁縺・※蟾ｮ蛻・ヱ繧ｹ縺ｫ螟画鋤
      .map((r) => r.node.path.replace(rootPath, ''));
    setPhase('list');
    validate();
    $workspaceStore = { ...$workspaceStore };
  };

  $: getDir = (item: DatasetState.NodeDispProps) => {
    let ret: string | null = null;
    if ($isFlat) {
      ret = item.node.path
        .replace(dataset.rootPath, '')
        .replace(item.node.name, '');
    }
    return ret;
  };
</script>

<Record align="right">
  <OperationButton
    name={!$isFlat ? 'Flat' : 'Tree'}
    width={120}
    isDisable={false}
    callback={toggleView}
    isLineup
  />
</Record>
<Record surplus={60}>
  <div
    class="list"
    bind:this={ref}
    onscroll={(e) => {
      scrollTop = e.currentTarget.scrollTop;
    }}
  >
    <div class="inner" style:height="{baseRecords.length * 25}px">
      {#each dispRecords as item}
        <DatasetChooseRow {item} dir={getDir(item)} {invalidate} />
      {/each}
    </div>
  </div>
</Record>
<Record align="right">
  <OperationButton
    name={'Cancel'}
    width={140}
    isDisable={false}
    callback={cancel}
    isLineup
  />
  <OperationButton
    name={'Transfer'}
    width={190}
    isDisable={false}
    callback={transfer}
    isLineup
  />
</Record>

<!-- {#if $store.preview != undefined}
  <FloatDialog />
{/if} -->

<style>
  .list {
    display: inline-block;
    position: relative;
    margin: 4px 0 0 4px;
    width: calc(100% - 8px);
    height: calc(100% - 8px);
    background-color: #ffffff92;
    overflow: auto;

    padding: 4px;
    box-sizing: border-box;
    border-radius: 2px;
  }
  .inner {
    display: inline-block;
    position: relative;
    width: 100%;
  }
</style>
