import { useMemo, useState } from 'react';
import { useSeo } from '../hooks/useSeo';
import { useBingoData } from '../hooks/useBingoData';
import PeriodSelector from '../components/PeriodSelector';
import {
    analyzeCombo,
    getNumberDetail,
    type NumberCount,
    type PairCount,
    type TripleCount,
    type ConsecutiveCount,
    type HeatTier,
} from '../utils/combo-analysis';
import '../styles/combos.css';

/** 熱度分級 → 顯示文字 */
const TIER_LABEL: Record<HeatTier, string> = {
    'extreme-hot': '極熱',
    hot: '偏熱',
    medium: '中庸',
    cold: '偏冷',
    'extreme-cold': '極冷',
};

const TIER_ORDER: HeatTier[] = ['extreme-hot', 'hot', 'medium', 'cold', 'extreme-cold'];

/** 單顆號碼球 */
function Ball({ n, size = 32, tone }: { n: number; size?: number; tone?: 'super' }) {
    return (
        <div
            className={`bingo-ball${tone === 'super' ? ' super' : ''}`}
            style={{ width: size, height: size, fontSize: size >= 32 ? '0.9rem' : '0.8rem' }}
        >
            {n}
        </div>
    );
}

function NumberCountRow({ item, cold }: { item: NumberCount; cold?: boolean }) {
    return (
        <div className="combo-row">
            <Ball n={item.number} />
            <span className={`combo-row-count${cold ? ' cold' : ''}`}>{item.count} 次</span>
        </div>
    );
}

function PairRow({ item }: { item: PairCount }) {
    return (
        <div className="combo-row">
            <div className="combo-row-balls">
                <Ball n={item.numbers[0]} size={30} />
                <span style={{ color: 'var(--text-muted)' }}>&</span>
                <Ball n={item.numbers[1]} size={30} />
            </div>
            <span className="combo-row-count">{item.count} 次</span>
        </div>
    );
}

