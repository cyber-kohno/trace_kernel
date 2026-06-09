<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { uiStore, workspaceStore } from '../../../../state/store';
  import Wrap from '../../../../util/layout/Wrap.svelte';
  import ScriptEditor from '../../../../util/monaco/ScriptEditor.svelte';
  import Record from '../../../../util/layout/RecordDiv.svelte';
  import WorkspaceState from '../../../../state/model/workspace/workspace-state';
  import DialogHeader from '../../DialogHeader.svelte';
  import ContextDataUtil from '../../program/util/context-data-util';
  import BusyIndicator from '../../../../util/item/BusyIndicator.svelte';
  import { validationStore } from '../../../../state/store';
  import { writable } from 'svelte/store';
  import LogicSourceUtil from '../util/logic-source-util';
  import DeclareUtil from '../../program/util/declare-util';
  import LogicSignatureCache from '../util/logic-signature-cache';

  let isMonacoInitDone = writable(false);
  let hasError = writable(false);

  $: workspace = WorkspaceState.getWorkspace($workspaceStore);
  $: currentTarget = $uiStore.target;
  $: injectionalData = ContextDataUtil.getUsableData(
    workspace,
    $validationStore.disables,
  );
  $: logic = (() => {
    if (currentTarget?.cat === 'logic') {
      return workspace.logics[currentTarget.index];
    }
    throw new Error();
  })();

  $: logicInjectionalData = {
    ...injectionalData,
    logics: injectionalData.logics.filter((item) => item.name !== logic.name),
  };
  $: logicApiDefs = ['parser' as const].map((r) => {
    const { typeDec, valueDec } = DeclareUtil.createUtilDeclareDef(r);
    return `${typeDec} declare const $${r}: ${valueDec};`;
  });
  $: injectionalDefs = logicApiDefs.concat(
    ContextDataUtil.createDeclareDef(logicInjectionalData),
  );
  $: structureMarkers = LogicSourceUtil.validate(logic.source);
  $: signature = LogicSignatureCache.get({
    source: logic.source,
    injectionDefs: injectionalDefs,
    declareSource: workspace.declare.source,
  });
  $: signatureLabel =
    signature == null
      ? ''
      : `${
          signature.name === 'default' ? 'default' : signature.name
        }(${signature.args.join(', ')}): ${signature.returnType}`;

  onMount(async () => {
    $uiStore.shortcutEvent = (e) => {
      if (e.key === 'Escape') {
        $uiStore.dialog = null;
      }
    };
  });

  onDestroy(() => {
    $uiStore.shortcutEvent = null;
  });
</script>

<div class="frame">
  <DialogHeader title={'#' + logic.name} />
  <Record surplus={30}>
    <Wrap>
      <ScriptEditor
        value={logic.source}
        onChange={(v) => {
          logic.source = v;
          $workspaceStore = { ...$workspaceStore };
        }}
        injectionDefs={injectionalDefs}
        declareSource={workspace.declare.source}
        analysisMode={'module'}
        extraMarkers={structureMarkers}
        setError={(flg) => ($hasError = flg)}
        initDone={() => {
          $isMonacoInitDone = true;
        }}
      />
      {#if signature != null}
        <div class="signature">
          {signatureLabel}
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
</div>

<style>
  .frame {
    display: inline-block;
    position: relative;
    margin: 8px 0 0 8px;
    width: calc(100% - 16px);
    height: calc(100% - 16px);
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
  .loadmsg {
    font-size: 30px;
    color: white;
    font-weight: 600;
    text-align: center;
  }
  .signature {
    position: absolute;
    left: 8px;
    right: 8px;
    bottom: 8px;
    padding: 6px 10px;
    background-color: rgba(0, 0, 0, 0.45);
    color: rgba(231, 255, 198, 0.95);
    font-size: 13px;
    line-height: 18px;
    box-sizing: border-box;
    pointer-events: none;
  }
</style>
