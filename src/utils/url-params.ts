/**
 * URL 參數編解碼工具
 * 用於策略分享功能
 */

export interface StrategyParams {
    star: number;
    groups: number;
    multiplier: number;
    isPromo: boolean;
    withTax: boolean;
    shared: number;
}

/**
 * 將策略參數編碼為 URL query string
 */
export function encodeStrategy(params: StrategyParams): string {
    const searchParams = new URLSearchParams({
        s: params.star.toString(),
        g: params.groups.toString(),
        m: params.multiplier.toString(),
        p: params.isPromo ? '1' : '0',
        t: params.withTax ? '1' : '0',
        sh: params.shared.toString(),
    });
    return searchParams.toString();
}

/**
 * 從 URL query string 解碼策略參數
 */
export function decodeStrategy(queryString: string): StrategyParams | null {
    const params = new URLSearchParams(queryString);
    const star = parseInt(params.get('s') || '', 10);
    if (isNaN(star) || star < 1 || star > 10) return null;

    return {
        star,
        groups: parseInt(params.get('g') || '1', 10) || 1,
        multiplier: parseInt(params.get('m') || '1', 10) || 1,
        isPromo: params.get('p') === '1',
        withTax: params.get('t') === '1',
        shared: parseInt(params.get('sh') || '0', 10) || 0,
    };
}

/**
 * 取得完整的分享 URL
 */
export function getShareUrl(params: StrategyParams): string {
    const base = window.location.origin + window.location.pathname;
    return `${base}#/calculator?${encodeStrategy(params)}`;
}
