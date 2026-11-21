/**
 * 賓果娛樂機 — 帳戶 Hook（試玩模式 / 登入模式）
 *
 * - 登入模式：走 Worker API（下注、餘額、簽到、救濟、結算皆以伺服器為準）
 * - 試玩模式：未登入或 API 連不到時，用 localStorage（key 前綴 arcade-demo-）的假代幣，
 *   在前端自行結算，不計排行。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from './api';
import type { ArcadeUser, BetItem, BetRow, MeResponse } from './api';
import { periodList, type ReservedBet } from './multi';
import { itemCost, settleAll, type PlayedBet, type SettleSummary } from './payout';
import { taipeiDateStr } from '../utils/tlc-direct';
import type { BingoDrawData } from '../utils/bingo-strategies';

const WALLET_KEY = 'arcade-demo-wallet';
const BETS_KEY = 'arcade-demo-bets';
const AGREED_KEY = 'arcade-demo-agreed';

export const SIGNUP_COINS = 10_000;
export const CHECKIN_COINS = 500;
export const RESCUE_COINS = 1_000;

interface DemoWallet {
    coins: number;
    tickets: number;
    checkinDate: string | null;
    rescueDate: string | null;
    todayDate: string;
    todayNet: number;
    totalNet: number;
    maxWin: number;
    curStreak: number;
    maxStreak: number;
}

/** groupId：同一次（可能多期）下注的群組；舊資料沒有，視為各期各自一組 */
interface DemoBet extends PlayedBet { period: string; groupId?: string }

function rowsToPlayed(rows: BetRow[]): PlayedBet[] {
    return rows.flatMap((row) => {
        const it = api.rowToItem(row);
        return it ? [{ item: it, multiplier: row.multiplier }] : [];
    });
}

export interface PanelStats {
    coins: number;
    tickets: number;
    todayNet: number;
    weekNet: number | null;
    totalNet: number;
    maxWin: number;
    curStreak: number;
    maxStreak: number;
}

function readJson<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
        return fallback;
    }
}

function writeJson(key: string, value: unknown): void {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 忽略 */ }
}

function freshWallet(): DemoWallet {
    return {
        coins: SIGNUP_COINS, tickets: 0, checkinDate: null, rescueDate: null,
        todayDate: taipeiDateStr(), todayNet: 0, totalNet: 0, maxWin: 0, curStreak: 0, maxStreak: 0,
    };
}

function loadWallet(): DemoWallet {
    const w = { ...freshWallet(), ...readJson<Partial<DemoWallet>>(WALLET_KEY, {}) };
    const today = taipeiDateStr();
    if (w.todayDate !== today) { w.todayDate = today; w.todayNet = 0; }
    return w;
}

function loadAgreed(): boolean {
    try { return localStorage.getItem(AGREED_KEY) === '1'; } catch { return false; }
}

