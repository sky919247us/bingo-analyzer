/**
 * 賓果娛樂機 — 管理員發幣頁（不進側邊欄）
 * 由 Worker 判斷是否為管理員；非管理員顯示無權限
 */
import { useEffect, useState } from 'react';
import { useSeo } from '../hooks/useSeo';
import {
    adminGrant, adminLedger, adminSearchUsers, errorMessage, getMe, getToken, lineLoginUrl,
    type AdminUser, type LedgerRow, type MeResponse,
} from '../arcade/api';
import { DisclaimerBar } from '../arcade/components/Disclaimer';
import '../arcade/arcade.css';

type Gate = 'loading' | 'guest' | 'forbidden' | 'ok' | 'offline';

export default function ArcadeAdmin() {
    useSeo({ title: '娛樂機管理', description: '賓果娛樂機管理員後台' });

    const [gate, setGate] = useState<Gate>('loading');
    const [me, setMe] = useState<MeResponse | null>(null);
    const [q, setQ] = useState('');
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [sel, setSel] = useState<AdminUser | null>(null);
    const [currency, setCurrency] = useState<'coins' | 'tickets'>('tickets');
    const [amount, setAmount] = useState('1000');
    const [reason, setReason] = useState('');
    const [ledger, setLedger] = useState<LedgerRow[]>([]);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!getToken()) { setGate('guest'); return; }
        getMe()
            .then((m) => { setMe(m); setGate(m.user.isAdmin ? 'ok' : 'forbidden'); })
            .catch((e) => setGate(e?.status === 401 ? 'guest' : 'offline'));
    }, []);

    const search = async () => {
        setBusy(true); setMsg(null);
        try { setUsers((await adminSearchUsers(q.trim())).users); }
        catch (e) { setMsg({ ok: false, text: errorMessage(e) }); }
        finally { setBusy(false); }
    };

    const loadLedger = async (u: AdminUser) => {
        try { setLedger((await adminLedger(u.id, 100)).rows); }
        catch (e) { setMsg({ ok: false, text: errorMessage(e) }); }
    };

    const pick = (u: AdminUser) => { setSel(u); setMsg(null); void loadLedger(u); };

    const amt = Number(amount);
    const amountOk = Number.isInteger(amt) && amt >= 1 && amt <= 1_000_000;
    const reasonOk = reason.trim().length > 0 && reason.trim().length <= 100;

    const grant = async () => {
        if (!sel || !amountOk || !reasonOk) return;
        const label = currency === 'coins' ? '一般代幣' : '活動券';
        if (!window.confirm(`確定發給「${sel.name}」${amt.toLocaleString()} ${label}？\n原因：${reason.trim()}`)) return;
        setBusy(true); setMsg(null);
        try {
            const r = await adminGrant({ userId: sel.id, currency, amount: amt, reason: reason.trim() });
            const updated = { ...sel, coins: r.coins, tickets: r.tickets };
            setSel(updated);
            setUsers((us) => us.map((u) => (u.id === sel.id ? updated : u)));
            setMsg({ ok: true, text: `已發放 ${amt.toLocaleString()} ${label}` });
            setReason('');
            void loadLedger(updated);
        } catch (e) {
            setMsg({ ok: false, text: errorMessage(e) });
        } finally {
            setBusy(false);
        }
    };

    if (gate !== 'ok') {
        return (
            <div className="arcade-root arcade-admin">
                <div className="arcade-panel arcade-admin-gate">
                    <h1 className="arcade-panel-title">娛樂機管理</h1>
                    {gate === 'loading' && <p>確認權限中…</p>}
                    {gate === 'guest' && <><p>請先登入管理員帳號。</p><a className="arcade-btn arcade-btn--line" href={lineLoginUrl()}>LINE 登入</a></>}
                    {gate === 'forbidden' && <p>無權限：此頁僅限管理員（目前登入：{me?.user.name}）。</p>}
                    {gate === 'offline' && <p>無法連線到伺服器，請稍後再試。</p>}
                </div>
            </div>
        );
    }

    return (
        <div className="arcade-root arcade-admin">
            <DisclaimerBar variant="top" />
            <h1 className="arcade-admin-title">娛樂機管理・發幣</h1>
            <p className="arcade-muted">代幣只能由系統發放，每一筆都寫入帳本並記錄操作者。不得搭配任何有價物。</p>

            <section className="arcade-panel">
                <h2 className="arcade-panel-title">搜尋玩家</h2>
                <form className="arcade-admin-row" onSubmit={(e) => { e.preventDefault(); void search(); }}>
                    <input className="arcade-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="名稱或 ID" />
                    <button type="submit" className="arcade-btn arcade-btn--neon" disabled={busy}>搜尋</button>
                </form>
                <ul className="arcade-admin-users">
                    {users.map((u) => (
                        <li key={u.id}>
                            <button type="button" className={`arcade-admin-user${sel?.id === u.id ? ' is-on' : ''}`} onClick={() => pick(u)}>
                                <span>{u.name}</span>
                                <small>{u.id}</small>
                                <span>代幣 {u.coins.toLocaleString()}・券 {u.tickets.toLocaleString()}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            </section>

            {sel && (
                <section className="arcade-panel">
                    <h2 className="arcade-panel-title">發放給：{sel.name}</h2>
                    <div className="arcade-admin-form">
                        <label>幣別
                            <select className="arcade-input" value={currency} onChange={(e) => setCurrency(e.target.value as 'coins' | 'tickets')}>
                                <option value="tickets">活動券</option>
                                <option value="coins">一般代幣</option>
                            </select>
                        </label>
                        <label>數量（1~1,000,000）
                            <input className="arcade-input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
                        </label>
                        <label>原因（必填，100 字內）
                            <input className="arcade-input" value={reason} maxLength={100} onChange={(e) => setReason(e.target.value)} />
                        </label>
                        <button type="button" className="arcade-btn arcade-btn--gold" disabled={busy || !amountOk || !reasonOk} onClick={grant}>
                            確認發放
                        </button>
                    </div>
                    {msg && <p className={msg.ok ? 'arcade-ok' : 'arcade-error'}>{msg.text}</p>}

                    <h3 className="arcade-panel-sub">帳本紀錄</h3>
                    <div className="arcade-table-wrap">
                        <table className="arcade-table">
                            <thead><tr><th>時間</th><th>類型</th><th>幣別</th><th>數量</th><th>備註</th><th>操作者</th></tr></thead>
                            <tbody>
                                {ledger.map((r) => (
                                    <tr key={r.id}>
                                        <td>{new Date(r.createdAt).toLocaleString('zh-TW')}</td>
                                        <td>{r.type}</td>
                                        <td>{r.currency}</td>
                                        <td className={r.amount >= 0 ? 'arcade-up' : 'arcade-down'}>{r.amount.toLocaleString()}</td>
                                        <td>{r.note ?? ''}</td>
                                        <td>{r.operatorId ?? ''}</td>
                                    </tr>
                                ))}
                                {ledger.length === 0 && <tr><td colSpan={6} className="arcade-muted">無紀錄</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}
            {!sel && msg && <p className={msg.ok ? 'arcade-ok' : 'arcade-error'}>{msg.text}</p>}
        </div>
    );
}
