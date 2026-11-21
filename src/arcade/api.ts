/**
 * 賓果娛樂機 — 後端 API 合約型別與呼叫
 *
 * 認證：Authorization: Bearer <token>（token 存 localStorage `arcade-token`）
 * 錯誤格式：{ error: string, code?: string }
 */

export const ARCADE_API: string =
    (import.meta.env.VITE_ARCADE_API as string | undefined) ?? 'https://bingo-kv-worker.sky919247us.workers.dev';

const TOKEN_KEY = 'arcade-token';

/* ───────────── 合約型別 ───────────── */

export interface ArcadeUser {
    id: string;
    name: string;
    avatar: string;
    coins: number;
    tickets: number;
    isAdmin: boolean;
    agreedAt: string | null;
    createdAt: string;
}

export interface ArcadeStats {
    totalNet: number;
    weekNet: number;
    monthNet: number;
    maxWin: number;
    curStreak: number;
    maxStreak: number;
    totalBets: number;
    totalWagered: number;
}

export interface MeResponse {
    user: ArcadeUser;
    stats: ArcadeStats;
    today: { checkedIn: boolean; rescued: boolean };
}

export interface RoundInfo {
    period: string | null;
    drawTime: string;
    closesAt: string;
    serverNow: string;
    open: boolean;
}

export type BetItem =
    | { game: 'basic'; star: number; numbers: number[] }
    | { game: 'super'; numbers: number[] }
    | { game: 'bigSmall'; pick: '大' | '小' }
    | { game: 'oddEven'; pick: '單' | '雙' };

export interface BetRow {
    id: string;
    /** 同一次（可能多期）下注的群組 id；舊資料等於 order id */
    groupId: string;
    period: string;
    game: BetItem['game'];
    star: number | null;
    numbers: number[] | null;
    pick: string | null;
    multiplier: number;
    costCoins: number;
    costTickets: number;
    /** 退款：後端可能用 status='refunded'，或 status='settled' 加 refunded=1/true（兩種都相容，判斷請用 isRefunded） */
    status: 'pending' | 'settled' | 'refunded';
    refunded?: boolean | number | null;
    hits: number | null;
    payout: number | null;
    createdAt: string;
}

export interface PlaceBetsResponse {
    bets: BetRow[];
    cost: { coins: number; tickets: number };
    balance: { coins: number; tickets: number };
    /** 連續投注期數（含當期） */
    periods: number;
    /** 最後一期期別 */
    lastPeriod: string;
    groupId: string;
}

/** GET /api/bets/pending：所有未結算注單（含多期預約的未來期別），依期別舊→新 */
export interface PendingBetsResponse {
    bets: BetRow[];
    /** 未結算的不同期別數 */
    periods: number;
}

export type LeaderboardType = 'rich' | 'maxWin' | 'week' | 'month' | 'streak' | 'total';

export interface LeaderboardResponse {
    type: LeaderboardType;
    rows: { rank: number; userId: string; name: string; avatar: string; value: number }[];
    me: { rank: number; value: number } | null;
}

export interface AdminUser {
    id: string;
    name: string;
    avatar: string;
    coins: number;
    tickets: number;
    createdAt: string;
}

export interface LedgerRow {
    id: string;
    userId: string;
    userName: string;
    type: string;
    currency: string;
    amount: number;
    ref: string | null;
    note: string | null;
    operatorId: string | null;
    createdAt: string;
}

/* ───────────── 每日任務／成就 ───────────── */

export type MissionCode = 'checkin' | 'bet3' | 'bet10' | 'win1' | 'all';

export interface Mission {
    code: MissionCode | string;
    title: string;
    target: number;
    progress: number;
    reward: number;
    done: boolean;
    claimed: boolean;
}

/** GET /api/missions：day 為台北日期 YYYY-MM-DD */
export interface MissionsResponse {
    day: string;
    missions: Mission[];
}

export interface ClaimMissionResponse {
    ok: true;
    reward: number;
    /** 領完後的代幣餘額 */
    coins: number;
}

