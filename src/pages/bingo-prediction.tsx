import { useSeo } from '../hooks/useSeo';
/**
 * 號碼預測頁面
 * 支援策略預測 + 自選號碼（1-80 號碼盤，一行 10 個）+ 儲存紀錄
 */
import { useState, useMemo, useCallback } from 'react';
import { useBingoData } from '../hooks/useBingoData';
import {
    runStrategy,
    STRATEGY_INFO,
    type StrategyName,
} from '../utils/bingo-strategies';
import { saveRecord } from '../utils/bingo-storage';
import {
    BASE_BET,
    SIDE_GAME_SPECS,
    SIDE_OPTIONS,
    SIDE_TIE_PROBABILITY,
    SUPER_MAX_PICKS,
    calcCost,
    countBig,
    countOdd,
    expectedReturnRate,
    getSideResult,
    summarizeSideHistory,
    summarizeSuperHistory,
    type GameType,
    type SideSelection,
} from '../models/side-games';

/** 產生 1-80 陣列 */
const ALL_NUMBERS = Array.from({ length: 80 }, (_, i) => i + 1);

/** 台彩官方支援的期數選項 */
const PERIOD_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12];

/** 玩法選單 */
const GAME_TABS: Array<{ type: GameType; icon: string; label: string }> = [
    { type: 'basic', icon: '⭐', label: '基本玩法' },
    { type: 'super', icon: '🎯', label: '超級獎號' },
    { type: 'bigSmall', icon: '⚖️', label: '猜大小' },
    { type: 'oddEven', icon: '🔢', label: '猜單雙' },
];

