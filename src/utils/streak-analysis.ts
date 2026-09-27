/**
 * 大小 / 單雙「連開走勢」分析（純函式，無副作用）
 *
 * 判定規則沿用 src/models/side-games.ts 既有定義（不自創）：
 * - 大小：>=41 為「大」，兩邊皆需達 13 顆（SIDE_WIN_COUNT）才成立，否則為「和」
 * - 單雙：規則相同，單/雙各需達 13 顆
 *
 * 「和」的處理：和局代表兩邊都未達成立門檻，無法歸屬任一邊，
 * 因此本模組將「和」視為連開中斷（不延續前一期的連開，也不自成一種連開），
 * 讓使用者清楚看到「目前連開」只描述『大』/『小』/『單』/『雙』其中一邊。
 */
import { getBigSmallResult, getOddEvenResult, type SideSelection } from '../models/side-games';

/** 連開趨勢分級 */
export type StreakLevel = '平穩' | '趨勢形成中' | '極熱' | '極其罕見';

export interface StreakResult {
    /** 目前連開的一方；'和' 代表最新一期為和局（無連開）；null 代表無資料 */
    side: SideSelection | '和' | null;
    /** 連開期數（和局或無資料時為 0） */
    length: number;
    /** 依連開期數換算的趨勢分級 */
    level: StreakLevel;
}

/**
 * 連開期數 → 趨勢分級
 * <3 平穩／>=3 趨勢形成中／>=5 極熱／>=8 極其罕見
 */
export function classifyStreakLevel(length: number): StreakLevel {
    if (length >= 8) return '極其罕見';
    if (length >= 5) return '極熱';
    if (length >= 3) return '趨勢形成中';
    return '平穩';
}

/**
 * 通用連開計算：由最新一期往前數，統計連續同一結果的期數
 * @param drawsNewestFirst 開獎號碼陣列，順序需為「由新到舊」（drawsNewestFirst[0] 為最新一期）
 * @param resultFn 依單期號碼判定結果（大小或單雙）的函式
 */
function computeStreak(
    drawsNewestFirst: number[][],
    resultFn: (numbers: number[]) => SideSelection | '和',
): StreakResult {
    if (drawsNewestFirst.length === 0) {
        return { side: null, length: 0, level: '平穩' };
    }

    const latestResult = resultFn(drawsNewestFirst[0]);

    // 和局不歸屬任一邊，視為連開中斷
    if (latestResult === '和') {
        return { side: '和', length: 0, level: '平穩' };
    }

    let length = 0;
    for (const numbers of drawsNewestFirst) {
        if (resultFn(numbers) === latestResult) length += 1;
        else break;
    }

    return { side: latestResult, length, level: classifyStreakLevel(length) };
}

/** 計算「大小」目前連開走勢 */
export function computeBigSmallStreak(drawsNewestFirst: number[][]): StreakResult {
    return computeStreak(drawsNewestFirst, getBigSmallResult);
}

/** 計算「單雙」目前連開走勢 */
export function computeOddEvenStreak(drawsNewestFirst: number[][]): StreakResult {
    return computeStreak(drawsNewestFirst, getOddEvenResult);
}
