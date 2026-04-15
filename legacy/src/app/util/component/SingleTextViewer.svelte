<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import type * as Monaco from "monaco-editor";
    import MonacoFactory from "../monaco/monacoFactory";

    export let content: string;
    export let language: string = "plaintext";

    let container: HTMLDivElement;
    let editor: Monaco.editor.IStandaloneCodeEditor | null = null;
    let model: Monaco.editor.ITextModel | null = null;

    onMount(async () => {
        const monaco = await MonacoFactory.createMonaco();

        editor = monaco.editor.create(container, {
            readOnly: true,
            automaticLayout: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            value: content,
            language
        }) as Monaco.editor.IStandaloneCodeEditor;

        model = editor.getModel();
    });

    $: if (model) {
        model.setValue(content);
    }

    onDestroy(() => {
        editor?.dispose();
        model?.dispose();
    });
</script>

<div bind:this={container} class="editor-container"></div>

<style>
.editor-container {
    width: 100%;
    height: 100%;
}
</style>