// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  integrations: [
    starlight({
      title: 'Trace Kernel',
      description: 'TypeScriptを、日常の問題解決に使うための実行基盤。',
      favicon: '/favicon.svg',
      logo: {
        src: './src/assets/logo.svg',
      },
      customCss: ['./src/styles/starlight.css'],
      tableOfContents: {
        minHeadingLevel: 2,
        maxHeadingLevel: 4,
      },
      sidebar: [
        {
          label: 'Overview',
          items: [
            { slug: 'index', label: 'Trace Kernelとは' },
            { slug: 'overview/philosophy', label: '理念' },
            { slug: 'overview/workflow', label: '基本ワークフロー' },
          ],
        },
        {
          label: 'Guide',
          items: [
            { slug: 'guide/workspace', label: 'ワークスペース' },
            { slug: 'guide/context', label: 'コンテキスト' },
            { slug: 'guide/program', label: 'プログラムを書く' },
            { slug: 'guide/transaction', label: 'トランザクション' },
          ],
        },
        {
          label: 'API Reference',
          items: [
            { slug: 'reference/api-overview', label: 'API概要' },
            { slug: 'reference/fs', label: '$fs' },
            { slug: 'reference/channel', label: '$channel' },
            { slug: 'reference/state', label: '$state' },
            { slug: 'reference/parser-net-runtime', label: '$parser / $net / $runtime' },
          ],
        },
        {
          label: 'Recipes',
          items: [
            { slug: 'recipes/file-batch', label: 'ファイル一括処理' },
          ],
        },
      ],
    }),
  ],
});
