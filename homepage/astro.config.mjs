// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  integrations: [
    starlight({
      title: 'Trace Kernel',
      description: 'TypeScriptを、日常の問題解決に使うための実行基盤。',
      favicon: '/favicon.svg',
      locales: {
        root: {
          label: '日本語',
          lang: 'ja',
        },
        en: {
          label: 'English',
          lang: 'en',
        },
      },
      defaultLocale: 'root',
      logo: {
        src: './src/assets/logo.svg',
      },
      components: {
        Header: './src/components/Header.astro',
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
            { slug: 'overview/philosophy', label: '通常の開発環境との違い' },
            { slug: 'overview/workflow', label: '基本ワークフロー' },
            { slug: 'overview/terminology', label: '用語と全体像' },
          ],
        },
        {
          label: 'Core Concepts',
          items: [
            { slug: 'core/workspace', label: 'ワークスペース' },
            { slug: 'core/work', label: 'work' },
            { slug: 'core/program', label: 'プログラムを書く' },
          ],
        },
        {
          label: 'Context',
          items: [
            { slug: 'context', label: '概要' },
            { slug: 'context/env', label: 'env' },
            { slug: 'context/resource', label: 'resource' },
            { slug: 'context/dataset', label: 'dataset' },
          ],
        },
        {
          label: 'API Reference',
          items: [
            { slug: 'reference/api-overview', label: 'API概要' },
            { slug: 'reference/print', label: '$print / $println' },
            { slug: 'reference/channel', label: '$channel' },
            { slug: 'reference/state', label: '$state' },
            {
              label: '$parser',
              items: [
                { slug: 'reference/parser', label: '概要' },
                { slug: 'reference/parser/dom', label: 'DOM' },
                { slug: 'reference/parser/excel', label: 'Excel' },
                { slug: 'reference/parser/table', label: 'Table' },
                { slug: 'reference/parser/json', label: 'JSON' },
              ],
            },
            { slug: 'reference/runtime', label: '$runtime' },
          ],
        },
        {
          label: 'Recipes',
          items: [
            { slug: 'recipes/file-batch', label: 'ログ/CSVを解析する' },
          ],
        },
        {
          label: 'Download',
          items: [
            { slug: 'download', label: 'ダウンロード' },
            { slug: 'download/compatibility', label: 'バージョン互換性' },
            { slug: 'download/release-notes', label: 'リリースノート' },
          ],
        },
        {
          label: 'Pro',
          items: [
            { slug: 'pro', label: 'Pro版とは' },
            { slug: 'pro/activate', label: 'アクティベート' },
            {
              label: 'Features',
              items: [
                { slug: 'pro/file-system', label: 'ファイル操作' },
                { slug: 'pro/process', label: '外部プログラム' },
                { slug: 'pro/logic', label: '共通ロジック' },
              ],
            },
            {
              label: 'Context',
              items: [
                { slug: 'pro/context/process', label: 'process' },
                { slug: 'pro/context/logic', label: 'logic' },
              ],
            },
            {
              label: 'API Reference',
              items: [
                { slug: 'pro/api/fs', label: '$fs' },
                { slug: 'pro/api/net', label: '$net' },
              ],
            },
            {
              label: 'Recipes',
              items: [
                { slug: 'pro/recipes/jar-vulnerability', label: 'jar脆弱性OSS検出' },
                { slug: 'pro/recipes/csv-daily-sort', label: 'CSV傾向別フォルダ分け' },
                { slug: 'pro/recipes/codebase-export', label: 'コードベース部分エクスポート' },
              ],
            },
          ],
        },
        {
          label: 'Legal',
          items: [
            { slug: 'legal/terms-license', label: '利用規約・ライセンス' },
            { slug: 'legal/disclaimer', label: '免責・利用上の注意' },
            { slug: 'legal/privacy', label: 'プライバシーポリシー' },
          ],
        },
      ],
    }),
  ],
});
