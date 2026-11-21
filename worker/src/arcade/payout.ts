/** 派彩計算（純函式）。基本玩法獎金照抄 src/models/prize-table.ts 的 normalPrize（不含加碼） */
import type { DrawResult } from './types';

export const UNIT_COST = 25;
export const ALLOWED_MULTIPLIERS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 20, 50];
export const SUPER_PRIZE = 1200;
export const SIDE_PRIZE = 150; // 大小／單雙

/** NORMAL_PRIZE[star][hitCount] = 單注 $25 常態獎金 */
export const NORMAL_PRIZE: Record<number, Record<number, number>> = {
  1: { 1: 50 },
  2: { 2: 75, 1: 25 },
  3: { 3: 500, 2: 50 },
  4: { 4: 1000, 3: 100, 2: 25 },
  5: { 5: 7500, 4: 500, 3: 50 },
  6: { 6: 25000, 5: 1000, 4: 200, 3: 25 },
  7: { 7: 80000, 6: 3000, 5: 300, 4: 50, 3: 25 },
  8: { 8: 500000, 7: 20000, 6: 1000, 5: 200, 4: 25, 0: 25 },
  9: { 9: 1000000, 8: 100000, 7: 3000, 6: 500, 5: 100, 4: 25, 0: 25 },
  10: { 10: 5000000, 9: 250000, 8: 25000, 7: 2500, 6: 250, 5: 25, 0: 25 },
};

export type BetItem =
  | { game: 'basic'; star: number; numbers: number[] }
  | { game: 'super'; numbers: number[] }
  | { game: 'bigSmall'; pick: '大' | '小' }
  | { game: 'oddEven'; pick: '單' | '雙' };

/** 該 item 佔幾注 */
export function unitsOf(item: BetItem): number {
  return item.game === 'super' ? item.numbers.length : 1;
}

/** 大小：41~80 ≥13 顆為大、1~40 ≥13 顆為小，否則和局 */
export function bigSmallOf(numbers: number[]): '大' | '小' | '和' {
  const big = numbers.filter((n) => n >= 41).length;
  if (big >= 13) return '大';
  if (numbers.length - big >= 13) return '小';
  return '和';
}

export function oddEvenOf(numbers: number[]): '單' | '雙' | '和' {
  const odd = numbers.filter((n) => n % 2 === 1).length;
  if (odd >= 13) return '單';
  if (numbers.length - odd >= 13) return '雙';
  return '和';
}

/**
 * 計算單一注單結果
 * hits：basic = 命中顆數；super/bigSmall/oddEven = 1 中、0 未中（和局為 0）
 */
export function evaluate(
  bet: { game: string; star: number | null; numbers: number[] | null; pick: string | null; multiplier: number },
  draw: DrawResult,
): { hits: number; payout: number } {
  const drawn = new Set(draw.numbers);
  const m = bet.multiplier;
  switch (bet.game) {
    case 'basic': {
      const hits = (bet.numbers ?? []).filter((n) => drawn.has(n)).length;
      const prize = NORMAL_PRIZE[bet.star ?? 0]?.[hits] ?? 0;
      return { hits, payout: prize * m };
    }
    case 'super': {
      const hit = (bet.numbers ?? []).includes(draw.superNumber);
      return { hits: hit ? 1 : 0, payout: hit ? SUPER_PRIZE * m : 0 };
    }
    case 'bigSmall': {
      const win = bigSmallOf(draw.numbers) === bet.pick;
      return { hits: win ? 1 : 0, payout: win ? SIDE_PRIZE * m : 0 };
    }
    case 'oddEven': {
      const win = oddEvenOf(draw.numbers) === bet.pick;
      return { hits: win ? 1 : 0, payout: win ? SIDE_PRIZE * m : 0 };
    }
    default:
      return { hits: 0, payout: 0 };
  }
}
