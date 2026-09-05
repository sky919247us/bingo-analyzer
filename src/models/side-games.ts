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

/* ========================================================================
 * 超級獎號分析
 * ====================================================================== */

/** 依出現次數分組的結果（同次數的號碼並列） */
export interface SuperCountGroup {
    /** 出現次數 */
    count: number;
    /** 該次數的所有號碼（由小到大） */
    numbers: number[];
}

export interface SuperAnalysis {
    /** 樣本期數 */
    totalPeriods: number;
    /** 有開出過的號碼，依次數由多到少分組（同次數並列） */
    groups: SuperCountGroup[];
    /** 從未開出的號碼 */
    never: number[];
    /** 每個號碼的出現次數（1~80 皆有值） */
    freq: Map<number, number>;
}

/**
 * 超級獎號完整分析：依出現次數分組 + 從未開出清單
 *
 * 用分組而非「前五名」，是因為快開型彩券的樣本裡大量號碼會並列同一次數，
 * 直接取前五名會武斷地切斷並列，看起來像是那五個特別熱。
 */
export function analyzeSuperNumbers(superNumbers: number[]): SuperAnalysis {
    const freq = new Map<number, number>();
    for (let n = 1; n <= 80; n++) freq.set(n, 0);

    let totalPeriods = 0;
    for (const n of superNumbers) {
        totalPeriods += 1;
        if (!n || n < 1 || n > 80) continue;
        freq.set(n, (freq.get(n) ?? 0) + 1);
    }

    const byCount = new Map<number, number[]>();
    const never: number[] = [];
    for (let n = 1; n <= 80; n++) {
        const c = freq.get(n) ?? 0;
        if (c === 0) { never.push(n); continue; }
        if (!byCount.has(c)) byCount.set(c, []);
        byCount.get(c)!.push(n);
    }

    const groups: SuperCountGroup[] = [...byCount.entries()]
        .map(([count, numbers]) => ({ count, numbers: numbers.sort((a, b) => a - b) }))
        .sort((a, b) => b.count - a.count);

    return { totalPeriods, groups, never, freq };
}

/* ========================================================================
 * 回測 / 模擬引擎
 * ====================================================================== */

/** 回測輸入：任何帶有 numbers 與 superNumber 的開獎資料 */
export interface DrawLike {
    numbers: number[];
    superNumber: number;
}

/** 單期回測結果 */
export interface SidePeriodResult {
    /** 該期的實際結果（超級獎號玩法為開出的號碼） */
    outcome: string;
    /** 是否中獎 */
    win: boolean;
    /** 該期獎金（含注數與倍數，稅前） */
    prize: number;
    /** 該期成本 */
    cost: number;
}

/** 回測總結 */
export interface SideBacktestResult {
    periods: SidePeriodResult[];
    totalPeriods: number;
    /** 中獎期數 */
    winCount: number;
    /** 和局期數（僅猜大小 / 猜單雙有意義） */
    tieCount: number;
    winRate: number;
    totalPrize: number;
    totalCost: number;
    netProfit: number;
    /** 實際回報率 = 總獎金 / 總成本 */
    returnRate: number;
    /** 最長連續未中期數 */
    maxMissStreak: number;
    /** 資金曲線（累積損益） */
    profitCurve: number[];
}

/**
 * 回測附加玩法
 *
 * @param draws       開獎資料（順序即為投注順序）
 * @param gameType    玩法
 * @param selections  猜大小 / 猜單雙的投注方向；超級獎號玩法請用 superPicks
 * @param superPicks  超級獎號的預測號碼
 * @param multiplier  投注倍數
 */
