/**
 * 賓果娛樂機 — 多期投注（連續投注 N 期）共用工具
 *
 * 規則與 Worker（worker/src/arcade/bets.ts 的 ALLOWED_PERIODS）一致：
 * - 期數只能是官方選項 1~10、12 期（沒有 11 期）
 * - 期別連續 +1，可跨日（每天 203 期，07:05 ~ 23:55；隔日第 1 期接續前一日最後一期，由後端查證）
 * - 前端推算的期別只是預覽，實際期別以伺服器回傳的注單為準
 */
import type { BetItem } from './api';
import { DRAW_INTERVAL_SEC, FIRST_DRAW_SEC, LAST_DRAW_SEC, taipeiDateStr, taipeiSecondsOfDay } from '../utils/tlc-direct';

/** 允許的連續投注期數（含當期）；要改只改這裡（後端同名常數也要一起改） */
export const PERIOD_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12] as const;

const DRAWS_PER_DAY = (LAST_DRAW_SEC - FIRST_DRAW_SEC) / DRAW_INTERVAL_SEC + 1; // 203

/** 該期開獎時刻起，當天還剩幾期可下注（含該期） */
export function periodsLeftToday(drawAt: Date): number {
    const sod = taipeiSecondsOfDay(drawAt);
    const index = Math.floor((sod - FIRST_DRAW_SEC) / DRAW_INTERVAL_SEC) + 1;
    return Math.max(1, DRAWS_PER_DAY - index + 1);
}

/**
 * 建立「期別 → 開獎日期（台北 YYYY-MM-DD）」的推算函式
 * 以已知的一期（期別＋名目開獎時刻）為基準，每天 203 期往前後推；跨日的注單顯示日期用。
 * 注意：跨年時期別是否歸零由後端處理（未確認），這裡只按連續 +1 推算。
 */
export function makePeriodDater(basePeriod: string | null, baseDrawAt: Date | null): (period: string) => string | null {
    const base = Number(basePeriod);
    if (!basePeriod || !baseDrawAt || !Number.isFinite(base) || Number.isNaN(baseDrawAt.getTime())) return () => null;
    const sod = taipeiSecondsOfDay(baseDrawAt);
    const idx0 = Math.min(DRAWS_PER_DAY - 1, Math.max(0, Math.floor((sod - FIRST_DRAW_SEC) / DRAW_INTERVAL_SEC)));
    return (period: string) => {
        const p = Number(period);
        if (!Number.isFinite(p)) return null;
        const dayOffset = Math.floor((idx0 + (p - base)) / DRAWS_PER_DAY);
        return taipeiDateStr(new Date(baseDrawAt.getTime() + dayOffset * 86_400_000));
    };
}

/** 「11/21」樣式的短日期；跟 today 同一天回傳 null（不必標） */
export function shortDateIfOther(date: string | null, today: string): string | null {
    if (!date || date === today) return null;
    const [, m, d] = date.split('-');
    return `${Number(m)}/${Number(d)}`;
}

/** 由起始期別推出連續 n 期的期別字串 */
export function periodList(first: string, n: number): string[] {
    const base = Number(first);
    return Array.from({ length: n }, (_, i) => String(base + i));
}

/** 期別範圍文字：「115063946 ~ 115063950 共 5 期」；單期只回期別 */
export function periodRangeText(first: string, n: number): string {
    if (n <= 1) return `第 ${first} 期`;
    const list = periodList(first, n);
    return `${list[0]} ~ ${list[n - 1]} 共 ${n} 期`;
}

/** 投注項目的比對鍵（判斷「同一組」：玩法＋星數＋號碼／選邊） */
export function itemKey(item: BetItem): string {
    switch (item.game) {
        case 'basic': return `basic:${item.star}:${[...item.numbers].sort((a, b) => a - b).join(',')}`;
        case 'super': return `super:${[...item.numbers].sort((a, b) => a - b).join(',')}`;
        default: return `${item.game}:${item.pick}`;
    }
}

/** 一筆預約（尚未開獎）的注 */
export interface ReservedBet {
    period: string;
    groupId: string;
    item: BetItem;
    multiplier: number;
}

/** 預約群組（同一次多期下注）顯示用彙總 */
export interface ReservationGroup {
    groupId: string;
    items: { item: BetItem; multiplier: number }[];
    /** 尚未開獎的期別（舊→新） */
    periods: string[];
}

/** 把預約注單依群組彙總；只保留期別 ≥ fromPeriod 的（fromPeriod=null 則全部） */
export function groupReservations(bets: ReservedBet[], fromPeriod: string | null): ReservationGroup[] {
    const map = new Map<string, ReservationGroup>();
    const sorted = [...bets].sort((a, b) => Number(a.period) - Number(b.period));
    for (const b of sorted) {
        if (fromPeriod && Number(b.period) < Number(fromPeriod)) continue;
        let g = map.get(b.groupId);
        if (!g) { g = { groupId: b.groupId, items: [], periods: [] }; map.set(b.groupId, g); }
        if (!g.periods.includes(b.period)) g.periods.push(b.period);
        // 同一群組各期項目相同，只記第一期的
        if (b.period === g.periods[0]) g.items.push({ item: b.item, multiplier: b.multiplier });
    }
    const out = [...map.values()];
    out.forEach((g) => g.periods.sort((a, b) => Number(a) - Number(b)));
    return out.sort((a, b) => Number(a.periods[0]) - Number(b.periods[0]));
}
