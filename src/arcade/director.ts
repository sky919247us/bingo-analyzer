/**
 * 賓果娛樂機 — 演出導演
 *
 * 跟柏青哥一樣「結果先定、演出跟著結果走」：
 * 先用 payout.ts 算出本期結果，再以期別為種子的確定性亂數挑選預告強度。
 * 所以預告信賴度是誠實的——強預告大多真的會中，但也保留低機率的「強預告落空」。
 * 規則：彩虹色＝確定演出，只會在有派彩時出現。
 */
import type { PlayedBet, SettleSummary } from './payout';
import { topPrize } from './payout';
import { BIG_THRESHOLD, SIDE_WIN_COUNT } from '../models/side-games';

export type PreviewColor = 'blue' | 'green' | 'red' | 'gold' | 'rainbow';
export type ReachLevel = 'normal' | 'sp' | 'spsp' | 'premium';
export type WinClass = 'none' | 'small' | 'win' | 'big' | 'mega';

export const COLOR_LABEL: Record<PreviewColor, string> = {
    blue: '藍', green: '綠', red: '紅', gold: '金', rainbow: '彩虹',
};

export const REACH_LABEL: Record<ReachLevel, string> = {
    normal: '聽牌', sp: 'SP 聽牌', spsp: 'SPSP 聽牌', premium: 'PREMIUM 聽牌',
};

/* ───────────── 確定性亂數 ───────────── */

/** 字串雜湊（xmur3） */
function hashSeed(str: string): number {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
}

/** 以字串為種子的亂數產生器（mulberry32） */
export function seededRng(seed: string): () => number {
    let a = hashSeed(seed);
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function pickWeighted<T>(rng: () => number, items: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rng() * total;
    for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r < 0) return items[i];
    }
    return items[items.length - 1];
}

/**
 * 資料缺少開出順序時（CSV / KV），產生確定性的「模擬順序」：
 * 其餘 19 顆亂序，超級獎號固定放第 20 顆
 */
export function simulatedOrder(period: string, numbers: number[], superNumber: number): number[] {
    const rng = seededRng(`order-${period}`);
    const rest = numbers.filter((n) => n !== superNumber);
    for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    return numbers.includes(superNumber) ? [...rest, superNumber] : rest;
}

/* ───────────── 聽牌偵測 ───────────── */

export interface ReachPlan {
    /** 出到第幾顆（0-based index）之後進入聽牌 */
    startIndex: number;
    /** 第幾顆完成（null = 最後落空） */
    resolveIndex: number | null;
    level: ReachLevel;
    /** 聽牌對象說明，如「6 星差 1 顆」 */
    label: string;
    /** 若成功可得的派彩 */
    value: number;
}

function levelByValue(value: number): ReachLevel {
    if (value > 100_000) return 'premium';
    if (value > 10_000) return 'spsp';
    if (value > 1_000) return 'sp';
    return 'normal';
}

const LEVELS: ReachLevel[] = ['normal', 'sp', 'spsp', 'premium'];

/** 找出本期最有價值的一個聽牌（差 1 顆中最高獎，且後面還有球） */
function findReach(order: number[], bets: PlayedBet[]): Omit<ReachPlan, 'level'> | null {
    let best: Omit<ReachPlan, 'level'> | null = null;
    const consider = (c: Omit<ReachPlan, 'level'>) => {
        if (!best || c.value > best.value || (c.value === best.value && c.startIndex < best.startIndex)) best = c;
    };

    for (const b of bets) {
        const it = b.item;
        if (it.game === 'basic' && it.star >= 2) {
            const mine = new Set(it.numbers);
            let hits = 0;
            let start = -1;
            let resolve: number | null = null;
            order.forEach((n, i) => {
                if (!mine.has(n)) return;
                hits++;
                if (hits === it.star - 1) start = i;
                if (hits === it.star) resolve = i;
            });
            if (start >= 0 && start < order.length - 1) {
                consider({ startIndex: start, resolveIndex: resolve, label: `${it.star} 星差 1 顆`, value: topPrize(it, b.multiplier) });
            }
        } else if (it.game === 'bigSmall' || it.game === 'oddEven') {
            const side = (n: number) =>
                it.game === 'bigSmall' ? (n >= BIG_THRESHOLD ? '大' : '小') : (n % 2 === 1 ? '單' : '雙');
            let mineCount = 0;
            let start = -1;
            let resolve: number | null = null;
            order.forEach((n, i) => {
                if (side(n) !== it.pick) return;
                mineCount++;
                if (mineCount === SIDE_WIN_COUNT - 1) start = i;
                if (mineCount === SIDE_WIN_COUNT) resolve = i;
            });
            if (start >= 0 && start < order.length - 1) {
                consider({ startIndex: start, resolveIndex: resolve, label: `「${it.pick}」差 1 顆`, value: topPrize(it, b.multiplier) });
            }
        }
    }
    return best;
}