export interface Achievement {
    code: string;
    title: string;
    desc: string;
    icon: string;
    unlocked: boolean;
    unlockedAt: string | null;
}

/** 注單是否為退款（相容 status='refunded' 與 settled + refunded=1） */
export function isRefunded(row: Pick<BetRow, 'status' | 'refunded'>): boolean {
    return row.status === 'refunded' || row.refunded === true || row.refunded === 1;
}

/* ───────────── token ───────────── */

export function getToken(): string | null {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setToken(token: string | null): void {
    try {
        if (token) localStorage.setItem(TOKEN_KEY, token);
        else localStorage.removeItem(TOKEN_KEY);
    } catch { /* 私密模式等情況忽略 */ }
}

/* ───────────── 共用請求 ───────────── */

/** API 錯誤（status=0 代表網路不通） */
export class ArcadeApiError extends Error {
    status: number;
    code?: string;
    /** 錯誤回應的其他欄位（例：TOO_MANY_PERIODS 的 maxPeriods） */
    data?: Record<string, unknown>;
    constructor(message: string, status: number, code?: string, data?: Record<string, unknown>) {
        super(message);
        this.status = status;
        this.code = code;
        this.data = data;
    }
}

async function req<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    let res: Response;
    try {
        res = await fetch(`${ARCADE_API}${path}`, {
            method: opts.method ?? 'GET',
            headers,
            body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
            cache: 'no-store',
        });
    } catch {
        throw new ArcadeApiError('無法連線到伺服器', 0);
    }

    let json: unknown = null;
    try { json = await res.json(); } catch { /* 非 JSON 回應 */ }

    if (!res.ok) {
        const err = (json ?? {}) as { error?: string; code?: string } & Record<string, unknown>;
        throw new ArcadeApiError(err.error || `HTTP ${res.status}`, res.status, err.code, err);
    }
    if (json === null) throw new ArcadeApiError('伺服器回應格式錯誤', res.status);
    return json as T;
}

/* ───────────── 認證 ───────────── */

/** LINE 登入起點網址（登入完成後回到本頁） */
export function lineLoginUrl(): string {
    const returnTo = `${window.location.origin}${window.location.pathname}#/bingo-arcade`;
    return `${ARCADE_API}/api/auth/line/start?return_to=${encodeURIComponent(returnTo)}`;
}

/** 用一次性 login_code 換 token，成功後自動存起來 */
export async function exchangeLoginCode(code: string): Promise<MeResponse['user']> {
    const r = await req<{ token: string; user: ArcadeUser }>('/api/auth/exchange', { method: 'POST', body: { code } });
    setToken(r.token);
    return r.user;
}

/**
 * 從網址 hash 讀出 login_code / login_error（例：#/bingo-arcade?login_code=xxx）
 * 讀到後立即把參數從網址清掉，避免重新整理時重複使用
 */
