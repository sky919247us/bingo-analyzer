/**
 * 中央液晶：80 格盤面 + 出球動畫 + 命中計數
 * 彩球從上方滾入、放大停留，再飛向對應格子；命中玩家號碼時格子爆光
 */
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ShowState } from '../engine';
import { ASSETS, markFailed, useAsset } from '../assets';

/** 依號碼區段給彩球顏色 */
export function ballTone(n: number): string {
    if (n <= 20) return 'red';
    if (n <= 40) return 'yellow';
    if (n <= 60) return 'blue';
    return 'green';
}

export function Ball({ n, size = 'md', className = '', style }: { n: number; size?: 'sm' | 'md' | 'lg'; className?: string; style?: CSSProperties }) {
    return (
        <span className={`arcade-ball arcade-ball--${ballTone(n)} arcade-ball--${size} ${className}`} style={style}>
            {String(n).padStart(2, '0')}
        </span>
    );
}

interface Props {
    show: ShowState;
    /** 要標記的玩家號碼 */
    picked: number[];
    /** 閒置時顯示的上一期號碼 */
    idleNumbers: number[];
    idleSuper: number | null;
    /** 疊在液晶上的演出層 */
    children?: ReactNode;
}

export default function DrawLcd({ show, picked, idleNumbers, idleSuper, children }: Props) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const cellRefs = useRef<(HTMLDivElement | null)[]>([]);
    const [fly, setFly] = useState({ tx: 0, ty: 0 });

    const active = show.phase !== 'idle';
    const drawnList = active ? show.drawn : idleNumbers;
    const drawnSet = useMemo(() => new Set(drawnList), [drawnList]);
    const pickedSet = useMemo(() => new Set(picked), [picked]);
    const last = show.phase === 'drawing' && show.drawn.length > 0 ? show.drawn[show.drawn.length - 1] : null;
    const superNo = active ? (show.drawn.length === 20 ? show.input?.superNumber ?? null : null) : idleSuper;

    // 量測新球要飛去的格子位置
    useLayoutEffect(() => {
        if (last === null) return;
        const wrap = wrapRef.current;
        const cell = cellRefs.current[last - 1];
        if (!wrap || !cell) return;
        const w = wrap.getBoundingClientRect();
        const c = cell.getBoundingClientRect();
        setFly({
            tx: c.left + c.width / 2 - (w.left + w.width / 2),
            ty: c.top + c.height / 2 - (w.top + w.height * 0.45),
        });
    }, [last, show.drawn.length]);

    const color = show.phase === 'drawing' && show.plan ? show.plan.color : 'none';
    // 液晶背景圖：演出期間依預告色切換；缺檔就只剩原本的 CSS 漸層
    const bgUrl = active && show.plan ? ASSETS.bg[show.plan.color] : null;
    const bgOk = useAsset(bgUrl);

    return (
        <div className={`arcade-lcd${show.reachOn ? ' is-reach' : ''}`} data-color={color} ref={wrapRef}>
            {bgOk && bgUrl && (
                <img key={bgUrl} className="arcade-lcd-bg" src={bgUrl} alt="" aria-hidden="true" decoding="async"
                    onError={() => markFailed(bgUrl)} />
            )}
            <div className="arcade-lcd-head">
                <span className="arcade-lcd-period">
                    {active ? `第 ${show.input?.period} 期` : '上一期結果'}
                    {active && show.input?.kind === 'replay' && <em className="arcade-tag arcade-tag--replay">重播・不計</em>}
                    {active && show.input?.simulated && <em className="arcade-tag arcade-tag--sim">模擬順序</em>}
                </span>
                <span className="arcade-lcd-count">
                    {active ? <>第 <b>{show.drawn.length}</b>/20 球</> : `${idleNumbers.length} 球`}
                </span>
                <span className="arcade-lcd-hits" key={show.hitCount}>
                    命中 <b className={show.hitCount > 0 ? 'arcade-bump' : ''}>{active ? show.hitCount : idleNumbers.filter((n) => pickedSet.has(n)).length}</b>
                </span>
            </div>

            <div className="arcade-grid" role="grid" aria-label="80 格開獎盤面">
                {Array.from({ length: 80 }, (_, i) => {
                    const n = i + 1;
                    const isDrawn = drawnSet.has(n);
                    const isPicked = pickedSet.has(n);
                    const cls = [
                        'arcade-cell',
                        isPicked ? 'is-picked' : '',
                        isDrawn ? 'is-drawn' : '',
                        isDrawn && isPicked ? 'is-hit' : '',
                        n === last ? 'is-new' : '',
                        n === superNo ? 'is-super' : '',
                        isDrawn ? `tone-${ballTone(n)}` : '',
                    ].filter(Boolean).join(' ');
                    return (
                        <div key={n} ref={(el) => { cellRefs.current[i] = el; }} className={cls} role="gridcell" aria-label={`${n}${isDrawn ? ' 已開出' : ''}${isPicked ? ' 已選' : ''}`}>
                            {n}
                        </div>
                    );
                })}
            </div>

            {last !== null && (
                <div
                    key={show.drawn.length}
                    className={`arcade-ball-fly${show.lastHit ? ' is-hit' : ''}${show.reachOn ? ' is-slow' : ''}`}
                    style={{ '--tx': `${fly.tx}px`, '--ty': `${fly.ty}px` } as CSSProperties}
                    aria-live="polite"
                >
                    <Ball n={last} size="lg" />
                    {show.lastHit && <span className="arcade-hit-burst" aria-hidden="true">HIT!</span>}
                </div>
            )}

            {children}
        </div>
    );
}
