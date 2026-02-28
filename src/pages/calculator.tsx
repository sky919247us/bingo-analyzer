/**
 * 獎金計算器頁面
 * 支援星數選擇、機率計算、獎金計算、組合策略模擬
 */
import { useState, useMemo, useCallback } from 'react';
import {
    Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import { calculateAllProbabilities, atLeastOneHitProbability } from '../models/probability';
import { getPrizeTable } from '../models/prize-table';
import { calculateTax } from '../models/tax';
import { getShareUrl, type StrategyParams } from '../utils/url-params';

const PIE_COLORS = ['#00ff87', '#60a5fa', '#a78bfa', '#fbbf24', '#f87171', '#22d3ee', '#818cf8', '#fb923c', '#34d399', '#f472b6'];

export default function Calculator() {
    const [selectedStars, setSelectedStars] = useState<number[]>([3]);
    const [multiplier, setMultiplier] = useState(1);
    const [isPromo, setIsPromo] = useState(false);
    const [withTax, setWithTax] = useState(true);
    const [groupCount, setGroupCount] = useState(1);
    const [sharedCount, setSharedCount] = useState(0);
    const [copied, setCopied] = useState(false);

    // 星數切換
    const toggleStar = useCallback((star: number) => {
        setSelectedStars((prev) =>
            prev.includes(star)
                ? prev.filter((s) => s !== star)
                : [...prev, star].sort()
        );
    }, []);

    // 主要計算結果
    const results = useMemo(() => {
        return selectedStars.map((star) => {
            const probs = calculateAllProbabilities(star);
            const table = getPrizeTable(star);

            const items = probs.map((p) => {
                const prizeEntry = table?.prizes.find((e) => e.hitCount === p.hitCount);
                let prize = 0;
                if (prizeEntry) {
                    prize = isPromo && prizeEntry.promoPrize !== null
                        ? prizeEntry.promoPrize
                        : prizeEntry.normalPrize;
                    prize *= multiplier;
                }

                const taxResult = calculateTax(prize, 1);
                const displayPrize = withTax ? taxResult.netPrize : prize;

                return {
                    hitCount: p.hitCount,
                    probability: p.probability,
                    odds: p.odds,
                    prize,
                    netPrize: taxResult.netPrize,
                    displayPrize,
                    isTaxable: taxResult.isTaxable,
                    ev: p.probability * displayPrize,
                };
            });

            const totalEv = items.reduce((sum, i) => sum + i.ev, 0);
            const betCost = 25 * multiplier;
            const returnRate = (totalEv / betCost) * 100;

            // 多組中獎機率
            const winProbs = items.filter((i) => i.prize > 0);
            const totalWinProb = winProbs.reduce((sum, i) => sum + i.probability, 0);
            const multiGroupProb = atLeastOneHitProbability(totalWinProb, groupCount);

            return {
                star,
                items,
                totalEv,
                betCost,
                returnRate,
                totalWinProb,
                multiGroupProb,
            };
        });
    }, [selectedStars, multiplier, isPromo, withTax, groupCount]);

    // 分享連結
    const handleShare = useCallback(() => {
        if (selectedStars.length === 0) return;
        const params: StrategyParams = {
            star: selectedStars[0],
            groups: groupCount,
            multiplier,
            isPromo,
            withTax,
            shared: sharedCount,
        };
        navigator.clipboard.writeText(getShareUrl(params));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [selectedStars, groupCount, multiplier, isPromo, withTax, sharedCount]);

    return (
        <div className="animate-in">
            <h1 className="page-title"><span className="emoji-icon">🧮</span> 獎金計算器</h1>

            {/* 控制面板 */}
            <div className="glass-card" style={{ marginBottom: 'var(--space-xl)' }}>
                <h2 className="section-title">⚙️ 參數設定</h2>

                {/* 星數選擇器 */}
                <div style={{ marginBottom: 'var(--space-lg)' }}>
                    <label className="stat-label" style={{ marginBottom: 'var(--space-sm)', display: 'block' }}>
                        選擇星數（可複選）
                    </label>
                    <div className="star-selector">
                        {Array.from({ length: 10 }, (_, i) => i + 1).map((star) => (
                            <button
                                key={star}
                                className={`star-btn ${selectedStars.includes(star) ? 'selected' : ''}`}
                                onClick={() => toggleStar(star)}
                            >
                                {star}★
                            </button>
                        ))}
                    </div>
                </div>

                {/* 參數列 */}
                <div className="control-row">
                    <div className="input-group">
                        <label>投注倍數</label>
                        <select
                            className="input-field"
                            value={multiplier}
                            onChange={(e) => setMultiplier(Number(e.target.value))}
                        >
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((m) => (
                                <option key={m} value={m}>{m} 倍 (${25 * m})</option>
                            ))}
                        </select>
                    </div>

                    <div className="input-group">
                        <label>投注組數</label>
                        <input
                            type="number"
                            className="input-field"
                            value={groupCount}
                            min={1}
                            max={100}
                            onChange={(e) => setGroupCount(Math.max(1, Number(e.target.value)))}
                            style={{ width: 100 }}
                        />
                    </div>

                    <div className="input-group">
                        <label>共用號碼數</label>
                        <input
                            type="number"
                            className="input-field"
                            value={sharedCount}
                            min={0}
                            max={selectedStars.length > 0 ? Math.max(...selectedStars) - 1 : 0}
                            onChange={(e) => setSharedCount(Math.max(0, Number(e.target.value)))}
                            style={{ width: 100 }}
                        />
                    </div>

                    <div className="toggle-switch" onClick={() => setIsPromo((v) => !v)}>
                        <div className={`toggle-track ${isPromo ? 'active' : ''}`}>
                            <div className="toggle-thumb" />
                        </div>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>加碼模式</span>
                    </div>

                    <div className="toggle-switch" onClick={() => setWithTax((v) => !v)}>
                        <div className={`toggle-track ${withTax ? 'active' : ''}`}>
                            <div className="toggle-thumb" />
                        </div>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>計算稅金</span>
                    </div>

                    <button className="btn btn-primary" onClick={handleShare}>
                        {copied ? '✅ 已複製！' : '🔗 分享策略'}
                    </button>
                </div>
            </div>

            {/* 計算結果 */}
            {results.map((result) => (
                <div key={result.star} className="glass-card" style={{ marginBottom: 'var(--space-lg)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                        <h2 className="section-title" style={{ margin: 0 }}>
                            ⭐ {result.star} 星分析
                        </h2>
                        <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                            <span className="chip chip-blue">
                                期望值 ${result.totalEv.toFixed(2)}
                            </span>
                            <span className={`chip ${result.returnRate >= 60 ? 'chip-green' : 'chip-red'}`}>
                                返還率 {result.returnRate.toFixed(1)}%
                            </span>
                            {groupCount > 1 && (
                                <span className="chip chip-yellow">
                                    {groupCount}組至少一中 {(result.multiGroupProb * 100).toFixed(2)}%
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-2">
                        {/* 機率表格 */}
                        <div>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>命中數</th>
                                        <th>機率</th>
                                        <th>{withTax ? '稅後獎金' : '稅前獎金'}</th>
                                        <th>期望值</th>
                                        <th>狀態</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.items.filter((i) => i.prize > 0 || i.hitCount === 0).map((item) => (
                                        <tr key={item.hitCount}>
                                            <td style={{ fontWeight: 700 }}>中 {item.hitCount} 顆</td>
                                            <td>{item.odds}</td>
                                            <td className={item.displayPrize > 0 ? 'highlight' : ''}>
                                                {item.displayPrize > 0 ? `$${item.displayPrize.toLocaleString()}` : '-'}
                                            </td>
                                            <td>${item.ev.toFixed(2)}</td>
                                            <td>
                                                {item.isTaxable && withTax ? (
                                                    <span className="chip chip-red">扣稅</span>
                                                ) : item.prize > 0 ? (
                                                    <span className="chip chip-green">免稅</span>
                                                ) : null}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* 機率圓餅圖 */}
                        <div>
                            <ResponsiveContainer width="100%" height={280}>
                                <PieChart>
                                    <Pie
                                        data={result.items.filter((i) => i.probability > 0.001).map((i) => ({
                                            name: `中${i.hitCount}顆`,
                                            value: parseFloat((i.probability * 100).toFixed(2)),
                                        }))}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={100}
                                        dataKey="value"
                                        paddingAngle={2}
                                    >
                                        {result.items.filter((i) => i.probability > 0.001).map((_, index) => (
                                            <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{
                                            background: 'rgba(17,24,39,0.95)',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: 8,
                                            color: '#f1f5f9',
                                        }}
                                        formatter={(value) => [`${value}%`, '機率']}
                                    />
                                    <Legend
                                        wrapperStyle={{ fontSize: '0.75rem', color: '#94a3b8' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            ))}

            {selectedStars.length === 0 && (
                <div className="glass-card empty-state">
                    <div className="icon">🎯</div>
                    <p>請選擇至少一個星數開始分析</p>
                </div>
            )}
        </div>
    );
}
