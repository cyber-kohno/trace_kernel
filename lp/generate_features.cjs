const fs = require('fs');
const path = require('path');

const srcFile = path.join(__dirname, '../ai_context/spec/02_機能概要.txt');
const destFile = path.join(__dirname, 'src/pages/features.astro');
const imgSourceDir = path.join(__dirname, '../ai_context/spec/screen_shot');
const imgDestDir = path.join(__dirname, 'public/screen_shot');

// 1. 画像フォルダのコピー
if (!fs.existsSync(imgDestDir)) {
    fs.mkdirSync(imgDestDir, { recursive: true });
}
const files = fs.readdirSync(imgSourceDir);
for (const file of files) {
    fs.copyFileSync(path.join(imgSourceDir, file), path.join(imgDestDir, file));
}

// 2. Astroファイルの生成
const lines = fs.readFileSync(srcFile, 'utf8').split(/\r?\n/);

const keywords = [
    'ワークスペース管理画面', 'プログラムコードエディタ', 'トランザクションダイアログ',
    'ワークスペース', 'コンテキストツリー', '詳細編集画面', 
    '環境変数', '静的なリソース', '動的リソース', '遅延ロード', 
    'Runtime auto', 'Direct choose', 'Flat', 'Tree', 'Transfer', 
    'プログレスバー', 'モニター', 
    'トランザクション', '仮想FS', '論理整合', 'コンテキスト要素', 
    'スクリプト引数', 'コマンドライン引数',
    'チャンネルAPI', 'ストリーム', 'テーブル形式',
    'enable', 'error'
];
keywords.sort((a, b) => b.length - a.length);

let toc = [];
let contentHtml = [];
let h2Count = 0;

for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (line.startsWith('■')) {
        let title = line.substring(1).trim();
        let id = 'section-' + (++h2Count);
        toc.push({ id, title });
        contentHtml.push(`</div><h2 id="${id}" class="feature-heading">${title}</h2><div class="section-content">`);
    } else if (line.startsWith('screen_shot/')) {
        let filename = line.split('/')[1];
        contentHtml.push(`<div class="feature-img-wrapper"><img src="/screen_shot/${filename}" alt="screenshot" loading="lazy" /></div>`);
    } else {
        if (!line.trim()) {
            contentHtml.push('<br/>');
            continue;
        }
        let processedLine = line;
        
        // Astro (JSX) および HTML 解析エラーを防ぐためのエスケープ処理
        processedLine = processedLine.replace(/&/g, '&amp;')
                                     .replace(/</g, '&lt;')
                                     .replace(/>/g, '&gt;')
                                     .replace(/{/g, '&#123;')
                                     .replace(/}/g, '&#125;');
        
        if (!line.trim().startsWith('//') && 
            !line.trim().startsWith('const ') && 
            !line.trim().startsWith('tx.') &&
            !line.trim().startsWith('$fs.') &&
            !line.trim().startsWith('for(')) {
            
            keywords.forEach(kw => {
                const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                try {
                    processedLine = processedLine.replace(new RegExp(`(?<!<strong class="feature-kw">)${escaped}(?!</strong>)`, 'g'), `<strong class="feature-kw">${kw}</strong>`);
                } catch(e) {}
            });
        }
        contentHtml.push(`<span>${processedLine}</span><br/>`);
    }
}

// remove opening tag imbalance
let contentStr = contentHtml.join('\n      ');
if (contentStr.startsWith('</div>')) {
    contentStr = contentStr.substring(6);
}
contentStr += '</div>';

