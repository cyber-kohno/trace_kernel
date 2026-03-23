<script lang="ts">
  import TextInput from "../../../util/form/TextInput.svelte";
  import LabelRecord from "../../../util/item/LabelRecord.svelte";
  import Record from "../../../util/layout/RecordDiv.svelte";
  import Wrap from "../../../util/layout/Wrap.svelte";
  import StoreWorkspace from "../../../store/storeWorkspace";
  import store from "../../../store/store";
  import OperationButton from "../../../util/button/OperationButton.svelte";
  import OperationSwitch from "../../../util/button/OperationSwitch.svelte";
  import type StoreWork from "../../../store/StoreWork";
  import ContextInjectionFrame from "./injection/container/ContextInjectionFrame.svelte";
  import ApiInjectionFrame from "./injection/api/ApiInjectionFrame.svelte";

  $: workspace = StoreWorkspace.getWorkspace($store);

  $: validate = () => {
    const target = StoreWorkspace.getTarget($store);
    StoreWorkspace.validate(target);
  };

  $: hasDisable = (() => {
    const target = $store.target;
    if (target != null) {
      return StoreWorkspace.hasDisable(target);
    }
    return false;
  })();

  $: work = (() => {
    const target = $store.target;
    if (target != null && target.cat === "work")
      return workspace.works[target.index];
    throw new Error();
  })();

  $: setName = (v: string) => {
    work.name = v;
    $store.workspace = { ...workspace };
    validate();
  };

  $: setMethod = (method: StoreWork.OutputMethod) => {
    work.method = method;
    $store.workspace = { ...workspace };
  };

  $: openProgram = () => {
    $store.dialog = "program";
  };
</script>

<Wrap>
  <Record surplus={30}>
    <LabelRecord name={"name"} />
    <TextInput
      value={work.name}
      set={setName}
      width={"calc(100% - 4px)"}
      requied
    />
    <LabelRecord name={"output_method"} />
    <Record>
      <OperationSwitch
        name="Plain"
        callback={() => setMethod("plain")}
        isActive={work.method === "plain"}
      />
      <OperationSwitch
        name="Channel"
        callback={() => setMethod("channel")}
        isActive={work.method === "channel"}
      />
    </Record>
    <!-- <LabelRecord name={"utilities"} /> -->
    <!-- 予約関数の使い方表示 -->
    <!-- <UsageFrame method={work.method} />  -->
    <LabelRecord name={"api_injections"} />
    <ApiInjectionFrame method={work.method} />
    <LabelRecord name={"context_injections"} />
    <!-- 予約関数の使い方表示 -->
    <ContextInjectionFrame />
  </Record>
  <Record align="right">
    <OperationButton
      name={"Open Editor"}
      callback={openProgram}
      isDisable={hasDisable}
      isLineup
      width={150}
    />
  </Record>
</Wrap>