export function backtestSideGame(
    draws: DrawLike[],
    gameType: Exclude<GameType, 'basic'>,
    opts: { selections?: SideSelection[]; superPicks?: number[]; multiplier?: number } = {},
): SideBacktestResult {
    const multiplier = opts.multiplier ?? 1;
    const selections = opts.selections ?? [];
    const superPicks = opts.superPicks ?? [];
    const spec = SIDE_GAME_SPECS[gameType];

    const betCount = gameType === 'super' ? superPicks.length : selections.length;
    const costPerPeriod = BASE_BET * betCount * multiplier;

    const periods: SidePeriodResult[] = [];
    const profitCurve: number[] = [];
    let cumulative = 0;
    let winCount = 0;
    let tieCount = 0;
    let missStreak = 0;
    let maxMissStreak = 0;

    for (const d of draws) {
        let win = false;
        let outcome: string;

        if (gameType === 'super') {
            outcome = String(d.superNumber);
            win = superPicks.includes(d.superNumber);
        } else {
            const r = getSideResult(gameType, d.numbers);
            outcome = r;
            if (r === '和') tieCount += 1;
            else win = selections.includes(r);
        }

        // 超級獎號複選時最多命中 1 注；大小單雙同押兩邊也只有一邊會中
        const prize = win ? spec.unitPrize * multiplier : 0;
        cumulative += prize - costPerPeriod;

        if (win) {
            winCount += 1;
            if (missStreak > maxMissStreak) maxMissStreak = missStreak;
            missStreak = 0;
        } else {
            missStreak += 1;
        }

        periods.push({ outcome, win, prize, cost: costPerPeriod });
        profitCurve.push(cumulative);
    }

    if (missStreak > maxMissStreak) maxMissStreak = missStreak;

    const totalPeriods = draws.length;
    const totalPrize = periods.reduce((s, p) => s + p.prize, 0);
    const totalCost = costPerPeriod * totalPeriods;

    return {
        periods,
        totalPeriods,
        winCount,
        tieCount,
        winRate: totalPeriods > 0 ? winCount / totalPeriods : 0,
        totalPrize,
        totalCost,
        netProfit: totalPrize - totalCost,
        returnRate: totalCost > 0 ? totalPrize / totalCost : 0,
        maxMissStreak,
    profitCurve,
    };
}

/**
 * 蒙地卡羅模擬：用理論機率隨機產生開獎結果
 * 與回測的差別是不吃歷史資料，而是直接依機率抽樣
 */
export function simulateSideGame(
    gameType: Exclude<GameType, 'basic'>,
    periodCount: number,
    opts: { betCount?: number; multiplier?: number; rng?: () => number } = {},
): SideBacktestResult {
    const rng = opts.rng ?? Math.random;
    const multiplier = opts.multiplier ?? 1;
    const betCount = opts.betCount ?? 1;
    const spec = SIDE_GAME_SPECS[gameType];

    // 每期中獎機率：超級獎號選 k 個即 k/80；大小單雙押 k 邊即 k × 9.80%
    const winProb = gameType === 'super'
        ? Math.min(1, betCount / 80)
        : Math.min(1, betCount * SIDE_WIN_PROBABILITY);

    const costPerPeriod = BASE_BET * betCount * multiplier;
    const periods: SidePeriodResult[] = [];
    const profitCurve: number[] = [];
    let cumulative = 0;
    let winCount = 0;
    let tieCount = 0;
    let missStreak = 0;
    let maxMissStreak = 0;

    for (let i = 0; i < periodCount; i++) {
        const roll = rng();
        const win = roll < winProb;
        // 和局：大小單雙在「沒中且落在和局區間」時計入
        if (gameType !== 'super' && !win && roll >= 1 - SIDE_TIE_PROBABILITY) tieCount += 1;

        const prize = win ? spec.unitPrize * multiplier : 0;
        cumulative += prize - costPerPeriod;

        if (win) {
            winCount += 1;
            if (missStreak > maxMissStreak) maxMissStreak = missStreak;
            missStreak = 0;
        } else {
            missStreak += 1;
        }

        periods.push({ outcome: win ? '中' : '未中', win, prize, cost: costPerPeriod });
        profitCurve.push(cumulative);
    }

    if (missStreak > maxMissStreak) maxMissStreak = missStreak;

    const totalPrize = periods.reduce((s, p) => s + p.prize, 0);
    const totalCost = costPerPeriod * periodCount;

    return {
        periods,
        totalPeriods: periodCount,
        winCount,
        tieCount,
        winRate: periodCount > 0 ? winCount / periodCount : 0,
        totalPrize,
        totalCost,
        netProfit: totalPrize - totalCost,
        returnRate: totalCost > 0 ? totalPrize / totalCost : 0,
        maxMissStreak,
        profitCurve,
    };
}
