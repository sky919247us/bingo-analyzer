/**
 * 組合分析 — 純函式工具
 * 輸入近 N 期開獎號碼（每期 20 個號碼），輸出：
 * a) 熱門單碼 Top10 / 冷門單碼 Bottom10
 * b) 同出雙星 Top8 / 同出三星 Top6
 * c) 連號雙星 Top8 / 連號三星 Top6 / 連號四星 Top4
 * d) 80 碼頻率分 5 級（極熱/偏熱/中庸/偏冷/極冷）
 * e) 指定號碼的最常同出 Top5 與其參與的連號組合
 *
 * 效能注意：N 最大 100 期，C(20,3)=1140 組 × 100 期 = 114,000 次計數，屬可接受範圍。
 */
import type { BingoDrawData } from './bingo-strategies';

/** 單碼出現次數 */
export interface NumberCount {
    number: number;
    count: number;
}

/** 雙號組合出現次數 */
export interface PairCount {
    numbers: [number, number];
    count: number;
}

/** 三號組合出現次數 */
export interface TripleCount {
    numbers: [number, number, number];
    count: number;
}

/** 連號組合出現次數（長度可為 2/3/4） */
export interface ConsecutiveCount {
    numbers: number[];
    count: number;
}

/** 熱度分級 */
export type HeatTier = 'extreme-hot' | 'hot' | 'medium' | 'cold' | 'extreme-cold';

export interface HeatCell {
    number: number;
    count: number;
    tier: HeatTier;
}

/** 指定號碼的詳細組合資料 */
export interface NumberDetail {
    number: number;
    /** 最常同出的號碼 Top5 */
    topPartners: NumberCount[];
    /** 該號碼參與的連號組合（雙/三/四星，依次數排序） */
    consecutiveCombos: ConsecutiveCount[];
}

export interface ComboAnalysisResult {
    /** 樣本期數 */
    sampleSize: number;
    /** 熱門單碼 Top10 */
    hotTop10: NumberCount[];
    /** 冷門單碼 Bottom10（由冷到不那麼冷排序） */
    coldBottom10: NumberCount[];
    /** 同出雙星 Top8 */
    pairTop8: PairCount[];
    /** 同出三星 Top6 */
    tripleTop6: TripleCount[];
    /** 連號雙星 Top8（如 12-13） */
    consecutivePairTop8: ConsecutiveCount[];
    /** 連號三星 Top6（如 12-13-14） */
    consecutiveTripleTop6: ConsecutiveCount[];
    /** 連號四星 Top4（如 12-13-14-15） */
    consecutiveQuadTop4: ConsecutiveCount[];
    /** 80 碼熱度分級（依號碼 1~80 排序） */
    heatGrid: HeatCell[];
    /** 每個號碼的原始出現次數（1~80） */
    frequency: Record<number, number>;
}

/** 計算 1~80 每個號碼的出現次數 */
function calcFrequency(draws: BingoDrawData[]): Record<number, number> {
    const freq: Record<number, number> = {};
    for (let i = 1; i <= 80; i++) freq[i] = 0;
    draws.forEach((d) => {
        d.numbers.forEach((n) => {
            if (n >= 1 && n <= 80) freq[n] = (freq[n] || 0) + 1;
        });
    });
    return freq;
}

/** 計算每期同出的雙號/三號組合次數（暴力枚舉，N<=100 期可接受） */
function calcComboCounts(draws: BingoDrawData[]) {
    const pairMap = new Map<string, PairCount>();
    const tripleMap = new Map<string, TripleCount>();

    draws.forEach((d) => {
        const sorted = Array.from(new Set(d.numbers)).sort((a, b) => a - b);
        const len = sorted.length;

        for (let i = 0; i < len; i++) {
            for (let j = i + 1; j < len; j++) {
                const key = `${sorted[i]}-${sorted[j]}`;
                const existing = pairMap.get(key);
                if (existing) {
                    existing.count += 1;
                } else {
                    pairMap.set(key, { numbers: [sorted[i], sorted[j]], count: 1 });
                }

                for (let k = j + 1; k < len; k++) {
                    const tKey = `${sorted[i]}-${sorted[j]}-${sorted[k]}`;
                    const tExisting = tripleMap.get(tKey);
                    if (tExisting) {
                        tExisting.count += 1;
                    } else {
                        tripleMap.set(tKey, { numbers: [sorted[i], sorted[j], sorted[k]], count: 1 });
                    }
                }
            }
        }
    });

    return { pairMap, tripleMap };
}

