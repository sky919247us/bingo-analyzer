/**
 * 戰績面板：代幣、活動券、今日收支、最大獎、最高連莊；簽到與破產救濟
 */
import { useState } from 'react';
import type { PanelStats } from '../account';
import { CHECKIN_COINS, RESCUE_COINS } from '../account';
import { errorMessage } from '../api';

interface Props {
    stats: PanelStats;
    demo: boolean;
    agreed: boolean;
    checkedIn: boolean;
    rescued: boolean;
    canRescue: boolean;
    onCheckin: () => Promise<number>;
    onRescue: () => Promise<number>;
    onResetDemo: () => void;
}

function Signed({ v }: { v: number }) {
    return <b className={v > 0 ? 'arcade-up' : v < 0 ? 'arcade-down' : ''}>{v > 0 ? '+' : ''}{v.toLocaleString()}</b>;
}

export default function StatsPanel({ stats, demo, agreed, checkedIn, rescued, canRescue, onCheckin, onRescue, onResetDemo }: Props) {
    const [msg, setMsg] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const run = async (fn: () => Promise<number>, label: string) => {
        setBusy(true);
        setMsg(null);
        try {
            const g = await fn();
            setMsg(`${label} +${g.toLocaleString()} 幣`);
        } catch (e) {
            setMsg(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="arcade-panel arcade-stats" aria-label="戰績">
            <h2 className="arcade-panel-title">我的戰績 {demo && <em className="arcade-tag arcade-tag--demo">試玩</em>}</h2>
            <div className="arcade-coins">
                <div className="arcade-coin-main">
                    <span className="arcade-coin-icon" aria-hidden="true">●</span>
                    <b>{stats.coins.toLocaleString()}</b>
                    <small>代幣</small>
                </div>
                <div className="arcade-coin-sub">活動券 <b>{stats.tickets.toLocaleString()}</b></div>
            </div>
            <dl className="arcade-statlist">
                <div><dt>今日收支</dt><dd><Signed v={stats.todayNet} /></dd></div>
                {stats.weekNet !== null && <div><dt>本週收支</dt><dd><Signed v={stats.weekNet} /></dd></div>}
                <div><dt>累計淨收益</dt><dd><Signed v={stats.totalNet} /></dd></div>
                <div><dt>單期最大獎</dt><dd><b>{stats.maxWin.toLocaleString()}</b></dd></div>
                <div><dt>目前連莊</dt><dd><b>{stats.curStreak}</b></dd></div>
                <div><dt>最高連莊</dt><dd><b>{stats.maxStreak}</b></dd></div>
            </dl>
            <div className="arcade-stats-actions">
                <button type="button" className="arcade-btn arcade-btn--neon" disabled={!agreed || checkedIn || busy}
                    onClick={() => run(onCheckin, '簽到')}>
                    {checkedIn ? '今日已簽到' : `每日簽到 +${CHECKIN_COINS}`}
                </button>
                <button type="button" className="arcade-btn arcade-btn--ghost" disabled={!agreed || !canRescue || busy}
                    onClick={() => run(onRescue, '破產救濟')} title="代幣＋活動券低於 25 時，每日可領一次">
                    {rescued ? '今日已領救濟' : `破產救濟 +${RESCUE_COINS.toLocaleString()}`}
                </button>
            </div>
            {msg && <p className="arcade-ok">{msg}</p>}
            {demo && (
                <button type="button" className="arcade-link" onClick={() => { if (window.confirm('確定要重置試玩代幣與戰績？')) onResetDemo(); }}>
                    重置試玩資料
                </button>
            )}
        </section>
    );
}
