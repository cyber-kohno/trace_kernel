<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import loader from '@monaco-editor/loader';
  import * as Monaco from 'monaco-editor';
  import { get, writable } from 'svelte/store';
  import { appStore } from '../../state/store';
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
  export let analysisMode: 'wrapped' | 'module' = 'wrapped';
  export let extraMarkers: {
    severity?: number;
    message: string;
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  }[] = [];

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
  const MAX_NAVIGATION_HISTORY = 50;

  type NavigationEntry = {
    model: Monaco.editor.ITextModel;
    selection: Monaco.Selection;
    scrollTop: number;
    scrollLeft: number;
  };

  const navigationHistory: NavigationEntry[] = [];
  let pendingCtrlClickNavigationEntry: NavigationEntry | null = null;

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

  const getNavigationEntry = (): NavigationEntry | null => {
    const model = editor.getModel();
    const selection = editor.getSelection();
    if (model == null || selection == null) return null;

    return {
      model,
      selection,
      scrollTop: editor.getScrollTop(),
      scrollLeft: editor.getScrollLeft(),
    };
  };

  const isSameNavigationEntry = (
    a: NavigationEntry | null,
    b: NavigationEntry | null,
  ) => {
    if (a == null || b == null) return false;
    return (
      a.model.uri.toString() === b.model.uri.toString() &&
      a.selection.equalsSelection(b.selection)
    );
  };

  const pushNavigationHistory = (entry: NavigationEntry) => {
    const current = navigationHistory[navigationHistory.length - 1] ?? null;
    if (isSameNavigationEntry(current, entry)) return;

    navigationHistory.push(entry);
    if (navigationHistory.length > MAX_NAVIGATION_HISTORY) {
      navigationHistory.shift();
    }
  };

  const restoreNavigationEntry = (entry: NavigationEntry | undefined) => {
    if (entry == null || entry.model.isDisposed()) return;

    if (editor.getModel() !== entry.model) {
      editor.setModel(entry.model);
    }

    editor.setSelection(entry.selection);
    editor.revealRangeInCenterIfOutsideViewport(entry.selection);
    editor.setScrollPosition({
      scrollTop: entry.scrollTop,
      scrollLeft: entry.scrollLeft,
    });
    editor.focus();
  };

  const pushNavigationHistoryIfMoved = (before: NavigationEntry | null) => {
    if (before == null) return;

    const after = getNavigationEntry();
    if (!isSameNavigationEntry(before, after)) {
      pushNavigationHistory(before);
    }
  };

  const scheduleNavigationHistoryCheck = (
    before: NavigationEntry | null,
    delays: number[] = [100],
  ) => {
    let pushed = false;
    delays.forEach((delay) => {
      setTimeout(() => {
        if (pushed) return;

        const lengthBefore = navigationHistory.length;
        pushNavigationHistoryIfMoved(before);
        pushed = navigationHistory.length > lengthBefore;
      }, delay);
    });
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
    const toAnalysisCode = (code: string) =>
      analysisMode === 'wrapped' ? makeWrapped(code) : code;

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
      toAnalysisCode,
      analysisUri,
      value,
    );

    // テーマ定義
    monaco.editor.defineTheme(themeName, {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editorWidget.background': '#1e1e1e',
        'editorWidget.foreground': '#f0f0f0',
        'editorWidget.border': '#3c3c3c',
        'input.background': '#252526',
        'input.foreground': '#ffffff',
        'input.border': '#3c3c3c',
        'list.foreground': '#e6edf3',
        'list.activeSelectionBackground': '#094771',
        'list.activeSelectionForeground': '#ffffff',
        'list.inactiveSelectionBackground': '#37373d',
        'list.inactiveSelectionForeground': '#e6edf3',
        'list.hoverBackground': '#2a2d2e',
        'list.hoverForeground': '#ffffff',
        'list.focusBackground': '#094771',
        'list.focusForeground': '#ffffff',
        'peekView.border': '#2aa3ff',
        'peekViewTitle.background': '#1e1e1e',
        'peekViewTitleLabel.foreground': '#ffffff',
        'peekViewTitleDescription.foreground': '#cccccc',
        'peekViewResult.background': '#252526',
        'peekViewResult.fileForeground': '#ffffff',
        'peekViewResult.lineForeground': '#d4d4d4',
        'peekViewResult.selectionBackground': '#094771',
        'peekViewResult.selectionForeground': '#ffffff',
        'peekViewResult.matchHighlightBackground': '#613214',
        'peekViewEditor.background': '#001010',
        'peekViewEditorGutter.background': '#002b3d',
        'peekViewEditor.matchHighlightBackground': '#613214',
      },
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

      analysisModel.setValue(toAnalysisCode(code));
    });

    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.Enter, () => {
      executeAction();
    });
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.LeftArrow, () => {
      restoreNavigationEntry(navigationHistory.pop());
    });
    editor.onKeyDown((e) => {
      if (e.keyCode !== monaco.KeyCode.F12) return;

      const before = getNavigationEntry();
      scheduleNavigationHistoryCheck(before);
    });
    editor.onMouseDown((e) => {
      if (!e.event.leftButton) return;
      if (!e.event.ctrlKey && !e.event.metaKey) return;
      if (e.target.position == null) return;

      pendingCtrlClickNavigationEntry = getNavigationEntry();
    });
    editor.onMouseUp((e) => {
      if (!e.event.leftButton) return;
      if (pendingCtrlClickNavigationEntry == null) return;

      scheduleNavigationHistoryCheck(pendingCtrlClickNavigationEntry, [
        100, 300, 800,
      ]);
      pendingCtrlClickNavigationEntry = null;
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

      const offsetLine = analysisMode === 'wrapped' ? 1 : 0;

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
      markers.push(
        ...extraMarkers.map((marker) => ({
          severity: marker.severity ?? monaco.MarkerSeverity.Error,
          message: marker.message,
          startLineNumber: marker.startLineNumber,
          startColumn: marker.startColumn,
          endLineNumber: marker.endLineNumber,
          endColumn: marker.endColumn,
          tags: [],
        })),
      );
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

      analysisModel.setValue(toAnalysisCode(code));

      await runDiagnostics();
    });

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
  :global(.monaco-editor .rename-box .rename-input) {
    color: var(--vscode-input-foreground);
    caret-color: var(--vscode-input-foreground);
    background-color: var(--vscode-input-background);
  }
  :global(.monaco-editor .reference-zone-widget .ref-tree) {
    font-size: 13px;
  }
</style>
