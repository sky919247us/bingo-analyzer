import { useSeo } from '../hooks/useSeo';
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
import { calculateFrequency, calculateGaps } from '../utils/bingo-strategies';

type FilterMode = 'all' | 'hot20' | 'cold20';

export default function BingoStatistics() {
    useSeo({ title: '統計分析與走勢圖', description: '深度分析賓果賓果大小單雙盤路走勢、冷熱門獎號與雙贏拖號演算法。', keywords: '賓果統計資料, 賓果走勢' });
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

    /** 計算 1-80 號碼遺漏值 (距離上次開出的期數) */
    const gapData = useMemo(() => {
        if (draws.length === 0) return [];
        const gaps = calculateGaps(draws);
        return Array.from({ length: 80 }, (_, i) => ({
            number: i + 1,
            gap: gaps[i + 1] || 0,
        })).sort((a, b) => b.gap - a.gap); // 由大到小排序
    }, [draws]);

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

    /** 超級獎號次數統計 */
    const superData = useMemo(() => {
        if (draws.length === 0) return { hottest: [], coldest: [] };
        const freq: Record<number, number> = {};
        for (let i = 1; i <= 80; i++) freq[i] = 0;
        
        draws.forEach(d => {
            if (d.superNumber) {
                freq[d.superNumber] = (freq[d.superNumber] || 0) + 1;
            }
        });

        const sorted = Object.entries(freq)
            .map(([num, count]) => ({ number: parseInt(num), count }))
            .sort((a, b) => b.count - a.count);
            
        return {
            hottest: sorted.slice(0, 5).filter(s => s.count > 0),    
            coldest: sorted.slice(-5)
        };
    }, [draws]);

    /** 尾數 (0-9) 分佈統計 */
    const lastDigitData = useMemo(() => {
        if (draws.length === 0) return [];
        const freq: Record<number, number> = {};
        for (let i = 0; i <= 9; i++) freq[i] = 0;
        
        draws.forEach(d => {
            d.numbers.forEach(num => {
                const digit = num % 10;
                freq[digit] += 1;
            });
        });

        return Object.entries(freq)
            .map(([digit, count]) => ({ digit: parseInt(digit), count }))
            .sort((a, b) => b.count - a.count);
    }, [draws]);

    /** 近期連莊號碼統計 (上一期有，這一期又出現) */
    const consecutiveData = useMemo(() => {
        if (draws.length < 2) return [];
        const freq: Record<number, number> = {};
        
        // draws 陣列是由新到舊 [最新, 倒數第二, ...]
        for (let i = 0; i < draws.length - 1; i++) {
            const current = draws[i].numbers;
            const prev = draws[i+1].numbers;
            
            current.forEach(num => {
                if (prev.includes(num)) {
                    freq[num] = (freq[num] || 0) + 1;
                }
            });
        }
        
        return Object.entries(freq)
            .map(([num, count]) => ({ number: parseInt(num), count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
    }, [draws]);

    /** 盤路走勢 (大小單雙遺漏與次數) */
    const trendData = useMemo(() => {
        if (draws.length === 0) return null;
        
        // 算出今日盤路統計
        const last3 = parseInt(draws[0].period, 10) % 1000;
        const todayCount = isNaN(last3) ? 203 : last3;
        const todayDraws = draws.slice(0, Math.min(todayCount, draws.length));
        
        let bigToday = 0;
        let smallToday = 0;
        let oddToday = 0;
        let evenToday = 0;

        for (const d of todayDraws) {
            let big = 0, odd = 0;
            d.numbers.forEach(n => {
                if (n > 40) big++;
                if (n % 2 !== 0) odd++;
            });
            if (big > 10) bigToday++;
            if (big < 10) smallToday++;
            if (odd > 10) oddToday++;
            if (odd < 10) evenToday++;
        }

        let currentBigGap = 0;
        let currentSmallGap = 0;
        let currentOddGap = 0;
        let currentEvenGap = 0;
        
        // 由新到舊計算遺漏期數
        for (const d of draws) {
            let bigCount = 0;
            let oddCount = 0;
            d.numbers.forEach(n => {
                if (n > 40) bigCount++;
                if (n % 2 !== 0) oddCount++;
            });
            
            const isBig = bigCount > 10;
            const isSmall = bigCount < 10;
            const isOdd = oddCount > 10;
            const isEven = oddCount < 10;
            
            if (!isBig && currentBigGap !== -1) currentBigGap++;
            if (!isSmall && currentSmallGap !== -1) currentSmallGap++;
            if (!isOdd && currentOddGap !== -1) currentOddGap++;
            if (!isEven && currentEvenGap !== -1) currentEvenGap++;
            
            if (isBig) currentBigGap = -1;
            if (isSmall) currentSmallGap = -1;
            if (isOdd) currentOddGap = -1;
            if (isEven) currentEvenGap = -1;
            
            if (currentBigGap < 0 && currentSmallGap < 0 && currentOddGap < 0 && currentEvenGap < 0) {
                break;
            }
        }
        
        return {
            bigGap: Math.max(0, currentBigGap),
            smallGap: Math.max(0, currentSmallGap),
            oddGap: Math.max(0, currentOddGap),
            evenGap: Math.max(0, currentEvenGap),
            bigToday,
            smallToday,
            oddToday,
            evenToday,
            totalToday: todayDraws.length
        };
    }, [draws]);

    /** 拖號分析 (Associated Numbers)：找出最常一起開出的雙號碼組合 (前 5 名) */
    const associatedData = useMemo(() => {
        if (draws.length === 0) return [];
        const pairFreq: Record<string, number> = {};
        
        draws.forEach(d => {
            const sorted = [...d.numbers].sort((a,b) => a - b);
            for (let i = 0; i < sorted.length; i++) {
                for (let j = i + 1; j < sorted.length; j++) {
                    const key = `${sorted[i]}-${sorted[j]}`;
                    pairFreq[key] = (pairFreq[key] || 0) + 1;
                }
            }
        });
        
        return Object.entries(pairFreq)
            .map(([pair, count]) => {
                const [n1, n2] = pair.split('-');
                return { n1: parseInt(n1), n2: parseInt(n2), count };
            })
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
    }, [draws]);

    /** 跳期分析 (Skip Analysis)：計算各號碼平均遺漏期數與當前遺漏的比對 */
    const skipAnalysisData = useMemo(() => {
        if (draws.length === 0) return [];
        // 計算每個號碼的歷史出現期數索引（由新到舊，0 = 最新這期）
        const occurences: Record<number, number[]> = {};
        for(let i = 1; i <= 80; i++) occurences[i] = [];
        
        draws.forEach((d, idx) => {
            d.numbers.forEach(n => occurences[n].push(idx));
        });
        
        const skipStats = [];
        for (let num = 1; num <= 80; num++) {
            const idxs = occurences[num];
            if (idxs.length < 2) continue; // 至少出現過兩次才能計算平均跳期
            
            const currentGap = idxs[0];
            let totalSkip = 0;
            let skipCount = 0;
            // 計算每次出現之間的間隔期數
            for (let j = 0; j < idxs.length - 1; j++) {
                totalSkip += (idxs[j+1] - idxs[j] - 1);
                skipCount++;
            }
            const avgSkip = +(totalSkip / skipCount).toFixed(1);
            
            // 如果當前遺漏接近平均跳期，就表示有規律要開了 (差異 <= 0.5)
            if (Math.abs(currentGap - avgSkip) <= 0.5 && idxs.length >= 5) {
                skipStats.push({
                    number: num,
                    currentGap,
                    avgSkip,
                    frequency: idxs.length
                });
            }
        }
        
        // 返回最接近規律的前五個
        return skipStats.sort((a,b) => Math.abs(a.currentGap - a.avgSkip) - Math.abs(b.currentGap - b.avgSkip)).slice(0, 5);
    }, [draws]);

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

                    {/* 遺漏值分析 */}
                    <div className="glass-card" style={{ marginBottom: 20 }}>
                        <h3 className="section-title">⏳ 遺漏值分析 (最久未開出號碼)</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
                            {gapData.slice(0, 10).map((d) => (
                                <div key={d.number} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 8px', background: 'var(--bg-page)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                                    <div className="bingo-ball">{d.number}</div>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--danger)', marginTop: 8, fontWeight: 700 }}>
                                        遺漏 {d.gap} 期
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-2" style={{ marginBottom: 20 }}>
                        {/* 超級獎號分析 */}
                        <div className="glass-card">
                            <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span className="bingo-ball super" style={{ width: 24, height: 24, fontSize: '0.8rem' }}>S</span> 
                                超級獎號分析
                            </h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                <div>
                                    <h4 style={{ fontSize: '0.9rem', color: 'var(--accent-green)', marginBottom: 8 }}>🔥 熱門超級獎號</h4>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                        {superData.hottest.map((d) => (
                                            <div key={d.number} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-page)', padding: '4px 8px', borderRadius: 'var(--radius-sm)' }}>
                                                <div className="bingo-ball super" style={{ width: 28, height: 28, fontSize: '0.85rem' }}>{d.number}</div>
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{d.count}次</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <h4 style={{ fontSize: '0.9rem', color: 'var(--accent-red)', marginBottom: 8 }}>🧊 冷門超級獎號</h4>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                        {superData.coldest.map((d) => (
                                            <div key={d.number} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-page)', padding: '4px 8px', borderRadius: 'var(--radius-sm)' }}>
                                                <div className="bingo-ball" style={{ width: 28, height: 28, fontSize: '0.85rem', filter: 'grayscale(1)' }}>{d.number}</div>
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{d.count}次</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 盤路遺漏走勢 */}
                        <div className="glass-card">
                            <h3 className="section-title">📉 盤路連續未開 (遺漏) 走勢</h3>
                            {trendData && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--bg-page)', borderRadius: 'var(--radius-sm)', borderLeft: '4px solid var(--accent-red)' }}>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                            <span style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>大</span>
                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>今日 {trendData.bigToday} 次</span>
                                        </div>
                                        <span>{trendData.bigGap === 0 ? <span style={{color:'var(--accent-green)'}}>連莊 / 剛出</span> : <span style={{color:'var(--danger)'}}>遺漏 {trendData.bigGap} 期</span>}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--bg-page)', borderRadius: 'var(--radius-sm)', borderLeft: '4px solid var(--accent-blue)' }}>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                            <span style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>小</span>
                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>今日 {trendData.smallToday} 次</span>
                                        </div>
                                        <span>{trendData.smallGap === 0 ? <span style={{color:'var(--accent-green)'}}>連莊 / 剛出</span> : <span style={{color:'var(--danger)'}}>遺漏 {trendData.smallGap} 期</span>}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--bg-page)', borderRadius: 'var(--radius-sm)', borderLeft: '4px solid var(--warning)' }}>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                            <span style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>單</span>
                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>今日 {trendData.oddToday} 次</span>
                                        </div>
                                        <span>{trendData.oddGap === 0 ? <span style={{color:'var(--accent-green)'}}>連莊 / 剛出</span> : <span style={{color:'var(--danger)'}}>遺漏 {trendData.oddGap} 期</span>}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--bg-page)', borderRadius: 'var(--radius-sm)', borderLeft: '4px solid var(--primary)' }}>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                            <span style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>雙</span>
                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>今日 {trendData.evenToday} 次</span>
                                        </div>
                                        <span>{trendData.evenGap === 0 ? <span style={{color:'var(--accent-green)'}}>連莊 / 剛出</span> : <span style={{color:'var(--danger)'}}>遺漏 {trendData.evenGap} 期</span>}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-2">
                        {/* 尾數分佈統計 */}
                        <div className="glass-card">
                            <h3 className="section-title">🎯 尾數 (0-9) 出現次數統計</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                                {lastDigitData.map((d) => (
                                    <div key={d.digit} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'var(--bg-page)', padding: '8px', borderRadius: 'var(--radius-sm)' }}>
                                        <span style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--primary)' }}>{d.digit}</span>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{d.count} 次</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 近期連莊號碼 */}
                        <div className="glass-card" style={{ marginBottom: 20 }}>
                            <h3 className="section-title">🔁 近期連莊號碼排行</h3>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                                {consecutiveData.map((d) => (
                                    <div key={d.number} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'var(--bg-page)', padding: '8px', borderRadius: 'var(--radius-sm)' }}>
                                        <div className="bingo-ball" style={{ width: 32, height: 32, fontSize: '0.9rem' }}>{d.number}</div>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--accent-green)', marginTop: 4, fontWeight: 'bold' }}>{d.count} 次</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-2">
                        {/* 拖號分析 */}
                        <div className="glass-card">
                            <h3 className="section-title">🔗 雙贏拖號分析 (最常同開組合)</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {associatedData.map((d, index) => (
                                    <div key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-page)', padding: '12px', borderRadius: 'var(--radius-sm)', borderLeft: '4px solid var(--primary)' }}>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <div className="bingo-ball" style={{ width: 32, height: 32, fontSize: '0.9rem' }}>{d.n1}</div>
                                            <span style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>&</span>
                                            <div className="bingo-ball relative" style={{ width: 32, height: 32, fontSize: '0.9rem' }}>{d.n2}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent-green)' }}>{d.count} 次</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>同開次數</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 跳期規律分析 */}
                        <div className="glass-card">
                            <h3 className="section-title">⏱️ 跳期規律分析 (即將到期)</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {skipAnalysisData.map((d) => (
                                    <div key={d.number} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-page)', padding: '12px', borderRadius: 'var(--radius-sm)', borderLeft: '4px solid var(--warning)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <div className="bingo-ball super" style={{ width: 36, height: 36, fontSize: '1rem' }}>{d.number}</div>
                                            <div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>出現 {d.frequency} 次</div>
                                                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>平均跳期: <span style={{ color: 'var(--primary)' }}>{d.avgSkip}</span> 期</div>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: d.currentGap >= d.avgSkip ? 'var(--danger)' : 'var(--warning)' }}>
                                                遺漏 {d.currentGap} 期
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                {d.currentGap === d.avgSkip ? '🎯 規律吻合' : (d.currentGap > d.avgSkip ? '⚠️ 超過平均' : '即將到期')}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {skipAnalysisData.length === 0 && (
                                    <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                                        目前沒有完美符合跳期規律的號碼
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
