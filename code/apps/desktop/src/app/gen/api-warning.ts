import type WorkspaceState from '../state/model/workspace/workspace-state';

type ApiDiff = {
  from: string;
  to: string;
};

type Props = {
  handlePath: string;
  workspace: WorkspaceState.Props;
  snapshot: WorkspaceState.SnapshotLog;
  apiDiff: ApiDiff;
};

export type ApiWarningState = {
  handlePath: string;
  workspace: WorkspaceState.Props;
  snapshot: WorkspaceState.SnapshotLog;
  apiDiff: ApiDiff;
  markdown: string;
  html: string;
};

const markdownFiles = import.meta.glob('./api-changelog/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const escapeHtml = (value: string) => {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
};

const renderInline = (line: string) => {
  return escapeHtml(line)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
};

const renderMarkdown = (markdown: string) => {
  const lines = markdown.replaceAll('\r\n', '\n').split('\n');
  const html: string[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let codeLines: string[] = [];
  let inCodeBlock = false;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    html.push(`<p>${paragraph.map(renderInline).join('<br />')}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    html.push(`<ul>${listItems.join('')}</ul>`);
    listItems = [];
  };

  const flushCode = () => {
    if (!inCodeBlock) return;
    html.push(
      `<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`,
    );
    codeLines = [];
    inCodeBlock = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.startsWith('```')) {
      flushParagraph();
      flushList();
      if (inCodeBlock) {
        flushCode();
      } else {
        inCodeBlock = true;
        codeLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(rawLine);
      continue;
    }

    if (line === '') {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading != null) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    const list = line.match(/^-\s+(.*)$/);
    if (list != null) {
      flushParagraph();
      listItems.push(`<li>${renderInline(list[1])}</li>`);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  flushCode();

  return html.join('\n');
};

const getMarkdownKey = (from: number, to: number) => {
  return `./api-changelog/${from}-to-${to}.md`;
};

const loadMarkdown = (apiDiff: ApiDiff) => {
  const from = Number(apiDiff.from);
  const to = Number(apiDiff.to);
  const sections: string[] = [];

  for (let current = from; current < to; current++) {
    const next = current + 1;
    const key = getMarkdownKey(current, next);
    const content = markdownFiles[key];
    if (content != null) {
      sections.push(content.trim());
    }
  }

  if (sections.length > 0) {
    return sections.join('\n\n---\n\n');
  }

  return [
    '# API Changes',
    '',
    `- Workspace API generation: ${apiDiff.from}`,
    `- Current app API generation: ${apiDiff.to}`,
    '',
    'No changelog file was found for this API generation range.',
  ].join('\n');
};

const createApiWarningState = async ({
  handlePath,
  workspace,
  snapshot,
  apiDiff,
}: Props): Promise<ApiWarningState> => {
  const markdown = loadMarkdown(apiDiff);
  return {
    handlePath,
    workspace,
    snapshot,
    apiDiff,
    markdown,
    html: renderMarkdown(markdown),
  };
};

export default createApiWarningState;
