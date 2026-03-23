<script lang="ts">
  import { writable } from "svelte/store";
  import store from "../../store/store";
  import StoreWorkspace from "../../store/storeWorkspace";
  import OperationButton from "../../util/button/OperationButton.svelte";
  import OperationSwitch from "../../util/button/OperationSwitch.svelte";
  import Textarea from "../../util/form/Textarea.svelte";
  import TextInput from "../../util/form/TextInput.svelte";
  import LabelRecord from "../../util/item/LabelRecord.svelte";
  import Record from "../../util/layout/RecordDiv.svelte";
  import Wrap from "../../util/layout/Wrap.svelte";
  import DataUtil from "../../util/data/dataUtil";

  const testData = writable<string | null>(null);

  $: workspace = StoreWorkspace.getWorkspace($store);

  $: resource = (() => {
    const target = $store.target;
    if (target != null && target.cat === "resource")
      return workspace.resources[target.index];
    throw new Error();
  })();

  $: validate = () => {
    const target = StoreWorkspace.getTarget($store);
    StoreWorkspace.validate(target);
  };

  $: setName = (v: string) => {
    resource.varName = v;
    $store.workspace = { ...workspace };
    validate();
  };
  $: setSource = (v: string) => {
    resource.source = v;
    $store.workspace = { ...workspace };
    validate();
  };

  $: toggleCsvConvert = () => {
    $testData = null;
    if (resource.parse === "csv") {
      resource.parse = undefined;
    } else {
      resource.parse = "csv";
    }
    $store.workspace = { ...workspace };
  };
  $: toggleTsvConvert = () => {
    $testData = null;
    if (resource.parse === "tsv") {
      resource.parse = undefined;
    } else {
      resource.parse = "tsv";
    }
    $store.workspace = { ...workspace };
  };

  const testParse = async () => {
    let src = resource.source;
    if (src == null) throw new Error();
    const conv = resource.parse;
    if (conv == undefined) throw new Error();
    const records = DataUtil.convertTableToJson(src, conv);

    $testData = "";
    const append = (str: string) => ($testData += str + "\n");
    append(`Start parsing the ${resource.parse}.`);
    append(`There are ${records.length} records.`);
    append(`\n★columns`);
    append(`------------------------`);
    Object.keys(records[0]).forEach((k) => {
      append(`・${k}`);
    });
    append(`------------------------`);
    append(`\n★records`);
    records.forEach((r, i) => {
      append(`\n〇line ${i}`);
      append(`-----`);
      Object.values(r).forEach((v) => {
        append(`[${v}]`);
      });
    });
    append(`------------------------`);
    append(`Successful completion!`);
  };
</script>

<Wrap>
  <LabelRecord name={"variable_name"} />
  <TextInput
    value={resource.varName}
    set={setName}
    width={"calc(100% - 4px)"}
    requied
  />
  <LabelRecord name={"source"} />
  <Record height={150}>
    <Wrap>
      <Textarea value={resource.source ?? ""} set={setSource} />
    </Wrap>
  </Record>
  <LabelRecord name={"parse_method"} sub={"type injection"} />
  <Record>
    <OperationSwitch
      name="CSV to JSON"
      callback={toggleCsvConvert}
      isActive={resource.parse === "csv"}
    />
    <OperationSwitch
      name="TSV to JSON"
      callback={toggleTsvConvert}
      isActive={resource.parse === "tsv"}
    />
  </Record>
  {#if resource.parse != undefined}
    <LabelRecord name={"preview_parse"} />
    <OperationButton name="Test" width={120} callback={testParse} />
    <Record height={200}>
      <Wrap>
        {#if $testData != null}
          <Textarea value={$testData} readonly />
        {/if}
      </Wrap>
    </Record>
  {/if}
</Wrap>
