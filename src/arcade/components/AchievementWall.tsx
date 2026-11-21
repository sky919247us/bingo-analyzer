/**
 * 成就徽章牆：GET /api/achievements（只有徽章，不發幣）
 * - 未解鎖：灰階＋達成條件
 * - 新解鎖：透過 onUnlocked 通知頁面（頁面用 toast／跑馬燈提示）
 * - 試玩／離線：顯示合約上的清單，全部未解鎖
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getAchievements, type Achievement } from '../api';

/** 合約上的成就清單（伺服器沒回 title/desc/icon 時補上；試玩／離線時顯示） */
const CATALOG: { code: string; title: string; desc: string; icon: string }[] = [
    { code: 'first_bet', title: '初次下注', desc: '第一次下注', icon: '🎲' },
    { code: 'first_win', title: '初次中獎', desc: '第一次中獎', icon: '🎉' },
    { code: 'star5_win', title: '五星高手', desc: '5 星以上的基本玩法中獎', icon: '⭐' },
    { code: 'star8_win', title: '八星傳說', desc: '8 星以上的基本玩法中獎', icon: '🌟' },
    { code: 'super_hit', title: '超級命中', desc: '猜中超級獎號', icon: '🎯' },
    { code: 'big_10k', title: '萬元大獎', desc: '單期派彩 ≥ 10,000', icon: '💰' },
    { code: 'big_100k', title: '十萬巨獎', desc: '單期派彩 ≥ 100,000', icon: '💎' },
    { code: 'streak3', title: '三連莊', desc: '連莊 3 期', icon: '🔥' },
    { code: 'streak5', title: '五連莊', desc: '連莊 5 期', icon: '☄️' },
    { code: 'streak10', title: '十連莊', desc: '連莊 10 期', icon: '🌈' },
    { code: 'bets100', title: '百注玩家', desc: '累計下注 100 注', icon: '🎫' },
    { code: 'bets1000', title: '千注老手', desc: '累計下注 1,000 注', icon: '🎟️' },
    { code: 'checkin7', title: '勤勞簽到', desc: '累計簽到 7 天', icon: '📅' },
    { code: 'net_100k', title: '十萬淨收益', desc: '總淨收益 ≥ 100,000', icon: '🏦' },
    { code: 'rescued', title: '浴火重生', desc: '領過破產救濟', icon: '🛟' },
];

const SEEN_KEY = 'arcade-ach-seen';

function readSeen(userId: string): Set<string> | null {
    try {
        const raw = localStorage.getItem(`${SEEN_KEY}-${userId}`);
        return raw ? new Set(JSON.parse(raw) as string[]) : null;
    } catch { return null; }
}
function writeSeen(userId: string, codes: string[]): void {
    try { localStorage.setItem(`${SEEN_KEY}-${userId}`, JSON.stringify(codes)); } catch { /* 忽略 */ }
}

function merge(list: Achievement[]): Achievement[] {
    const byCode = new Map(CATALOG.map((c) => [c.code, c]));
    return list.map((a) => {
        const c = byCode.get(a.code);
        return { ...a, title: a.title || c?.title || a.code, desc: a.desc || c?.desc || '', icon: a.icon || c?.icon || '🏅' };
    });
}

function fmtDate(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
}

interface Props {
    online: boolean;
    userId: string | null;
    reloadKey: string | number;
    onUnlocked: (items: Achievement[]) => void;
}

export default function AchievementWall({ online, userId, reloadKey, onUnlocked }: Props) {
    const [list, setList] = useState<Achievement[] | null>(null);
    const [loadErr, setLoadErr] = useState(false);
    const onUnlockedRef = useRef(onUnlocked);
    onUnlockedRef.current = onUnlocked;

    const load = useCallback(async () => {
        if (!online || !userId) { setList(null); setLoadErr(false); return; }
        try {
            const r = await getAchievements();
            const items = merge(Array.isArray(r.achievements) ? r.achievements : []);
            setList(items);
            setLoadErr(false);
            const unlocked = items.filter((a) => a.unlocked).map((a) => a.code);
            const seen = readSeen(userId);
            // 第一次在這台裝置看到：當作基準，不一次跳一堆提示
            if (seen) {
                const fresh = items.filter((a) => a.unlocked && !seen.has(a.code));
                if (fresh.length > 0) onUnlockedRef.current(fresh);
            }
            writeSeen(userId, unlocked);
        } catch {
            setLoadErr(true);
        }
    }, [online, userId]);

    useEffect(() => { void load(); }, [load, reloadKey]);

    const shown: Achievement[] = list ?? CATALOG.map((c) => ({ ...c, unlocked: false, unlockedAt: null }));
    const count = shown.filter((a) => a.unlocked).length;

    return (
        <section className="arcade-panel arcade-achv" aria-label="成就徽章">
            <h2 className="arcade-panel-title">成就徽章 <small>{count}/{shown.length}</small></h2>
            {!online && <p className="arcade-muted arcade-missions-note">登入後才會記錄成就（徽章，不發代幣）。</p>}
            {online && loadErr && (
                <p className="arcade-muted arcade-missions-note">
                    成就讀取失敗。<button type="button" className="arcade-link" onClick={() => void load()}>重試</button>
                </p>
            )}
            <ul className="arcade-badges">
                {shown.map((a) => (
                    <li key={a.code} className={`arcade-badge-item${a.unlocked ? ' is-unlocked' : ' is-locked'}`}
                        aria-label={`${a.title}：${a.unlocked ? '已解鎖' : `未解鎖，條件：${a.desc}`}`}>
                        <span className="arcade-badge-icon" aria-hidden="true">{a.icon}</span>
                        <span className="arcade-badge-title">{a.title}</span>
                        <span className="arcade-badge-desc">{a.unlocked ? (fmtDate(a.unlockedAt) || '已解鎖') : a.desc}</span>
                    </li>
                ))}
            </ul>
        </section>
    );
}

/** 成就解鎖提示（沿用大獎 toast 的樣式） */
export function AchievementToast({ item, onClose }: { item: Achievement | null; onClose: () => void }) {
    if (!item) return null;
    return (
        <div className="arcade-toast arcade-toast--achv" role="status" aria-live="polite">
            <span className="arcade-toast-title">成就解鎖</span>
            <span className="arcade-toast-text">{item.icon} {item.title}</span>
            <button type="button" className="arcade-toast-close" onClick={onClose} aria-label="關閉成就提示">×</button>
        </div>
    );
}
