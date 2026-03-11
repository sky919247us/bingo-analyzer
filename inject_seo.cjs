const fs = require('fs');
const path = require('path');

const seoData = {
    'bingo-latest.tsx': { title: '最新即時開獎', desc: '追蹤最新期數賓果開獎號碼與連莊動態。', kw: '賓果最新開獎, 賓果開獎號碼' },
    'bingo-statistics.tsx': { title: '統計分析與走勢圖', desc: '深度分析賓果賓果大小單雙盤路走勢、冷熱門獎號與雙贏拖號演算法。', kw: '賓果統計資料, 賓果走勢' },
    'bingo-prediction.tsx': { title: 'AI 號碼預測', desc: '多星數賓果AI預測模型，包含追熱、補冷與跳期規律策略推薦。', kw: '賓果預測, 賓果報牌' },
    'bingo-records.tsx': { title: '預測兌獎記錄', desc: '全面追蹤並檢驗過去所有專注賓果中獎與預測的歷史紀錄。', kw: '歷史開獎記錄, 預測驗證' },
    'bingo-distribution.tsx': { title: '獎號分布走勢', desc: '統整80顆賓果號碼的開獎分佈圖，掌握冷熱趨勢與超級獎號落點。', kw: '號碼分佈圖, 獎號分析' },
    'dashboard-large.tsx': { title: '門市大螢幕看板', desc: '專為彩券行與分析愛好者打造的滿版即時開獎儀表板，一目了然看盤無干擾。', kw: '賓果大螢幕, 店面看盤' },
    'dashboard.tsx': { title: '總覽儀表板', desc: '刮刮研究室的全方位數據總覽，快速瀏覽開獎概況與趨勢。', kw: '刮刮研究室, 大盤數據' },
    'calculator.tsx': { title: '中獎計算器', desc: '各種星數、倍數與玩法的獎金精算與投資報酬評估工具。', kw: '賓果中獎計算, 獎金試算' },
    'prize-table-page.tsx': { title: '各星玩法獎金表', desc: '台灣彩券賓果賓果1星至10星完整中獎機率與固定彩金對照表。', kw: '賓果機率, 賓果獎金' },
    'backtest.tsx': { title: '歷史回測實驗室', desc: '使用歷屆數萬期真實開獎數據進行你的專屬打法與策略回測。', kw: '策略回測, 量化分析' },
    'simulation.tsx': { title: '蒙地卡羅模擬', desc: '利用蒙地卡羅隨機演算法，預演長時間投注下各種資金池與風險管控測試。', kw: '蒙地卡羅, 資金管控' }
};

let injectedCount = 0;
for (const [file, data] of Object.entries(seoData)) {
    const fullPath = path.join(__dirname, 'src', 'pages', file);
    if (fs.existsSync(fullPath)) {
        let content = fs.readFileSync(fullPath, 'utf8');
        if (!content.includes('useSeo')) {
            content = "import { useSeo } from '../hooks/useSeo';\n" + content;
            
            // 尋找 export default function 組件宣告
            const funcRegex = /export\s+default\s+function\s+[A-Za-z0-9_]+\s*\([^)]*\)\s*\{/;
            const match = content.match(funcRegex);
            if (match) {
                const insertPos = match.index + match[0].length;
                const hookCall = `\n    useSeo({ title: '${data.title}', description: '${data.desc}', keywords: '${data.kw}' });`;
                content = content.slice(0, insertPos) + hookCall + content.slice(insertPos);
                fs.writeFileSync(fullPath, content);
                injectedCount++;
            }
        }
    }
}
console.log(`Successfully injected useSeo into ${injectedCount} pages.`);
