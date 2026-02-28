/**
 * 歷史回測頁面
 * 載入 CSV 歷史數據，模擬策略回測
 */
import { useState, useMemo, useCallback } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, BarChart, Bar, Cell
} from 'recharts';
import { loadCsvFile, backtestStrategy, type DrawResult } from '../utils/csv-parser';
import { getPrize } from '../models/prize-table';

export default function Backtest() {
    const [data, setData] = useState<DrawResult[]>([]);
    const [fileName, setFileName] = useState('');
    const [loading, setLoading] = useState(false);
    const [star, setStar] = useState(3);
    const [isPromo, setIsPromo] = useState(true);
    const [multiplier, setMultiplier] = useState(4);
    const [simCount, setSimCount] = useState(10);

    // 載入 CSV 檔案
    const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        setFileName(file.name);
        try {
            const parsed = await loadCsvFile(file);
            setData(parsed);
        } catch (err) {
            console.error('CSV 解析失敗:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    // 執行回測模擬
    const backtestResult = useMemo(() => {
        if (data.length === 0) return null;

        // 隨機選號模擬（多次取平均）
        const betCostPerPeriod = 25 * multiplier;
        const totalPeriods = Math.min(data.length, 2000); // 限制期數避免計算過久
        const slicedData = data.slice(0, totalPeriods);

        // 進行多次隨機選號並計算平均
        const simulations = Array.from({ length: simCount }, () => {
            // 隨機選擇號碼
            const allNums = Array.from({ length: 80 }, (_, i) => i + 1);
            for (let i = allNums.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [allNums[i], allNums[j]] = [allNums[j], allNums[i]];
            }
            const selectedNumbers = allNums.slice(0, star);

            // 回測
            const results = backtestStrategy(slicedData, selectedNumbers);

            let cumProfit = 0;
            let maxDrawdown = 0;
            let maxConsecutiveMiss = 0;
            let currentMissStreak = 0;
            let winCount = 0;

            const profitCurve = results.map((r, index) => {
                const prize = getPrize(star, r.hits, isPromo) * multiplier;
                const profit = prize - betCostPerPeriod;
                cumProfit += profit;

                if (cumProfit < maxDrawdown) maxDrawdown = cumProfit;

                if (prize > 0) {
                    winCount++;
                    if (currentMissStreak > maxConsecutiveMiss) {
                        maxConsecutiveMiss = currentMissStreak;
                    }
                    currentMissStreak = 0;
                } else {
                    currentMissStreak++;
                }

                return {
                    period: index + 1,
                    profit: cumProfit,
                    date: r.date,
                };
            });

            if (currentMissStreak > maxConsecutiveMiss) {
                maxConsecutiveMiss = currentMissStreak;
            }

            return {
                profitCurve,
                totalProfit: cumProfit,
                winCount,
                winRate: winCount / totalPeriods,
                maxDrawdown,
                maxConsecutiveMiss,
            };
        });

        // 計算平均值
        const avgProfit = simulations.reduce((s, sim) => s + sim.totalProfit, 0) / simCount;
        const avgWinRate = simulations.reduce((s, sim) => s + sim.winRate, 0) / simCount;
        const avgMaxMiss = Math.round(simulations.reduce((s, sim) => s + sim.maxConsecutiveMiss, 0) / simCount);

        // 取中位數模擬的資金曲線作為展示
        const sorted = [...simulations].sort((a, b) => a.totalProfit - b.totalProfit);
        const medianCurve = sorted[Math.floor(sorted.length / 2)].profitCurve;

        // 命中次數分布
        const hitDistribution: { [key: number]: number } = {};
        for (let i = 0; i <= star; i++) hitDistribution[i] = 0;

        const sampleResults = backtestStrategy(
            slicedData,
            Array.from({ length: 80 }, (_, i) => i + 1).sort(() => Math.random() - 0.5).slice(0, star)
        );
        for (const r of sampleResults) {
            if (hitDistribution[r.hits] !== undefined) {
                hitDistribution[r.hits]++;
            }
        }

        const hitDistData = Object.entries(hitDistribution).map(([hits, count]) => ({
            name: `中${hits}顆`,
            次數: count,
            比例: parseFloat(((count / totalPeriods) * 100).toFixed(1)),
        }));

        return {
            totalPeriods,
            avgProfit,
            avgWinRate,
            avgMaxMiss,
            totalCost: betCostPerPeriod * totalPeriods,
            medianCurve,
            hitDistData,
            simulations,
        };
    }, [data, star, isPromo, multiplier, simCount]);

    return (
        <div className="animate-in">
            <h1 className="page-title"><span className="emoji-icon">📜</span> 歷史回測</h1>

            {/* 控制面板 */}
            <div className="glass-card" style={{ marginBottom: 'var(--space-xl)' }}>
                <h2 className="section-title">⚙️ 回測設定</h2>
                <div className="control-row">
                    <div className="input-group">
                        <label>載入 CSV 檔案</label>
                        <input
                            type="file"
                            accept=".csv"
                            onChange={handleFileUpload}
                            className="input-field"
                            style={{ padding: '6px' }}
                        />
                    </div>

                    <div className="input-group">
                        <label>星數</label>
                        <select className="input-field" value={star} onChange={(e) => setStar(Number(e.target.value))}>
                            {Array.from({ length: 10 }, (_, i) => i + 1).map((s) => (
                                <option key={s} value={s}>{s} 星</option>
                            ))}
                        </select>
                    </div>

                    <div className="input-group">
                        <label>倍數</label>
                        <select className="input-field" value={multiplier} onChange={(e) => setMultiplier(Number(e.target.value))}>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((m) => (
                                <option key={m} value={m}>{m} 倍</option>
                            ))}
                        </select>
                    </div>

                    <div className="input-group">
                        <label>模擬次數</label>
                        <input
                            type="number"
                            className="input-field"
                            value={simCount}
                            min={1}
                            max={100}
                            onChange={(e) => setSimCount(Math.max(1, Math.min(100, Number(e.target.value))))}
                            style={{ width: 80 }}
                        />
                    </div>

                    <div className="toggle-switch" onClick={() => setIsPromo((v) => !v)}>
                        <div className={`toggle-track ${isPromo ? 'active' : ''}`}>
                            <div className="toggle-thumb" />
                        </div>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>加碼模式</span>
                    </div>
                </div>

                {fileName && (
                    <div style={{ marginTop: 'var(--space-md)', color: 'var(--accent-cyan)', fontSize: '0.85rem' }}>
                        📁 已載入：{fileName}（{data.length.toLocaleString()} 期）
                    </div>
                )}
            </div>

            {loading && <div className="loading-spinner" />}

            {/* 回測結果 */}
            {backtestResult && !loading && (
                <>
                    {/* 統計概覽 */}
                    <div className="grid grid-4" style={{ marginBottom: 'var(--space-xl)' }}>
                        <div className="glass-card stat-card">
                            <span className="stat-label">模擬期數</span>
                            <span className="stat-value">{backtestResult.totalPeriods.toLocaleString()}</span>
                        </div>
                        <div className="glass-card stat-card">
                            <span className="stat-label">平均損益</span>
                            <span className={`stat-value ${backtestResult.avgProfit < 0 ? 'danger' : ''}`}>
                                ${Math.round(backtestResult.avgProfit).toLocaleString()}
                            </span>
                        </div>
                        <div className="glass-card stat-card">
                            <span className="stat-label">平均中獎率</span>
                            <span className="stat-value">{(backtestResult.avgWinRate * 100).toFixed(1)}%</span>
                        </div>
                        <div className="glass-card stat-card">
                            <span className="stat-label">平均最大連續未中</span>
                            <span className="stat-value danger">{backtestResult.avgMaxMiss}期</span>
                        </div>
                    </div>

                    {/* 資金曲線 */}
                    <div className="glass-card" style={{ marginBottom: 'var(--space-xl)' }}>
                        <h2 className="section-title">💰 資金曲線（中位數模擬）</h2>
                        <ResponsiveContainer width="100%" height={360}>
                            <LineChart data={backtestResult.medianCurve} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="period" stroke="#64748b" fontSize={11} />
                                <YAxis stroke="#64748b" fontSize={11} tickFormatter={(v) => `$${v}`} />
                                <Tooltip
                                    contentStyle={{
                                        background: 'rgba(17,24,39,0.95)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: 8,
                                        color: '#f1f5f9',
                                    }}
                                    formatter={(value) => [`$${Number(value).toLocaleString()}`, '累計損益']}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="profit"
                                    stroke="#00ff87"
                                    strokeWidth={2}
                                    dot={false}
                                />
                                {/* 零線 */}
                                <Line
                                    type="monotone"
                                    data={backtestResult.medianCurve.map((d) => ({ ...d, zero: 0 }))}
                                    dataKey="zero"
                                    stroke="rgba(255,255,255,0.2)"
                                    strokeWidth={1}
                                    strokeDasharray="5 5"
                                    dot={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    {/* 命中分布 */}
                    <div className="glass-card">
                        <h2 className="section-title">🎯 命中次數分布</h2>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={backtestResult.hitDistData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                                <YAxis stroke="#64748b" fontSize={12} />
                                <Tooltip
                                    contentStyle={{
                                        background: 'rgba(17,24,39,0.95)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: 8,
                                        color: '#f1f5f9',
                                    }}
                                    formatter={(value, name) => [
                                        name === '比例' ? `${value}%` : Number(value).toLocaleString(),
                                        String(name)
                                    ]}
                                />
                                <Bar dataKey="次數" fill="#60a5fa" radius={[4, 4, 0, 0]}>
                                    {backtestResult.hitDistData.map((_, index) => (
                                        <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </>
            )}

            {data.length === 0 && !loading && (
                <div className="glass-card empty-state">
                    <div className="icon">📂</div>
                    <p>請上傳 CSV 歷史開獎數據檔案開始回測</p>
                    <p style={{ fontSize: '0.8rem', marginTop: 'var(--space-sm)' }}>
                        支援格式：台灣彩券賓果賓果開獎數據 CSV
                    </p>
                </div>
            )}
        </div>
    );
}

const PIE_COLORS = ['#00ff87', '#60a5fa', '#a78bfa', '#fbbf24', '#f87171', '#22d3ee', '#818cf8', '#fb923c', '#34d399', '#f472b6', '#94a3b8'];
