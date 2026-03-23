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
  export let injectionDefs: string[];
  export let declareSource: string;
  export let setError: (flg: boolean) => void;
  export let initDone: () => void;

  export let executeAction: () => void = () => {};

  const LANGUAGE = "typescript";
  let hasError = writable(false);

  const uid = ""; //crypto.randomUUID();
  const themeName = `theme-${uid}`;

  let typescript: any | null = null;
  let injectionModel: any = null;
  let declareModel: any = null;

  let monaco: any;
  let userModel: any;
  let analysisModel: any;
  let runtimeDecorations: string[] = [];

  export const setRuntimeErrorMarker = (
    pos: { line: number; column: number },
    message: string,
  ) => {
    if (!userModel || !monaco) return;

    setError(true);
    runtimeDecorations = editor.deltaDecorations(runtimeDecorations, [
      {
        range: new monaco.Range(
          pos.line,
          1,
          pos.line,
          userModel.getLineLength(pos.line) + 1,
        ),
        options: {
          isWholeLine: true,
          className: "runtime-error-line",
          hoverMessage: { value: `**Runtime Error**\n\n${message}` },
        },
      },
    ]);

    const lineLength = userModel.getLineLength(pos.line);

    monaco.editor.setModelMarkers(userModel, "runtime", [
      {
        severity: monaco.MarkerSeverity.Error,
        message,
        startLineNumber: pos.line,
        startColumn: 1,
        endLineNumber: pos.line,
        endColumn: lineLength + 1,
      },
    ]);
  };

  const clearRuntimeMarkers = () => {
    if (!userModel || !monaco) return;
    monaco.editor.setModelMarkers(userModel, "runtime", []);
    runtimeDecorations = editor.deltaDecorations(runtimeDecorations, []);
  };

  onMount(async () => {
    if (!editorDiv) return;

    (loader as any).__reset?.();
    loader.config({
      paths: {
        vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs",
      },
    });

    // monaco = await loader.init();
    monaco = await MonacoFactory.createMonaco();

    typescript = monaco.languages.typescript as any;

    typescript.typescriptDefaults.setCompilerOptions({
      ...typescript.typescriptDefaults.getCompilerOptions(),
    });

    // typescript.typescriptDefaults.setCompilerOptions({
    //   target: monaco.languages.typescript.ScriptTarget.ES2020,
    //   module: monaco.languages.typescript.ModuleKind.ESNext,

    //   // 🔴 ここが最重要
    //   lib: ["es2020"], // ← "dom" を絶対に入れない

    //   strict: true,
    //   noEmit: true,
    // });

    typescript.typescriptDefaults.setEagerModelSync(true);

    const userUri = monaco.Uri.parse(`inmemory://user-${uid}.ts`);
    const analysisUri = monaco.Uri.parse(`inmemory://analysis-${uid}.ts`);

    const makeWrapped = (code: string) => `
      async function __run() {
        ${code}
      }
    `;

    typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
    });

    injectionModel = monaco.editor.createModel(
      injectionDefs.join("\n"),
      "typescript",
      monaco.Uri.parse("file:///__externals__/injection.d.ts"),
    );

    declareModel = monaco.editor.createModel(
      declareSource,
      "typescript",
      monaco.Uri.parse("file:///__externals__/declare.d.ts"),
    );

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
      // ランタイムエラーのマーカー削除
      clearRuntimeMarkers();

      const code = userModel.getValue();
      onChange(code);

      analysisModel.setValue(makeWrapped(code));
    });

    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.Enter, () => {
      executeAction();
    });

    const service = await MonacoFactory.getService(monaco, analysisModel.uri);

    const runDiagnostics = async () => {
      const diagnostics = [
        ...(await service.getSyntacticDiagnostics(
          analysisModel.uri.toString(),
        )),
        ...(await service.getSemanticDiagnostics(analysisModel.uri.toString())),
      ];

      const offsetLine = 2; // async function + '{'

      const markers = diagnostics
        .filter((d: any) => typeof d.start === "number")
        .map((d: any) => {
          const startPos = analysisModel.getPositionAt(d.start);
          const endPos = analysisModel.getPositionAt(d.start + (d.length ?? 0));

          return {
            severity: monaco.MarkerSeverity.Error,
            message:
              typeof d.messageText === "string"
                ? d.messageText
                : d.messageText.messageText,

            startLineNumber: Math.max(1, startPos.lineNumber - offsetLine),
            startColumn: startPos.column,
            endLineNumber: Math.max(1, endPos.lineNumber - offsetLine),
            endColumn: endPos.column,
          };
        });

      monaco.editor.setModelMarkers(userModel, "user", markers);

      const hasErr = markers.length > 0;
      $hasError = hasErr;
      setError(hasErr);
    };

    await runDiagnostics();

    editor.onDidChangeModelContent(async () => {
      const code = userModel.getValue();
      onChange(code);

      analysisModel.setValue(makeWrapped(code));

      await runDiagnostics();
    });

    // Monaco Editor初期化完了時の処理
    initDone();
  });

  onDestroy(() => {
    editor.dispose();
    userModel.dispose();
    analysisModel.dispose();
    injectionModel.dispose();
    declareModel.dispose();
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
