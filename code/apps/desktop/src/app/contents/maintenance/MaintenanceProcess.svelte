<script lang="ts">
  import TextInput from '../../util/form/TextInput.svelte';
  import LabelRecord from '../../util/item/LabelRecord.svelte';
  import Record from '../../util/layout/RecordDiv.svelte';
  import Wrap from '../../util/layout/Wrap.svelte';
  import WorkspaceState from '../../state/model/workspace/workspace-state';
  import { workspaceStore } from '../../state/store';
  import { uiStore } from '../../state/store';
  import NumberInput from '../../util/form/NumberInput.svelte';
  import AddDelButton from '../system/AddDelButton.svelte';
  import Column from '../../util/layout/Column.svelte';
  import OperationSwitch from '../../util/button/OperationSwitch.svelte';
  import ToastService from '../../service/toast-service';
  import PathState from '../../util/form/validation/PathState.svelte';
  import Textarea from '../../util/form/Textarea.svelte';
  import { writable } from 'svelte/store';
  import { onMount } from 'svelte';
  import DataUtil from '../../util/data/data-util';
  import type TauriDto from '../../infra/tauri/tauri-dto';
  import ItemLabel from '../../util/item/ItemLabel.svelte';
  import { commitWorkspace, getTargetEntry } from './maintenance-helpers';

  $: workspace = WorkspaceState.getWorkspace($workspaceStore);

  $: process = getTargetEntry($uiStore.target, 'process', workspace.processes);
  $: if (process.cwd == undefined) {
    process.cwd = '';
  }
  $: if (process.stdin == undefined) {
    process.stdin = '';
  }
  $: if (process.encoding.stdin == undefined) {
    process.encoding.stdin = 'utf8';
  }

  $: setName = (v: string) => {
    process.funcName = v;
    commitWorkspace(workspace);
  };
  $: setProgramPath = (v: string) => {
    process.prgPath = v;
    commitWorkspace(workspace);
  };
  $: addScriptArg = () => {
    process.scriptArgs.push({
      name: `arg${process.scriptArgs.length}`,
      type: 'string',
    });
    process.scriptArgs = process.scriptArgs.slice();
    commitWorkspace(workspace);
  };
  $: addCommaandArg = () => {
    process.cmdArgs.push('');
    process.cmdArgs = process.cmdArgs.slice();
    commitWorkspace(workspace);
  };
  $: setTimeout = (v: number) => {
    process.timeout = v;
    commitWorkspace(workspace, { validate: false });
  };
  $: setCwd = (v: string) => {
    process.cwd = v;
    commitWorkspace(workspace, { validate: false });
  };
  $: setStdin = (v: string) => {
    process.stdin = v;
    commitWorkspace(workspace, { validate: false });
  };
  $: isUse = (value: string) => {
    return (
      process.cmdArgs.find((c) => c.indexOf(`__${value}__`) !== -1) !=
        undefined ||
      (process.cwd ?? '').indexOf(`__${value}__`) !== -1 ||
      (process.stdin ?? '').indexOf(`__${value}__`) !== -1
    );
  };

  let scriptDefErrors = writable<boolean[]>([]);

  onMount(() => {
    $scriptDefErrors = process.scriptArgs.map((_) => false);
  });

  $: createSetEncodingCallback = (
    target: 'stdin' | 'stdout' | 'stderr',
    encoding: TauriDto.TextEncoding,
  ) => {
    return () => {
      process.encoding[target] = encoding;
      commitWorkspace(workspace, { validate: false });
    };
  };
</script>

