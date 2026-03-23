<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import loader from "@monaco-editor/loader";
  import * as Monaco from "monaco-editor";
  import { get, writable } from "svelte/store";
  import store from "../../store/store";
  import MonacoFactory from "./monacoFactory";

  let editorDiv: HTMLDivElement | null = null;
  let editor: Monaco.editor.IStandaloneCodeEditor;

  export let value;
  export let onChange: (value: string) => void;

  const LANGUAGE = "typescript";
  let hasError = writable(false);

  const uid = ""; //crypto.randomUUID();
  const themeName = `theme-${uid}`;

  let typescript: any | null = null;

  let monaco: any;
  let userModel: any;
  let analysisModel: any;

  onMount(async () => {
    if (!editorDiv) return;

    (loader as any).__reset?.();
    loader.config({
      paths: {
        vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs",
      },
    });

    monaco = await MonacoFactory.createMonaco();

    typescript = monaco.languages.typescript as any;

    typescript.typescriptDefaults.setCompilerOptions({
      ...typescript.typescriptDefaults.getCompilerOptions(),
    });

    typescript.typescriptDefaults.setEagerModelSync(true);

    const userUri = monaco.Uri.parse(`inmemory://user-${uid}.ts`);
    const analysisUri = monaco.Uri.parse(`inmemory://analysis-${uid}.ts`);

    const makeWrapped = (code: string) => code;

    typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
    });

    userModel = MonacoFactory.getUserModel(userUri, value);
    analysisModel = MonacoFactory.getAnalysisModel(
      makeWrapped,
      analysisUri,
      value,
    );

    // 🟦 テーマ定義
    monaco.editor.defineTheme(themeName, {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {},
    });

    const fontSize = get(store).setting.monacoFontSize;
    editor = monaco.editor.create(editorDiv, {
      // value,
      model: userModel,
      language: LANGUAGE,
      theme: themeName,
      automaticLayout: true,
      fontSize,
    });

    editor.onDidChangeModelContent(() => {

      const code = userModel.getValue();
      onChange(code);

      analysisModel.setValue(makeWrapped(code));
    });

    const service = await MonacoFactory.getService(monaco, analysisModel.uri);

    const runDiagnostics = async () => {
      const diagnostics = [
        ...(await service.getSyntacticDiagnostics(
          analysisModel.uri.toString(),
        )),
        ...(await service.getSemanticDiagnostics(analysisModel.uri.toString())),
      ];
    };

    await runDiagnostics();

    editor.onDidChangeModelContent(async () => {
      const code = userModel.getValue();
      onChange(code);

      analysisModel.setValue(makeWrapped(code));

      await runDiagnostics();
    });
  });

  onDestroy(() => {
    editor.dispose();
    userModel.dispose();
    analysisModel.dispose();
  });
</script>

<div bind:this={editorDiv} data--error={$hasError}></div>

<style>
  div {
    width: 100%;
    height: 100%;
    border: 3px solid rgb(0, 0, 0);
    box-sizing: border-box;
  }
  div[data--error="true"] {
    border: 3px solid red;
  }
  :global(.runtime-error-line) {
    background-color: rgba(255, 0, 0, 0.18);
  }
</style>
