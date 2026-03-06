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

/** 賓果賓果每注基本金額 */
const BASE_BET = 25;

/** 產生 1-80 陣列 */
const ALL_NUMBERS = Array.from({ length: 80 }, (_, i) => i + 1);

/** 台彩官方支援的期數選項 */
const PERIOD_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12];

export default function BingoPrediction() {
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

    /** 取出分析區間的資料 */
    const analysisDraws = useMemo(() => draws.slice(0, range), [draws, range]);

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

    /** 儲存紀錄（策略或自選） */
    const handleSave = (numbers: number[], label: string) => {
        if (numbers.length === 0) return;
        // 取得當前最新期號作為起始期
        const currentPeriod = draws.length > 0 ? draws[0].period : '';
        saveRecord({
            strategy: label,
            numbers,
            starCount,
            analysisRange: range,
            betMultiplier,
            estimatedCost: BASE_BET * betMultiplier * periodCount,
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
                    {/* 模式切換 Tab */}
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

                    {/* 共用：星數選擇 */}
                    <div className="card" style={{ marginBottom: 20 }}>
                        <h3 className="section-title">⭐ 玩法設定</h3>
                        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
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
                            <div>
                                <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>
                                    投注倍數
                                </label>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {[1, 2, 5, 10, 25, 50].map((m) => (
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
                        </div>
                        <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg-page)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                            <span style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>
                                預估總成本：<strong style={{ color: 'var(--warning)', fontSize: '1.1rem' }}>
                                    NT$ {(BASE_BET * betMultiplier * periodCount).toLocaleString()}
                                </strong>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: 8 }}>
                                    （$25 × {betMultiplier}倍 × {periodCount}期）
                                </span>
                            </span>
                        </div>
                    </div>

                    {/* ====== Tab: 策略預測 ====== */}
                    {tab === 'strategy' && (
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
                    {tab === 'manual' && (
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
                </>
            )}
        </div>
    );
}