const astroContent = `---
import Layout from '../layouts/Layout.astro';

const toc = ${JSON.stringify(toc)};
---

<Layout title="Features - Trace Kernel">
  <div class="features-layout">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-content">
        <h3>Contents</h3>
        <nav id="toc">
          <ul>
            {toc.map(item => (
              <li><a href={\`#\${item.id}\`} class="toc-link" data-target={item.id}>{item.title}</a></li>
            ))}
          </ul>
        </nav>
      </div>
    </aside>
    
    <!-- Main Content -->
    <main class="main-content">
      <div class="content-wrapper">
        <h1 class="page-title">Trace Kernel - 機能概要</h1>
        ${contentStr}
      </div>
    </main>
  </div>
</Layout>

<style>
  html {
    scroll-behavior: smooth;
  }
  .features-layout {
    display: flex;
    max-width: 1400px;
    margin: 0 auto;
    align-items: flex-start;
  }
  .sidebar {
    position: sticky;
    top: 64px;
    width: 300px;
    height: calc(100vh - 64px);
    overflow-y: auto;
    background-color: var(--bg-surface);
    border-right: 1px solid rgba(255, 255, 255, 0.05);
    padding: 2rem;
  }
  .sidebar-content h3 {
    margin-top: 0;
    margin-bottom: 1.5rem;
    font-size: 1.1rem;
    color: var(--text-color);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .sidebar-content ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .sidebar-content li {
    margin-bottom: 0.8rem;
  }
  .toc-link {
    display: block;
    color: var(--text-muted);
    text-decoration: none;
    font-size: 0.95rem;
    line-height: 1.5;
    transition: color 0.2s;
    position: relative;
    padding-left: 14px;
  }
  .toc-link::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background-color: transparent;
    transition: background-color 0.2s;
    border-radius: 4px;
  }
  .toc-link:hover {
    color: var(--text-color);
  }
  .toc-link.active {
    color: var(--accent);
    font-weight: 600;
  }
  .toc-link.active::before {
    background-color: var(--accent);
  }

  /* Custom scrollbar for sidebar */
  .sidebar::-webkit-scrollbar {
    width: 6px;
  }
  .sidebar::-webkit-scrollbar-track {
    background: transparent;
  }
  .sidebar::-webkit-scrollbar-thumb {
    background-color: rgba(255,255,255,0.1);
    border-radius: 10px;
  }

  .main-content {
    flex: 1;
    padding: 3rem 4rem;
    max-width: 1000px;
  }
  .content-wrapper {
    font-size: 1.1rem;
    line-height: 1.8;
    color: var(--text-muted);
  }
  .page-title {
    font-size: 2.8rem;
    margin-bottom: 1rem;
    color: var(--text-color);
  }
  .feature-heading {
    font-size: 2rem;
    margin-top: 5rem;
    margin-bottom: 1.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    color: var(--text-color);
    scroll-margin-top: 100px; /* Header offset */
  }
  .section-content {
    margin-bottom: 3rem;
  }
  .feature-img-wrapper {
    margin: 2rem 0;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 15px 35px -10px rgba(0,0,0,0.5);
    border: 1px solid rgba(255,255,255,0.1);
    background-color: #000;
  }
  .feature-img-wrapper img {
    max-width: 100%;
    display: block;
  }
  .feature-kw {
    color: var(--accent);
    font-weight: 600;
  }
</style>

<script>
  document.addEventListener('DOMContentLoaded', () => {
    const headings = document.querySelectorAll('h2.feature-heading');
    const tocLinks = document.querySelectorAll('.toc-link');

    const observer = new IntersectionObserver((entries) => {
      // Find the most visible heading based on intersection
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const currentId = entry.target.getAttribute('id');
          tocLinks.forEach(link => {
            if (link.getAttribute('data-target') === currentId) {
              link.classList.add('active');
            } else {
              link.classList.remove('active');
            }
          });
        }
      });
    }, {
      rootMargin: '-10% 0px -80% 0px' 
      // トリガー判定：画面上部から10%〜20%の位置にh2が来た時をアクティブとする
    });

    headings.forEach(h => observer.observe(h));
  });
</script>
`;

fs.writeFileSync(destFile, astroContent);
console.log('generated features.astro and copied images');
