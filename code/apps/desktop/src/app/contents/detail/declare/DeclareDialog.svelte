<script>
  import { onMount } from 'svelte';
  import { uiStore, workspaceStore } from '../../../state/store';
  import WorkspaceState from '../../../state/model/workspace/workspace-state';
  import RecordDiv from '../../../util/layout/RecordDiv.svelte';
  import Wrap from '../../../util/layout/Wrap.svelte';
  import DeclareEditor from '../../../util/monaco/DeclareEditor.svelte';
  import DialogHeader from '../DialogHeader.svelte';

  $: workspace = WorkspaceState.getWorkspace($workspaceStore);

  onMount(async () => {
    $uiStore.shortcutEvent = (e) => {
      if (e.key === 'Escape') {
        $uiStore.dialog = null;
      }
    };
  });
</script>

<div class="frame">
  <DialogHeader title={'#declare'} />
  <RecordDiv surplus={30}>
    <Wrap>
      <DeclareEditor
        value={workspace.declare.source}
        onChange={(v) => (workspace.declare.source = v)}
      />
    </Wrap>
  </RecordDiv>
</div>

<style>
  .frame {
    display: inline-block;
    position: relative;
    margin: 8px 0 0 8px;
    width: calc(100% - 16px);
    height: calc(100% - 16px);
  }
</style>
