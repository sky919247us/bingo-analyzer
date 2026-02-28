import { calculateAllProbabilities } from './src/models/probability.ts';
import { PRIZE_TABLES } from './src/models/prize-table.ts';

const star = 6;
const probs = calculateAllProbabilities(star);
const table = PRIZE_TABLES.find(t => t.star === star);

let ev = 0;
console.log(`--- 6 星機率與期望值分析 ---`);
for (const p of probs) {
    const entry = table?.prizes.find(pz => pz.hitCount === p.hitCount);
    const prize = entry ? entry.normalPrize : 0;
    const termEv = p.probability * prize;
    ev += termEv;
    console.log(`中 ${p.hitCount} 顆: 機率 ${(p.probability * 100).toFixed(6)}%, 獎金 $${prize}, 期望值貢獻: $${termEv.toFixed(6)}`);
}
console.log(`總期望值: $${ev.toFixed(6)}`);
