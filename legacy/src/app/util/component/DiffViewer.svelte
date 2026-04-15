<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import type * as Monaco from "monaco-editor";
    import MonacoFactory from "../monaco/monacoFactory";

    export let original: string;
    export let current: string;
    export let language: string = "plaintext";

    let container: HTMLDivElement;

    let diffEditor: Monaco.editor.IStandaloneDiffEditor | null = null;
    let originalModel: Monaco.editor.ITextModel | null = null;
    let modifiedModel: Monaco.editor.ITextModel | null = null;

    onMount(async () => {
        const monaco = await MonacoFactory.createMonaco();
        diffEditor = monaco.editor.createDiffEditor(container, {
            readOnly: true,
            automaticLayout: true,
            renderSideBySide: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
        });

        originalModel = monaco.editor.createModel(
            original,
            language,
        ) as Monaco.editor.ITextModel;
        modifiedModel = monaco.editor.createModel(
            current,
            language,
        ) as Monaco.editor.ITextModel;

        diffEditor?.setModel({
            original: originalModel,
            modified: modifiedModel,
        });
    });

    // original / current が変わった場合の更新
    $: if (diffEditor && originalModel && modifiedModel) {
        originalModel.setValue(original);
        modifiedModel.setValue(current);
    }

    onDestroy(() => {
        diffEditor?.dispose();
        originalModel?.dispose();
        modifiedModel?.dispose();
    });
</script>

<div bind:this={container} class="diff-container"></div>

<style>
    .diff-container {
        width: 100%;
        height: 100%;
    }
</style>
