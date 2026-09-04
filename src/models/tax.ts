/**
 * 賓果賓果稅務計算模組
 * 
 * 根據中華民國稅法：
 * - 免稅門檻：單注獎金 ≦ NT$ 5,000
 * - 超過門檻：所得稅 20% + 印花稅 0.4%
 *
 * ⚠ 課稅以「每一注」為單位認定。加倍投注等同於買了 N 注相同選號，
 *   每一注各自以「基本單注獎金」與 $5,000 門檻比較，倍數不會把單注獎金推過門檻。
 *   例：超級獎號單注 $1,200，押 10 倍中獎為 10 注 × $1,200，全額免稅（不是 1 注 $12,000）。
 *   這也是「3星4倍10期」策略能全額免稅的原理。
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
 * 計算稅務
 *
 * 課稅門檻以「基本單注獎金」認定，與倍數無關；倍數只是把注數放大 N 倍，
 * 稅額逐注計算後再乘以 N。
 *
 * @param grossPrize - 稅前「基本單注」獎金（含加碼後的金額）
 * @param multiplier - 投注倍數，等同注數
 */
export function calculateTax(grossPrize: number, multiplier: number = 1): TaxResult {
    // 課稅與否只看基本單注獎金，倍數不影響判定
    const isTaxable = grossPrize > TAX_THRESHOLD;
    const totalPrize = grossPrize * multiplier;

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

    // 逐注計算稅額（各稅目分別無條件捨去至元），再依注數放大
    const incomeTaxPerBet = Math.floor(grossPrize * INCOME_TAX_RATE);
    const stampTaxPerBet = Math.floor(grossPrize * STAMP_TAX_RATE);
    const incomeTax = incomeTaxPerBet * multiplier;
    const stampTax = stampTaxPerBet * multiplier;
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
