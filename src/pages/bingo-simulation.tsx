/**
 * 模擬投注頁面
 * 提供 1-80 號碼互動盤面，計算獎金與投注成本
 */
import { useState, useMemo } from 'react';

/** 各星等的參考獎金（單位：NT$） */
const PRIZE_TABLE: Record<number, { hitAll: number; description: string }> = {
    1: { hitAll: 15, description: '1 星：每注 NT$25，全中 15 元' },
    2: { hitAll: 60, description: '2 星：每注 NT$25，全中 60 元' },
    3: { hitAll: 300, description: '3 星：每注 NT$25，全中 300 元' },
    4: { hitAll: 1_500, description: '4 星：每注 NT$25，全中 1,500 元' },
    5: { hitAll: 10_000, description: '5 星：每注 NT$25，全中 10,000 元' },
    6: { hitAll: 50_000, description: '6 星：每注 NT$25，全中 50,000 元' },
    7: { hitAll: 200_000, description: '7 星：每注 NT$25，全中 200,000 元' },
    8: { hitAll: 400_000, description: '8 星：每注 NT$25，全中 400,000 元' },
    9: { hitAll: 1_200_000, description: '9 星：每注 NT$25，全中 1,200,000 元' },
    10: { hitAll: 5_000_000, description: '10 星：每注 NT$25，全中 5,000,000 元' },
};

export default function BingoSimulation() {
    const [selected, setSelected] = useState<Set<number>>(new Set());

    /** 點擊號碼球：新增或移除 */
    const toggleBall = (num: number) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(num)) {
                next.delete(num);
            } else {
                // 最多選 10 顆
                if (next.size >= 10) return prev;
                next.add(num);
            }
            return next;
        });
    };

    /** 清除所有選取 */
    const clearAll = () => setSelected(new Set());

    /** 目前星數 */
    const starCount = selected.size;

    /** 參考獎金資訊 */
    const prizeInfo = useMemo(() => {
        if (starCount === 0) return null;
        return PRIZE_TABLE[starCount] || null;
    }, [starCount]);

    return (
        <div className="animate-in">
            <h1 className="page-title">
                <span className="emoji-icon">🎮</span> 模擬投注
            </h1>

            {/* 選號盤面 */}
            <div className="glass-card" style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                    <h3 className="section-title" style={{ marginBottom: 0 }}>
                        選取號碼 ({starCount}/10)
                    </h3>
                    <button className="btn btn-secondary" onClick={clearAll}>
                        🗑️ 清除
                    </button>
                </div>

                <div className="bingo-board">
                    {Array.from({ length: 80 }, (_, i) => i + 1).map((num) => (
                        <div
                            key={num}
                            className={`bingo-ball${selected.has(num) ? ' selected' : ''}`}
                            onClick={() => toggleBall(num)}
                        >
                            {num}
                        </div>
                    ))}
                </div>
            </div>

            {/* 選取的號碼 */}
            {starCount > 0 && (
                <div className="glass-card" style={{ marginBottom: 20 }}>
                    <h3 className="section-title">✅ 已選號碼</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                        {Array.from(selected).sort((a, b) => a - b).map((num) => (
                            <div key={num} className="bingo-ball selected">{num}</div>
                        ))}
                    </div>

                    <div className="draw-stats-row">
                        <div className="draw-stat-item">
                            <span className="draw-stat-label">玩法</span>
                            <span className="draw-stat-value">{starCount} 星</span>
                        </div>
                        <div className="draw-stat-item">
                            <span className="draw-stat-label">每注金額</span>
                            <span className="draw-stat-value">NT$ 25</span>
                        </div>
                        {prizeInfo && (
                            <div className="draw-stat-item">
                                <span className="draw-stat-label">全中獎金</span>
                                <span className="draw-stat-value" style={{ color: 'var(--accent-yellow)' }}>
                                    NT$ {prizeInfo.hitAll.toLocaleString()}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* 獎金參考表 */}
            <div className="glass-card">
                <h3 className="section-title">💰 獎金參考表</h3>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>玩法</th>
                            <th>全中獎金</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Object.entries(PRIZE_TABLE).map(([star, info]) => (
                            <tr key={star} style={parseInt(star) === starCount ? { background: 'rgba(0, 255, 135, 0.05)' } : {}}>
                                <td>
                                    <span style={parseInt(star) === starCount ? { color: 'var(--accent-green)', fontWeight: 700 } : {}}>
                                        {star} 星
                                    </span>
                                </td>
                                <td>
                                    <span className={parseInt(star) === starCount ? 'highlight' : ''}>
                                        NT$ {info.hitAll.toLocaleString()}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
