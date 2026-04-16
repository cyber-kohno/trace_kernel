<script lang="ts">
  import workspaceStore from '../../store/workspace-store';
  import uiStore from '../../store/ui-store';
  import StoreProcess from '../../store/store-process';
  import StoreDataset from '../../store/store-dataset';
  import StoreWorkspace from '../../store/store-workspace';
  import StoreResource from '../../store/store-resource';
  import StoreWork from '../../store/store-work';
  import EntrySection from './EntrySection.svelte';
  import ProcessEntry from './entries/ProcessEntry.svelte';
  import EnvEntry from './entries/EnvEntry.svelte';
  import ResourceEntry from './entries/ResourceEntry.svelte';
  import WorkEntry from './entries/WorkEntry.svelte';
  import storeLicense from '../../store/store-license';
  import DatasetEntry from './entries/DatasetEntry.svelte';

  $: workspace = StoreWorkspace.getWorkspace($workspaceStore);
  $: validate = (target: StoreWorkspace.Target) => {
    StoreWorkspace.validate(target);
  };

  const commitAddedEntry = (target: StoreWorkspace.Target) => {
    validate(target);
    $workspaceStore.workspace = { ...workspace };
    $uiStore.target = target;
  };

  const addEntry = <T,>(cat: StoreWorkspace.Category, items: T[], entry: T) => {
    items.push(entry);
    const nextItems = items.slice();
    const target: StoreWorkspace.Target = {
      cat,
      index: nextItems.length - 1,
    };

    switch (cat) {
      case 'env':
        workspace.envs = nextItems as typeof workspace.envs;
        break;
      case 'resource':
        workspace.resources = nextItems as typeof workspace.resources;
        break;
      case 'dataset':
        workspace.datasets = nextItems as typeof workspace.datasets;
        break;
      case 'process':
        workspace.processes = nextItems as typeof workspace.processes;
        break;
      case 'work':
        workspace.works = nextItems as typeof workspace.works;
        break;
    }

    commitAddedEntry(target);
  };

  const addEnv = () =>
    addEntry('env', workspace.envs, {
      varName: '',
      value: '',
    });

  const addResource = () =>
    addEntry('resource', workspace.resources, StoreResource.getInitial(''));

  const addDataset = () =>
    addEntry('dataset', workspace.datasets, StoreDataset.getInitial(''));

  const addProcess = () =>
    addEntry('process', workspace.processes, StoreProcess.getInitial());

  const addWork = () =>
    addEntry(
      'work',
      workspace.works,
      StoreWork.getInitial(`work${workspace.works.length}`),
    );

  $: openDeclare = () => {
    $uiStore.dialog = 'declare';
  };
</script>

<div class="category">
  <div class="label">{'context'}</div>
</div>

<div class="indent">
  <!-- 環境変数 -->
  <EntrySection
    label={'-env'}
    items={workspace.envs}
    entryComponent={EnvEntry}
    add={addEnv}
  />

  <!-- リソース -->
  <EntrySection
    label={'-resource'}
    items={workspace.resources}
    entryComponent={ResourceEntry}
    add={addResource}
  />

  <!-- データセット -->
  <EntrySection
    label={'-dataset'}
    items={workspace.datasets}
    entryComponent={DatasetEntry}
    add={addDataset}
  />

  <!-- プロセス -->
  {#if storeLicense.isPro()}
    <EntrySection
      label={'-process'}
      items={workspace.processes}
      entryComponent={ProcessEntry}
      add={addProcess}
    />
  {/if}
</div>

<div class="category">
  <div class="label">{'program'}</div>
  <div class="right">
    <button onclick={openDeclare}>{'__common_declare__'}</button>
  </div>
</div>

<div class="indent">
  <!-- ワーク -->
  <EntrySection
    label={'-work'}
    items={workspace.works}
    entryComponent={WorkEntry}
    add={addWork}
  />
</div>

<style>
  .indent {
    display: inline-block;
    position: relative;
    width: 100%;
    padding: 0 0 0 8px;
    background-color: rgba(255, 255, 255, 0.041);
    box-sizing: border-box;
  }
  .category {
    display: inline-block;
    position: relative;
    width: 100%;
    height: 30px;
    /* background-color: rgb(57, 57, 57); */
    margin-top: 4px;

    text-align: left;
  }
  .label {
    display: inline-block;
    font-size: 18px;
    font-weight: 600;
    color: rgba(219, 251, 255, 0.646);
    font-style: italic;
    padding: 0 0 0 4px;
    box-sizing: border-box;
    width: 100px;
  }
  .right {
    display: inline-block;
    width: calc(100% - 100px);
    text-align: right;
  }

  button {
    display: inline-block;
    position: relative;
    height: 24px;
    margin: 3px 4px 0 0;
    padding: 0 12px;
    box-sizing: border-box;
    color: rgba(147, 194, 180, 0.97);
    font-size: 18px;
    line-height: 24px;
    font-weight: 600;
    border: none;
    text-align: center;
    /* background-color: rgba(240, 248, 255, 0.086); */
    background-color: transparent;
    border-radius: 4px;
    font-style: italic;
    text-decoration: underline;

    &:hover {
      color: rgba(255, 255, 255, 0.97);
      /* opacity: 0.81; */
    }
  }
</style>
