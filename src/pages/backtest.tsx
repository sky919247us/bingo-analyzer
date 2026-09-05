import { useSeo } from '../hooks/useSeo';
/**
 * 歷史回測頁面
 * 自動支援 public/data/ 內的 CSV 歷史開獎資料
 * 使用者可自選年份啟動回測
 */
import { useState, useMemo, useCallback } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, BarChart, Bar, Cell
} from 'recharts';
import { parseCsvData, backtestStrategy, type DrawResult } from '../utils/csv-parser';
import { getPrize } from '../models/prize-table';

/** 可用的年份清單 */
const AVAILABLE_YEARS = [
    2026, 2025, 2024, 2023, 2022, 2021, 2020,
    2019, 2018, 2017, 2016, 2015, 2014, 2013,
];

import {
    SIDE_GAME_SPECS,
    SIDE_OPTIONS,
    SUPER_MAX_PICKS,
    backtestSideGame,
    expectedReturnRate,
    type GameType,
    type SideSelection,
} from '../models/side-games';

/** 玩法選單 */
const GAME_TABS: Array<{ type: GameType; icon: string; label: string }> = [
    { type: 'basic', icon: '⭐', label: '基本玩法' },
    { type: 'super', icon: '🎯', label: '超級獎號' },
    { type: 'bigSmall', icon: '⚖️', label: '猜大小' },
    { type: 'oddEven', icon: '🔢', label: '猜單雙' },
];

const PIE_COLORS = ['#00ff87', '#60a5fa', '#a78bfa', '#fbbf24', '#f87171', '#22d3ee', '#818cf8', '#fb923c', '#34d399', '#f472b6', '#94a3b8'];

