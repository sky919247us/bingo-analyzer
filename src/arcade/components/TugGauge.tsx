/**
 * 大小 / 單雙拔河量表：隨出球即時擺動，某邊 ≥13 顆定格，20 顆都不足則為「和」
 */
import { BIG_THRESHOLD, SIDE_WIN_COUNT } from '../../models/side-games';

function Gauge({ left, right, a, b, total }: { left: string; right: string; a: number; b: number; total: number }) {
    const result = a >= SIDE_WIN_COUNT ? left : b >= SIDE_WIN_COUNT ? right : total >= 20 ? '和' : null;
    // a 多 → 指針往左
    const pos = 50 - ((a - b) / 20) * 100;
    const clamped = Math.max(4, Math.min(96, pos));
    return (
        <div className={`arcade-tug${result ? ' is-locked' : ''}`}>
            <span className={`arcade-tug-side${result === left ? ' is-win' : ''}`}>{left} {a}</span>
            <div className="arcade-tug-track">
                <div className="arcade-tug-fill-l" style={{ width: `${clamped}%` }} />
                <div className="arcade-tug-mark" aria-hidden="true" />
                <div className="arcade-tug-knot" style={{ left: `${clamped}%` }} />
            </div>
            <span className={`arcade-tug-side${result === right ? ' is-win' : ''}`}>{b} {right}</span>
            {result && <span className="arcade-tug-result">{result}</span>}
        </div>
    );
}

export default function TugGauge({ drawn }: { drawn: number[] }) {
    const big = drawn.filter((n) => n >= BIG_THRESHOLD).length;
    const odd = drawn.filter((n) => n % 2 === 1).length;
    return (
        <div className="arcade-tugs" aria-label="大小單雙拔河">
            <Gauge left="大" right="小" a={big} b={drawn.length - big} total={drawn.length} />
            <Gauge left="單" right="雙" a={odd} b={drawn.length - odd} total={drawn.length} />
        </div>
    );
}
