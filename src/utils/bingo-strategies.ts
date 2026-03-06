/**
 * 賓果賓果選號演算法
 * 提供追熱、補冷、均衡、加權隨機、到期等 5 種策略
 */

/** 號碼出現頻率統計 */
export interface FrequencyMap {
  [num: number]: number;
}

/** 歷史開獎資料（簡化版） */
export interface BingoDrawData {
  /** 期數 */
  period: string;
  /** 開獎時間 */
  drawTime: string;
  /** 20 顆開獎號碼 */
  numbers: number[];
  /** 超級獎號 */
  superNumber: number;
}

/**
 * 統計各號碼在指定期數內的出現次數
 * @param draws - 開獎資料陣列
 * @returns 號碼 → 出現次數 的映射
 */
export function calculateFrequency(draws: BingoDrawData[]): FrequencyMap {
  const freq: FrequencyMap = {};
  for (let n = 1; n <= 80; n++) freq[n] = 0;
  for (const draw of draws) {
    for (const num of draw.numbers) {
      freq[num] = (freq[num] || 0) + 1;
    }
  }
  return freq;
}

/**
 * 計算每個號碼距離上次出現的期數
 * @param draws - 開獎資料陣列（需按時間由新到舊排列）
 * @returns 號碼 → 距離上次出現期數
 */
export function calculateGaps(draws: BingoDrawData[]): FrequencyMap {
  const gaps: FrequencyMap = {};
  for (let n = 1; n <= 80; n++) gaps[n] = draws.length; // 預設為最大間隔

  for (let i = 0; i < draws.length; i++) {
    for (const num of draws[i].numbers) {
      // 只記錄首次出現（最短間距）
      if (gaps[num] === draws.length) {
        gaps[num] = i;
      }
    }
  }
  return gaps;
}

/**
 * 追熱策略：挑選最近最常出現的號碼
 */
export function hotStrategy(draws: BingoDrawData[], count: number): number[] {
  const freq = calculateFrequency(draws);
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([num]) => parseInt(num, 10))
    .sort((a, b) => a - b);
}

/**
 * 補冷策略：挑選最久沒出現的號碼
 */
export function coldStrategy(draws: BingoDrawData[], count: number): number[] {
  const freq = calculateFrequency(draws);
  return Object.entries(freq)
    .sort((a, b) => a[1] - b[1])
    .slice(0, count)
    .map(([num]) => parseInt(num, 10))
    .sort((a, b) => a - b);
}

/**
 * 均衡策略：一半取熱門，一半取冷門
 */
export function balancedStrategy(draws: BingoDrawData[], count: number): number[] {
  const hotCount = Math.ceil(count / 2);
  const coldCount = count - hotCount;
  const hot = hotStrategy(draws, hotCount);
  const cold = coldStrategy(draws, coldCount);

  // 合併去重，若重複則從排序中間繼續補
  const combined = new Set([...hot, ...cold]);
  if (combined.size < count) {
    const freq = calculateFrequency(draws);
    const sorted = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .map(([num]) => parseInt(num, 10));
    for (const n of sorted) {
      if (combined.size >= count) break;
      combined.add(n);
    }
  }
  return Array.from(combined).sort((a, b) => a - b).slice(0, count);
}

/**
 * 加權隨機策略：依歷史頻率作為權重進行加權抽樣
 */
export function weightedRandomStrategy(draws: BingoDrawData[], count: number): number[] {
  const freq = calculateFrequency(draws);
  const entries = Object.entries(freq).map(([num, f]) => ({
    num: parseInt(num, 10),
    weight: f + 1, // +1 避免零權重
  }));

  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
  const selected = new Set<number>();

  // 加權隨機抽取，避免重複
  let attempts = 0;
  while (selected.size < count && attempts < 1000) {
    let rand = Math.random() * totalWeight;
    for (const entry of entries) {
      rand -= entry.weight;
      if (rand <= 0) {
        selected.add(entry.num);
        break;
      }
    }
    attempts++;
  }

  return Array.from(selected).sort((a, b) => a - b);
}

/**
 * 到期策略：專門選取連續最久未出現的號碼
 */
export function dueStrategy(draws: BingoDrawData[], count: number): number[] {
  const gaps = calculateGaps(draws);
  return Object.entries(gaps)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([num]) => parseInt(num, 10))
    .sort((a, b) => a - b);
}

/** 策略名稱到函式的映射 */
export type StrategyName = 'hot' | 'cold' | 'balanced' | 'weightedRandom' | 'due';

/** 策略顯示資訊 */
export const STRATEGY_INFO: Record<StrategyName, { label: string; icon: string; description: string }> = {
  hot: { label: '追熱策略', icon: '🔥', description: '選取近期出現頻率最高的熱門號碼' },
  cold: { label: '補冷策略', icon: '🧊', description: '選取久未出現的冷門號碼' },
  balanced: { label: '均衡策略', icon: '⚖️', description: '混合熱號與冷號，平衡風險' },
  weightedRandom: { label: '加權隨機', icon: '🎲', description: '依歷史頻率作為權重隨機模擬' },
  due: { label: '到期策略', icon: '⏳', description: '專門選取連續最久未出現的號碼' },
};

/**
 * 依策略名稱執行對應的選號演算法
 */
export function runStrategy(
  strategy: StrategyName,
  draws: BingoDrawData[],
  count: number,
): number[] {
  switch (strategy) {
    case 'hot': return hotStrategy(draws, count);
    case 'cold': return coldStrategy(draws, count);
    case 'balanced': return balancedStrategy(draws, count);
    case 'weightedRandom': return weightedRandomStrategy(draws, count);
    case 'due': return dueStrategy(draws, count);
  }
}
