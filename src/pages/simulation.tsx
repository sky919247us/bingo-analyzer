import { useSeo } from '../hooks/useSeo';
/**
 * 蒙地卡羅模擬頁面
 * 資金模擬、破產機率計算、資金水位圖
 */
import { useState, useMemo, useCallback } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer
} from 'recharts';
import { hypergeometricProbability } from '../models/probability';
import { getPrize } from '../models/prize-table';
import {
    BASE_BET,
    SIDE_GAME_SPECS,
    SIDE_WIN_PROBABILITY,
    SUPER_MAX_PICKS,
    expectedReturnRate,
    type GameType,
} from '../models/side-games';

interface SimulationRun {
    curve: { period: number; balance: number }[];
    finalBalance: number;
    maxBalance: number;
    minBalance: number;
    busted: boolean;
}

/** 玩法選單 */
const GAME_TABS: Array<{ type: GameType; icon: string; label: string }> = [
    { type: 'basic', icon: '⭐', label: '基本玩法' },
    { type: 'super', icon: '🎯', label: '超級獎號' },
    { type: 'bigSmall', icon: '⚖️', label: '猜大小' },
    { type: 'oddEven', icon: '🔢', label: '猜單雙' },
];

export default function Simulation() {
    useSeo({ title: '蒙地卡羅模擬', description: '利用蒙地卡羅隨機演算法，預演長時間投注下各種資金池與風險管控測試。', keywords: '蒙地卡羅, 資金管控' });
    const [star, setStar] = useState(3);
    const [multiplier, setMultiplier] = useState(4);
    const [isPromo, setIsPromo] = useState(true);
    const [initialCapital, setInitialCapital] = useState(10000);
    const [periods, setPeriods] = useState(200);
    const [stopLoss, setStopLoss] = useState(0);
    const [stopWin, setStopWin] = useState(50000);
    const [simCount, setSimCount] = useState(100);
    const [running, setRunning] = useState(false);

    /* 附加玩法：蒙地卡羅只取決於「注數」，不取決於選了哪些號碼 */
    const [gameType, setGameType] = useState<GameType>('basic');
    const [sideBetCount, setSideBetCount] = useState(1);
    const [result, setResult] = useState<{
        runs: SimulationRun[];
        bustRate: number;
        avgFinal: number;
        avgMax: number;
        avgMin: number;
        profitRate: number;
    } | null>(null);

    // 執行蒙地卡羅模擬
    const runSimulation = useCallback(() => {
        setRunning(true);

        // 使用 setTimeout 讓 UI 更新
        setTimeout(() => {
            // 注數：基本玩法固定 1 注；附加玩法依選擇個數（超級獎號選 k 個 = k 注）
            const betCount = gameType === 'basic' ? 1 : sideBetCount;
            const betCost = BASE_BET * betCount * multiplier;

            const cdf: { cumProb: number; prize: number }[] = [];

            if (gameType === 'basic') {
                // 預先計算各命中數的機率與獎金
                const outcomes: { probability: number; prize: number }[] = [];
                const maxHit = Math.min(star, 20);
                for (let h = 0; h <= maxHit; h++) {
                    const prob = hypergeometricProbability(star, h);
                    const prize = getPrize(star, h, isPromo) * multiplier;
                    if (prob > 1e-10) {
                        outcomes.push({ probability: prob, prize });
                    }
                }

                // 建立累積機率陣列（用於快速抽樣）
                let acc = 0;
                for (const o of outcomes) {
                    acc += o.probability;
                    cdf.push({ cumProb: acc, prize: o.prize });
                }
            } else {
                // 附加玩法只有「中」與「不中」兩種結果：
                // 超級獎號選 k 個 → k/80；猜大小 / 猜單雙押 k 邊 → k × 9.804%
                // （複選最多只會中一注，所以獎金不隨注數放大，但成本會）
                const winProb = gameType === 'super'
                    ? Math.min(1, betCount / 80)
                    : Math.min(1, betCount * SIDE_WIN_PROBABILITY);
                const prize = SIDE_GAME_SPECS[gameType].unitPrize * multiplier;
                cdf.push({ cumProb: winProb, prize });
                cdf.push({ cumProb: 1, prize: 0 });
            }

            // 執行模擬
            const runs: SimulationRun[] = [];
            let bustCount = 0;
            let profitCount = 0;

            for (let s = 0; s < simCount; s++) {
                let balance = initialCapital;
                let maxBalance = balance;
                let minBalance = balance;
                let busted = false;
                const curve: { period: number; balance: number }[] = [{ period: 0, balance }];

                for (let p = 1; p <= periods; p++) {
                    // 扣注金
                    balance -= betCost;

                    // 隨機抽獎
                    const rand = Math.random();
                    let prize = 0;
                    for (const c of cdf) {
                        if (rand <= c.cumProb) {
                            prize = c.prize;
                            break;
                        }
                    }
                    balance += prize;

                    maxBalance = Math.max(maxBalance, balance);
                    minBalance = Math.min(minBalance, balance);

                    // 每 5 期記錄一次（加上首尾期）避免圖表資料量太大
                    if (p % Math.max(1, Math.floor(periods / 100)) === 0 || p === periods) {
                        curve.push({ period: p, balance: Math.round(balance) });
                    }

                    // 停損 / 停利
                    if (balance <= stopLoss) { busted = true; break; }
                    if (balance >= stopWin) break;
                }

                if (busted) bustCount++;
                if (balance > initialCapital) profitCount++;

                runs.push({
                    curve,
                    finalBalance: Math.round(balance),
                    maxBalance: Math.round(maxBalance),
                    minBalance: Math.round(minBalance),
                    busted,
                });
            }

            setResult({
                runs,
                bustRate: bustCount / simCount,
                avgFinal: Math.round(runs.reduce((s, r) => s + r.finalBalance, 0) / simCount),
                avgMax: Math.round(runs.reduce((s, r) => s + r.maxBalance, 0) / simCount),
                avgMin: Math.round(runs.reduce((s, r) => s + r.minBalance, 0) / simCount),
                profitRate: profitCount / simCount,
            });

            setRunning(false);
        }, 50);
    }, [gameType, sideBetCount, star, multiplier, isPromo, initialCapital, periods, stopLoss, stopWin, simCount]);

    // 圖表資料：取前 20 條模擬的資金曲線
    const chartData = useMemo(() => {
        if (!result) return [];

        // 取最多 20 條曲線
        const displayRuns = result.runs.slice(0, Math.min(20, result.runs.length));

        // 合併所有期數點
        const allPeriods = new Set<number>();
        displayRuns.forEach((run) => run.curve.forEach((p) => allPeriods.add(p.period)));
        const sortedPeriods = [...allPeriods].sort((a, b) => a - b);

        return sortedPeriods.map((period) => {
            const point: Record<string, number> = { period };
            displayRuns.forEach((run, i) => {
                const match = run.curve.find((c) => c.period === period);
                if (match) {
                    point[`sim${i}`] = match.balance;
                }
            });
            return point;
        });
    }, [result]);

    const simLineColors = [
        '#00ff87', '#60a5fa', '#a78bfa', '#fbbf24', '#f87171',
        '#22d3ee', '#818cf8', '#fb923c', '#34d399', '#f472b6',
        '#6ee7b7', '#93c5fd', '#c4b5fd', '#fcd34d', '#fca5a5',
        '#67e8f9', '#a5b4fc', '#fdba74', '#6ee7b7', '#f9a8d4',
    ];

    return (
        <div className="animate-in">
            <h1 className="page-title"><span className="emoji-icon">🎲</span> 蒙地卡羅模擬</h1>

            {/* 控制面板 */}
            <div className="glass-card" style={{ marginBottom: 'var(--space-xl)' }}>
                <h2 className="section-title">⚙️ 模擬參數</h2>

                {/* 玩法選擇 */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 'var(--space-md)' }}>
                    {GAME_TABS.map((g) => (
                        <button
                            key={g.type}
                            className={`strategy-btn${gameType === g.type ? ' selected' : ''}`}
                            onClick={() => { setGameType(g.type); setSideBetCount(1); setResult(null); }}
                        >
                            <span>{g.icon}</span>
                            <span>{g.label}</span>
                        </button>
                    ))}
                </div>

                {gameType !== 'basic' && (
                    <div style={{ marginBottom: 'var(--space-md)', padding: '12px 16px', background: 'var(--bg-page)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                        <div className="input-group" style={{ marginBottom: 8 }}>
                            <label>{gameType === 'super' ? '選號個數（= 注數）' : '投注方向數（= 注數）'}</label>
                            <select
                                className="input-field"
                                value={sideBetCount}
                                onChange={(e) => { setSideBetCount(Number(e.target.value)); setResult(null); }}
                            >
                                {Array.from({ length: gameType === 'super' ? SUPER_MAX_PICKS : 2 }, (_, i) => i + 1).map((n) => (
                                    <option key={n} value={n}>{n} 注</option>
                                ))}
                            </select>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                            蒙地卡羅只取決於<strong>注數</strong>，不取決於你選了哪幾個號碼——
                            每個號碼機率相同，選 25 號或 63 號的模擬結果在統計上完全一致。
                            單注獎金 ${SIDE_GAME_SPECS[gameType].unitPrize.toLocaleString()}
                            ．每期成本 ${(BASE_BET * sideBetCount * multiplier).toLocaleString()}
                            ．理論回報率 {(expectedReturnRate(gameType) * 100).toFixed(2)}%
                            {gameType !== 'super' && `．和局率 80.39%`}
                        </p>
                    </div>
                )}
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

                    <div className="input-group">
                        <label>初始本金</label>
                        <input
                            type="number"
                            className="input-field"
                            value={initialCapital}
                            onChange={(e) => setInitialCapital(Number(e.target.value))}
                        />
                    </div>

                    <div className="input-group">
                        <label>模擬期數</label>
                        <input
                            type="number"
                            className="input-field"
                            value={periods}
                            min={10}
                            max={10000}
                            onChange={(e) => setPeriods(Number(e.target.value))}
                        />
                    </div>

                    <div className="input-group">
                        <label>停損線</label>
                        <input
                            type="number"
                            className="input-field"
                            value={stopLoss}
                            onChange={(e) => setStopLoss(Number(e.target.value))}
                        />
                    </div>

                    <div className="input-group">
                        <label>停利線</label>
                        <input
                            type="number"
                            className="input-field"
                            value={stopWin}
                            onChange={(e) => setStopWin(Number(e.target.value))}
                        />
                    </div>

                    <div className="input-group">
                        <label>模擬次數</label>
                        <input
                            type="number"
                            className="input-field"
                            value={simCount}
                            min={10}
                            max={1000}
                            onChange={(e) => setSimCount(Math.max(10, Number(e.target.value)))}
                        />
                    </div>

                    {gameType === 'basic' && (
                    <div className="toggle-switch" onClick={() => setIsPromo((v) => !v)}>
                        <div className={`toggle-track ${isPromo ? 'active' : ''}`}>
                            <div className="toggle-thumb" />
                        </div>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>加碼</span>
                    </div>
                    )}

                    <button
                        className="btn btn-primary"
                        onClick={runSimulation}
                        disabled={running}
                        style={{ minWidth: 120 }}
                    >
                        {running ? '⏳ 計算中...' : '🚀 開始模擬'}
                    </button>
                </div>
            </div>

            {running && <div className="loading-spinner" />}

            {/* 模擬結果 */}
            {result && !running && (
                <>
                    {/* 統計概覽 */}
                    <div className="grid grid-4" style={{ marginBottom: 'var(--space-xl)' }}>
                        <div className="glass-card stat-card">
                            <span className="stat-label">破產機率</span>
                            <span className={`stat-value ${result.bustRate > 0.5 ? 'danger' : ''}`}>
                                {(result.bustRate * 100).toFixed(1)}%
                            </span>
                        </div>
                        <div className="glass-card stat-card">
                            <span className="stat-label">獲利機率</span>
                            <span className="stat-value">
                                {(result.profitRate * 100).toFixed(1)}%
                            </span>
                        </div>
                        <div className="glass-card stat-card">
                            <span className="stat-label">平均最終餘額</span>
                            <span className={`stat-value ${result.avgFinal < initialCapital ? 'danger' : ''}`}>
                                ${result.avgFinal.toLocaleString()}
                            </span>
                        </div>
                        <div className="glass-card stat-card">
                            <span className="stat-label">平均最低水位</span>
                            <span className="stat-value danger">
                                ${result.avgMin.toLocaleString()}
                            </span>
                        </div>
                    </div>

                    {/* 資金水位圖 */}
                    <div className="glass-card" style={{ marginBottom: 'var(--space-xl)' }}>
                        <h2 className="section-title">
                            💧 資金水位圖
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: 'var(--space-sm)' }}>
                                （顯示{Math.min(20, result.runs.length)}條模擬路徑）
                            </span>
                        </h2>
                        <ResponsiveContainer width="100%" height={400}>
                            <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="period" stroke="#64748b" fontSize={11} label={{ value: '期數', position: 'insideBottom', offset: -5, fill: '#64748b' }} />
                                <YAxis stroke="#64748b" fontSize={11} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                                <Tooltip
                                    contentStyle={{
                                        background: 'rgba(17,24,39,0.95)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: 8,
                                        color: '#f1f5f9',
                                        maxHeight: 200,
                                        overflow: 'auto',
                                    }}
                                    formatter={(value) => [`$${Number(value).toLocaleString()}`, '']}
                                />
                                {/* 初始本金線 */}
                                {chartData.length > 0 && (
                                    <Line
                                        type="monotone"
                                        data={chartData.map((d) => ({ ...d, initial: initialCapital }))}
                                        dataKey="initial"
                                        stroke="rgba(255,255,255,0.2)"
                                        strokeWidth={1}
                                        strokeDasharray="5 5"
                                        dot={false}
                                        name="初始本金"
                                    />
                                )}
                                {/* 模擬路徑 */}
                                {result.runs.slice(0, 20).map((_, i) => (
                                    <Line
                                        key={i}
                                        type="monotone"
                                        dataKey={`sim${i}`}
                                        stroke={simLineColors[i % simLineColors.length]}
                                        strokeWidth={1.5}
                                        strokeOpacity={0.6}
                                        dot={false}
                                        name={`模擬 ${i + 1}`}
                                    />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    {/* 策略建議 */}
                    <div className="glass-card">
                        <h2 className="section-title">📋 策略分析</h2>
                        <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
                            <div style={{ padding: 'var(--space-md)', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)' }}>
                                <strong style={{ color: 'var(--accent-cyan)' }}>策略組合：</strong>
                                <span style={{ marginLeft: 'var(--space-sm)' }}>
                                    {gameType === 'basic'
                                        ? `${star}星 × ${multiplier}倍 ${isPromo ? '(加碼)' : '(常態)'}`
                                        : `${SIDE_GAME_SPECS[gameType].label} ${sideBetCount}注 × ${multiplier}倍`}，
                                    單期成本 ${(BASE_BET * (gameType === 'basic' ? 1 : sideBetCount) * multiplier).toLocaleString()}，初始本金 ${initialCapital.toLocaleString()}
                                </span>
                            </div>
                            <div style={{ padding: 'var(--space-md)', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)' }}>
                                <strong style={{ color: result.bustRate > 0.3 ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                                    風險評估：
                                </strong>
                                <span style={{ marginLeft: 'var(--space-sm)' }}>
                                    {result.bustRate > 0.5
                                        ? '⚠️ 高風險！超過 50% 的模擬會破產，建議增加本金或降低投注。'
                                        : result.bustRate > 0.2
                                            ? '⚡ 中等風險。約 ' + (result.bustRate * 100).toFixed(0) + '% 破產機率，注意資金管理。'
                                            : '✅ 相對穩健。破產風險較低，但仍需注意長期波動。'}
                                </span>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {!result && !running && (
                <div className="glass-card empty-state">
                    <div className="icon">🎲</div>
                    <p>設定參數後點擊「開始模擬」</p>
                    <p style={{ fontSize: '0.8rem', marginTop: 'var(--space-sm)', color: 'var(--text-muted)' }}>
                        蒙地卡羅模擬將根據真實機率隨機產生數千期投注結果
                    </p>
                </div>
            )}
        </div>
    );
}