function TripleRow({ item }: { item: TripleCount }) {
    return (
        <div className="combo-row">
            <div className="combo-row-balls">
                {item.numbers.map((n, idx) => (
                    <span key={n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {idx > 0 && <span style={{ color: 'var(--text-muted)' }}>&</span>}
                        <Ball n={n} size={28} />
                    </span>
                ))}
            </div>
            <span className="combo-row-count">{item.count} 次</span>
        </div>
    );
}

function ConsecutiveRow({ item }: { item: ConsecutiveCount }) {
    return (
        <div className="combo-row">
            <div className="combo-row-balls">
                {item.numbers.map((n) => (
                    <Ball key={n} n={n} size={28} />
                ))}
            </div>
            <span className="combo-row-count">{item.count} 次</span>
        </div>
    );
}

export default function BingoCombos() {
    useSeo({
        title: '組合分析',
        description: '賓果賓果組合分析：熱門冷門單碼、同出雙星三星、連號組合與 80 碼熱度分級一次掌握。',
        keywords: '賓果組合分析, 賓果同出號碼, 賓果連號',
    });

    const { draws, loading, error } = useBingoData();
    const [periods, setPeriods] = useState(30);
    const [selectedNumber, setSelectedNumber] = useState<number | null>(null);

    /** 依選取期數截取最新 N 期（draws 由新到舊排列） */
    const sample = useMemo(() => draws.slice(0, periods), [draws, periods]);

    const analysis = useMemo(() => analyzeCombo(sample), [sample]);

    const detail = useMemo(() => {
        if (selectedNumber === null) return null;
        return getNumberDetail(sample, selectedNumber);
    }, [sample, selectedNumber]);

    const legendColors: Record<HeatTier, string> = {
        'extreme-hot': '#D32F2F',
        hot: '#F39C12',
        medium: '#60A5FA',
        cold: '#3B5F82',
        'extreme-cold': '#5A6268',
    };

    return (
        <div className="animate-in">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <h1 className="page-title">
                    <span className="emoji-icon">🧩</span> 組合分析
                </h1>
            </div>

            <div className="glass-card" style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <h3 className="section-title" style={{ marginBottom: 0 }}>📅 分析期數</h3>
                    <PeriodSelector value={periods} onChange={setPeriods} />
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 10, marginBottom: 0 }}>
                    目前分析最近 <strong style={{ color: 'var(--text-main)' }}>{analysis.sampleSize}</strong> 期開獎資料
                </p>
            </div>

            {error && <div className="error-message">載入失敗: {error}</div>}
            {loading && <div className="loading-spinner" />}

            {!loading && sample.length === 0 && !error && (
                <div className="glass-card combo-empty">尚無足夠開獎資料可供分析</div>
            )}

            {!loading && sample.length > 0 && (
                <>
                    {/* a) 熱門單碼 / 冷門單碼 */}
                    <div className="grid grid-2 combo-section">
                        <div className="glass-card">
                            <h3 className="section-title">🔥 熱門單碼 Top10</h3>
                            <div className="combo-list">
                                {analysis.hotTop10.map((item) => (
                                    <NumberCountRow key={item.number} item={item} />
                                ))}
                            </div>
                        </div>
                        <div className="glass-card">
                            <h3 className="section-title">🧊 冷門單碼 Bottom10</h3>
                            <div className="combo-list">
                                {analysis.coldBottom10.map((item) => (
                                    <NumberCountRow key={item.number} item={item} cold />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* b) 同出雙星 / 三星 */}
                    <div className="grid grid-2 combo-section">
                        <div className="glass-card">
                            <h3 className="section-title">🔗 同出雙星 Top8</h3>
                            <div className="combo-list">
                                {analysis.pairTop8.length === 0 && <div className="combo-empty">尚無資料</div>}
                                {analysis.pairTop8.map((item) => (
                                    <PairRow key={item.numbers.join('-')} item={item} />
                                ))}
                            </div>
                        </div>
                        <div className="glass-card">
                            <h3 className="section-title">🎯 同出三星 Top6</h3>
                            <div className="combo-list">
                                {analysis.tripleTop6.length === 0 && <div className="combo-empty">尚無資料</div>}
                                {analysis.tripleTop6.map((item) => (
                                    <TripleRow key={item.numbers.join('-')} item={item} />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* c) 連號雙星 / 三星 / 四星 */}
                    <div className="grid grid-3 combo-section">
                        <div className="glass-card">
                            <h3 className="section-title">🔢 連號雙星 Top8</h3>
                            <div className="combo-list">
                                {analysis.consecutivePairTop8.length === 0 && <div className="combo-empty">尚無資料</div>}
                                {analysis.consecutivePairTop8.map((item) => (
                                    <ConsecutiveRow key={item.numbers.join('-')} item={item} />
                                ))}
                            </div>
                        </div>
                        <div className="glass-card">
                            <h3 className="section-title">🔢 連號三星 Top6</h3>
                            <div className="combo-list">
                                {analysis.consecutiveTripleTop6.length === 0 && <div className="combo-empty">尚無資料</div>}
                                {analysis.consecutiveTripleTop6.map((item) => (
                                    <ConsecutiveRow key={item.numbers.join('-')} item={item} />
                                ))}
                            </div>
                        </div>
                        <div className="glass-card">
                            <h3 className="section-title">🔢 連號四星 Top4</h3>
                            <div className="combo-list">
                                {analysis.consecutiveQuadTop4.length === 0 && <div className="combo-empty">尚無資料</div>}
                                {analysis.consecutiveQuadTop4.map((item) => (
                                    <ConsecutiveRow key={item.numbers.join('-')} item={item} />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* d) 80 碼頻率熱力圖 + e) 點選詳細資料 */}
                    <div className="glass-card combo-section">
                        <h3 className="section-title">🌡️ 80 碼熱度分級</h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: -6, marginBottom: 12 }}>
                            點選任一號碼可查看它最常同出的號碼與連號組合
                        </p>
                        <div className="combo-heatgrid">
                            {analysis.heatGrid.map((cell) => (
                                <button
                                    key={cell.number}
                                    type="button"
                                    className={`combo-heat-cell tier-${cell.tier}${selectedNumber === cell.number ? ' selected' : ''}`}
                                    title={`${cell.number} 號：${cell.count} 次（${TIER_LABEL[cell.tier]}）`}
                                    onClick={() => setSelectedNumber(cell.number === selectedNumber ? null : cell.number)}
                                >
                                    {cell.number.toString().padStart(2, '0')}
                                </button>
                            ))}
                        </div>

                        <div className="combo-heat-legend">
                            {TIER_ORDER.map((tier) => (
                                <div key={tier} className="combo-heat-legend-item">
                                    <span className="combo-heat-legend-swatch" style={{ background: legendColors[tier] }} />
                                    {TIER_LABEL[tier]}
                                </div>
                            ))}
                        </div>

                        {detail && (
                            <div className="combo-detail-panel">
                                <div className="combo-detail-title">
                                    <Ball n={detail.number} tone="super" size={34} />
                                    <span>{detail.number} 號 詳細組合資料</span>
                                    <button
                                        type="button"
                                        className="combo-detail-close"
                                        onClick={() => setSelectedNumber(null)}
                                    >
                                        關閉
                                    </button>
                                </div>

                                <h4 style={{ fontSize: '0.9rem', color: 'var(--primary)', margin: '0 0 8px' }}>
                                    最常同出號碼 Top5
                                </h4>
                                <div className="combo-list" style={{ marginBottom: 16 }}>
                                    {detail.topPartners.length === 0 && <div className="combo-empty">尚無同出紀錄</div>}
                                    {detail.topPartners.map((p) => (
                                        <NumberCountRow key={p.number} item={p} />
                                    ))}
                                </div>

                                <h4 style={{ fontSize: '0.9rem', color: 'var(--primary)', margin: '0 0 8px' }}>
                                    參與的連號組合
                                </h4>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    {detail.consecutiveCombos.length === 0 && (
                                        <div className="combo-empty">尚無連號紀錄</div>
                                    )}
                                    {detail.consecutiveCombos.map((c) => (
                                        <span key={c.numbers.join('-')} className="combo-combo-item">
                                            {c.numbers.join('-')}（{c.count} 次）
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
