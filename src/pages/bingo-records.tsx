import { useSeo } from '../hooks/useSeo';
/**
 * 歷史紀錄頁面
 * 列出所有儲存的預測/自選紀錄，支援兌獎功能（自動比對開獎結果）
 */
import { useState, useEffect, useCallback } from 'react';
import {
    getRecords,
    deleteRecord,
    clearRecords,
    type PredictionRecord,
} from '../utils/bingo-storage';
import {
    checkRecord,
    type CheckResult,
    type SingleDrawCheckResult,
} from '../utils/bingo-checker';

export default function BingoRecords() {
    useSeo({ title: '預測兌獎記錄', description: '全面追蹤並檢驗過去所有專注賓果中獎與預測的歷史紀錄。', keywords: '歷史開獎記錄, 預測驗證' });
    const [records, setRecords] = useState<PredictionRecord[]>([]);
    const [checkResults, setCheckResults] = useState<Map<string, CheckResult>>(new Map());
    const [checkingId, setCheckingId] = useState<string | null>(null);

    /** 載入紀錄 */
    const loadRecords = useCallback(() => {
        setRecords(getRecords());
    }, []);

    useEffect(() => {
        loadRecords();
    }, [loadRecords]);

    /** 刪除單筆 */
    const handleDelete = (id: string) => {
        deleteRecord(id);
        setCheckResults((prev) => {
            const next = new Map(prev);
            next.delete(id);
            return next;
        });
        loadRecords();
    };

    /** 全部清除 */
    const handleClear = () => {
        if (!window.confirm('確定要清除所有歷史紀錄嗎？')) return;
        clearRecords();
        setCheckResults(new Map());
        loadRecords();
    };

    /** 對單筆紀錄進行兌獎 */
    const handleCheck = async (record: PredictionRecord) => {
        setCheckingId(record.id);
        try {
            const result = await checkRecord(record);
            setCheckResults((prev) => new Map(prev).set(record.id, result));
        } catch (err) {
            console.error('兌獎失敗:', err);
        } finally {
            setCheckingId(null);
        }
    };

    /** 對所有紀錄進行兌獎 */
    const handleCheckAll = async () => {
        setCheckingId('all');
        try {
            for (const record of records) {
                const result = await checkRecord(record);
                setCheckResults((prev) => new Map(prev).set(record.id, result));
            }
        } catch (err) {
            console.error('批次兌獎失敗:', err);
        } finally {
            setCheckingId(null);
        }
    };

    /** 渲染單期兌獎結果 */
    const renderDrawResult = (dr: SingleDrawCheckResult, idx: number) => {
        // 算出開獎的單雙大小和值
        const sum = dr.drawNumbers.reduce((a, b) => a + b, 0);
        const sumResult = sum >= 811 ? '大和' : '小和';
        let bigCount = 0; let oddCount = 0;
        dr.drawNumbers.forEach(n => {
            if (n > 40) bigCount++;
            if (n % 2 !== 0) oddCount++;
        });
        const bsResult = bigCount > 10 ? '大' : (bigCount < 10 ? '小' : '和');
        const oeResult = oddCount > 10 ? '單' : (oddCount < 10 ? '雙' : '和');

        return (
            <div
                key={dr.period}
                style={{
                    padding: '8px 12px',
                    background: dr.prize > 0 ? 'rgba(30,132,73,0.08)' : 'var(--bg-page)',
                    borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${dr.prize > 0 ? 'var(--success)' : 'var(--border-light)'}`,
                    fontSize: '0.85rem',
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, color: 'var(--primary)' }}>
                            第{idx + 1}期 #{dr.period}
                        </span>
                        <div style={{ display: 'flex', gap: 4 }}>
                            <span className="badge" style={{ background: bsResult === '大' ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)', color: bsResult === '大' ? 'var(--danger)' : 'var(--accent-blue)', fontSize: '0.65rem', padding: '0 4px' }}>{bsResult}</span>
                            <span className="badge" style={{ background: oeResult === '單' ? 'rgba(245,158,11,0.1)' : 'rgba(167,139,250,0.1)', color: oeResult === '單' ? 'var(--warning)' : '#a78bfa', fontSize: '0.65rem', padding: '0 4px' }}>{oeResult}</span>
                            <span className="badge" style={{ background: sumResult === '大和' ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)', color: sumResult === '大和' ? 'var(--danger)' : 'var(--accent-blue)', fontSize: '0.65rem', padding: '0 4px' }}>{sumResult}</span>
                        </div>
                    </div>
                    {dr.prize > 0 ? (
                        <span className="badge badge-success" style={{ fontSize: '0.8rem' }}>
                            🎉 中獎 ${dr.prize.toLocaleString()}
                        </span>
                    ) : (
                        <span className="badge badge-neutral" style={{ fontSize: '0.8rem' }}>未中獎</span>
                    )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {dr.drawNumbers.slice(0, 20).map((n) => {
                        const isHit = dr.hitNumbers.includes(n);
                        return (
                            <span
                                key={n}
                                style={{
                                    display: 'inline-block', width: 24, height: 24,
                                    lineHeight: '24px', textAlign: 'center',
                                    borderRadius: '50%', fontSize: '0.6rem', fontWeight: 700,
                                    background: isHit ? 'var(--success)' : 'var(--border-light)',
                                    color: isHit ? 'var(--text-inverse)' : 'var(--text-muted)',
                                }}
                            >
                                {n}
                            </span>
                        );
                    })}
                </div>
                <div style={{ marginTop: 4, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    命中 {dr.hitCount} 顆：{dr.hitNumbers.length > 0 ? dr.hitNumbers.join(', ') : '—'}
                </div>
            </div>
        );
    };

    return (
        <div className="animate-in">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                <h1 className="page-title" style={{ marginBottom: 0 }}>📋 歷史紀錄</h1>
                <div style={{ display: 'flex', gap: 8 }}>
                    {records.length > 0 && (
                        <>
                            <button
                                className="btn btn-primary"
                                onClick={handleCheckAll}
                                disabled={checkingId !== null}
                                style={{ opacity: checkingId ? 0.5 : 1 }}
                            >
                                {checkingId === 'all' ? '⏳ 兌獎中...' : '🎰 全部兌獎'}
                            </button>
                            <button className="btn btn-action" onClick={handleClear}>
                                🗑️ 全部清除
                            </button>
                        </>
                    )}
                </div>
            </div>

            {records.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 48 }}>
                    <div style={{ fontSize: 48 }}>📭</div>
                    <p style={{ color: 'var(--text-muted)', marginTop: 12 }}>目前沒有儲存的預測紀錄</p>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 8 }}>
                        前往「號碼預測」頁面產生預測結果並點擊「儲存至紀錄」
                    </p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {records.map((record) => {
                        const result = checkResults.get(record.id);
                        const isChecking = checkingId === record.id;

                        return (
                            <div key={record.id} className="card animate-in">
                                {/* 標頭資訊列 */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                        <span className="badge badge-neutral">{record.strategy}</span>
                                        <span className="badge badge-success">{record.starCount} 星</span>
                                        <span className="badge badge-warning">{record.betMultiplier}x</span>
                                        <span className="badge badge-neutral">{record.periodCount || 1} 期</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        <button
                                            className="btn btn-primary"
                                            onClick={() => handleCheck(record)}
                                            disabled={isChecking}
                                            style={{ padding: '4px 12px', fontSize: '0.8rem', opacity: isChecking ? 0.5 : 1 }}
                                        >
                                            {isChecking ? '⏳...' : '🎰 兌獎'}
                                        </button>
                                        <button
                                            className="btn btn-secondary"
                                            onClick={() => handleDelete(record.id)}
                                            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>

                                {/* 預測號碼 */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                                    {record.numbers.map((num) => (
                                        <div key={num} className="bingo-ball selected">{num}</div>
                                    ))}
                                </div>

                                {/* 紀錄資訊 */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    <span>📅 {record.savedAt}</span>
                                    <span>
                                        {record.startPeriod && `起始期: #${record.startPeriod} · `}
                                        成本: NT$ {record.estimatedCost?.toLocaleString() || (25 * record.betMultiplier)}
                                    </span>
                                </div>

                                {/* 兌獎結果 */}
                                {result && (
                                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '2px solid var(--border-light)' }}>
                                        {/* 總結橫幅 */}
                                        <div style={{
                                            padding: '12px 16px',
                                            borderRadius: 'var(--radius-sm)',
                                            marginBottom: 12,
                                            background: result.allDrawn
                                                ? (result.netProfit >= 0 ? 'rgba(30,132,73,0.1)' : 'rgba(211,47,47,0.08)')
                                                : 'rgba(243,156,18,0.1)',
                                            border: `1px solid ${result.allDrawn
                                                ? (result.netProfit >= 0 ? 'var(--success)' : 'var(--danger)')
                                                : 'var(--warning)'}`,
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                                                <div>
                                                    <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--primary)' }}>
                                                        {result.allDrawn ? '✅ 兌獎完成' : `⏳ 尚有 ${result.totalPeriods - result.drawnCount} 期未開獎`}
                                                    </span>
                                                    <span style={{ marginLeft: 12, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                        已開 {result.drawnCount}/{result.totalPeriods} 期
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>總獎金</div>
                                                        <div style={{ fontWeight: 800, fontSize: '1.2rem', color: result.totalPrize > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                                                            ${result.totalPrize.toLocaleString()}
                                                        </div>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>淨損益</div>
                                                        <div style={{
                                                            fontWeight: 800, fontSize: '1.2rem',
                                                            color: result.netProfit >= 0 ? 'var(--success)' : 'var(--danger)',
                                                        }}>
                                                            {result.netProfit >= 0 ? '+' : ''}{result.netProfit.toLocaleString()}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* 各期明細 */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {result.drawResults.map((dr, idx) => {
                                                if (dr.drawn) {
                                                    return renderDrawResult(dr as SingleDrawCheckResult, idx);
                                                }
                                                // 未開獎
                                                return (
                                                    <div
                                                        key={`pending-${idx}`}
                                                        style={{
                                                            padding: '8px 12px',
                                                            background: 'rgba(243,156,18,0.06)',
                                                            borderRadius: 'var(--radius-sm)',
                                                            border: '1px dashed var(--warning)',
                                                            fontSize: '0.85rem',
                                                            color: 'var(--warning)',
                                                            fontWeight: 600,
                                                        }}
                                                    >
                                                        ⏳ 第{idx + 1}期 — 尚未開獎
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
