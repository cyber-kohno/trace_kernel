<script lang="ts">
  import { writable } from 'svelte/store';
  import workspaceStore from '../../../store/workspace-store';
  import uiStore from '../../../store/ui-store';
  import StoreWorkspace from '../../../store/store-workspace';
  import OperationButton from '../../../util/button/OperationButton.svelte';
  import OperationSwitch from '../../../util/button/OperationSwitch.svelte';
  import Textarea from '../../../util/form/Textarea.svelte';
  import TextInput from '../../../util/form/TextInput.svelte';
  import LabelRecord from '../../../util/item/LabelRecord.svelte';
  import Record from '../../../util/layout/RecordDiv.svelte';
  import Wrap from '../../../util/layout/Wrap.svelte';
  import {
    clearParseValidation,
    createParsePreview,
    setResourceParseMethod,
    setResourceSource,
    validateResourceParse,
  } from './resource-parse-util';
  import { commitWorkspace, getTargetEntry } from '../maintenance-helpers';

  const testData = writable<string | null>(null);

  $: workspace = StoreWorkspace.getWorkspace($workspaceStore);

  $: resource = getTargetEntry(
    $uiStore.target,
    'resource',
    workspace.resources,
  );

  $: setName = (v: string) => {
    resource.varName = v;
    commitWorkspace(workspace);
  };
  $: setSource = (v: string) => {
    $testData = null;
    setResourceSource(resource, v);
    commitWorkspace(workspace);
  };

  $: toggleCsvConvert = () => {
    $testData = null;
    setResourceParseMethod(
      resource,
      resource.parse === 'csv' ? undefined : 'csv',
    );
    commitWorkspace(workspace);
  };
  $: toggleTsvConvert = () => {
    $testData = null;
    setResourceParseMethod(
      resource,
      resource.parse === 'tsv' ? undefined : 'tsv',
    );
    commitWorkspace(workspace);
  };

  const testParse = async () => {
    try {
      const records = validateResourceParse(resource);
      resource.parseValidated = true;
      $testData = createParsePreview(resource.parse, records);
    } catch (error) {
      clearParseValidation(resource);
      const message = error instanceof Error ? error.message : String(error);
      $testData = `Parse failed.\n${message}`;
    }
    commitWorkspace(workspace);
  };
</script>

<Wrap>
  <LabelRecord name={'variable_name'} />
  <TextInput
    value={resource.varName}
    set={setName}
    width={'calc(100% - 4px)'}
    requied
  />
  <LabelRecord name={'source'} />
  <Record height={150}>
    <Wrap>
      <Textarea value={resource.source ?? ''} set={setSource} />
    </Wrap>
  </Record>
  <LabelRecord name={'parse_method'} sub={'type injection'} />
  <Record>
    <OperationSwitch
      name="CSV to JSON"
      callback={toggleCsvConvert}
      isActive={resource.parse === 'csv'}
    />
    <OperationSwitch
      name="TSV to JSON"
      callback={toggleTsvConvert}
      isActive={resource.parse === 'tsv'}
    />
  </Record>
  {#if resource.parse != undefined}
    <LabelRecord name={'test_parse'} />
    <OperationButton name="Test" width={120} callback={testParse} />
    <Record height={200}>
      <Wrap>
        {#if $testData == null}
          <div class="parse-status">
            Test parsing is required to enable this resource.
          </div>
        {:else}
          <Textarea value={$testData} readonly />
        {/if}
      </Wrap>
    </Record>
  {/if}
</Wrap>

<style>
  .parse-status {
    padding: 8px;
    color: rgba(255, 240, 180, 0.9);
    font-size: 14px;
    line-height: 1.4;
  }
</style>