export function takeLoginParams(): { code: string | null; error: string | null } {
    const hash = window.location.hash;
    const q = hash.indexOf('?');
    if (q < 0) return { code: null, error: null };
    const params = new URLSearchParams(hash.slice(q + 1));
    const code = params.get('login_code');
    const error = params.get('login_error');
    if (code === null && error === null) return { code: null, error: null };
    params.delete('login_code');
    params.delete('login_error');
    const rest = params.toString();
    const cleanHash = hash.slice(0, q) + (rest ? `?${rest}` : '');
    try {
        window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${cleanHash}`);
    } catch { /* 忽略 */ }
    return { code, error };
}

export async function logout(): Promise<void> {
    try { await req('/api/auth/logout', { method: 'POST' }); } catch { /* 無論成功與否都清 token */ }
    setToken(null);
}

/* ───────────── 玩家 ───────────── */

export const getMe = () => req<MeResponse>('/api/me');
export const agree = () => req<MeResponse>('/api/agree', { method: 'POST' });
export const checkin = () => req<{ granted: number; coins: number }>('/api/checkin', { method: 'POST' });
export const rescue = () => req<{ granted: number; coins: number }>('/api/rescue', { method: 'POST' });
export const getRound = () => req<RoundInfo>('/api/round');

export const getMissions = () => req<MissionsResponse>('/api/missions');
export const claimMission = (code: string) =>
    req<ClaimMissionResponse>('/api/missions/claim', { method: 'POST', body: { code } });
export const getAchievements = () => req<{ achievements: Achievement[] }>('/api/achievements');

/** 刪除帳號：必須帶 confirm: "DELETE"；成功後由呼叫端清 token */
export const deleteAccount = () => req<{ ok: true }>('/api/me/delete', { method: 'POST', body: { confirm: 'DELETE' } });

/** periods：連續投注期數（含當期，預設 1；只能是 multi.ts 的 PERIOD_OPTIONS） */
export const placeBets = (period: string, multiplier: number, items: BetItem[], periods = 1) =>
    req<PlaceBetsResponse>('/api/bets', { method: 'POST', body: { period, multiplier, items, periods } });

export const getPendingBets = () => req<PendingBetsResponse>('/api/bets/pending');

export const getBets = (period: string) =>
    req<{ bets: BetRow[] }>(`/api/bets?period=${encodeURIComponent(period)}`);

export const getRecentBets = (limit = 30) => req<{ bets: BetRow[] }>(`/api/bets/recent?limit=${limit}`);

export const getLeaderboard = (type: LeaderboardType, limit = 50) =>
    req<LeaderboardResponse>(`/api/leaderboard?type=${type}&limit=${limit}`);

/* ───────────── 管理員 ───────────── */

export const adminSearchUsers = (q: string) =>
    req<{ users: AdminUser[] }>(`/api/admin/users?q=${encodeURIComponent(q)}`);

export const adminGrant = (body: { userId: string; currency: 'coins' | 'tickets'; amount: number; reason: string }) =>
    req<{ coins: number; tickets: number }>('/api/admin/grant', { method: 'POST', body });

export const adminLedger = (userId: string, limit = 100) =>
    req<{ rows: LedgerRow[] }>(`/api/admin/ledger?userId=${encodeURIComponent(userId)}&limit=${limit}`);

/** 把伺服器的 BetRow 還原成 BetItem（演出用） */
export function rowToItem(row: BetRow): BetItem | null {
    switch (row.game) {
        case 'basic':
            return row.star && row.numbers ? { game: 'basic', star: row.star, numbers: row.numbers } : null;
        case 'super':
            return row.numbers ? { game: 'super', numbers: row.numbers } : null;
        case 'bigSmall':
            return row.pick === '大' || row.pick === '小' ? { game: 'bigSmall', pick: row.pick } : null;
        case 'oddEven':
            return row.pick === '單' || row.pick === '雙' ? { game: 'oddEven', pick: row.pick } : null;
        default:
            return null;
    }
}

/** 錯誤碼轉成玩家看得懂的訊息 */
export function errorMessage(e: unknown): string {
    if (e instanceof ArcadeApiError) {
        switch (e.code) {
            case 'NOT_AGREED': return '請先勾選同意免責聲明';
            case 'ALREADY': return '今天已經領過了';
            case 'NOT_ELIGIBLE': return '餘額未低於 25，還不能領救濟';
            case 'WRONG_PERIOD': return '期別已變更，請重新下注';
            case 'CLOSED': return '本期已截止下注';
            case 'INSUFFICIENT': return '代幣不足';
            case 'TOO_MANY': return '某一期已達每期 20 項上限';
            case 'TOO_MANY_PERIODS': {
                const m = Number(e.data?.maxPeriods);
                return Number.isFinite(m) ? `最多只能連續 ${m} 期` : '期數超過可下注期數';
            }
            case 'FORBIDDEN': return '沒有權限';
            case 'MISSION_NOT_DONE': return '任務尚未達成';
            case 'MISSION_CLAIMED': return '這個任務今天已經領過了';
        }
        return e.message;
    }
    return e instanceof Error ? e.message : '發生未知錯誤';
}
