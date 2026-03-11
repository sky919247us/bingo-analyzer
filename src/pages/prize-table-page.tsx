import { useSeo } from '../hooks/useSeo';
/**
 * 完整獎金表分頁
 * 顯示常態/加碼與稅前/稅後的四種獎金結構
 */
import { PRIZE_TABLES } from '../models/prize-table';
import { calculateTax } from '../models/tax';

export default function PrizeTablePage() {
    useSeo({ title: '各星玩法獎金表', description: '台灣彩券賓果賓果1星至10星完整中獎機率與固定彩金對照表。', keywords: '賓果機率, 賓果獎金' });
    // 預先對各星數的獎金結構反轉排序 (10星~1星) 顯示，並生成 4 種狀態的表格
    const reversedTables = [...PRIZE_TABLES].reverse();

    /** 內部元件：渲染單一狀態的獎金表 */
    const renderTable = (isPromo: boolean, isTaxed: boolean, title: string, themeColor: string) => (
        <div className="card">
            <h2 className="section-title" style={{ color: themeColor }}>{title}</h2>
            <div className="table-container" style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ minWidth: '400px' }}>
                    <thead>
                        <tr>
                            <th style={{ width: '80px' }}>星數</th>
                            <th style={{ width: '80px' }}>命中數</th>
                            <th>獎金金額</th>
                            {isTaxed && <th>稅後實拿</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {reversedTables.map((table) => {
                            // 隱藏該模式下沒有獎金設定的命中組合
                            const validPrizes = table.prizes.filter(
                                (p) => isPromo ? p.promoPrize !== null : p.normalPrize > 0
                            ).sort((a, b) => b.hitCount - a.hitCount);

                            if (validPrizes.length === 0) return null;

                            return validPrizes.map((prize, idx) => {
                                const gross = isPromo ? (prize.promoPrize || 0) : prize.normalPrize;
                                const taxData = calculateTax(gross);

                                return (
                                    <tr key={`${table.star}-${prize.hitCount}`}>
                                        {idx === 0 && (
                                            <td rowSpan={validPrizes.length} style={{ fontWeight: 700, verticalAlign: 'top', borderRight: '1px solid var(--border-light)' }}>
                                                {table.star} 星
                                            </td>
                                        )}
                                        <td>中 {prize.hitCount} 顆</td>
                                        <td>
                                            <span style={{ color: gross > 0 ? 'var(--primary)' : 'var(--text-muted)', fontWeight: gross > 0 ? 700 : 400 }}>
                                                ${gross.toLocaleString()}
                                            </span>
                                        </td>
                                        {isTaxed && (
                                            <td>
                                                <span
                                                    style={{ color: taxData.isTaxable ? 'var(--danger)' : 'var(--success)', fontWeight: 700 }}
                                                    title={taxData.isTaxable ? `扣稅額: $${taxData.totalTax.toLocaleString()}` : '免扣稅'}
                                                >
                                                    ${taxData.netPrize.toLocaleString()}
                                                </span>
                                            </td>
                                        )}
                                    </tr>
                                );
                            });
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <div className="animate-in">
            <h1 className="page-title"><span className="emoji-icon">🏆</span> 完整獎金表（單注 $25 基準）</h1>

            <div className="grid grid-2" style={{ gap: 'var(--space-xl)' }}>
                {renderTable(false, false, '🔹 常態獎金表（稅前）', '#60a5fa')}
                {renderTable(false, true, '🔹 常態獎金表（稅後實拿）', '#93c5fd')}
                {renderTable(true, false, '🔥 加碼獎金表（稅前）', '#fbbf24')}
                {renderTable(true, true, '🔥 加碼獎金表（稅後實拿）', '#fcd34d')}
            </div>
        </div>
    );
}