export default function BingoPrediction() {
    useSeo({ title: 'AI 號碼預測', description: '多星數賓果AI預測模型，包含追熱、補冷與跳期規律策略推薦。', keywords: '賓果預測, 賓果報牌' });
    const { draws, loading, countdown } = useBingoData();

    /* 策略預測狀態 */
    const [range, setRange] = useState(10);
    const [strategy, setStrategy] = useState<StrategyName>('balanced');
    const [starCount, setStarCount] = useState(5);
    const [betMultiplier, setBetMultiplier] = useState(1);
    const [predicted, setPredicted] = useState<number[]>([]);
    const [showResult, setShowResult] = useState(false);
    const [saveMsg, setSaveMsg] = useState('');

    /* 自選號碼狀態 */
    const [tab, setTab] = useState<'strategy' | 'manual'>('strategy');
    const [manualNumbers, setManualNumbers] = useState<number[]>([]);

    /* 多期投注期數 */
    const [periodCount, setPeriodCount] = useState(1);

    /* 玩法：基本 / 超級獎號 / 猜大小 / 猜單雙 */
    const [gameType, setGameType] = useState<GameType>('basic');
    /* 超級獎號預測號碼（1~20 個） */
    const [superNumbers, setSuperNumbers] = useState<number[]>([]);
    /* 猜大小 / 猜單雙的投注選項 */
    const [sideSelections, setSideSelections] = useState<SideSelection[]>([]);

    /** 取出分析區間的資料 */
    const analysisDraws = useMemo(() => draws.slice(0, range), [draws, range]);

    /** 目前玩法的注數 */
    const selectionCount = gameType === 'super' ? superNumbers.length : sideSelections.length;
    const betCount = gameType === 'basic' ? 1 : selectionCount;
    const totalCost = calcCost(gameType, selectionCount, betMultiplier, periodCount);

    /** 切換玩法時清掉另一種玩法的選擇，避免殘留 */
    const switchGame = useCallback((next: GameType) => {
        setGameType(next);
        setSuperNumbers([]);
        setSideSelections([]);
        setSaveMsg('');
    }, []);

    /** 超級獎號選號切換（上限 20 個） */
    const toggleSuperNumber = useCallback((num: number) => {
        setSuperNumbers((prev) => {
            if (prev.includes(num)) return prev.filter((n) => n !== num);
            if (prev.length >= SUPER_MAX_PICKS) return prev;
            return [...prev, num].sort((a, b) => a - b);
        });
    }, []);

    /** 猜大小 / 猜單雙選項切換（可同時選兩邊 = 2 注） */
    const toggleSideSelection = useCallback((opt: SideSelection) => {
        setSideSelections((prev) =>
            prev.includes(opt) ? prev.filter((s) => s !== opt) : [...prev, opt],
        );
    }, []);

    /** 猜大小 / 猜單雙：最近 range 期的實際分布 */
    const sideHistory = useMemo(() => {
        if (gameType !== 'bigSmall' && gameType !== 'oddEven') return null;
        return summarizeSideHistory(gameType, analysisDraws.map((d) => d.numbers));
    }, [gameType, analysisDraws]);

    /** 超級獎號：最近 range 期的出現次數 */
    const superHistory = useMemo(
        () => summarizeSuperHistory(analysisDraws.map((d) => d.superNumber)),
        [analysisDraws],
    );

    /** 執行策略預測 */
    const handlePredict = () => {
        if (analysisDraws.length === 0) return;
        const result = runStrategy(strategy, analysisDraws, starCount);
        setPredicted(result);
        setShowResult(true);
        setSaveMsg('');
    };

    /** 自選號碼切換 */
    const toggleManualNumber = useCallback((num: number) => {
        setManualNumbers((prev) => {
            if (prev.includes(num)) return prev.filter((n) => n !== num);
            if (prev.length >= starCount) return prev; // 限制選號數量
            return [...prev, num].sort((a, b) => a - b);
        });
    }, [starCount]);

    /** 清空自選號碼 */
    const clearManual = useCallback(() => {
        setManualNumbers([]);
    }, []);

    /** 儲存紀錄（策略、自選或附加玩法） */
    const handleSave = (numbers: number[], label: string, selections: SideSelection[] = []) => {
        if (numbers.length === 0 && selections.length === 0) return;
        // 取得當前最新期號作為起始期
        const currentPeriod = draws.length > 0 ? draws[0].period : '';
        const count = gameType === 'super' ? numbers.length : selections.length;
        saveRecord({
            gameType,
            sideSelections: selections,
            strategy: label,
            numbers,
            starCount,
            analysisRange: range,
            betMultiplier,
            estimatedCost: calcCost(gameType, count, betMultiplier, periodCount),
            periodCount,
            startPeriod: currentPeriod,
        });
        setSaveMsg(`✅ 已儲存至歷史紀錄（${periodCount} 期）`);
        setTimeout(() => setSaveMsg(''), 3000);
    };

    return (
        <div className="animate-in">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <h1 className="page-title">🔮 號碼預測</h1>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>⏱ {countdown}s 後更新</span>
            </div>

            {loading && <div className="skeleton" style={{ height: 200 }} />}

            {!loading && (
                <>
                    {/* ====== 玩法選擇 ====== */}
                    <div className="card" style={{ marginBottom: 20 }}>
                        <h3 className="section-title">🎮 選擇玩法</h3>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
                        {gameType !== 'basic' && (
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 8 }}>
                                {SIDE_GAME_SPECS[gameType].description}
                            </p>
                        )}
                    </div>

                    {/* 模式切換 Tab（僅基本玩法） */}
                    {gameType === 'basic' && (
                    <div style={{ display: 'flex', gap: 0, marginBottom: 20 }}>
                        <button
                            className="btn"
                            style={{
                                flex: 1, borderRadius: '8px 0 0 8px',
                                background: tab === 'strategy' ? 'var(--primary)' : 'var(--bg-surface)',
                                color: tab === 'strategy' ? 'var(--text-inverse)' : 'var(--text-main)',
                                border: '1px solid var(--border-light)',
                            }}
                            onClick={() => setTab('strategy')}
                        >
                            🎯 策略預測
                        </button>
                        <button
                            className="btn"
                            style={{
                                flex: 1, borderRadius: '0 8px 8px 0',
                                background: tab === 'manual' ? 'var(--primary)' : 'var(--bg-surface)',
                                color: tab === 'manual' ? 'var(--text-inverse)' : 'var(--text-main)',
                                border: '1px solid var(--border-light)',
                                borderLeft: 'none',
                            }}
                            onClick={() => setTab('manual')}
                        >
                            ✋ 自選號碼
                        </button>
                    </div>
                    )}

                    {/* 共用：星數選擇 */}
                    <div className="card" style={{ marginBottom: 20 }}>
                        <h3 className="section-title">⭐ 玩法設定</h3>
                        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                            {gameType === 'basic' && (
                            <div>
                                <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>
                                    選號數量（星數）
                                </label>
                                <div className="star-selector">
                                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                                        <button
                                            key={n}
                                            className={`star-btn${starCount === n ? ' selected' : ''}`}
                                            onClick={() => {
                                                setStarCount(n);
                                                // 若自選號碼超過新星數，截斷
                                                setManualNumbers((prev) => prev.slice(0, n));
                                            }}
                                        >
                                            {n}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            )}
                            <div>
                                <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>
                                    投注倍數
                                </label>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {[1, 2, 3, 4, 5, 6, 8, 10, 12, 20, 50].map((m) => (
                                        <button
                                            key={m}
                                            className={`strategy-btn${betMultiplier === m ? ' selected' : ''}`}
                                            onClick={() => setBetMultiplier(m)}
                                            style={{ minWidth: 48 }}
                                        >
                                            {m}x
                                        </button>
                                    ))}
                                </div>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 8 }}>
                                    投注倍數：<strong>{betMultiplier}x</strong>
                                </p>
                            </div>
                            <div>
                                <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>
                                    投注期數
                                </label>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {PERIOD_OPTIONS.map((p) => (
                                        <button
                                            key={p}
                                            className={`strategy-btn${periodCount === p ? ' selected' : ''}`}
                                            onClick={() => setPeriodCount(p)}
                                            style={{ minWidth: 42 }}
                                        >
                                            {p}期
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {gameType !== 'basic' && (
                                <div>
                                    <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>
                                        歷史分析區間
                                    </label>
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        {[10, 20, 30, 50, 100].map((n) => (
                                            <button
                                                key={n}
                                                className={`strategy-btn${range === n ? ' selected' : ''}`}
                                                onClick={() => setRange(n)}
                                                style={{ minWidth: 52 }}
                                            >
                                                {n}期
                                            </button>
                                        ))}
                                    </div>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 8 }}>
                                        僅影響下方統計顯示，不影響投注
                                    </p>
                                </div>
                            )}
                        </div>
                        <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg-page)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                            <span style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>
                                預估總成本：<strong style={{ color: 'var(--warning)', fontSize: '1.1rem' }}>
                                    NT$ {totalCost.toLocaleString()}
                                </strong>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: 8 }}>
                                    （${BASE_BET} × {betCount}注 × {betMultiplier}倍 × {periodCount}期）
                                </span>
                            </span>
                            {gameType !== 'basic' && (
                                <p style={{ fontSize: '0.8rem', color: 'var(--success)', marginTop: 8, marginBottom: 0 }}>
                                    💚 單注獎金 ${SIDE_GAME_SPECS[gameType].unitPrize.toLocaleString()} 未達 $5,000 課稅門檻，
                                    且課稅為逐注認定，因此<strong>不論加到幾倍都免稅</strong>。
                                </p>
                            )}
                        </div>
                    </div>

                    {/* ====== Tab: 策略預測 ====== */}
                    {gameType === 'basic' && tab === 'strategy' && (
                        <>
                            {/* 分析區間 */}
                            <div className="card" style={{ marginBottom: 20 }}>
                                <h3 className="section-title">📐 分析區間</h3>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 12 }}>
                                    選擇最近幾期的開獎數據作為分析樣本
                                </p>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {[1, 3, 5, 10, 15, 20].map((n) => (
                                        <button
                                            key={n}
                                            className={`strategy-btn${range === n ? ' selected' : ''}`}
                                            onClick={() => setRange(n)}
                                        >
                                            最近 {n} 期
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 策略選擇 */}
                            <div className="card" style={{ marginBottom: 20 }}>
                                <h3 className="section-title">🎯 預測策略</h3>
                                <div className="strategy-group" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {(Object.keys(STRATEGY_INFO) as StrategyName[]).map((key) => {
                                        const info = STRATEGY_INFO[key];
                                        return (
                                            <button
                                                key={key}
                                                className={`strategy-btn${strategy === key ? ' selected' : ''}`}
                                                onClick={() => setStrategy(key)}
                                            >
                                                <span>{info.icon}</span>
                                                <span>{info.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 8 }}>
                                    {STRATEGY_INFO[strategy].description}
                                </p>
                            </div>

                            {/* 預測按鈕 */}
                            <button className="btn btn-primary" onClick={handlePredict} style={{ width: '100%', padding: '14px 0', fontSize: '1rem', marginBottom: 20 }}>
                                🔮 開始預測
                            </button>

                            {/* 預測結果 */}
                            {showResult && predicted.length > 0 && (
                                <div className="card animate-in" style={{ marginBottom: 20 }}>
                                    <h3 className="section-title">🎱 預測結果</h3>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                        {predicted.map((num) => (
                                            <div key={num} className="bingo-ball selected">{num}</div>
                                        ))}
                                    </div>
                                    <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                                        <button className="btn btn-primary" onClick={() => handleSave(predicted, STRATEGY_INFO[strategy].label)}>
                                            💾 儲存至紀錄
                                        </button>
                                        {saveMsg && (
                                            <span style={{ color: 'var(--success)', fontSize: '0.85rem' }}>{saveMsg}</span>
                                        )}
                                    </div>
                                    <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <span className="badge badge-neutral">{STRATEGY_INFO[strategy].icon} {STRATEGY_INFO[strategy].label}</span>
                                        <span className="badge badge-success">{starCount} 星</span>
                                        <span className="badge badge-warning">{betMultiplier}x 倍</span>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* ====== Tab: 自選號碼 ====== */}
                    {gameType === 'basic' && tab === 'manual' && (
                        <>
                            <div className="card" style={{ marginBottom: 20 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                    <h3 className="section-title" style={{ margin: 0 }}>✋ 自選號碼</h3>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                            已選 <strong style={{ color: manualNumbers.length === starCount ? 'var(--success)' : 'var(--primary)' }}>{manualNumbers.length}</strong> / {starCount}
                                        </span>
                                        <button className="btn btn-action" onClick={clearManual} style={{ padding: '4px 12px', fontSize: '0.8rem' }}>
                                            清空
                                        </button>
                                    </div>
                                </div>

                                {/* 號碼盤：1-80，一行 10 個 */}
                                <div className="number-pad">
                                    {ALL_NUMBERS.map((num) => (
                                        <button
                                            key={num}
                                            className={`number-btn${manualNumbers.includes(num) ? ' selected' : ''}`}
                                            onClick={() => toggleManualNumber(num)}
                                            disabled={!manualNumbers.includes(num) && manualNumbers.length >= starCount}
                                            style={{
                                                opacity: (!manualNumbers.includes(num) && manualNumbers.length >= starCount) ? 0.4 : 1,
                                            }}
                                        >
                                            {num}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 已選號碼預覽與儲存 */}
                            {manualNumbers.length > 0 && (
                                <div className="card animate-in" style={{ marginBottom: 20 }}>
                                    <h3 className="section-title">🎱 你選的號碼</h3>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                                        {manualNumbers.map((num) => (
                                            <div key={num} className="bingo-ball selected">{num}</div>
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                                        <button
                                            className="btn btn-primary"
                                            onClick={() => handleSave(manualNumbers, '自選號碼')}
                                            disabled={manualNumbers.length !== starCount}
                                            style={{ opacity: manualNumbers.length !== starCount ? 0.5 : 1 }}
                                        >
                                            💾 儲存至紀錄
                                        </button>
                                        {manualNumbers.length !== starCount && (
                                            <span style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>
                                                請選滿 {starCount} 個號碼
                                            </span>
                                        )}
                                        {saveMsg && (
                                            <span style={{ color: 'var(--success)', fontSize: '0.85rem' }}>{saveMsg}</span>
                                        )}
                                    </div>
                                    <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <span className="badge badge-neutral">✋ 自選號碼</span>
                                        <span className="badge badge-success">{starCount} 星</span>
                                        <span className="badge badge-warning">{betMultiplier}x 倍</span>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* ====== 玩法：超級獎號 ====== */}
                    {gameType === 'super' && (
                        <>
                            <div className="card" style={{ marginBottom: 20 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                                    <h3 className="section-title" style={{ margin: 0 }}>🎯 預測超級獎號</h3>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                            已選 <strong style={{ color: 'var(--primary)' }}>{superNumbers.length}</strong> / {SUPER_MAX_PICKS}
                                        </span>
                                        <button className="btn btn-action" onClick={() => setSuperNumbers([])} style={{ padding: '4px 12px', fontSize: '0.8rem' }}>
                                            清空
                                        </button>
                                    </div>
                                </div>

                                <div className="number-pad">
                                    {ALL_NUMBERS.map((num) => {
                                        const hits = superHistory.get(num) ?? 0;
                                        return (
                                            <button
                                                key={num}
                                                className={`number-btn${superNumbers.includes(num) ? ' selected' : ''}`}
                                                onClick={() => toggleSuperNumber(num)}
                                                disabled={!superNumbers.includes(num) && superNumbers.length >= SUPER_MAX_PICKS}
                                                title={`最近 ${range} 期開出 ${hits} 次`}
                                                style={{
                                                    opacity: (!superNumbers.includes(num) && superNumbers.length >= SUPER_MAX_PICKS) ? 0.4 : 1,
                                                    outline: hits > 0 && !superNumbers.includes(num) ? '2px solid var(--warning)' : undefined,
                                                }}
                                            >
                                                {num}
                                            </button>
                                        );
                                    })}
                                </div>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 10 }}>
                                    ⭕ 外框標示：最近 {range} 期曾經開出過的超級獎號（滑鼠停留可看次數）。
                                    提醒：每期超級獎號皆為獨立事件，歷史次數不影響下一期機率。
                                </p>
                            </div>

                            <div className="card" style={{ marginBottom: 20 }}>
                                <h3 className="section-title">📊 玩法數據</h3>
                                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                                    <div><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>中獎率</span><div style={{ fontSize: '1.1rem', fontWeight: 700 }}>1 / 80</div></div>
                                    <div><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>固定獎金倍數</span><div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{SIDE_GAME_SPECS.super.payoutMultiple} 倍</div></div>
                                    <div><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>單注獎金</span><div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--success)' }}>NT$ {SIDE_GAME_SPECS.super.unitPrize.toLocaleString()}</div></div>
                                    <div><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>期望回報率</span><div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--warning)' }}>{(expectedReturnRate('super') * 100).toFixed(2)}%</div></div>
                                    <div><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>命中時可得</span><div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--success)' }}>NT$ {(SIDE_GAME_SPECS.super.unitPrize * betMultiplier).toLocaleString()}</div></div>
                                </div>
                            </div>

                            {superNumbers.length > 0 && (
                                <div className="card animate-in" style={{ marginBottom: 20 }}>
                                    <h3 className="section-title">🎱 你預測的超級獎號</h3>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                                        {superNumbers.map((num) => (
                                            <div key={num} className="bingo-ball selected">{num}</div>
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                                        <button className="btn btn-primary" onClick={() => handleSave(superNumbers, '超級獎號')}>
                                            💾 儲存至紀錄
                                        </button>
                                        {saveMsg && <span style={{ color: 'var(--success)', fontSize: '0.85rem' }}>{saveMsg}</span>}
                                    </div>
                                    <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <span className="badge badge-neutral">🎯 超級獎號</span>
                                        <span className="badge badge-success">{superNumbers.length} 注</span>
                                        <span className="badge badge-warning">{betMultiplier}x 倍</span>
                                        <span className="badge badge-neutral">中獎率 {(superNumbers.length / 80 * 100).toFixed(2)}%</span>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* ====== 玩法：猜大小 / 猜單雙 ====== */}
                    {(gameType === 'bigSmall' || gameType === 'oddEven') && (
                        <>
                            <div className="card" style={{ marginBottom: 20 }}>
                                <h3 className="section-title">{SIDE_GAME_SPECS[gameType].icon} 選擇投注方向</h3>
                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                    {SIDE_OPTIONS[gameType].map((opt) => (
                                        <button
                                            key={opt}
                                            className={`strategy-btn${sideSelections.includes(opt) ? ' selected' : ''}`}
                                            onClick={() => toggleSideSelection(opt)}
                                            style={{ minWidth: 120, padding: '18px 0', fontSize: '1.3rem', fontWeight: 700 }}
                                        >
                                            {opt}
                                        </button>
                                    ))}
                                </div>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 10 }}>
                                    可同時投注兩邊（以 2 注計算）。中獎條件：該邊開出 <strong>13 顆（含）以上</strong>。
                                </p>
                            </div>

                            {/* 和局警示 */}
                            <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--warning)' }}>
                                <h3 className="section-title">⚠️ 和局才是常態</h3>
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', margin: 0 }}>
                                    這不是二選一的 50/50。20 顆球中單邊要開到 13 顆以上才算數，
                                    實際上有 <strong style={{ color: 'var(--warning)', fontSize: '1.1rem' }}>{(SIDE_TIE_PROBABILITY * 100).toFixed(2)}%</strong> 的期數
                                    兩邊都不足 13 顆，屬於<strong>和局：不中獎，也不退款</strong>。
                                    單邊中獎率僅約 <strong>{(SIDE_GAME_SPECS[gameType].winProbability * 100).toFixed(2)}%（約 1/10.2）</strong>，
                                    平均每 10 期才會判給其中一邊一次。
                                </p>
                            </div>

                            {/* 最近 N 期實際分布 */}
                            {sideHistory && sideHistory.total > 0 && (
                                <div className="card" style={{ marginBottom: 20 }}>
                                    <h3 className="section-title">📊 最近 {sideHistory.total} 期實際分布</h3>
                                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
                                        {SIDE_OPTIONS[gameType].map((opt) => (
                                            <div key={opt}>
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>開「{opt}」</span>
                                                <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--success)' }}>
                                                    {sideHistory.win[opt] ?? 0} 期
                                                </div>
                                            </div>
                                        ))}
                                        <div>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>和局</span>
                                            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                                                {sideHistory.tie} 期
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        {analysisDraws.map((d) => {
                                            const r = getSideResult(gameType, d.numbers);
                                            const count = gameType === 'bigSmall' ? countBig(d.numbers) : countOdd(d.numbers);
                                            const other = d.numbers.length - count;
                                            return (
                                                <span
                                                    key={d.period}
                                                    className={`badge ${r === '和' ? 'badge-neutral' : 'badge-success'}`}
                                                    title={`#${d.period} — ${SIDE_OPTIONS[gameType][0]} ${count} : ${SIDE_OPTIONS[gameType][1]} ${other}`}
                                                >
                                                    {r}
                                                </span>
                                            );
                                        })}
                                    </div>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 10 }}>
                                        由新到舊排列，滑鼠停留可看該期比數。可在上方「玩法設定 → 歷史分析區間」調整期數。
                                    </p>
                                </div>
                            )}

                            <div className="card" style={{ marginBottom: 20 }}>
                                <h3 className="section-title">📊 玩法數據</h3>
                                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                                    <div><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>單邊中獎率</span><div style={{ fontSize: '1.1rem', fontWeight: 700 }}>約 1 / 10.2</div></div>
                                    <div><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>固定獎金倍數</span><div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{SIDE_GAME_SPECS[gameType].payoutMultiple} 倍</div></div>
                                    <div><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>單注獎金</span><div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--success)' }}>NT$ {SIDE_GAME_SPECS[gameType].unitPrize.toLocaleString()}</div></div>
                                    <div><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>期望回報率</span><div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--warning)' }}>{(expectedReturnRate(gameType) * 100).toFixed(2)}%</div></div>
                                    <div><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>命中時可得</span><div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--success)' }}>NT$ {(SIDE_GAME_SPECS[gameType].unitPrize * betMultiplier).toLocaleString()}</div></div>
                                </div>
                            </div>

                            {sideSelections.length > 0 && (
                                <div className="card animate-in" style={{ marginBottom: 20 }}>
                                    <h3 className="section-title">🎱 你的投注</h3>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                                        {sideSelections.map((opt) => (
                                            <div key={opt} className="bingo-ball selected">{opt}</div>
                                        ))}
                                    </div>
                                    {sideSelections.length === 2 && (
                                        <p style={{ color: 'var(--warning)', fontSize: '0.82rem', marginTop: 0 }}>
                                            同時投注兩邊＝2 注成本，但仍有 {(SIDE_TIE_PROBABILITY * 100).toFixed(2)}% 機率兩注全空。
                                            兩邊都押的回報率仍是 {(expectedReturnRate(gameType) * 100).toFixed(2)}%，不會因為「包牌」而變好。
                                        </p>
                                    )}
                                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                                        <button className="btn btn-primary" onClick={() => handleSave([], SIDE_GAME_SPECS[gameType].label, sideSelections)}>
                                            💾 儲存至紀錄
                                        </button>
                                        {saveMsg && <span style={{ color: 'var(--success)', fontSize: '0.85rem' }}>{saveMsg}</span>}
                                    </div>
                                    <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <span className="badge badge-neutral">{SIDE_GAME_SPECS[gameType].icon} {SIDE_GAME_SPECS[gameType].label}</span>
                                        <span className="badge badge-success">{sideSelections.length} 注</span>
                                        <span className="badge badge-warning">{betMultiplier}x 倍</span>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                </>
            )}
        </div>
    );
}
