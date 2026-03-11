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

interface SimulationRun {
    curve: { period: number; balance: number }[];
    finalBalance: number;
    maxBalance: number;
    minBalance: number;
    busted: boolean;
}

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
            const betCost = 25 * multiplier;

            // 預先計算各命中數的機率與獎金
            const outcomes: { probability: number; prize: number }[] = [];
            const maxHit = Math.min(star, 20);
            let cumProb = 0;
            for (let h = 0; h <= maxHit; h++) {
                const prob = hypergeometricProbability(star, h);
                const prize = getPrize(star, h, isPromo) * multiplier;
                if (prob > 1e-10) {
                    outcomes.push({ probability: prob, prize });
                    cumProb += prob;
                }
            }

            // 建立累積機率陣列（用於快速抽樣）
            const cdf: { cumProb: number; prize: number }[] = [];
            let acc = 0;
            for (const o of outcomes) {
                acc += o.probability;
                cdf.push({ cumProb: acc, prize: o.prize });
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
    }, [star, multiplier, isPromo, initialCapital, periods, stopLoss, stopWin, simCount]);

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
                <div className="control-row">
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

                    <div className="toggle-switch" onClick={() => setIsPromo((v) => !v)}>
                        <div className={`toggle-track ${isPromo ? 'active' : ''}`}>
                            <div className="toggle-thumb" />
                        </div>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>加碼</span>
                    </div>

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
                                    {star}星 × {multiplier}倍 {isPromo ? '(加碼)' : '(常態)'}，
                                    單期成本 ${25 * multiplier}，初始本金 ${initialCapital.toLocaleString()}
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