export function useArcadeAccount() {
    const [mode, setMode] = useState<'loading' | 'demo' | 'online'>('loading');
    const [offline, setOffline] = useState(false);
    const [me, setMe] = useState<MeResponse | null>(null);
    const [todayNetOnline, setTodayNetOnline] = useState(0);
    const [wallet, setWallet] = useState<DemoWallet>(loadWallet);
    const [demoBets, setDemoBets] = useState<DemoBet[]>(() => readJson<DemoBet[]>(BETS_KEY, []));
    const [demoAgreed, setDemoAgreed] = useState(loadAgreed);
    /** 登入模式本機快取的已下注（伺服器回應） */
    const [onlineBets, setOnlineBets] = useState<Record<string, PlayedBet[]>>({});
    /** 登入模式：伺服器上所有未結算注單（含多期預約） */
    const [pendingRows, setPendingRows] = useState<BetRow[]>([]);

    const saveWallet = useCallback((w: DemoWallet) => { setWallet(w); writeJson(WALLET_KEY, w); }, []);
    const saveBets = useCallback((b: DemoBet[]) => { setDemoBets(b); writeJson(BETS_KEY, b); }, []);

    /** 登入模式：取回未結算注單，並把各期別寫進本機快取（多期預約的未來期別也看得到） */
    const loadPending = useCallback(async () => {
        try {
            const { bets } = await api.getPendingBets();
            setPendingRows(bets);
            const byPeriod: Record<string, BetRow[]> = {};
            bets.forEach((b) => { (byPeriod[b.period] ??= []).push(b); });
            setOnlineBets((ob) => {
                const next = { ...ob };
                for (const [p, rows] of Object.entries(byPeriod)) next[p] = rowsToPlayed(rows);
                return next;
            });
        } catch { /* 非必要資料（舊版後端沒有此端點） */ }
    }, []);

    /** 重新取得伺服器帳戶資料；失敗時切回試玩模式 */
    const refresh = useCallback(async () => {
        if (!api.getToken()) { setMode('demo'); setMe(null); return; }
        try {
            const m = await api.getMe();
            setMe(m);
            setMode('online');
            setOffline(false);
            api.getRecentBets(30).then(({ bets }) => {
                const today = taipeiDateStr();
                let net = 0;
                for (const b of bets) {
                    if (b.status !== 'settled' || api.isRefunded(b) || taipeiDateStr(new Date(b.createdAt)) !== today) continue;
                    net += (b.payout ?? 0) - b.costCoins - b.costTickets;
                }
                setTodayNetOnline(net);
            }).catch(() => { /* 非必要資料 */ });
            void loadPending();
        } catch (e) {
            if (e instanceof api.ArcadeApiError && e.status === 401) api.setToken(null);
            else setOffline(true);
            setMe(null);
            setMode('demo');
        }
    }, [loadPending]);

    useEffect(() => { void refresh(); }, [refresh]);

    const online = mode === 'online' && me !== null;
    const user: ArcadeUser | null = online ? me!.user : null;
    const agreed = online ? !!me!.user.agreedAt : demoAgreed;
    const today = taipeiDateStr();

    const stats: PanelStats = online
        ? {
            coins: me!.user.coins, tickets: me!.user.tickets, todayNet: todayNetOnline, weekNet: me!.stats.weekNet,
            totalNet: me!.stats.totalNet, maxWin: me!.stats.maxWin, curStreak: me!.stats.curStreak, maxStreak: me!.stats.maxStreak,
        }
        : {
            coins: wallet.coins, tickets: wallet.tickets, todayNet: wallet.todayNet, weekNet: null,
            totalNet: wallet.totalNet, maxWin: wallet.maxWin, curStreak: wallet.curStreak, maxStreak: wallet.maxStreak,
        };

    const checkedIn = online ? me!.today.checkedIn : wallet.checkinDate === today;
    const rescued = online ? me!.today.rescued : wallet.rescueDate === today;
    const canRescue = !rescued && stats.coins + stats.tickets < 25;

    const agree = useCallback(async () => {
        if (online) { setMe(await api.agree()); return; }
        try { localStorage.setItem(AGREED_KEY, '1'); } catch { /* 忽略 */ }
        setDemoAgreed(true);
    }, [online]);

    const checkin = useCallback(async (): Promise<number> => {
        if (online) { const r = await api.checkin(); await refresh(); return r.granted; }
        if (wallet.checkinDate === today) throw new Error('今天已經簽到過了');
        saveWallet({ ...wallet, coins: wallet.coins + CHECKIN_COINS, checkinDate: today });
        return CHECKIN_COINS;
    }, [online, wallet, today, refresh, saveWallet]);

    const rescue = useCallback(async (): Promise<number> => {
        if (online) { const r = await api.rescue(); await refresh(); return r.granted; }
        if (wallet.rescueDate === today) throw new Error('今天已經領過救濟了');
        if (wallet.coins + wallet.tickets >= 25) throw new Error('餘額未低於 25，還不能領救濟');
        saveWallet({ ...wallet, coins: wallet.coins + RESCUE_COINS, rescueDate: today });
        return RESCUE_COINS;
    }, [online, wallet, today, refresh, saveWallet]);

    /**
     * 下注（試玩：先扣活動券再扣代幣）
     * periods：連續投注期數（含當期）；同一組項目套用到從 period 起連續 N 期，一次扣款 = 單期 × N
     */
    const placeBets = useCallback(async (period: string, multiplier: number, items: BetItem[], periods = 1) => {
        if (online) {
            const r = await api.placeBets(period, multiplier, items, periods);
            setMe((m) => m ? { ...m, user: { ...m.user, coins: r.balance.coins, tickets: r.balance.tickets } } : m);
            const byPeriod: Record<string, BetRow[]> = {};
            r.bets.forEach((b) => { (byPeriod[b.period] ??= []).push(b); });
            setOnlineBets((ob) => {
                const next = { ...ob };
                for (const [p, rows] of Object.entries(byPeriod)) next[p] = [...(ob[p] ?? []), ...rowsToPlayed(rows)];
                return next;
            });
            setPendingRows((pr) => [...pr, ...r.bets]);
            return;
        }
        const cost = items.reduce((s, it) => s + itemCost(it, multiplier), 0) * periods;
        if (cost > wallet.coins + wallet.tickets) throw new Error('代幣不足');
        const useTickets = Math.min(wallet.tickets, cost);
        saveWallet({ ...wallet, tickets: wallet.tickets - useTickets, coins: wallet.coins - (cost - useTickets) });
        const groupId = `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const added = periodList(period, periods).flatMap((p) => items.map((item) => ({ period: p, multiplier, item, groupId })));
        saveBets([...demoBets, ...added]);
    }, [online, wallet, demoBets, saveWallet, saveBets]);

    /** 尚未開獎的注（含多期預約的未來期別），給「已預約」顯示 */
    const reservations: ReservedBet[] = useMemo(() => online
        ? pendingRows.flatMap((row) => {
            const it = api.rowToItem(row);
            return it ? [{ period: row.period, groupId: row.groupId, item: it, multiplier: row.multiplier }] : [];
        })
        : demoBets.map((b) => ({ period: b.period, groupId: b.groupId ?? `p${b.period}`, item: b.item, multiplier: b.multiplier })), [online, pendingRows, demoBets]);

    /** 某期已下的注（同步，給 UI 顯示） */
    const betsOf = useCallback((period: string | null): PlayedBet[] => {
        if (!period) return [];
        if (online) return onlineBets[period] ?? [];
        return demoBets.filter((b) => b.period === period).map(({ item, multiplier }) => ({ item, multiplier }));
    }, [online, onlineBets, demoBets]);

    /** 某期已下的注（登入模式會向伺服器確認） */
    const fetchBetsOf = useCallback(async (period: string): Promise<PlayedBet[]> => {
        if (!online) return betsOf(period);
        try {
            const { bets } = await api.getBets(period);
            return bets.flatMap((row) => {
                const it = api.rowToItem(row);
                return it ? [{ item: it, multiplier: row.multiplier }] : [];
            });
        } catch {
            return onlineBets[period] ?? [];
        }
    }, [online, betsOf, onlineBets]);

    /**
     * 結算某期（試玩模式在前端派彩；登入模式只重新整理伺服器餘額）
     */
    const settlePeriod = useCallback((draw: BingoDrawData): SettleSummary | null => {
        if (online) {
            setPendingRows((pr) => pr.filter((b) => b.period !== draw.period));
            void refresh();
            return null;
        }
        const mine = readJson<DemoBet[]>(BETS_KEY, []).filter((b) => b.period === draw.period);
        if (mine.length === 0) return null;
        const s = settleAll(mine, draw.numbers, draw.superNumber);
        const w = loadWallet();
        const cur = s.totalPayout > 0 ? w.curStreak + 1 : 0;
        saveWallet({
            ...w,
            coins: w.coins + s.totalPayout,
            todayNet: w.todayNet + s.net,
            totalNet: w.totalNet + s.net,
            maxWin: Math.max(w.maxWin, s.totalPayout),
            curStreak: cur,
            maxStreak: Math.max(w.maxStreak, cur),
        });
        saveBets(readJson<DemoBet[]>(BETS_KEY, []).filter((b) => b.period !== draw.period));
        return s;
    }, [online, refresh, saveWallet, saveBets]);

    /**
     * 頁面載入時處理試玩模式「離開期間已開獎」的注：
     * 有開獎資料的直接結算；太舊查不到的退回代幣
     */
    const settleStale = useCallback((draws: BingoDrawData[]) => {
        if (online || draws.length === 0) return;
        const pending = readJson<DemoBet[]>(BETS_KEY, []);
        if (pending.length === 0) return;
        const latest = Number(draws[0].period);
        const oldest = Number(draws[draws.length - 1].period);
        let w = loadWallet();
        const keep: DemoBet[] = [];
        const periods = [...new Set(pending.map((b) => b.period))];
        for (const p of periods) {
            const group = pending.filter((b) => b.period === p);
            const draw = draws.find((d) => d.period === p);
            if (draw) {
                const s = settleAll(group, draw.numbers, draw.superNumber);
                const cur = s.totalPayout > 0 ? w.curStreak + 1 : 0;
                w = {
                    ...w, coins: w.coins + s.totalPayout, todayNet: w.todayNet + s.net, totalNet: w.totalNet + s.net,
                    maxWin: Math.max(w.maxWin, s.totalPayout), curStreak: cur, maxStreak: Math.max(w.maxStreak, cur),
                };
            } else if (Number(p) < oldest || (Number(p) <= latest && !draw)) {
                w = { ...w, coins: w.coins + group.reduce((sum, b) => sum + itemCost(b.item, b.multiplier), 0) };
            } else {
                keep.push(...group);
            }
        }
        saveWallet(w);
        saveBets(keep);
    }, [online, saveWallet, saveBets]);

    /** 重置試玩資料 */
    const resetDemo = useCallback(() => {
        saveWallet(freshWallet());
        saveBets([]);
    }, [saveWallet, saveBets]);

    /** 任務領獎等只回傳新餘額的端點：直接更新本機顯示的代幣 */
    const applyCoins = useCallback((coins: number) => {
        setMe((m) => m ? { ...m, user: { ...m.user, coins } } : m);
    }, []);

    /** 刪除帳號（登入模式）：成功後清 token 與本機快取，回到未登入（試玩）狀態 */
    const deleteAccount = useCallback(async () => {
        await api.deleteAccount();
        api.setToken(null);
        setOnlineBets({});
        setPendingRows([]);
        setMe(null);
        await refresh();
    }, [refresh]);

    const loginWithCode = useCallback(async (code: string) => {
        await api.exchangeLoginCode(code);
        await refresh();
    }, [refresh]);

    const logout = useCallback(async () => {
        await api.logout();
        setOnlineBets({});
        setPendingRows([]);
        await refresh();
    }, [refresh]);

    return {
        mode, online, offline, user, me, stats, agreed, checkedIn, rescued, canRescue,
        agree, checkin, rescue, placeBets, betsOf, fetchBetsOf, settlePeriod, settleStale, reservations,
        resetDemo, refresh, loginWithCode, logout, applyCoins, deleteAccount,
    };
}

export type ArcadeAccount = ReturnType<typeof useArcadeAccount>;
