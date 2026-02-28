/**
 * 賓果賓果稅務計算模組
 * 
 * 根據中華民國稅法：
 * - 免稅門檻：單注獎金 ≦ NT$ 5,000
 * - 超過門檻：所得稅 20% + 印花稅 0.4%
 */

/** 稅務常數 */
const TAX_THRESHOLD = 5000;
const INCOME_TAX_RATE = 0.20;
const STAMP_TAX_RATE = 0.004;
const TOTAL_TAX_RATE = INCOME_TAX_RATE + STAMP_TAX_RATE;

/** 稅務計算結果 */
export interface TaxResult {
    /** 稅前獎金 */
    grossPrize: number;
    /** 是否需要課稅 */
    isTaxable: boolean;
    /** 所得稅金額 */
    incomeTax: number;
    /** 印花稅金額 */
    stampTax: number;
    /** 總稅額 */
    totalTax: number;
    /** 稅後實拿金額 */
    netPrize: number;
    /** 實拿比例 */
    netRatio: number;
}

/**
 * 計算單注稅務
 * @param grossPrize - 稅前單注獎金
 * @param multiplier - 投注倍數（影響單注獎金判定）
 */
export function calculateTax(grossPrize: number, multiplier: number = 1): TaxResult {
    // NOTE: 稅金判定以「單注獎金 × 倍數」為基準
    const totalPrize = grossPrize * multiplier;
    const isTaxable = totalPrize > TAX_THRESHOLD;

    if (!isTaxable) {
        return {
            grossPrize: totalPrize,
            isTaxable: false,
            incomeTax: 0,
            stampTax: 0,
            totalTax: 0,
            netPrize: totalPrize,
            netRatio: 1,
        };
    }

    const incomeTax = Math.floor(totalPrize * INCOME_TAX_RATE);
    const stampTax = Math.floor(totalPrize * STAMP_TAX_RATE);
    const totalTax = incomeTax + stampTax;
    const netPrize = totalPrize - totalTax;

    return {
        grossPrize: totalPrize,
        isTaxable: true,
        incomeTax,
        stampTax,
        totalTax,
        netPrize,
        netRatio: netPrize / totalPrize,
    };
}

/**
 * 取得稅率資訊文字
 */
export function getTaxInfo(): { threshold: number; rate: number; effectiveRate: number } {
    return {
        threshold: TAX_THRESHOLD,
        rate: TOTAL_TAX_RATE,
        effectiveRate: 1 - TOTAL_TAX_RATE,
    };
}
