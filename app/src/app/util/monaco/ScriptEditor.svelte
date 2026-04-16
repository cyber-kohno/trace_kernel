<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import loader from '@monaco-editor/loader';
  import * as Monaco from 'monaco-editor';
  import { get, writable } from 'svelte/store';
  import appStore from '../../store/app-store';
  import MonacoFactory from './monaco-factory';
  import { restrictedGlobals } from './restricted-globals';

  let editorDiv: HTMLDivElement | null = null;
  let editor: Monaco.editor.IStandaloneCodeEditor;

  export let value;
  export let onChange: (value: string) => void;
  export let injectionDefs: string[];
  export let declareSource: string;
  export let setError: (flg: boolean) => void;
  export let initDone: () => void;

  export let executeAction: () => void = () => {};

  const LANGUAGE = 'typescript';
  let hasError = writable(false);

  const uid = ''; //crypto.randomUUID();
  const themeName = `theme-${uid}`;

  let typescript: any | null = null;
  let injectionModel: any = null;
  let declareModel: any = null;

  let monaco: any;
  let userModel: any;
  let analysisModel: any;
  let runtimeDecorations: string[] = [];
  const unusedTag = Monaco.MarkerTag.Unnecessary;

  const toMarkerSeverity = (diagnostic: any) => {
    if (diagnostic.reportsUnnecessary) {
      return monaco.MarkerSeverity.Hint;
    }

    const category = diagnostic.category;
    switch (category) {
      case 0:
        return monaco.MarkerSeverity.Warning;
      case 2:
        return monaco.MarkerSeverity.Hint;
      case 3:
        return monaco.MarkerSeverity.Info;
      case 1:
      default:
        return monaco.MarkerSeverity.Error;
    }
  };

  const getRestrictedGlobalMarkers = (code: string) => {
    if (!monaco) return [];

    return monaco.editor
      .tokenize(code, LANGUAGE)
      .flatMap((lineTokens: any[], lineIndex: number) => {
        const lineNumber = lineIndex + 1;
        const lineText = userModel.getLineContent(lineNumber);

        return lineTokens.flatMap((token: any, tokenIndex: number) => {
          const startColumn = token.offset + 1;
          const endColumn =
            tokenIndex + 1 < lineTokens.length
              ? lineTokens[tokenIndex + 1].offset + 1
              : lineText.length + 1;
          const tokenText = lineText
            .slice(startColumn - 1, endColumn - 1)
            .trim();
          const prevChar = lineText[startColumn - 2] ?? '';

          const restricted = restrictedGlobals.find(
            (entry) => entry.name === tokenText,
          );
          if (!restricted) return [];

          const isIdentifierToken =
            typeof token.type === 'string' && token.type.includes('identifier');
          if (!isIdentifierToken) return [];

          if (prevChar === '.') return [];

          return [
            {
              severity: monaco.MarkerSeverity.Error,
              message: restricted.message,
              startLineNumber: lineNumber,
              startColumn,
              endLineNumber: lineNumber,
              endColumn,
            },
          ];
        });
      });
  };

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
          className: 'runtime-error-line',
          hoverMessage: { value: `**Runtime Error**\n\n${message}` },
        },
      },
    ]);

    const lineLength = userModel.getLineLength(pos.line);

    monaco.editor.setModelMarkers(userModel, 'runtime', [
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
    monaco.editor.setModelMarkers(userModel, 'runtime', []);
    runtimeDecorations = editor.deltaDecorations(runtimeDecorations, []);
  };

  onMount(async () => {
    if (!editorDiv) return;

    (loader as any).__reset?.();
    loader.config({
      paths: {
        vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs',
      },
    });

    monaco = await MonacoFactory.createMonaco();

    typescript = monaco.languages.typescript as any;
    MonacoFactory.configureTypeScriptDefaults(monaco);

    const userUri = monaco.Uri.parse(`inmemory://user-${uid}.ts`);
    const analysisUri = monaco.Uri.parse(`inmemory://analysis-${uid}.ts`);

    const makeWrapped = (code: string) =>
      `async function __run() {\n${code}\n}`;

    typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
    });

    injectionModel = monaco.editor.createModel(
      injectionDefs.join('\n'),
      'typescript',
      monaco.Uri.parse('file:///__externals__/injection.d.ts'),
    );

    declareModel = monaco.editor.createModel(
      declareSource,
      'typescript',
      monaco.Uri.parse('file:///__externals__/declare.d.ts'),
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

    const fontSize = get(appStore).setting.monacoFontSize;
    editor = monaco.editor.create(editorDiv, {
      // value,
      model: userModel,
      language: LANGUAGE,
      theme: themeName,
      automaticLayout: true,
      fontSize,
      showUnused: true,
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
      const code = userModel.getValue();
      const diagnostics = [
        ...(await service.getSyntacticDiagnostics(
          analysisModel.uri.toString(),
        )),
        ...(await service.getSemanticDiagnostics(analysisModel.uri.toString())),
        ...(await service.getSuggestionDiagnostics(
          analysisModel.uri.toString(),
        )),
      ];

      const offsetLine = 1; // async function line before user code

      const markers = diagnostics
        .filter((d: any) => typeof d.start === 'number')
        .map((d: any) => {
          const startPos = analysisModel.getPositionAt(d.start);
          const endPos = analysisModel.getPositionAt(d.start + (d.length ?? 0));

          return {
            severity: toMarkerSeverity(d),
            message:
              typeof d.messageText === 'string'
                ? d.messageText
                : d.messageText.messageText,

            startLineNumber: Math.max(1, startPos.lineNumber - offsetLine),
            startColumn: startPos.column,
            endLineNumber: Math.max(1, endPos.lineNumber - offsetLine),
            endColumn: endPos.column,
            tags: d.reportsUnnecessary ? [unusedTag] : [],
          };
        });

      markers.push(...getRestrictedGlobalMarkers(code));
      monaco.editor.setModelMarkers(userModel, 'user', markers);

      const hasErr = markers.some(
        (marker: any) =>
          marker.severity === monaco.MarkerSeverity.Error &&
          !(marker.tags ?? []).includes(unusedTag),
      );
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
  div[data--error='true'] {
    border: 3px solid red;
  }
  :global(.runtime-error-line) {
    background-color: rgba(255, 0, 0, 0.18);
  }
</style>
