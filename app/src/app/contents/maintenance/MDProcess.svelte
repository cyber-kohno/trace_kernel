<script lang="ts">
  import TextInput from "../../util/form/TextInput.svelte";
  import LabelRecord from "../../util/item/LabelRecord.svelte";
  import Record from "../../util/layout/RecordDiv.svelte";
  import Wrap from "../../util/layout/Wrap.svelte";
  import StoreWorkspace from "../../store/storeWorkspace";
  import store from "../../store/store";
  import NumberInput from "../../util/form/NumberInput.svelte";
  import AddDelButton from "../system/AddDelButton.svelte";
  import Column from "../../util/layout/Column.svelte";
  import OperationSwitch from "../../util/button/OperationSwitch.svelte";
  import ToastUtil from "../../util/item/toastUtit";
  import PathState from "../../util/form/validation/PathState.svelte";
  import { writable } from "svelte/store";
  import { onMount } from "svelte";
  import DataUtil from "../../util/data/dataUtil";
  import type { TextEncoding } from "../../store/types";
  import ItemLabel from "../../util/item/ItemLabel.svelte";

  $: workspace = StoreWorkspace.getWorkspace($store);

  $: process = (() => {
    const target = $store.target;
    if (target != null && target.cat === "process")
      return workspace.processes[target.index];
    throw new Error();
  })();

  $: validate = () => {
    const target = StoreWorkspace.getTarget($store);
    StoreWorkspace.validate(target);
  };

  $: setName = (v: string) => {
    process.funcName = v;
    $store.workspace = { ...workspace };
    validate();
  };
  $: setProgramPath = (v: string) => {
    process.prgPath = v;
    $store.workspace = { ...workspace };
    validate();
  };
  $: addScriptArg = () => {
    process.scriptArgs.push({
      name: `arg${process.scriptArgs.length}`,
      type: "string",
    });
    process.scriptArgs = process.scriptArgs.slice();
    $store.workspace = { ...workspace };
    validate();
  };
  $: addCommaandArg = () => {
    process.cmdArgs.push("");
    process.cmdArgs = process.cmdArgs.slice();
    $store.workspace = { ...workspace };
    validate();
  };
  $: setTimeout = (v: number) => {
    process.timeout = v;
    $store.workspace = { ...workspace };
  };
  $: isUse = (value: string) => {
    return (
      process.cmdArgs.find((c) => c.indexOf(`__${value}__`) !== -1) != undefined
    );
  };

  let scriptDefErrors = writable<boolean[]>([]);

  onMount(() => {
    $scriptDefErrors = process.scriptArgs.map((_) => false);
  });

  $: createSetEncodingCallback = (
    target: "stdout" | "stderr",
    encoding: TextEncoding,
  ) => {
    return () => {
      process.encoding[target] = encoding;
    };
  };
</script>

