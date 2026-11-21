/**
 * 每日任務蓋章卡：GET /api/missions、POST /api/missions/claim
 * - 已達成可領 → 印章格可點，領取後蓋章（有動畫；reduced-motion 時直接顯示結果）
 * - 試玩模式／伺服器連不到 → 只顯示任務內容，不能領
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArcadeApiError, claimMission, errorMessage, getMissions, type Mission } from '../api';
import { sfx } from '../audio';

/** 合約上的任務清單（試玩／離線時顯示用；登入時以伺服器回傳為準） */
const FALLBACK: Mission[] = [
    { code: 'checkin', title: '每日簽到', target: 1, progress: 0, reward: 100, done: false, claimed: false },
    { code: 'bet3', title: '玩 3 期', target: 3, progress: 0, reward: 100, done: false, claimed: false },
    { code: 'bet10', title: '下注 10 注', target: 10, progress: 0, reward: 150, done: false, claimed: false },
    { code: 'win1', title: '中獎 1 次', target: 1, progress: 0, reward: 150, done: false, claimed: false },
    { code: 'all', title: '全部蓋章', target: 4, progress: 0, reward: 500, done: false, claimed: false },
];

const ICON: Record<string, string> = { checkin: '📅', bet3: '🎰', bet10: '🎫', win1: '🏆', all: '👑' };

interface Props {
    online: boolean;
    agreed: boolean;
    /** 變動時重新取任務進度（例：下注、結算、簽到後） */
    reloadKey: string | number;
    /** 領獎成功後的新代幣餘額 */
    onCoins: (coins: number) => void;
}

export default function MissionCard({ online, agreed, reloadKey, onCoins }: Props) {
    const [missions, setMissions] = useState<Mission[] | null>(null);
    const [day, setDay] = useState<string | null>(null);
    const [loadErr, setLoadErr] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    /** 剛蓋章的格子（播一次蓋章動畫） */
    const [justStamped, setJustStamped] = useState<string | null>(null);
    const alive = useRef(true);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

    const load = useCallback(async () => {
        if (!online) { setMissions(null); setLoadErr(false); return; }
        try {
            const r = await getMissions();
            if (!alive.current) return;
            setMissions(Array.isArray(r.missions) ? r.missions : []);
            setDay(r.day ?? null);
            setLoadErr(false);
        } catch {
            if (alive.current) setLoadErr(true);
        }
    }, [online]);

    useEffect(() => { void load(); }, [load, reloadKey]);

    const claim = async (m: Mission) => {
        if (!online || !agreed || busy || !m.done || m.claimed) return;
        setBusy(m.code);
        setMsg(null);
        try {
            const r = await claimMission(m.code);
            setMissions((ms) => ms?.map((x) => (x.code === m.code ? { ...x, claimed: true } : x)) ?? ms);
            setJustStamped(m.code);
            setMsg({ ok: true, text: `${m.title} 蓋章完成 +${r.reward.toLocaleString()} 幣` });
            if (Number.isFinite(r.coins)) onCoins(r.coins);
            sfx.coin();
            void load(); // 「全部蓋章」可能因此達成
        } catch (e) {
            if (e instanceof ArcadeApiError && e.code === 'MISSION_CLAIMED') {
                setMissions((ms) => ms?.map((x) => (x.code === m.code ? { ...x, claimed: true } : x)) ?? ms);
            }
            setMsg({ ok: false, text: errorMessage(e) });
            void load();
        } finally {
            setBusy(null);
        }
    };

    const list = missions ?? FALLBACK;
    const stampedCount = list.filter((m) => m.claimed).length;

    return (
        <section className="arcade-panel arcade-missions" aria-label="每日任務">
            <h2 className="arcade-panel-title">
                每日任務 <small>{online && missions ? `${stampedCount}/${list.length} 已蓋章${day ? `・${day}` : ''}` : '每天 00:00 重置'}</small>
            </h2>
            {!online && <p className="arcade-muted arcade-missions-note">登入後完成任務即可蓋章領代幣（試玩模式不計）。</p>}
            {online && loadErr && (
                <p className="arcade-muted arcade-missions-note">
                    任務讀取失敗。<button type="button" className="arcade-link" onClick={() => void load()}>重試</button>
                </p>
            )}
            <ul className="arcade-stamps">
                {list.map((m) => {
                    const claimable = online && agreed && m.done && !m.claimed;
                    const state = m.claimed ? 'is-claimed' : claimable ? 'is-ready' : 'is-todo';
                    const progress = Math.min(m.progress, m.target);
                    return (
                        <li key={m.code}>
                            <button type="button"
                                className={`arcade-stamp ${state}${justStamped === m.code ? ' is-just' : ''}`}
                                disabled={!claimable || busy !== null}
                                onClick={() => void claim(m)}
                                onAnimationEnd={() => { if (justStamped === m.code) setJustStamped(null); }}
                                aria-label={`${m.title}，獎勵 ${m.reward} 幣，${m.claimed ? '已蓋章' : m.done ? '已達成，點擊蓋章領取' : `進度 ${progress}/${m.target}`}`}>
                                <span className="arcade-stamp-icon" aria-hidden="true">{ICON[m.code] ?? '★'}</span>
                                <span className="arcade-stamp-title">{m.title}</span>
                                <span className="arcade-stamp-sub">
                                    {m.claimed ? `+${m.reward}` : m.done ? (busy === m.code ? '蓋章中…' : '點我蓋章') : `${progress}/${m.target}・+${m.reward}`}
                                </span>
                                {m.claimed && <span className="arcade-stamp-ink" aria-hidden="true">已領</span>}
                            </button>
                        </li>
                    );
                })}
            </ul>
            {msg && <p className={msg.ok ? 'arcade-ok' : 'arcade-error'} role="status">{msg.text}</p>}
        </section>
    );
}
