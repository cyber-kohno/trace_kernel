<script lang="ts">
  import store from "../../store/store";
  import OperationButton from "../../util/button/OperationButton.svelte";
  import Column from "../../util/layout/Column.svelte";
  import Record from "../../util/layout/RecordDiv.svelte";

  export let title: string = "";

  $: close = () => {
    $store.dialog = null;
  };

  const CloseButtonAreaWidth = 40;
</script>

<Record height={30} bgColor={"#333"}>
  <Column surplus={CloseButtonAreaWidth}>
    <span>{title}</span>
  </Column>
  <Column width={CloseButtonAreaWidth}>
    <OperationButton name={"×"} callback={close} isLineup bgColor={"#faa"} />
  </Column>
</Record>

<style>
  span {
    font-size: 18px;
    font-weight: 400;
    color: rgb(184, 203, 202);
    margin-left: 4px;
  }
</style>
