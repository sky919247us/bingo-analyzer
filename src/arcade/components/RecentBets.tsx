/**
 * 我的近期注單（登入模式）：未開獎／中獎／未中／已退款
 * 退款相容兩種後端寫法：status='refunded'，或 status='settled' 加 refunded=1
 */
import { useEffect, useState } from 'react';
import { getRecentBets, isRefunded, rowToItem, type BetRow } from '../api';
import { itemLabel } from '../payout';
import { shortDateIfOther } from '../multi';

interface Props {
    reloadKey: string | number;
    /** 期別 → 開獎日期（台北），跨日的期別標日期 */
    periodDate: (period: string) => string | null;
    today: string;
}

function statusOf(b: BetRow): { cls: string; text: string } {
    if (isRefunded(b)) return { cls: 'is-refunded', text: `已退款 ${(b.costCoins + b.costTickets).toLocaleString()}` };
    if (b.status === 'pending') return { cls: 'is-pending', text: '未開獎' };
    if ((b.payout ?? 0) > 0) return { cls: 'is-win', text: `中 +${(b.payout ?? 0).toLocaleString()}` };
    return { cls: 'is-lose', text: '未中' };
}

export default function RecentBets({ reloadKey, periodDate, today }: Props) {
    const [rows, setRows] = useState<BetRow[] | null>(null);
    const [err, setErr] = useState(false);

    useEffect(() => {
        let alive = true;
        getRecentBets(20)
            .then(({ bets }) => { if (alive) { setRows(Array.isArray(bets) ? bets : []); setErr(false); } })
            .catch(() => { if (alive) setErr(true); });
        return () => { alive = false; };
    }, [reloadKey]);

    return (
        <section className="arcade-panel arcade-recent" aria-label="近期注單">
            <h2 className="arcade-panel-title">近期注單</h2>
            {err && !rows && <p className="arcade-muted">注單讀取失敗，稍後會再試。</p>}
            {rows && rows.length === 0 && <p className="arcade-muted">還沒有注單</p>}
            {rows && rows.length > 0 && (
                <ul className="arcade-recent-list">
                    {rows.map((b) => {
                        const it = rowToItem(b);
                        const s = statusOf(b);
                        // 注單的開獎日期：期別推算優先，推不出時用下注日期判斷
                        const d = shortDateIfOther(periodDate(b.period), today);
                        return (
                            <li key={b.id}>
                                <span className="arcade-recent-period">{d && <em className="arcade-date-tag">{d}</em>}第 {b.period} 期</span>
                                <span className="arcade-recent-item">{it ? itemLabel(it) : b.game} ×{b.multiplier}</span>
                                <span className={`arcade-bet-status ${s.cls}`}>{s.text}</span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
