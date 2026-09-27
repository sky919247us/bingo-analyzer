/**
 * 超級獎號「尾數 (0~9)」分析（純函式，無副作用）
 * 超級獎號範圍為 1~80，尾數 = 號碼 % 10（例如 80 的尾數為 0）
 */

export interface SuperTailStat {
    /** 尾數 0~9 */
    digit: number;
    /** 該尾數在樣本期數內出現次數 */
    count: number;
    /** 目前遺漏期數：距離上次開出該尾數已經過幾期（0 = 最新一期就是該尾數）；
     *  若樣本內從未開出，則等於樣本總期數 */
    gap: number;
}

/**
 * @param superNumbersNewestFirst 超級獎號陣列，順序需為「由新到舊」（[0] 為最新一期）
 */
export function analyzeSuperTail(superNumbersNewestFirst: number[]): SuperTailStat[] {
    const counts = new Array(10).fill(0);
    const gaps = new Array(10).fill(-1); // -1 = 尚未找到最近一次出現

    superNumbersNewestFirst.forEach((n, idx) => {
        if (!n || n < 1 || n > 80) return;
        const digit = n % 10;
        counts[digit] += 1;
        if (gaps[digit] === -1) gaps[digit] = idx;
    });

    const total = superNumbersNewestFirst.length;
    return Array.from({ length: 10 }, (_, digit) => ({
        digit,
        count: counts[digit],
        gap: gaps[digit] === -1 ? total : gaps[digit],
    }));
}
