<script lang="ts">
  import type StoreDataset from "../../../store/storeDataset";
  import Wrap from "../../../util/layout/Wrap.svelte";

  export let dataset: StoreDataset.Props;

  const targets = (() => {
    if (dataset.targets == null) throw new Error();
    // return dataSet.targets.join("\n");
    return dataset.targets;
  })();
</script>

<Wrap>
  <div class="wrap">
    <!-- <Textarea value={targets} readonly /> -->
    {#each targets as target}
      <div class="item"><span>{target}</span></div>
    {/each}
  </div>
</Wrap>

<style>
  .wrap {
    display: inline-block;
    position: relative;
    width: 100%;
    height: 100%;
    overflow: auto;
    background-color: rgb(74, 74, 93);
  }
  .item {
    display: inline-block;
    position: relative;
    width: 100%;
    height: 26px;
    margin-top: 1px;
    background-color: rgba(18, 18, 113, 0.445);
    padding-left: 4px;
    box-sizing: border-box;

    span {
      font-size: 14px;
      color: rgb(197, 255, 247);
      line-height: 18px;
      font-weight: 400;
    }
    overflow: hidden;
    white-space: nowrap;
  }
</style>
