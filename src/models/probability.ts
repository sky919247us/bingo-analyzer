/**
 * 賓果賓果超幾何分佈機率計算模組
 * 
 * 遊戲規則：從 80 顆球中開出 20 顆
 * 玩家選 k 顆（星數），計算恰好命中 x 顆的機率
 */

/** 
 * 計算組合數 C(n, r) 
 * 使用對數避免大數溢位
 */
export function combination(n: number, r: number): number {
  if (r < 0 || r > n) return 0;
  if (r === 0 || r === n) return 1;
  // 利用對稱性減少計算量
  if (r > n - r) r = n - r;

  let logResult = 0;
  for (let i = 0; i < r; i++) {
    logResult += Math.log(n - i) - Math.log(i + 1);
  }
  return Math.round(Math.exp(logResult));
}

/**
 * 計算對數組合數 log(C(n, r))
 * 用於超大數計算（避免溢位）
 */
export function logCombination(n: number, r: number): number {
  if (r < 0 || r > n) return -Infinity;
  if (r === 0 || r === n) return 0;
  if (r > n - r) r = n - r;

  let result = 0;
  for (let i = 0; i < r; i++) {
    result += Math.log(n - i) - Math.log(i + 1);
  }
  return result;
}

// NOTE: 賓果賓果基本常數
const TOTAL_BALLS = 80;
const DRAWN_BALLS = 20;

/**
 * 超幾何分佈機率計算
 * P(X = x) = C(k, x) * C(80-k, 20-x) / C(80, 20)
 * 
 * @param starCount - 玩家選擇的星數（k 顆號碼）
 * @param hitCount - 命中顆數（x）
 * @returns 命中機率
 */
export function hypergeometricProbability(starCount: number, hitCount: number): number {
  if (hitCount < 0 || hitCount > Math.min(starCount, DRAWN_BALLS)) return 0;
  if (hitCount > starCount || (DRAWN_BALLS - hitCount) > (TOTAL_BALLS - starCount)) return 0;

  // 使用對數避免溢位：log(P) = log(C(k,x)) + log(C(80-k, 20-x)) - log(C(80,20))
  const logP =
    logCombination(starCount, hitCount) +
    logCombination(TOTAL_BALLS - starCount, DRAWN_BALLS - hitCount) -
    logCombination(TOTAL_BALLS, DRAWN_BALLS);

  return Math.exp(logP);
}

/** 單一星數的全部命中機率列表 */
export interface ProbabilityResult {
  hitCount: number;
  probability: number;
  odds: string; // 例如 "1/4"
}

/**
 * 計算某星數下所有可能的命中機率
 * @param starCount - 星數 (1~10)
 */
export function calculateAllProbabilities(starCount: number): ProbabilityResult[] {
  const results: ProbabilityResult[] = [];
  const maxHit = Math.min(starCount, DRAWN_BALLS);

  for (let x = 0; x <= maxHit; x++) {
    const prob = hypergeometricProbability(starCount, x);
    if (prob > 0) {
      const oddsDenom = Math.round(1 / prob);
      results.push({
        hitCount: x,
        probability: prob,
        odds: prob >= 0.01 ? `${(prob * 100).toFixed(2)}%` : `1/${oddsDenom.toLocaleString()}`,
      });
    }
  }

  return results;
}

/**
 * 計算多組投注的至少一組中獎機率
 * @param singleProb - 單組中獎機率
 * @param groupCount - 組數
 */
export function atLeastOneHitProbability(singleProb: number, groupCount: number): number {
  // P(至少一組中) = 1 - (1 - p)^n
  return 1 - Math.pow(1 - singleProb, groupCount);
}

/**
 * 計算部分號碼相同時的中獎機率（蒙地卡羅估算）
 * @param starCount - 星數
 * @param groupCount - 組數
 * @param sharedCount - 共用號碼數
 * @param targetHit - 目標命中數
 * @param simRounds - 模擬輪次
 */
export function sharedNumbersProbability(
  starCount: number,
  groupCount: number,
  sharedCount: number,
  targetHit: number,
  simRounds: number = 10000,
): number {
  let successCount = 0;

  for (let round = 0; round < simRounds; round++) {
    // 隨機產生開獎號碼（20 顆）
    const drawnSet = new Set<number>();
    while (drawnSet.size < DRAWN_BALLS) {
      drawnSet.add(Math.floor(Math.random() * TOTAL_BALLS) + 1);
    }

    // 隨機產生共用號碼
    const allNumbers = Array.from({ length: TOTAL_BALLS }, (_, i) => i + 1);
    shuffleArray(allNumbers);
    const sharedNumbers = allNumbers.slice(0, sharedCount);

    let anyGroupHit = false;
    for (let g = 0; g < groupCount; g++) {
      // 每組的獨立號碼從剩餘號碼中隨機選取
      const remaining = allNumbers.slice(sharedCount);
      shuffleArray(remaining);
      const uniqueNumbers = remaining.slice(0, starCount - sharedCount);
      const groupNumbers = [...sharedNumbers, ...uniqueNumbers];

      // 計算命中數
      const hits = groupNumbers.filter((n) => drawnSet.has(n)).length;
      if (hits >= targetHit) {
        anyGroupHit = true;
        break;
      }
    }

    if (anyGroupHit) successCount++;
  }

  return successCount / simRounds;
}

/** Fisher-Yates 洗牌 */
function shuffleArray(arr: number[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