<Wrap>
  <div class="main">
    <LabelRecord name={'function_name'} />
    <TextInput
      value={process.funcName}
      set={setName}
      width={'calc(100% - 4px)'}
      required
    />
    <LabelRecord name={'program_path'} />
    <TextInput
      value={process.prgPath}
      set={setProgramPath}
      width={'calc(100% - 4px)'}
      required
    />
    <PathState
      isDir={false}
      path={DataUtil.getAppliedEnvValue(process.prgPath, workspace.envs)}
    />
    <LabelRecord name={'script_argument_defs'} />
    {#each process.scriptArgs as arg, i}
      <Record height={30}>
        <Column width={42}>
          <AddDelButton
            del
            callback={() => {
              process.scriptArgs.splice(i, 1);
              $scriptDefErrors.splice(i, 1);
              process.scriptArgs = process.scriptArgs.slice();
              commitWorkspace(workspace);
            }}
          />
        </Column>
        <Column width={172}>
          <TextInput
            value={arg.name}
            set={(v) => {
              process.scriptArgs[i].name = v;
              process.scriptArgs = process.scriptArgs.slice();
              commitWorkspace(workspace);
            }}
            width={'calc(100% - 4px)'}
            required
            invalidValues={process.scriptArgs
              .map((a) => a.name)
              .filter((_, idx) => idx !== i)}
            bind:error={$scriptDefErrors[i]}
          />
        </Column>
        <Column width={98}>
          <OperationSwitch
            name={'Number'}
            isActive={arg.type === 'number'}
            callback={() => {
              arg.type = arg.type === 'number' ? 'string' : 'number';
              process.scriptArgs = process.scriptArgs.slice();
              commitWorkspace(workspace, { validate: false });
            }}
          />
        </Column>
        <Column width={172}>
          {#if !$scriptDefErrors[i] && arg.name !== ''}
            <button
              class="label"
              data--used={isUse(arg.name)}
              oncontextmenu={() => {
                const value = `__${arg.name}__`;
                navigator.clipboard.writeText(value);
                ToastService.show({
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
    <LabelRecord name={'command_argument_values'} />
    {#each process.cmdArgs as arg, i}
      <Record height={30}>
        <Column width={42}>
          <AddDelButton
            del
            callback={() => {
              process.cmdArgs.splice(i, 1);
              process.cmdArgs = process.cmdArgs.slice();
              commitWorkspace(workspace);
            }}
          />
        </Column>
        <Column surplus={42}>
          <TextInput
            value={arg}
            set={(v) => {
              process.cmdArgs[i] = v;
              commitWorkspace(workspace);
            }}
            width={'calc(100% - 4px)'}
            required
          />
        </Column>
      </Record>
    {/each}
    <Record>
      <AddDelButton callback={addCommaandArg} />
    </Record>
    <LabelRecord name={'working_directory'} />
    <TextInput
      value={process.cwd ?? ''}
      set={setCwd}
      width={'calc(100% - 4px)'}
    />
    <LabelRecord name={'standard_input'} />
    <Record height={120}>
      <div class="textarea-wrap">
        <Textarea value={process.stdin ?? ''} set={setStdin} />
      </div>
    </Record>
    <LabelRecord name={'timeout_millisecond'} />
    <NumberInput
      value={process.timeout}
      set={setTimeout}
      min={500}
      max={10000}
    />
    <LabelRecord name={'response_encoding'} />
    <Record>
      <Column width={90}>
        <ItemLabel name="stdin" width={80} />
      </Column>
      <Column surplus={90}>
        <OperationSwitch
          name="UTF8"
          callback={createSetEncodingCallback('stdin', 'utf8')}
          isActive={process.encoding.stdin === 'utf8'}
        />
        <OperationSwitch
          name="SJIS"
          callback={createSetEncodingCallback('stdin', 'sjis')}
          isActive={process.encoding.stdin === 'sjis'}
        />
      </Column>
    </Record>
    <Record>
      <Column width={90}>
        <ItemLabel name="stdout" width={80} />
      </Column>
      <Column surplus={90}>
        <OperationSwitch
          name="UTF8"
          callback={createSetEncodingCallback('stdout', 'utf8')}
          isActive={process.encoding.stdout === 'utf8'}
        />
        <OperationSwitch
          name="SJIS"
          callback={createSetEncodingCallback('stdout', 'sjis')}
          isActive={process.encoding.stdout === 'sjis'}
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
          callback={createSetEncodingCallback('stderr', 'utf8')}
          isActive={process.encoding.stderr === 'utf8'}
        />
        <OperationSwitch
          name="SJIS"
          callback={createSetEncodingCallback('stderr', 'sjis')}
          isActive={process.encoding.stderr === 'sjis'}
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
  .label[data--used='true'] {
    color: rgba(180, 255, 175, 0.741);
  }
  .textarea-wrap {
    display: inline-block;
    position: relative;
    margin: 5px 0 0 2px;
    width: calc(100% - 4px);
    height: calc(100% - 7px);
    box-sizing: border-box;
  }
</style>