/** 計算連號組合（同一期內開出的連續號碼）次數，groupSize = 2/3/4 */
function calcConsecutiveCounts(draws: BingoDrawData[], groupSize: number): Map<string, ConsecutiveCount> {
    const result = new Map<string, ConsecutiveCount>();

    draws.forEach((d) => {
        const numberSet = new Set(d.numbers);
        for (let start = 1; start <= 80 - groupSize + 1; start++) {
            const group: number[] = [];
            let allPresent = true;
            for (let offset = 0; offset < groupSize; offset++) {
                const n = start + offset;
                if (!numberSet.has(n)) {
                    allPresent = false;
                    break;
                }
                group.push(n);
            }
            if (allPresent) {
                const key = group.join('-');
                const existing = result.get(key);
                if (existing) {
                    existing.count += 1;
                } else {
                    result.set(key, { numbers: group, count: 1 });
                }
            }
        }
    });

    return result;
}

/** 依熱度分 5 級：極熱 Top20% / 偏熱 / 中庸 / 偏冷 / 極冷 Bottom20% */
function calcHeatGrid(freq: Record<number, number>): HeatCell[] {
    const entries: NumberCount[] = [];
    for (let i = 1; i <= 80; i++) entries.push({ number: i, count: freq[i] || 0 });

    // 依次數由高到低排序，取名次決定分級
    const rankedDesc = [...entries].sort((a, b) => b.count - a.count || a.number - b.number);
    const tierByNumber = new Map<number, HeatTier>();

    rankedDesc.forEach((entry, idx) => {
        let tier: HeatTier;
        if (idx < 16) tier = 'extreme-hot';
        else if (idx < 32) tier = 'hot';
        else if (idx < 48) tier = 'medium';
        else if (idx < 64) tier = 'cold';
        else tier = 'extreme-cold';
        tierByNumber.set(entry.number, tier);
    });

    return entries.map((e) => ({
        number: e.number,
        count: e.count,
        tier: tierByNumber.get(e.number) ?? 'medium',
    }));
}

/**
 * 組合分析主函式
 * @param draws 近 N 期開獎資料（每期含 numbers: 20 個號碼），N 建議不超過 100 期
 */
export function analyzeCombo(draws: BingoDrawData[]): ComboAnalysisResult {
    const frequency = calcFrequency(draws);

    const freqEntries: NumberCount[] = [];
    for (let i = 1; i <= 80; i++) freqEntries.push({ number: i, count: frequency[i] || 0 });

    const hotSorted = [...freqEntries].sort((a, b) => b.count - a.count || a.number - b.number);
    const coldSorted = [...freqEntries].sort((a, b) => a.count - b.count || a.number - b.number);

    const { pairMap, tripleMap } = calcComboCounts(draws);
    const pairTop8 = Array.from(pairMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);
    const tripleTop6 = Array.from(tripleMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);

    const consecutivePairTop8 = Array.from(calcConsecutiveCounts(draws, 2).values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);
    const consecutiveTripleTop6 = Array.from(calcConsecutiveCounts(draws, 3).values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);
    const consecutiveQuadTop4 = Array.from(calcConsecutiveCounts(draws, 4).values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 4);

    return {
        sampleSize: draws.length,
        hotTop10: hotSorted.slice(0, 10),
        coldBottom10: coldSorted.slice(0, 10),
        pairTop8,
        tripleTop6,
        consecutivePairTop8,
        consecutiveTripleTop6,
        consecutiveQuadTop4,
        heatGrid: calcHeatGrid(frequency),
        frequency,
    };
}

/**
 * 指定號碼的詳細組合資料：
 * - 最常同出的號碼 Top5
 * - 該號碼參與的連號組合（雙/三/四星）
 */
export function getNumberDetail(draws: BingoDrawData[], number: number): NumberDetail {
    const partnerFreq = new Map<number, number>();

    draws.forEach((d) => {
        if (!d.numbers.includes(number)) return;
        d.numbers.forEach((n) => {
            if (n === number) return;
            partnerFreq.set(n, (partnerFreq.get(n) || 0) + 1);
        });
    });

    const topPartners: NumberCount[] = Array.from(partnerFreq.entries())
        .map(([n, count]) => ({ number: n, count }))
        .sort((a, b) => b.count - a.count || a.number - b.number)
        .slice(0, 5);

    const consecutiveCombos: ConsecutiveCount[] = [];
    [2, 3, 4].forEach((groupSize) => {
        const combos = calcConsecutiveCounts(draws, groupSize);
        combos.forEach((combo) => {
            if (combo.numbers.includes(number)) consecutiveCombos.push(combo);
        });
    });
    consecutiveCombos.sort((a, b) => b.count - a.count || a.numbers.length - b.numbers.length);

    return {
        number,
        topPartners,
        consecutiveCombos,
    };
}
