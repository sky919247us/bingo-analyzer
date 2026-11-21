/**
 * 排行榜：富豪榜、單期最大獎、本週、本月、最高連莊、總榜
 */
import { useEffect, useState } from 'react';
import { errorMessage, getLeaderboard, type LeaderboardResponse, type LeaderboardType } from '../api';

const TABS: { key: LeaderboardType; label: string; unit: string }[] = [
    { key: 'rich', label: '富豪榜', unit: '幣' },
    { key: 'maxWin', label: '單期最大獎', unit: '幣' },
    { key: 'week', label: '本週', unit: '幣' },
    { key: 'month', label: '本月', unit: '幣' },
    { key: 'streak', label: '最高連莊', unit: '連' },
    { key: 'total', label: '總榜', unit: '幣' },
];

interface Props {
    online: boolean;
    /** 變動時重新載入（例如結算後） */
    reloadKey: number;
}

export default function Leaderboard({ online, reloadKey }: Props) {
    const [tab, setTab] = useState<LeaderboardType>('rich');
    const [data, setData] = useState<LeaderboardResponse | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        setErr(null);
        getLeaderboard(tab, 50)
            .then((r) => { if (alive) setData(r); })
            .catch((e) => { if (alive) { setData(null); setErr(errorMessage(e)); } })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [tab, reloadKey, online]);

    const unit = TABS.find((t) => t.key === tab)?.unit ?? '';

    return (
        <section className="arcade-panel arcade-board" aria-label="排行榜">
            <h2 className="arcade-panel-title">排行榜</h2>
            <div className="arcade-tabs-scroll" role="tablist">
                {TABS.map((t) => (
                    <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
                        className={`arcade-tab${tab === t.key ? ' is-on' : ''}`} onClick={() => setTab(t.key)}>
                        {t.label}
                    </button>
                ))}
            </div>

            {!online && <p className="arcade-demo-note">試玩成績不計入排行，登入後才會上榜</p>}
            {online && data?.me && (
                <div className="arcade-board-me">我的名次：第 <b>{data.me.rank}</b> 名・{data.me.value.toLocaleString()} {unit}</div>
            )}

            {loading && <p className="arcade-muted">載入中…</p>}
            {!loading && err && <p className="arcade-muted">排行榜暫時無法連線（{err}）</p>}
            {!loading && !err && data && data.rows.length === 0 && <p className="arcade-muted">還沒有人上榜，搶頭香！</p>}
            {!loading && !err && data && data.rows.length > 0 && (
                <ol className="arcade-board-list">
                    {data.rows.map((r) => (
                        <li key={r.userId} className={r.rank <= 3 ? `is-top is-top${r.rank}` : ''}>
                            <span className="arcade-board-rank">{r.rank}</span>
                            {r.avatar
                                ? <img className="arcade-avatar arcade-avatar--sm" src={r.avatar} alt="" width={24} height={24} loading="lazy" referrerPolicy="no-referrer" />
                                : <span className="arcade-avatar arcade-avatar--sm arcade-avatar--empty" aria-hidden="true">{r.name.slice(0, 1)}</span>}
                            <span className="arcade-board-name">{r.name}</span>
                            <span className="arcade-board-val">{r.value.toLocaleString()} {unit}</span>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}
