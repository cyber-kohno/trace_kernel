<script lang="ts">
  import workspaceStore from '../../../../store/workspace-store';
  import workspaceValidationStore from '../../../../store/workspace-validation-store';
  import uiStore from '../../../../store/ui-store';
  import Wrap from '../../../../util/layout/Wrap.svelte';
  import ScriptEditor from '../../../../util/monaco/ScriptEditor.svelte';
  import OperationButton from '../../../../util/button/OperationButton.svelte';
  import TypescriptUtil from '../../../../util/typescript-util';
  import { onDestroy, onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import Record from '../../../../util/layout/RecordDiv.svelte';
  import StoreWorkspace from '../../../../store/store-workspace';
  import DeclareUtil from '../util/declare-util';
  import DialogHeader from '../../DialogHeader.svelte';
  import ProgressBar from './ProgressBar.svelte';
  import ContextDataUtil from '../util/context-data-util';
  import RuntimeErrorFrame from './RuntimeErrorFrame.svelte';
  import WorkerAdapter from './worker-adapter';
  import RuntimeUtil from '../runtime/runtime-util';
  import TextStreamView from '../output/text/TextStreamView.svelte';
  import ChannelSwitchFrame from '../output/ChannelSwitchFrame.svelte';
  import type DclChannel from '../util/channel/dcl-channel';
  import TableStreamView from '../output/table/TableStreamView.svelte';
  import type { StreamAPI } from '../output/stream-api';
  import BusyIndicator from '../../../../util/item/BusyIndicator.svelte';
  import TxDialog from './tx/ui/TxDialog.svelte';

  type Phase = 'coding' | 'prepar' | 'executing' | 'done' | 'error';

  let hasError = writable(false);
  let phase = writable<Phase>('coding');

  let monitorLines = writable<string[]>([]);

  let streamRef: StreamAPI | null = null;
  let channels = writable<DclChannel.Props[]>([]);
  let activeChannelIdx = writable<number>(-1);

  let errorFrameRef: RuntimeErrorFrame;

  const getInitialProgress = () => ({
    cur: 0,
    total: -1,
  });
  let progress = writable<{ cur: number; total: number }>(getInitialProgress());
  let isMonacoInitDone = writable(false);

  let txCache = writable<RuntimeUtil.VFSState | null>(null);
  let isDispTxDialog = writable(false);

  let monacoRef: ScriptEditor;

  $: workspace = StoreWorkspace.getWorkspace($workspaceStore);
  $: injectionalData = ContextDataUtil.getUsableData(
    workspace,
    $workspaceValidationStore.disables,
  );

  $: work = (() => {
    const target = $uiStore.target;
    if (target && target.cat === 'work') return workspace.works[target.index];
    throw new Error();
  })();

  $: usableUtils = DeclareUtil.getUsableReserveList({ method: work.method });
  $: injectionalDefs = ContextDataUtil.createDeclareDef(injectionalData);
  $: activeChannel = $channels[$activeChannelIdx];

  onDestroy(() => {
    $uiStore.shortcutEvent = null;
  });

  const { init, terminate, start, postInvoke } = WorkerAdapter.use(
    async (e) => {
      switch (e.type) {
        case 'create_stream': {
          if ($channels.some((ch) => ch.id === e.props.id)) {
            throw new Error(`A stream with ID "${e.props.id}" already exists.`);
          }
          $channels.push(e.props);
          $channels = $channels.slice();

          if ($channels.length === 1) {
            $activeChannelIdx = 0;
          }
          break;
        }
        case 'receive_stream': {
          if (activeChannel == undefined) break;
          if (e.channelId === activeChannel.id) {
            if (!streamRef) throw new Error();
            streamRef.receiveStream();
          }
          break;
        }
        case 'invoke':
          postInvoke(e);
          break;
        case 'prepar_end':
          $phase = 'executing';
          break;
        case 'done':
          $phase = 'done';
          streamRef?.end();

          if (e.vfs != null) {
            $txCache = e.vfs;
            $isDispTxDialog = true;
          }
          break;
        case 'runtime-error': {
          $phase = 'error';
          const { sourceMap, stack } = e;
          setTimeout(() => {
            errorFrameRef.init(
              sourceMap,
              stack,
              work.source,
              (monacoRef as any).setRuntimeErrorMarker,
            );
          }, 0);
          break;
        }
        case 'state': {
          switch (e.method) {
            case 'progress_start':
              $progress.total = e.total;
              break;
            case 'progress_tick':
              $progress.cur++;
              break;
            case 'monitor_init':
              $monitorLines = Array.from({ length: e.allocSize }, () => '');
              break;
            case 'monitor_set':
              $monitorLines[e.index] = e.str;
              break;
          }
          break;
        }
      }
    },
  );

  onMount(async () => {
    init();

    $uiStore.shortcutEvent = (e) => {
      if (e.altKey && e.key === 'ArrowLeft') {
        cancel();
      } else if (e.key === 'Escape') {
        $uiStore.dialog = null;
      } else if (e.key === 'F5' || (e.altKey && e.key === 'Enter')) {
        runScript();
      }
    };
  });

  $: cancel = () => {
    if ($phase === 'coding' || $isDispTxDialog) return;
    terminate();
    $channels = [];
    $phase = 'coding';
    $progress = getInitialProgress();
    $monitorLines = [];
    $txCache = null;
    init();
  };

  $: executeDisable = $phase !== 'coding' || $hasError;

  $: runScript = () => {
    if ($phase !== 'coding' || $hasError) return;

    (document.activeElement as HTMLElement)?.blur();
    document.body.focus();

    $phase = 'prepar';

    const { outputText, sourceMapText } = TypescriptUtil.transpileTsToJs(
      work.source,
    );
    if (!sourceMapText) throw new Error();
    start({
      type: 'execute',
      outputText,
      sourceMapText,
      injectionalData,
      usableUtils,
      outputMethod: work.method,
    });
  };
</script>

<div class="frame">
  <DialogHeader title={'#' + work.name} />
  <Record surplus={30}>
    <div class="half" style:width={`${$phase === 'coding' ? 100 : 50}%`}>
      <div class="left">
        <Record surplus={30}>
          <Wrap>
            <ScriptEditor
              bind:this={monacoRef}
              value={work.source}
              onChange={(v) => {
                work.source = v;
                $workspaceStore = { ...$workspaceStore };
              }}
              injectionDefs={usableUtils
                .map((r) => {
                  const { typeDec, valueDec } =
                    DeclareUtil.createUtilDeclareDef(r);
                  return `${typeDec} declare const $${r}: ${valueDec};`;
                })
                .concat(injectionalDefs)}
              declareSource={workspace.declare.source}
              analysisMode={'wrapped'}
              setError={(flg) => ($hasError = flg)}
              executeAction={runScript}
              initDone={() => {
                $isMonacoInitDone = true;
              }}
            />
            {#if $phase !== 'coding'}
              <div class="blind">
                <div class="progressmsg">
                  <div class="executing">
                    {(() => {
                      switch ($phase) {
                        case 'prepar':
                          return 'Preparing...';
                        case 'executing':
                          return 'Executing...';
                        case 'done':
                          return 'Done!';
                        case 'error':
                          return 'Runtime error!';
                      }
                    })()}
                  </div>
                  {#if $phase === 'error'}
                    <RuntimeErrorFrame bind:this={errorFrameRef} />
                  {/if}
                  {#if $progress.total !== -1}
                    <ProgressBar rate={($progress.cur / $progress.total) * 100} />
                  {/if}
                  {#each $monitorLines as m}
                    <div class="monitor">{m}</div>
                  {/each}
                </div>
              </div>
            {/if}
            {#if !$isMonacoInitDone}
              <div class="blind">
                <BusyIndicator>
                  <div class="loadmsg">{'Monaco initializing...'}</div>
                </BusyIndicator>
              </div>
            {/if}
          </Wrap>
        </Record>
        <Record align="right">
          <OperationButton
            name={'Run'}
            callback={runScript}
            isLineup
            width={120}
            isDisable={executeDisable}
            tooltip={'Alt + Enter or F5'}
          />
        </Record>
      </div>
    </div>
    <div class="half" style:width={`${$phase === 'coding' ? 0 : 50}%`}>
      <div class="right">
        <Record surplus={30}>
          <Wrap>
            {#if $phase !== 'coding'}
              {#if work.method === 'channel'}
                <ChannelSwitchFrame
                  active={$activeChannelIdx}
                  channels={$channels}
                  move={(dir) => {
                    $activeChannelIdx += dir;
                    setTimeout(() => {
                      if (streamRef) {
                        const ref = streamRef;
                        ref.init();
                        ref.receiveStream().then(() => ref.init());
                        if ($phase === 'done') ref.end();
                      }
                    }, 0);
                  }}
                />
              {/if}
              <Record surplus={work.method === 'channel' ? 30 : 0}>
                {#if activeChannel != undefined}
                  {#if activeChannel.view === 'text'}
                    <TextStreamView bind:this={streamRef} channel={activeChannel} />
                  {:else if activeChannel.view === 'table'}
                    <TableStreamView bind:this={streamRef} channel={activeChannel} />
                  {/if}
                {/if}
              </Record>
            {/if}
          </Wrap>
        </Record>
        <Record height={30} align={'right'}>
          <OperationButton
            name={'Cancel'}
            callback={cancel}
            isLineup
            width={150}
            isDisable={$phase === 'coding'}
            tooltip={'Ctrl + ArrowLeft'}
          />
          {#if $txCache != null}
            <OperationButton
              name={'Transaction'}
              callback={() => ($isDispTxDialog = true)}
              isLineup
              width={190}
            />
          {/if}
        </Record>
      </div>
    </div>

    {#if $txCache != null && $isDispTxDialog}
      <TxDialog vfs={$txCache} close={() => ($isDispTxDialog = false)} />
    {/if}
  </Record>
</div>

<style>
  .frame {
    display: inline-block;
    position: relative;
    margin: 8px 0 0 8px;
    width: calc(100% - 16px);
    height: calc(100% - 16px);
  }
  .half {
    display: inline-block;
    position: relative;
    width: 50%;
    height: 100%;
    vertical-align: top;
  }
  .left {
    display: inline-block;
    position: relative;
    margin: 4px 0 0 4px;
    width: calc(100% - 8px);
    height: calc(100% - 8px);
    background-color: rgba(130, 168, 204, 0.499);
  }
  .blind {
    position: absolute;
    inset: 0;
    background-color: #00d9ff7d;
    z-index: 5;
    display: flex;
    justify-content: center;
    align-items: center;
    backdrop-filter: blur(2px);
  }
  .right {
    display: inline-block;
    position: relative;
    margin: 4px 0 0 4px;
    width: calc(100% - 8px);
    height: calc(100% - 8px);
    background-color: rgba(157, 176, 189, 0.354);
    overflow-y: auto;
  }

  .loadmsg {
    font-size: 30px;
    color: white;
    font-weight: 600;
    text-align: center;
  }
  .progressmsg {
    width: 100%;
    background-color: rgba(127, 255, 212, 0.19);
  }
  .executing {
    width: 100%;
    height: 40px;
    font-size: 30px;
    line-height: 35px;
    text-align: center;
    color: white;
    font-weight: 600;
    background-color: rgba(0, 0, 0, 0.215);
  }
  .monitor {
    width: 100%;
    height: 30px;
    font-size: 18px;
    text-align: left;
    color: rgb(173, 255, 160);
    font-weight: 400;
    background-color: rgba(0, 0, 0, 0.406);
    padding-left: 4px;
    box-sizing: border-box;
    overflow: hidden;
    white-space: nowrap;
  }
</style>
