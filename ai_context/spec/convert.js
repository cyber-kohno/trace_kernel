const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '02_機能概要.txt');
const destPath = path.join(__dirname, '02_機能概要.md');

let lines = fs.readFileSync(srcPath, 'utf8').split(/\r?\n/);

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

let newLines = [];
newLines.push('# Trace Kernel 機能概要\n');

for (let line of lines) {
    if (line.startsWith('■')) {
        newLines.push('\n## ' + line.substring(1));
    } else if (line.startsWith('screen_shot/')) {
        let name = line.replace('screen_shot/', '').split('.')[0];
        // プレビュー用に改行を調整して画像を挿入
        newLines.push('');
        newLines.push(`![${name}](${line})`);
        newLines.push('');
    } else {
        let processedLine = line;
        // プログラムの部分はなるべく色付けを避ける
        if (!line.trim().startsWith('//') && 
            !line.trim().startsWith('const ') && 
            !line.trim().startsWith('tx.') &&
            !line.trim().startsWith('$fs.') &&
            !line.trim().startsWith('for(')) {
            
            keywords.forEach(kw => {
                const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                try {
                    processedLine = processedLine.replace(new RegExp(`(?<!\\*\\*)${escaped}(?!\\*\\*)`, 'g'), `**${kw}**`);
                } catch(e) {
                    // ignore unsupported regex
                }
            });
        }
        newLines.push(processedLine);
    }
}

fs.writeFileSync(destPath, newLines.join('\n'), 'utf8');
console.log('Conversion successful.');
