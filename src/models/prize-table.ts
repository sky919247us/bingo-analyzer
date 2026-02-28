/**
 * 賓果賓果獎金對照表資料模組
 * 
 * 資料來源：台灣彩券官方 + BINGO_RULES.md
 * 單注 $25 元基準
 */

/** 獎金對照表型別 */
export interface PrizeEntry {
    /** 中獎顆數 */
    hitCount: number;
    /** 常態獎金 (單注 $25) */
    normalPrize: number;
    /** 加碼獎金 (單注 $25)，null 表示無加碼 */
    promoPrize: number | null;
}

export interface StarPrizeTable {
    /** 星數 */
    star: number;
    /** 該星數的所有獎項 */
    prizes: PrizeEntry[];
}

/** 完整的獎金對照表 */
export const PRIZE_TABLES: StarPrizeTable[] = [
    {
        star: 1,
        prizes: [
            { hitCount: 1, normalPrize: 50, promoPrize: 75 },
        ],
    },
    {
        star: 2,
        prizes: [
            { hitCount: 2, normalPrize: 75, promoPrize: 150 },
            { hitCount: 1, normalPrize: 25, promoPrize: null },
        ],
    },
    {
        star: 3,
        prizes: [
            { hitCount: 3, normalPrize: 500, promoPrize: 1000 },
            { hitCount: 2, normalPrize: 50, promoPrize: null },
        ],
    },
    {
        star: 4,
        prizes: [
            { hitCount: 4, normalPrize: 1000, promoPrize: 2000 },
            { hitCount: 3, normalPrize: 100, promoPrize: 150 },
            { hitCount: 2, normalPrize: 25, promoPrize: null },
        ],
    },
    {
        star: 5,
        prizes: [
            { hitCount: 5, normalPrize: 7500, promoPrize: 10000 },
            { hitCount: 4, normalPrize: 500, promoPrize: 600 },
            { hitCount: 3, normalPrize: 50, promoPrize: null },
        ],
    },
    {
        star: 6,
        prizes: [
            { hitCount: 6, normalPrize: 25000, promoPrize: 50000 },
            { hitCount: 5, normalPrize: 1000, promoPrize: 1200 },
            { hitCount: 4, normalPrize: 200, promoPrize: null },
            { hitCount: 3, normalPrize: 25, promoPrize: null },
        ],
    },
    {
        star: 7,
        prizes: [
            { hitCount: 7, normalPrize: 80000, promoPrize: null },
            { hitCount: 6, normalPrize: 3000, promoPrize: null },
            { hitCount: 5, normalPrize: 300, promoPrize: null },
            { hitCount: 4, normalPrize: 50, promoPrize: null },
            { hitCount: 3, normalPrize: 25, promoPrize: null },
        ],
    },
    {
        star: 8,
        prizes: [
            { hitCount: 8, normalPrize: 500000, promoPrize: null },
            { hitCount: 7, normalPrize: 20000, promoPrize: null },
            { hitCount: 6, normalPrize: 1000, promoPrize: null },
            { hitCount: 5, normalPrize: 200, promoPrize: null },
            { hitCount: 4, normalPrize: 25, promoPrize: null },
            { hitCount: 0, normalPrize: 25, promoPrize: null },
        ],
    },
    {
        star: 9,
        prizes: [
            { hitCount: 9, normalPrize: 1000000, promoPrize: null },
            { hitCount: 8, normalPrize: 100000, promoPrize: null },
            { hitCount: 7, normalPrize: 3000, promoPrize: null },
            { hitCount: 6, normalPrize: 500, promoPrize: null },
            { hitCount: 5, normalPrize: 100, promoPrize: null },
            { hitCount: 4, normalPrize: 25, promoPrize: null },
            { hitCount: 0, normalPrize: 25, promoPrize: null },
        ],
    },
    {
        star: 10,
        prizes: [
            { hitCount: 10, normalPrize: 5000000, promoPrize: null },
            { hitCount: 9, normalPrize: 250000, promoPrize: null },
            { hitCount: 8, normalPrize: 25000, promoPrize: null },
            { hitCount: 7, normalPrize: 2500, promoPrize: null },
            { hitCount: 6, normalPrize: 250, promoPrize: null },
            { hitCount: 5, normalPrize: 25, promoPrize: null },
            { hitCount: 0, normalPrize: 25, promoPrize: null },
        ],
    },
];

/**
 * 根據星數取得獎金表
 */
export function getPrizeTable(star: number): StarPrizeTable | undefined {
    return PRIZE_TABLES.find((t) => t.star === star);
}

/**
 * 根據星數和命中數取得獎金
 */
export function getPrize(star: number, hitCount: number, isPromo: boolean): number {
    const table = getPrizeTable(star);
    if (!table) return 0;

    const entry = table.prizes.find((p) => p.hitCount === hitCount);
    if (!entry) return 0;

    if (isPromo && entry.promoPrize !== null) {
        return entry.promoPrize;
    }
    return entry.normalPrize;
}