export default function Backtest() {
    useSeo({ title: '歷史回測實驗室', description: '使用歷屆數萬期真實開獎數據進行你的專屬打法與策略回測。', keywords: '策略回測, 量化分析' });
    const [data, setData] = useState<DrawResult[]>([]);
    const [fileName, setFileName] = useState('');
    const [loading, setLoading] = useState(false);
    const [selectedYear, setSelectedYear] = useState<number | null>(null);
    const [star, setStar] = useState(3);
    const [isPromo, setIsPromo] = useState(true);
    const [multiplier, setMultiplier] = useState(4);
    const [simCount, setSimCount] = useState(10);

    /* 附加玩法回測狀態 */
    const [gameType, setGameType] = useState<GameType>('basic');
    const [superPicks, setSuperPicks] = useState<number[]>([]);
    const [sideSelections, setSideSelections] = useState<SideSelection[]>([]);

    const switchGame = useCallback((next: GameType) => {
        setGameType(next);
        setSuperPicks([]);
        setSideSelections(next === 'bigSmall' ? ['大'] : next === 'oddEven' ? ['單'] : []);
    }, []);

    const toggleSuperPick = useCallback((num: number) => {
        setSuperPicks((prev) => {
            if (prev.includes(num)) return prev.filter((n) => n !== num);
            if (prev.length >= SUPER_MAX_PICKS) return prev;
            return [...prev, num].sort((a, b) => a - b);
        });
    }, []);

    const toggleSide = useCallback((opt: SideSelection) => {
        setSideSelections((prev) =>
            prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt],
        );
    }, []);

    /** 附加玩法回測：直接用歷史每一期比對，不需要隨機模擬 */
    const sideResult = useMemo(() => {
        if (gameType === 'basic' || data.length === 0) return null;
        const betCount = gameType === 'super' ? superPicks.length : sideSelections.length;
        if (betCount === 0) return null;

        const sliced = data.slice(0, Math.min(data.length, 2000));
        return backtestSideGame(sliced, gameType, {
            superPicks,
            selections: sideSelections,
            multiplier,
        });
    }, [gameType, data, superPicks, sideSelections, multiplier]);

    /** 從 public/data/ 載入指定年份的 CSV */
    const handleLoadYear = useCallback(async (year: number) => {
        setLoading(true);
        setSelectedYear(year);
        setFileName(`賓果賓果_${year}.csv`);
        try {
            const url = `${import.meta.env.BASE_URL}data/賓果賓果_${year}.csv`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`載入失敗 (HTTP ${response.status})`);
            const csvText = await response.text();
            const parsed = parseCsvData(csvText);
            setData(parsed);
        } catch (err) {
            console.error('CSV 載入失敗:', err);
            setData([]);
        } finally {
            setLoading(false);
        }
    }, []);

    /** 手動上傳 CSV（保留此功能作為備用） */
    const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        setFileName(file.name);
        setSelectedYear(null);
        try {
            const text = await file.text();
            const parsed = parseCsvData(text);
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

        const betCostPerPeriod = 25 * multiplier;
        const totalPeriods = Math.min(data.length, 2000);
        const slicedData = data.slice(0, totalPeriods);

        const simulations = Array.from({ length: simCount }, () => {
            const allNums = Array.from({ length: 80 }, (_, i) => i + 1);
            for (let i = allNums.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [allNums[i], allNums[j]] = [allNums[j], allNums[i]];
            }
            const selectedNumbers = allNums.slice(0, star);

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

        const avgProfit = simulations.reduce((s, sim) => s + sim.totalProfit, 0) / simCount;
        const avgWinRate = simulations.reduce((s, sim) => s + sim.winRate, 0) / simCount;
        const avgMaxMiss = Math.round(simulations.reduce((s, sim) => s + sim.maxConsecutiveMiss, 0) / simCount);

        const sorted = [...simulations].sort((a, b) => a.totalProfit - b.totalProfit);
        const medianCurve = sorted[Math.floor(sorted.length / 2)].profitCurve;

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

            {/* 年份選擇 */}
            <div className="glass-card" style={{ marginBottom: 'var(--space-lg)' }}>
                <h2 className="section-title">📅 選擇年份資料</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 12 }}>
                    點擊下方年份按鈕即可自動載入對應年度的台彩賓果賓果歷史開獎數據
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                    {AVAILABLE_YEARS.map((year) => (
                        <button
                            key={year}
                            className={`strategy-btn${selectedYear === year ? ' selected' : ''}`}
                            onClick={() => handleLoadYear(year)}
                            disabled={loading}
                        >
                            {year}
                        </button>
                    ))}
                </div>

                {/* 手動上傳作為備用 */}
                <details style={{ marginTop: 8 }}>
                    <summary style={{ color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer' }}>
                        📂 或手動上傳其他 CSV 檔案
                    </summary>
                    <div style={{ marginTop: 8 }}>
                        <input
                            type="file"
                            accept=".csv"
                            onChange={handleFileUpload}
                            className="input-field"
                            style={{ padding: '6px' }}
                        />
                    </div>
                </details>
            </div>

            {/* 回測設定 */}
            <div className="glass-card" style={{ marginBottom: 'var(--space-lg)' }}>
                <h2 className="section-title">⚙️ 回測設定</h2>

                {/* 玩法選擇 */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 'var(--space-md)' }}>
                    {GAME_TABS.map((g) => (
                        <button
                            key={g.type}
                            className={`strategy-btn${gameType === g.type ? ' selected' : ''}`}
                            onClick={() => switchGame(g.type)}
                        >
                            <span>{g.icon}</span>
                            <span>{g.label}</span>
                        </button>
                    ))}
                </div>

                <div className="control-row">
                    {gameType === 'basic' && (
                    <div className="input-group">
                        <label>星數</label>
                        <select className="input-field" value={star} onChange={(e) => setStar(Number(e.target.value))}>
                            {Array.from({ length: 10 }, (_, i) => i + 1).map((s) => (
                                <option key={s} value={s}>{s} 星</option>
                            ))}
                        </select>
                    </div>
                    )}

                    <div className="input-group">
                        <label>倍數</label>
                        <select className="input-field" value={multiplier} onChange={(e) => setMultiplier(Number(e.target.value))}>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((m) => (
                                <option key={m} value={m}>{m} 倍</option>
                            ))}
                        </select>
                    </div>

                    {gameType === 'basic' && (<>
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
                    </>)}
                </div>

                {/* 超級獎號選號盤 */}
                {gameType === 'super' && (
                    <div style={{ marginTop: 'var(--space-md)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                            <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                                選擇要回測的超級獎號（{superPicks.length}/{SUPER_MAX_PICKS}）
                            </label>
                            <button className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: '0.8rem' }} onClick={() => setSuperPicks([])}>
                                清空
                            </button>
                        </div>
                        <div className="number-pad">
                            {Array.from({ length: 80 }, (_, i) => i + 1).map((num) => (
                                <button
                                    key={num}
                                    className={`number-btn${superPicks.includes(num) ? ' selected' : ''}`}
                                    onClick={() => toggleSuperPick(num)}
                                    disabled={!superPicks.includes(num) && superPicks.length >= SUPER_MAX_PICKS}
                                >
                                    {num}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* 猜大小 / 猜單雙方向 */}
                {(gameType === 'bigSmall' || gameType === 'oddEven') && (
                    <div style={{ marginTop: 'var(--space-md)' }}>
                        <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: 10 }}>
                            投注方向（可複選，複選以多注計算）
                        </label>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            {SIDE_OPTIONS[gameType].map((opt) => (
                                <button
                                    key={opt}
                                    className={`strategy-btn${sideSelections.includes(opt) ? ' selected' : ''}`}
                                    onClick={() => toggleSide(opt)}
                                    style={{ minWidth: 100, padding: '14px 0', fontSize: '1.2rem', fontWeight: 700 }}
                                >
                                    {opt}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {fileName && (
                    <div style={{ marginTop: 'var(--space-md)', color: 'var(--accent-cyan)', fontSize: '0.85rem' }}>
                        📁 已載入：{fileName}（{data.length.toLocaleString()} 期）
                    </div>
                )}
            </div>

            {loading && <div className="loading-spinner" />}

            {/* ===== 附加玩法回測結果 ===== */}
            {gameType !== 'basic' && !loading && (
                <>
                    {!sideResult && data.length > 0 && (
                        <div className="glass-card" style={{ marginBottom: 'var(--space-lg)' }}>
                            <p style={{ margin: 0, color: 'var(--text-muted)' }}>
                                請先在上方選擇{gameType === 'super' ? '至少 1 個超級獎號' : '至少 1 個投注方向'}。
                            </p>
                        </div>
                    )}

                    {sideResult && (
                        <>
                            <div className="grid grid-4" style={{ marginBottom: 'var(--space-xl)' }}>
                                <div className="glass-card stat-card">
                                    <span className="stat-label">回測期數</span>
                                    <span className="stat-value">{sideResult.totalPeriods.toLocaleString()}</span>
                                </div>
                                <div className="glass-card stat-card">
                                    <span className="stat-label">實際損益</span>
                                    <span className={`stat-value ${sideResult.netProfit < 0 ? 'danger' : ''}`}>
                                        ${Math.round(sideResult.netProfit).toLocaleString()}
                                    </span>
                                </div>
                                <div className="glass-card stat-card">
                                    <span className="stat-label">實際中獎率</span>
                                    <span className="stat-value">{(sideResult.winRate * 100).toFixed(2)}%</span>
                                </div>
                                <div className="glass-card stat-card">
                                    <span className="stat-label">最長連續未中</span>
                                    <span className="stat-value danger">{sideResult.maxMissStreak}期</span>
                                </div>
                            </div>

                            <div className="glass-card" style={{ marginBottom: 'var(--space-xl)' }}>
                                <h2 className="section-title">📊 實際 vs 理論</h2>
                                <table className="data-table">
                                    <thead>
                                        <tr><th>項目</th><th>回測實際值</th><th>理論值</th></tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td>中獎率</td>
                                            <td>{(sideResult.winRate * 100).toFixed(2)}%</td>
                                            <td>{((gameType === 'super'
                                                ? superPicks.length / 80
                                                : sideSelections.length * SIDE_GAME_SPECS[gameType].winProbability) * 100).toFixed(2)}%</td>
                                        </tr>
                                        <tr>
                                            <td>回報率（獎金 ÷ 成本）</td>
                                            <td>{(sideResult.returnRate * 100).toFixed(2)}%</td>
                                            <td>{(expectedReturnRate(gameType) * 100).toFixed(2)}%</td>
                                        </tr>
                                        <tr>
                                            <td>總成本</td>
                                            <td colSpan={2}>${sideResult.totalCost.toLocaleString()}</td>
                                        </tr>
                                        <tr>
                                            <td>總獎金</td>
                                            <td colSpan={2}>${sideResult.totalPrize.toLocaleString()}（中 {sideResult.winCount} 期 × ${(SIDE_GAME_SPECS[gameType].unitPrize * multiplier).toLocaleString()}）</td>
                                        </tr>
                                        {gameType !== 'super' && (
                                            <tr>
                                                <td>和局期數</td>
                                                <td colSpan={2}>{sideResult.tieCount} 期（{(sideResult.tieCount / sideResult.totalPeriods * 100).toFixed(2)}%），理論 80.39%</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 12, marginBottom: 0 }}>
                                    ⚠ 回報率長期會收斂到理論值。單一年度的偏離是抽樣變異，不代表這個玩法有優勢。
                                </p>
                            </div>

                            <div className="glass-card" style={{ marginBottom: 'var(--space-xl)' }}>
                                <h2 className="section-title">💰 資金曲線（歷史實際結果）</h2>
                                <ResponsiveContainer width="100%" height={360}>
                                    <LineChart
                                        data={sideResult.profitCurve.map((profit, i) => ({ period: i + 1, profit }))}
                                        margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                        <XAxis dataKey="period" stroke="#94a3b8" fontSize={12} />
                                        <YAxis stroke="#94a3b8" fontSize={12} />
                                        <Tooltip
                                            contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                                            formatter={(v) => [`$${Math.round(Number(v ?? 0)).toLocaleString()}`, '累積損益']}
                                        />
                                        <Line type="monotone" dataKey="profit" stroke="#00ff87" strokeWidth={2} dot={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </>
                    )}
                </>
            )}

            {/* 回測結果 */}
            {gameType === 'basic' && backtestResult && !loading && (
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
                    <p>請點選上方年份按鈕載入歷史開獎數據</p>
                    <p style={{ fontSize: '0.8rem', marginTop: 'var(--space-sm)' }}>
                        支援 2013 ~ 2026 年台灣彩券賓果賓果開獎數據
                    </p>
                </div>
            )}
        </div>
    );
}
