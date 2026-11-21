/**
 * 賓果娛樂機 — 前端結算（試玩模式與演出用）
 *
 * 規則與 Worker 端一致：
 * - basic：派彩 = 官方常態獎金 normalPrize × 倍數（不用加碼）
 * - super：開出的超級獎號在所選號碼中 → 1200 × 倍數（每個號碼 1 注）
 * - bigSmall / oddEven：≥13 顆判定，猜中 → 150 × 倍數；和局 0
 */
import { getPrize, getPrizeTable } from '../models/prize-table';
import { BASE_BET, getBigSmallResult, getOddEvenResult, SIDE_GAME_SPECS } from '../models/side-games';
import type { BetItem } from './api';

/** 允許的倍數 */
export const MULTIPLIERS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 20, 50] as const;

export const SUPER_PRIZE = SIDE_GAME_SPECS.super.unitPrize;      // 1200
export const SIDE_PRIZE = SIDE_GAME_SPECS.bigSmall.unitPrize;    // 150

/** 同一期每人最多幾個投注項目 */
export const MAX_ITEMS_PER_PERIOD = 20;

/** 一筆已下的注（項目 + 倍數） */
export interface PlayedBet {
    item: BetItem;
    multiplier: number;
}

/** 項目的注數 */
export function itemUnits(item: BetItem): number {
    return item.game === 'super' ? item.numbers.length : 1;
}

/** 項目花費 = 25 × 注數 × 倍數 */
export function itemCost(item: BetItem, multiplier: number): number {
    return BASE_BET * itemUnits(item) * multiplier;
}

/** 該項目可能的最高派彩（聽牌等級、演出用） */
export function topPrize(item: BetItem, multiplier: number): number {
    switch (item.game) {
        case 'basic': {
            const t = getPrizeTable(item.star);
            return t ? Math.max(...t.prizes.map((p) => p.normalPrize)) * multiplier : 0;
        }
        case 'super': return SUPER_PRIZE * multiplier;
        default: return SIDE_PRIZE * multiplier;
    }
}

/** 項目名稱（顯示用） */
export function itemLabel(item: BetItem): string {
    switch (item.game) {
        case 'basic': return `${item.star} 星`;
        case 'super': return `超級獎號 ×${item.numbers.length}`;
        case 'bigSmall': return `猜大小「${item.pick}」`;
        case 'oddEven': return `猜單雙「${item.pick}」`;
    }
}

/** 驗證項目格式，回傳錯誤訊息或 null */
export function validateItem(item: BetItem): string | null {
    const okNums = (ns: number[]) =>
        ns.every((n) => Number.isInteger(n) && n >= 1 && n <= 80) && new Set(ns).size === ns.length;
    switch (item.game) {
        case 'basic':
            if (item.star < 1 || item.star > 10) return '星數需為 1~10';
            if (item.numbers.length !== item.star) return `${item.star} 星需選 ${item.star} 個號碼`;
            return okNums(item.numbers) ? null : '號碼格式錯誤';
        case 'super':
            if (item.numbers.length < 1 || item.numbers.length > 20) return '超級獎號需選 1~20 個號碼';
            return okNums(item.numbers) ? null : '號碼格式錯誤';
        default:
            return null;
    }
}

/** 單一項目結算 */
export function settleItem(bet: PlayedBet, numbers: number[], superNumber: number): { hits: number; payout: number } {
    const { item, multiplier } = bet;
    const drawn = new Set(numbers);
    switch (item.game) {
        case 'basic': {
            const hits = item.numbers.filter((n) => drawn.has(n)).length;
            return { hits, payout: getPrize(item.star, hits, false) * multiplier };
        }
        case 'super': {
            const hit = item.numbers.includes(superNumber);
            return { hits: hit ? 1 : 0, payout: hit ? SUPER_PRIZE * multiplier : 0 };
        }
        case 'bigSmall': {
            const hit = getBigSmallResult(numbers) === item.pick;
            return { hits: hit ? 1 : 0, payout: hit ? SIDE_PRIZE * multiplier : 0 };
        }
        case 'oddEven': {
            const hit = getOddEvenResult(numbers) === item.pick;
            return { hits: hit ? 1 : 0, payout: hit ? SIDE_PRIZE * multiplier : 0 };
        }
    }
}

export interface SettleLine {
    label: string;
    multiplier: number;
    cost: number;
    hits: number;
    payout: number;
}

export interface SettleSummary {
    lines: SettleLine[];
    totalCost: number;
    totalPayout: number;
    net: number;
    /** 派彩 / 下注（無下注為 0） */
    ratio: number;
}

/** 整期結算 */
export function settleAll(bets: PlayedBet[], numbers: number[], superNumber: number): SettleSummary {
    const lines = bets.map((b) => {
        const r = settleItem(b, numbers, superNumber);
        return { label: itemLabel(b.item), multiplier: b.multiplier, cost: itemCost(b.item, b.multiplier), ...r };
    });
    const totalCost = lines.reduce((s, l) => s + l.cost, 0);
    const totalPayout = lines.reduce((s, l) => s + l.payout, 0);
    return {
        lines,
        totalCost,
        totalPayout,
        net: totalPayout - totalCost,
        ratio: totalCost > 0 ? totalPayout / totalCost : 0,
    };
}

/** 隨機選 n 個不重複號碼（快選） */
export function quickPick(n: number, rnd: () => number = Math.random): number[] {
    const pool = Array.from({ length: 80 }, (_, i) => i + 1);
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, n).sort((a, b) => a - b);
}
