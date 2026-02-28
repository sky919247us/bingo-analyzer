/**
 * 儀表板頁面
 * 顯示期望值熱力圖 + 快速計算面板
 */
import { useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell
} from 'recharts';
import { calculateAllProbabilities } from '../models/probability';
import { PRIZE_TABLES } from '../models/prize-table';
import { calculateTax } from '../models/tax';

/** 計算單一星數的期望值 */
function calculateExpectedValue(star: number, isPromo: boolean, withTax: boolean): number {
    const probs = calculateAllProbabilities(star);
    const table = PRIZE_TABLES.find((t) => t.star === star);
    if (!table) return 0;

    let ev = 0;
    for (const prob of probs) {
        const prizeEntry = table.prizes.find((p) => p.hitCount === prob.hitCount);
        if (prizeEntry) {
            let prize = isPromo && prizeEntry.promoPrize !== null
                ? prizeEntry.promoPrize
                : prizeEntry.normalPrize;

            if (withTax) {
                const taxResult = calculateTax(prize);
                prize = taxResult.netPrize;
            }

            ev += prob.probability * prize;
        }
    }

    return ev;
}

/** 期望值色彩映射 */
function getEvColor(ev: number): string {
    const ratio = ev / 25; // 相對於投注金額的比例
    if (ratio >= 0.8) return '#00ff87';
    if (ratio >= 0.6) return '#60a5fa';
    if (ratio >= 0.4) return '#fbbf24';
    return '#f87171';
}

export default function Dashboard() {
    // 期望值矩陣計算
    const evData = useMemo(() => {
        const data = [];
        for (let star = 1; star <= 10; star++) {
            const normal = calculateExpectedValue(star, false, false);
            const normalTax = calculateExpectedValue(star, false, true);
            const promo = calculateExpectedValue(star, true, false);
            const promoTax = calculateExpectedValue(star, true, true);

            data.push({
                star: `${star}星`,
                starNum: star,
                '常態(税前)': parseFloat(normal.toFixed(2)),
                '常態(税後)': parseFloat(normalTax.toFixed(2)),
                '加碼(税前)': parseFloat(promo.toFixed(2)),
                '加碼(税後)': parseFloat(promoTax.toFixed(2)),
                returnRate: parseFloat(((normal / 25) * 100).toFixed(1)),
                returnRateTax: parseFloat(((normalTax / 25) * 100).toFixed(1)),
                promoReturnRate: parseFloat(((promo / 25) * 100).toFixed(1)),
                promoReturnRateTax: parseFloat(((promoTax / 25) * 100).toFixed(1)),
            });
        }
        return data;
    }, []);

    // 返還率長條圖資料
    const returnRateData = useMemo(() => {
        return evData.map((d) => ({
            name: d.star,
            常態: d.returnRate,
            加碼: d.promoReturnRate,
        }));
    }, [evData]);

    return (
        <div className="animate-in">
            <h1 className="page-title"><span className="emoji-icon">📊</span> 研究室儀表板</h1>

            {/* 統計概覽 */}
            <div className="grid grid-4" style={{ marginBottom: 'var(--space-xl)' }}>
                <div className="glass-card stat-card">
                    <span className="stat-label">最佳星數（常態）</span>
                    <span className="stat-value">
                        {evData.reduce((best, d) => d['常態(税前)'] > best['常態(税前)'] ? d : best).star}
                    </span>
                </div>
                <div className="glass-card stat-card">
                    <span className="stat-label">最佳星數（加碼）</span>
                    <span className="stat-value">
                        {evData.reduce((best, d) => d['加碼(税前)'] > best['加碼(税前)'] ? d : best).star}
                    </span>
                </div>
                <div className="glass-card stat-card">
                    <span className="stat-label">最高返還率</span>
                    <span className="stat-value">
                        {Math.max(...evData.map((d) => d.promoReturnRate))}%
                    </span>
                </div>
                <div className="glass-card stat-card">
                    <span className="stat-label">資料年份</span>
                    <span className="stat-value">14年</span>
                </div>
            </div>

            {/* 期望值矩陣（熱力圖風格表格） */}
            <div className="glass-card" style={{ marginBottom: 'var(--space-xl)' }}>
                <h2 className="section-title">🔥 期望值熱力圖（單注 $25）</h2>
                <div style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>星數</th>
                                <th>常態(稅前)</th>
                                <th>常態(稅後)</th>
                                <th>加碼(稅前)</th>
                                <th>加碼(稅後)</th>
                                <th>常態返還率(稅前)</th>
                                <th>常態返還率(稅後)</th>
                                <th>加碼返還率(稅前)</th>
                                <th>加碼返還率(稅後)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {evData.map((row) => (
                                <tr key={row.starNum}>
                                    <td style={{ fontWeight: 700 }}>{row.star}</td>
                                    <td style={{ color: getEvColor(row['常態(税前)']) }}>
                                        ${row['常態(税前)'].toFixed(2)}
                                    </td>
                                    <td style={{ color: getEvColor(row['常態(税後)']) }}>
                                        ${row['常態(税後)'].toFixed(2)}
                                    </td>
                                    <td style={{ color: getEvColor(row['加碼(税前)']) }}>
                                        ${row['加碼(税前)'].toFixed(2)}
                                    </td>
                                    <td style={{ color: getEvColor(row['加碼(税後)']) }}>
                                        ${row['加碼(税後)'].toFixed(2)}
                                    </td>
                                    <td>
                                        <span className={row.returnRate >= 60 ? 'chip chip-green' : 'chip chip-red'}>
                                            {row.returnRate}%
                                        </span>
                                    </td>
                                    <td>
                                        <span className={row.returnRateTax >= 60 ? 'chip chip-green' : 'chip chip-red'}>
                                            {row.returnRateTax}%
                                        </span>
                                    </td>
                                    <td>
                                        <span className={row.promoReturnRate >= 60 ? 'chip chip-green' : 'chip chip-red'}>
                                            {row.promoReturnRate}%
                                        </span>
                                    </td>
                                    <td>
                                        <span className={row.promoReturnRateTax >= 60 ? 'chip chip-green' : 'chip chip-red'}>
                                            {row.promoReturnRateTax}%
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 返還率長條圖 */}
            <div className="glass-card">
                <h2 className="section-title">📈 返還率對照圖</h2>
                <ResponsiveContainer width="100%" height={360}>
                    <BarChart data={returnRateData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                        <YAxis stroke="#64748b" fontSize={12} unit="%" />
                        <Tooltip
                            contentStyle={{
                                background: 'rgba(17,24,39,0.95)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: 8,
                                color: '#f1f5f9',
                            }}
                            formatter={(value) => [`${value}%`, '']}
                        />
                        <Bar dataKey="常態" fill="#60a5fa" radius={[4, 4, 0, 0]}>
                            {returnRateData.map((entry, index) => (
                                <Cell key={index} fill={entry.常態 >= 60 ? '#60a5fa' : '#475569'} />
                            ))}
                        </Bar>
                        <Bar dataKey="加碼" fill="#00ff87" radius={[4, 4, 0, 0]}>
                            {returnRateData.map((entry, index) => (
                                <Cell key={index} fill={entry.加碼 >= 60 ? '#00ff87' : '#22c55e40'} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
