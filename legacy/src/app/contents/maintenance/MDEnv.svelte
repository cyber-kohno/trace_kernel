<script lang="ts">
  import TextInput from "../../util/form/TextInput.svelte";
  import LabelRecord from "../../util/item/LabelRecord.svelte";
  import Record from "../../util/layout/RecordDiv.svelte";
  import Wrap from "../../util/layout/Wrap.svelte";
  import storeWorkspace from "../../store/storeWorkspace";
  import store from "../../store/store";
  import type StoreEnv from "../../store/storeEnv";
  import OperationSwitch from "../../util/button/OperationSwitch.svelte";
  import PathState from "../../util/form/validation/PathState.svelte";
  import ValidateUtil from "../../util/data/validateUtil";

  $: workspace = storeWorkspace.getWorkspace($store);

  $: env = (() => {
    const target = storeWorkspace.getTarget($store);
    if (target != null && target.cat === "env")
      return workspace.envs[target.index];
    throw new Error();
  })();
  $: validate = () => {
    const target = storeWorkspace.getTarget($store);
    storeWorkspace.validate(target);
  };

  $: setKey = (v: string) => {
    env.varName = v;
    $store.workspace = { ...workspace };
    validate();
  };
  $: setValue = (v: string) => {
    env.value = v;
    $store.workspace = { ...workspace };
    validate();
  };

  $: getTogglePurposeCallback = (purpose: StoreEnv.Purpose) => {
    return () => {
      if (env.purpose === purpose) {
        delete env.purpose;
      } else {
        env.purpose = purpose;
      }
      $store.workspace = { ...workspace };
    };
  };
</script>

<Wrap>
  <div class="main">
    <LabelRecord name={"name"} sub={"uppercase only"} />
    <TextInput
      value={env.varName}
      set={setKey}
      width={"calc(100% - 4px)"}
      requied
      allowedPattern={ValidateUtil.UpperCase}
    />
    <LabelRecord name={"purpose"} />
    <Record>
      <OperationSwitch
        name="Directory path"
        callback={getTogglePurposeCallback("dir")}
        isActive={env.purpose === "dir"}
      />
      <OperationSwitch
        name="File path"
        callback={getTogglePurposeCallback("file")}
        isActive={env.purpose === "file"}
      />
    </Record>
    <LabelRecord name={"value"} />
    <TextInput
      value={env.value}
      set={setValue}
      width={"calc(100% - 4px)"}
      requied
    />
    {#if env.purpose === "dir"}
      <PathState isDir={true} path={env.value} />
    {/if}
    {#if env.purpose === "file"}
      <PathState isDir={false} path={env.value} />
    {/if}
  </div>
</Wrap>
