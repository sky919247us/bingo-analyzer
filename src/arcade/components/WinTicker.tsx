/**
 * 中獎跑馬燈＋大獎 toast
 *
 * - 一般：橫向捲動；滑鼠移入或觸控按住暫停
 * - reduced（prefers-reduced-motion 或 .is-reduced）：不捲動，每 4 秒淡入淡出換一則
 * - 清單更新時不打斷正在跑的一圈：等這一圈跑完（animationiteration）才換上新清單
 */
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { FeedEvent, TickerItem } from '../feed';
import { feedText } from '../feed';

const SPEED_PX_PER_SEC = 70;
const FADE_MS = 4000;

interface TickerProps {
    items: TickerItem[];
    /** 倒數那則的即時文字 */
    countdownText: string;
    reduced: boolean;
}

function textOf(it: TickerItem, countdownText: string): string {
    return it.kind === 'countdown' ? countdownText : it.text;
}

export function WinTicker({ items, countdownText, reduced }: TickerProps) {
    const [shown, setShown] = useState<TickerItem[]>(items);
    const pendingRef = useRef<TickerItem[]>(items);
    const [paused, setPaused] = useState(false);
    const trackRef = useRef<HTMLDivElement>(null);
    const [duration, setDuration] = useState(30);
    const [idx, setIdx] = useState(0);

    /* 新清單：第一次或 reduced 模式直接換；捲動模式等這一圈結束 */
    const sig = items.map((x) => x.key).join('|');
    const shownSig = shown.map((x) => x.key).join('|');
    useEffect(() => {
        pendingRef.current = items;
        if (reduced || shown.length === 0) setShown(items);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sig, reduced]);
    /* 內容相同但文字有變（例如名字被管理員隱藏後重排）也要同步 */
    useEffect(() => {
        if (sig === shownSig) setShown(items);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items]);

    /* 捲動速度固定：依內容寬度算動畫秒數（軌道內放兩份，捲半個軌道為一圈） */
    useLayoutEffect(() => {
        if (reduced || !trackRef.current) return;
        const half = trackRef.current.scrollWidth / 2;
        setDuration(Math.max(12, half / SPEED_PX_PER_SEC));
    }, [shownSig, reduced]);

    /* 淡入淡出模式：每 4 秒換下一則（暫停時不換） */
    useEffect(() => {
        if (!reduced || paused || shown.length <= 1) return;
        const t = setInterval(() => setIdx((i) => i + 1), FADE_MS);
        return () => clearInterval(t);
    }, [reduced, paused, shown.length]);

    if (shown.length === 0) return null;

    const pauseOn = () => setPaused(true);
    const pauseOff = () => setPaused(false);
    // Pointer Events：滑鼠移入即暫停；觸控時 pointerenter 在按下、pointerleave 在放開時觸發 → 按住暫停
    //（不用 touch/mouse 事件，避免觸控後模擬的 mouseenter 讓它一直停住）
    const handlers = {
        onPointerEnter: pauseOn, onPointerDown: pauseOn,
        onPointerLeave: pauseOff, onPointerUp: (e: ReactPointerEvent) => { if (e.pointerType !== 'mouse') pauseOff(); },
        onPointerCancel: pauseOff,
    };

    const cls = (it: TickerItem) => `arcade-ticker-item arcade-ticker-item--${it.kind}`;

    if (reduced) {
        const it = shown[idx % shown.length];
        return (
            <div className={`arcade-ticker is-fade${paused ? ' is-paused' : ''}`} role="region" aria-label="中獎與開獎快訊" {...handlers}>
                <span className="arcade-ticker-tag" aria-hidden="true">快訊</span>
                <div className="arcade-ticker-viewport">
                    <span key={`${it.key}-${idx}`} className={`${cls(it)} arcade-ticker-fadein`}>{textOf(it, countdownText)}</span>
                </div>
            </div>
        );
    }

    const onIteration = () => {
        const next = pendingRef.current;
        if (next.map((x) => x.key).join('|') !== shownSig) setShown(next);
    };

    return (
        <div className={`arcade-ticker${paused ? ' is-paused' : ''}`} role="region" aria-label="中獎與開獎快訊" {...handlers}>
            <span className="arcade-ticker-tag" aria-hidden="true">快訊</span>
            <div className="arcade-ticker-viewport">
                <div
                    key={shownSig}
                    ref={trackRef}
                    className="arcade-ticker-track"
                    style={{ animationDuration: `${duration}s` }}
                    onAnimationIteration={onIteration}
                >
                    {[0, 1].map((copy) => (
                        <span key={copy} className="arcade-ticker-copy" aria-hidden={copy === 1 ? true : undefined}>
                            {shown.map((it) => <span key={it.key} className={cls(it)}>{textOf(it, countdownText)}</span>)}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}

/* ───────────── 大獎 toast ───────────── */

export function BigWinToast({ event, onClose }: { event: FeedEvent | null; onClose: () => void }) {
    if (!event) return null;
    return (
        <div className="arcade-toast" role="status" aria-live="polite">
            <span className="arcade-toast-title">大獎快報</span>
            <span className="arcade-toast-text">{feedText(event)}</span>
            <button type="button" className="arcade-toast-close" onClick={onClose} aria-label="關閉大獎快報">×</button>
        </div>
    );
}