/* ───────────── 演出計畫 ───────────── */

export interface DirectorPlan {
    /** 預告 STEP 1~5 */
    step: number;
    color: PreviewColor;
    reach: ReachPlan | null;
    winClass: WinClass;
    /** 玩家有下超級獎號 */
    superBet: boolean;
    /** 超級獎號是否命中（最強演出） */
    superHit: boolean;
    /** 落空收尾文字 */
    missText: string;
    /** 無下注（觀戰） */
    spectator: boolean;
}

const STEPS = [1, 2, 3, 4, 5] as const;
const COLORS: PreviewColor[] = ['blue', 'green', 'red', 'gold', 'rainbow'];

/** 各結果等級的 STEP 權重（index 0 = 觀戰，1 = 落空，2~6 = 由小到大） */
const STEP_WEIGHTS = [
    [55, 30, 12, 3, 0],
    [50, 28, 14, 6, 2],
    [35, 35, 22, 7, 1],
    [15, 30, 35, 17, 3],
    [5, 15, 35, 35, 10],
    [0, 5, 15, 45, 35],
    [0, 0, 5, 30, 65],
];
const COLOR_WEIGHTS = [
    [70, 25, 5, 0, 0],
    [62, 26, 10, 2, 0],
    [45, 40, 13, 2, 0],
    [25, 40, 30, 5, 0],
    [10, 25, 40, 22, 3],
    [0, 10, 30, 40, 20],
    [0, 0, 10, 40, 50],
];

const MISS_TEXTS = ['差一點！下期再戰', '氣勢累積中…', '球運正在醞釀', '下一期就是你的', '收集能量中，請稍候'];

export function classify(summary: SettleSummary): WinClass {
    if (summary.totalPayout <= 0) return 'none';
    if (summary.ratio >= 100) return 'mega';
    if (summary.ratio >= 20) return 'big';
    if (summary.ratio >= 1) return 'win';
    return 'small';
}

/** 依結果產生演出計畫（同一期、同一組注必定得到同樣的演出） */
export function direct(period: string, order: number[], superNumber: number, bets: PlayedBet[], summary: SettleSummary): DirectorPlan {
    const betKey = bets.map((b) => JSON.stringify(b.item) + b.multiplier).join('|');
    const rng = seededRng(`${period}#${betKey}`);
    const winClass = classify(summary);
    const spectator = bets.length === 0;

    const tier = spectator ? 0
        : winClass === 'none' ? 1
            : winClass === 'small' ? 2
                : winClass === 'win' ? (summary.ratio >= 5 ? 4 : 3)
                    : winClass === 'big' ? 5 : 6;

    const step = pickWeighted(rng, STEPS, STEP_WEIGHTS[tier]);
    let color = pickWeighted(rng, COLORS, COLOR_WEIGHTS[tier]);
    if (color === 'rainbow' && summary.totalPayout <= 0) color = 'gold'; // 彩虹＝確定，落空絕不出現

    const raw = findReach(order, bets);
    let reach: ReachPlan | null = null;
    if (raw) {
        let li = LEVELS.indexOf(levelByValue(raw.value));
        const success = raw.resolveIndex !== null;
        // 成功時較常升級；落空時偶爾也升級（強預告落空，製造緊張）
        if (success && rng() < 0.35) li++;
        else if (!success && rng() < 0.08) li++;
        reach = { ...raw, level: LEVELS[Math.min(li, LEVELS.length - 1)] };
    }

    const superBet = bets.some((b) => b.item.game === 'super');
    const superHit = bets.some((b) => b.item.game === 'super' && b.item.numbers.includes(superNumber));

    return {
        step,
        color,
        reach,
        winClass,
        superBet,
        superHit,
        missText: MISS_TEXTS[Math.floor(rng() * MISS_TEXTS.length)],
        spectator,
    };
}
