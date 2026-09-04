/**
 * 賓果賓果附加玩法模型：超級獎號 / 猜大小 / 猜單雙
 *
 * 資料來源：台灣彩券官方「BINGO BINGO賓果賓果」遊戲介紹（獎金分配方式）
 * https://www.taiwanlottery.com/lotto/info/bingo_bingo
 *
 * 三種玩法每注售價皆為 $25，皆可加倍 2~50 倍、多期 2~12 期。
 * 「超級獎號」可複選 2~20 個號碼、「猜大小」與「猜單雙」可同時投注兩邊，
 * 皆依選擇項目數計算注數。
 *
 * ⚠ 課稅：三種玩法的基本單注獎金分別為 $1,200 / $150 / $150，
 *   皆未達 $5,000 門檻，且課稅為逐注認定（加倍 = 買 N 注），
 *   因此不論押到幾倍都不會被課稅。詳見 models/tax.ts。
 */

/** 玩法代號 */
export type GameType = 'basic' | 'super' | 'bigSmall' | 'oddEven';

/** 附加玩法的投注選項 */
export type SideSelection = '大' | '小' | '單' | '雙';

/** 每注售價 */
export const BASE_BET = 25;

/** 大小的分界：>= 41 為「大」 */
export const BIG_THRESHOLD = 41;

/** 判定成立所需的顆數：單邊需開出 13 顆（含）以上 */
export const SIDE_WIN_COUNT = 13;

/** 超級獎號可複選的號碼數上限（官方：2~20 個） */
export const SUPER_MAX_PICKS = 20;

/** 玩法規格 */
export interface GameSpec {
    type: GameType;
    label: string;
    icon: string;
    /** 固定獎金倍數（官方用語） */
    payoutMultiple: number;
    /** 基本單注獎金 */
    unitPrize: number;
    /** 單注中獎機率 */
    winProbability: number;
    /** 單期總獎金上限 */
    prizeCap: number;
    description: string;
}

/**
 * 中獎機率為超幾何分布精算值（80 取 20，單邊 40 顆）：
 *   P(單邊 >= 13) = 0.09803996820721252  →  1/10.1999，與官方標示「約 1/10.2」相符
 */
export const SIDE_WIN_PROBABILITY = 0.09803996820721252;

/** 兩邊都不足 13 顆（和局，不中獎亦不退款）的機率 */
export const SIDE_TIE_PROBABILITY = 1 - 2 * SIDE_WIN_PROBABILITY;

/** 附加玩法規格表 */
export const SIDE_GAME_SPECS: Record<Exclude<GameType, 'basic'>, GameSpec> = {
    super: {
        type: 'super',
        label: '超級獎號',
        icon: '🎯',
        payoutMultiple: 48,
        unitPrize: 1200,
        winProbability: 1 / 80,
        prizeCap: 20_000_000,
        description: '預測當期開出的第 20 個獎號，猜中即得 48 倍獎金。可複選 2~20 個號碼，依選號個數計算注數。',
    },
    bigSmall: {
        type: 'bigSmall',
        label: '猜大小',
        icon: '⚖️',
        payoutMultiple: 6,
        unitPrize: 150,
        winProbability: SIDE_WIN_PROBABILITY,
        prizeCap: 20_000_000,
        description: '預測 41~80（大）或 01~40（小）哪一邊會開出 13 顆以上。兩邊都不足 13 顆時為和局，不中獎。',
    },
    oddEven: {
        type: 'oddEven',
        label: '猜單雙',
        icon: '🔢',
        payoutMultiple: 6,
        unitPrize: 150,
        winProbability: SIDE_WIN_PROBABILITY,
        prizeCap: 20_000_000,
        description: '預測單數或雙數號碼哪一邊會開出 13 顆以上。兩邊都不足 13 顆時為和局，不中獎。',
    },
};

/** 各玩法可選的投注項目 */
export const SIDE_OPTIONS: Record<'bigSmall' | 'oddEven', SideSelection[]> = {
    bigSmall: ['大', '小'],
    oddEven: ['單', '雙'],
};

/** 計算一期開獎中「大」的顆數 */
export function countBig(numbers: number[]): number {
    return numbers.filter((n) => n >= BIG_THRESHOLD).length;
}

/** 計算一期開獎中「單」的顆數 */
export function countOdd(numbers: number[]): number {
    return numbers.filter((n) => n % 2 === 1).length;
}

/**
 * 判定一期的大小結果
 * @returns '大' | '小' | '和'（和局代表兩邊皆不足 13 顆）
 */
export function getBigSmallResult(numbers: number[]): SideSelection | '和' {
    const big = countBig(numbers);
    const small = numbers.length - big;
    if (big >= SIDE_WIN_COUNT) return '大';
    if (small >= SIDE_WIN_COUNT) return '小';
    return '和';
}

/**
 * 判定一期的單雙結果
 * @returns '單' | '雙' | '和'
 */
export function getOddEvenResult(numbers: number[]): SideSelection | '和' {
    const odd = countOdd(numbers);
    const even = numbers.length - odd;
    if (odd >= SIDE_WIN_COUNT) return '單';
    if (even >= SIDE_WIN_COUNT) return '雙';
    return '和';
}

/** 依玩法取得該期的結果 */
export function getSideResult(gameType: 'bigSmall' | 'oddEven', numbers: number[]): SideSelection | '和' {
    return gameType === 'bigSmall' ? getBigSmallResult(numbers) : getOddEvenResult(numbers);
}

/**
 * 計算注數
 * - 基本玩法：固定 1 注
 * - 超級獎號：選幾個號碼就是幾注
 * - 猜大小 / 猜單雙：選幾個選項就是幾注（同時猜兩邊 = 2 注）
 */
export function countBets(gameType: GameType, selectionCount: number): number {
    if (gameType === 'basic') return 1;
    return Math.max(0, selectionCount);
}

/** 計算投注總成本 = $25 × 注數 × 倍數 × 期數 */
export function calcCost(
    gameType: GameType,
    selectionCount: number,
    multiplier: number,
    periodCount: number,
): number {
    return BASE_BET * countBets(gameType, selectionCount) * multiplier * periodCount;
}

/**
 * 計算單期期望值（每投入 $1 的回報）
 * 注意：複選並不會提高回報率，只是同時買了多注，回報率恆等於單注回報率。
 */
export function expectedReturnRate(gameType: Exclude<GameType, 'basic'>): number {
    const spec = SIDE_GAME_SPECS[gameType];
    return (spec.unitPrize * spec.winProbability) / BASE_BET;
}

/**
 * 統計最近 N 期的大小或單雙分布
 */
export function summarizeSideHistory(
    gameType: 'bigSmall' | 'oddEven',
    drawsNumbers: number[][],
): { win: Record<SideSelection, number>; tie: number; total: number } {
    const options = SIDE_OPTIONS[gameType];
    const win = { [options[0]]: 0, [options[1]]: 0 } as Record<SideSelection, number>;
    let tie = 0;
    for (const numbers of drawsNumbers) {
        const r = getSideResult(gameType, numbers);
        if (r === '和') tie += 1;
        else win[r] = (win[r] ?? 0) + 1;
    }
    return { win, tie, total: drawsNumbers.length };
}

/**
 * 統計最近 N 期各超級獎號的出現次數
 * @returns Map<號碼, 次數>
 */
export function summarizeSuperHistory(superNumbers: number[]): Map<number, number> {
    const map = new Map<number, number>();
    for (const n of superNumbers) {
        if (!n || n < 1 || n > 80) continue;
        map.set(n, (map.get(n) ?? 0) + 1);
    }
    return map;
}
