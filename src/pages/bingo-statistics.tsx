/**
 * 統計分析頁面
 * 使用 Recharts 繪製 1-80 號碼出現頻率直方圖
 */
import { useState, useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell,
} from 'recharts';
import { useBingoData } from '../hooks/useBingoData';
import { calculateFrequency } from '../utils/bingo-strategies';

type FilterMode = 'all' | 'hot20' | 'cold20';

export default function BingoStatistics() {
    const { draws, loading, countdown } = useBingoData();
    const [filter, setFilter] = useState<FilterMode>('all');

    /** 計算 1-80 號碼頻率 */
    const frequencyData = useMemo(() => {
        if (draws.length === 0) return [];
        const freq = calculateFrequency(draws);
        return Array.from({ length: 80 }, (_, i) => ({
            number: i + 1,
            count: freq[i + 1] || 0,
        }));
    }, [draws]);

    /** 依篩選模式過濾 */
    const filteredData = useMemo(() => {
        if (filter === 'all') return frequencyData;
        const sorted = [...frequencyData].sort((a, b) => b.count - a.count);
        if (filter === 'hot20') return sorted.slice(0, 20).sort((a, b) => a.number - b.number);
        return sorted.slice(-20).sort((a, b) => a.number - b.number);
    }, [frequencyData, filter]);

    /** 關鍵指標 */
    const stats = useMemo(() => {
        if (frequencyData.length === 0) return null;
        const sorted = [...frequencyData].sort((a, b) => b.count - a.count);
        const avg = frequencyData.reduce((sum, d) => sum + d.count, 0) / 80;
        return {
            hottest: sorted[0],
            coldest: sorted[sorted.length - 1],
            average: avg.toFixed(1),
        };
    }, [frequencyData]);

    /** 圖表色彩 — 依出現次數漸變 */
    const getBarColor = (count: number) => {
        if (!stats) return '#60a5fa';
        const avg = parseFloat(stats.average);
        if (count >= avg * 1.3) return '#00ff87'; // 極熱
        if (count >= avg) return '#60a5fa'; // 偏熱
        if (count >= avg * 0.7) return '#fbbf24'; // 中性
        return '#f87171'; // 冷門
    };

    return (
        <div className="animate-in">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <h1 className="page-title">
                    <span className="emoji-icon">📊</span> 統計分析
                </h1>
                <span className="countdown-badge">⏱ {countdown}s 後更新</span>
            </div>

            {loading && <div className="loading-spinner" />}

            {!loading && (
                <>
                    {/* 關鍵指標 */}
                    {stats && (
                        <div className="grid grid-3" style={{ marginBottom: 20 }}>
                            <div className="glass-card stat-card">
                                <span className="stat-label">最高頻號碼</span>
                                <span className="stat-value">#{stats.hottest.number}</span>
                                <span style={{ fontSize: '0.8rem', color: 'var(--accent-green)' }}>
                                    出現 {stats.hottest.count} 次
                                </span>
                            </div>
                            <div className="glass-card stat-card">
                                <span className="stat-label">平均出現次數</span>
                                <span className="stat-value">{stats.average}</span>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    共分析 {draws.length} 期
                                </span>
                            </div>
                            <div className="glass-card stat-card">
                                <span className="stat-label">最低頻號碼</span>
                                <span className="stat-value danger">#{stats.coldest.number}</span>
                                <span style={{ fontSize: '0.8rem', color: 'var(--accent-red)' }}>
                                    出現 {stats.coldest.count} 次
                                </span>
                            </div>
                        </div>
                    )}

                    {/* 篩選按鈕 */}
                    <div className="glass-card" style={{ marginBottom: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                            <h3 className="section-title" style={{ marginBottom: 0 }}>📈 頻率分佈</h3>
                            <div className="filter-group">
                                <button
                                    className={`filter-btn${filter === 'all' ? ' active' : ''}`}
                                    onClick={() => setFilter('all')}
                                >
                                    全部 80 號
                                </button>
                                <button
                                    className={`filter-btn${filter === 'hot20' ? ' active' : ''}`}
                                    onClick={() => setFilter('hot20')}
                                >
                                    🔥 熱門 20
                                </button>
                                <button
                                    className={`filter-btn${filter === 'cold20' ? ' active' : ''}`}
                                    onClick={() => setFilter('cold20')}
                                >
                                    🧊 冷門 20
                                </button>
                            </div>
                        </div>

                        {/* 長條圖 */}
                        <div style={{ width: '100%', height: 350 }}>
                            <ResponsiveContainer>
                                <BarChart data={filteredData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="number"
                                        tick={{ fontSize: 10 }}
                                        interval={filter === 'all' ? 4 : 0}
                                    />
                                    <YAxis tick={{ fontSize: 11 }} />
                                    <Tooltip
                                        contentStyle={{
                                            background: 'rgba(17, 24, 39, 0.95)',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: 8,
                                            color: '#f1f5f9',
                                        }}
                                        labelFormatter={(v) => `號碼 ${v}`}
                                        formatter={(value: unknown) => [`${value} 次`, '出現次數']}
                                    />
                                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                        {filteredData.map((entry) => (
                                            <Cell key={entry.number} fill={getBarColor(entry.count)} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