<Wrap>
  <div class="main">
    <LabelRecord name={"function_name"} />
    <TextInput
      value={process.funcName}
      set={setName}
      width={"calc(100% - 4px)"}
      requied
    />
    <LabelRecord name={"program_path"} />
    <TextInput
      value={process.prgPath}
      set={setProgramPath}
      width={"calc(100% - 4px)"}
      requied
    />
    <PathState
      isDir={false}
      path={DataUtil.getAppliedEnvValue(process.prgPath, workspace.envs)}
    />
    <LabelRecord name={"script_argument_defs"} />
    {#each process.scriptArgs as arg, i}
      <Record height={30}>
        <Column width={42}>
          <AddDelButton
            del
            callback={() => {
              process.scriptArgs.splice(i, 1);
              $scriptDefErrors.splice(i, 1);
              process.scriptArgs = process.scriptArgs.slice();
              $store.workspace = { ...workspace };
              validate();
            }}
          />
        </Column>
        <Column width={172}>
          <TextInput
            value={arg.name}
            set={(v) => {
              process.scriptArgs[i].name = v;
              process.scriptArgs = process.scriptArgs.slice();
              $store.workspace = { ...workspace };
              validate();
            }}
            width={"calc(100% - 4px)"}
            requied
            invalidValues={process.scriptArgs
              .map((a) => a.name)
              .filter((_, idx) => idx !== i)}
            bind:error={$scriptDefErrors[i]}
          />
        </Column>
        <Column width={98}>
          <OperationSwitch
            name={"Number"}
            isActive={arg.type === "number"}
            callback={() => {
              arg.type = arg.type === "number" ? "string" : "number";
              process.scriptArgs = process.scriptArgs.slice();
            }}
          />
        </Column>
        <Column width={172}>
          {#if !$scriptDefErrors[i] && arg.name !== ""}
            <button
              class="label"
              data--used={isUse(arg.name)}
              oncontextmenu={() => {
                const value = `__${arg.name}__`;
                navigator.clipboard.writeText(value);
                ToastUtil.disp({
                  text: `Copied the script argument "${value}".`,
                });
              }}
            >
              {`__${arg.name}__`}
            </button>
          {/if}
        </Column>
      </Record>
    {/each}
    <Record>
      <AddDelButton callback={addScriptArg} />
    </Record>
    <LabelRecord name={"command_argument_values"} />
    {#each process.cmdArgs as arg, i}
      <Record height={30}>
        <Column width={42}>
          <AddDelButton
            del
            callback={() => {
              process.cmdArgs.splice(i, 1);
              process.cmdArgs = process.cmdArgs.slice();
              $store.workspace = { ...workspace };
              validate();
            }}
          />
        </Column>
        <Column surplus={42}>
          <TextInput
            value={arg}
            set={(v) => {
              process.cmdArgs[i] = v;
              $store.workspace = { ...workspace };
              validate();
            }}
            width={"calc(100% - 4px)"}
            requied
          />
        </Column>
      </Record>
    {/each}
    <Record>
      <AddDelButton callback={addCommaandArg} />
    </Record>
    <LabelRecord name={"timeout_millisecond"} />
    <NumberInput
      value={process.timeout}
      set={setTimeout}
      min={500}
      max={10000}
    />
    <LabelRecord name={"response_encoding"} />
    <Record>
      <Column width={90}>
        <ItemLabel name="stdout" width={80} />
      </Column>
      <Column surplus={90}>
        <OperationSwitch
          name="UTF8"
          callback={createSetEncodingCallback("stdout", "utf8")}
          isActive={process.encoding.stdout === "utf8"}
        />
        <OperationSwitch
          name="SJIS"
          callback={createSetEncodingCallback("stdout", "sjis")}
          isActive={process.encoding.stdout === "sjis"}
        />
      </Column>
    </Record>
    <Record>
      <Column width={90}>
        <ItemLabel name="stderr" width={80} />
      </Column>
      <Column surplus={90}>
        <OperationSwitch
          name="UTF8"
          callback={createSetEncodingCallback("stderr", "utf8")}
          isActive={process.encoding.stderr === "utf8"}
        />
        <OperationSwitch
          name="SJIS"
          callback={createSetEncodingCallback("stderr", "sjis")}
          isActive={process.encoding.stderr === "sjis"}
        />
      </Column>
    </Record>
  </div>
</Wrap>

<style>
  .label {
    display: inline-block;
    position: relative;
    margin: 2px 4px;
    width: calc(100% - 4px);
    height: calc(100% - 4px);
    font-size: 14px;
    color: rgba(255, 255, 255, 0.39);
    font-weight: 600;
    background-color: rgba(255, 186, 254, 0.081);
    padding: 0 4px;
    box-sizing: border-box;
    white-space: nowrap;
    overflow-x: hidden;
    border-radius: 4px;
    &:hover {
      background-color: rgba(255, 186, 254, 0.306);
    }
  }
  .label[data--used="true"] {
    color: rgba(180, 255, 175, 0.741);
  }
</style>
