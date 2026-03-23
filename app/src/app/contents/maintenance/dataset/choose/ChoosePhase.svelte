<script lang="ts">
  import ChooseRecord from "./ChooseRecord.svelte";
  import { writable } from "svelte/store";
  import ChooseUtil from "./chooseUtil";
  import OperationButton from "../../../../util/button/OperationButton.svelte";
  import store from "../../../../store/store";
  import StoreDataset from "../../../../store/storeDataset";
  import StoreCache from "../../../../store/storeCache";
  import Record from "../../../../util/layout/RecordDiv.svelte";
  import StoreWorkspace from "../../../../store/storeWorkspace";
  import ToastUtil from "../../../../util/item/toastUtit";

  let ref: HTMLDivElement | undefined = undefined;

  export let dataset: StoreDataset.Props;
  export let setPhase: (phase: StoreDataset.ChoosePhase) => void;
  export let validate: () => void;

  let root = writable<StoreDataset.UsableNode>(
    (() => {
      const ret = StoreCache.getEachChoose($store.target?.index ?? -1);
      if (ret == null) throw new Error();
      return ret;
    })(),
  );

  $: invalidate = () => (root = { ...root });

  let scrollTop = 0;

  const isFlat = writable<boolean>(false);

  $: baseRecords = (() => {
    const list = ChooseUtil.getDispRecords($root, $isFlat);
    return list;
  })();

  $: dispRecords = (() => {
    if (!ref) return [];

    const ITEM_HEIGHT = 25;

    const rect = ref.getBoundingClientRect();
    const start = Math.floor(scrollTop / ITEM_HEIGHT);
    const count = Math.ceil(rect.height / ITEM_HEIGHT) + 1; // 余白1行
    const end = Math.min(start + count, baseRecords.length);

    return baseRecords.slice(start, end);
  })();

  $: cancel = () => {
    setPhase("scan");
    StoreCache.remove({ type: "dataset-choose", index: $store.target?.index ?? -1 });
    $store = { ...$store };
    validate();
  };
  $: toggleView = () => {
    $isFlat = !$isFlat;
  };

  /**
   * ルートからの差分パスに変換して、選択リストに転送
   */
  $: transfer = () => {
    const selectedNodes = ChooseUtil.getDispRecords($root, true)
      // 選択中の要素でフィルター
      .filter((r) => r.node.isSelected);

    const workspace = StoreWorkspace.getWorkspace($store);
    // 環境件数を加味した正式なルートパスを取得
    const rootPath = workspace.envs.reduce(
      (ret, cur) => ret.replaceAll(`%${cur.varName}%`, cur.value),
      dataset.rootPath,
    );
    // スキャン後にルートパスが変更されていないかチェック
    const isPathCheck = selectedNodes.some((r) => {
      if (r.node.path.indexOf(rootPath) === -1) return false;
      return true;
    });
    if (!isPathCheck) {
      ToastUtil.disp({
        text: "The root path has changed since the scan. Please try scanning again.",
      });
      return;
    }
    dataset.targets = selectedNodes
      // 絶対パスからルートパスを除いて差分パスに変換
      .map((r) => r.node.path.replace(rootPath, ""));
    setPhase("list");
    validate();
    $store = { ...$store };
  };

  $: getDir = (item: StoreDataset.NodeDispProps) => {
    let ret: string | null = null;
    if ($isFlat) {
      ret = item.node.path
        .replace(dataset.rootPath, "")
        .replace(item.node.name, "");
    }
    return ret;
  };
</script>

<Record align="right">
  <OperationButton
    name={!$isFlat ? "Flat" : "Tree"}
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
        <ChooseRecord {item} dir={getDir(item)} {invalidate} />
      {/each}
    </div>
  </div>
</Record>
<Record align="right">
  <OperationButton
    name={"Cancel"}
    width={140}
    isDisable={false}
    callback={cancel}
    isLineup
  />
  <OperationButton
    name={"Transfer"}
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
