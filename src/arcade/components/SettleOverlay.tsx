/**
 * 結算演出：中獎金額滾動 + 金幣雨；大獎全螢幕閃光與 BIG WIN 字；落空也有收尾
 */
import { useEffect, useState } from 'react';
import type { ShowState } from '../engine';
import { getBigSmallResult, getOddEvenResult } from '../../models/side-games';
import CoinRain from './CoinRain';
import { Ball } from './DrawLcd';
import { ASSETS, cardKind, markFailed, pickBigWinVideo, useAsset, videoAllowed, wantsBigWinVideo } from '../assets';
import type { BigWinVideoAsset } from '../assets';

/** 數字由 0 滾動到目標 */
function useRollUp(target: number, ms: number, reduced: boolean): number {
    const [v, setV] = useState(reduced ? target : 0);
    useEffect(() => {
        if (reduced || target <= 0) { setV(target); return; }
        let raf = 0;
        const t0 = performance.now();
        const tick = (t: number) => {
            const p = Math.min(1, (t - t0) / ms);
            setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
            if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [target, ms, reduced]);
    return v;
}

const WIN_TITLE = { small: 'WIN', win: 'WIN!', big: 'BIG WIN', mega: 'MEGA WIN' } as const;
const CARD_ALT = { bigwin: 'BIG WIN', megawin: 'MEGA WIN', jackpot: 'JACKPOT' } as const;

/**
 * 最高等級大獎的背景影片：muted / autoplay / playsInline / loop。
 * reduced-motion 或省流量 → 不掛 <video>，只顯示 poster；影片載入失敗 → 退回 poster（poster 也缺就什麼都不放）。
 */
function BigWinVideo({ reduced, video }: { reduced: boolean; video: BigWinVideoAsset }) {
    const [failed, setFailed] = useState(false);
    const posterOk = useAsset(video.poster);
    const allowVideo = !failed && videoAllowed(reduced);
    if (allowVideo) {
        return (
            <video key={video.mp4} className="arcade-settle-video" muted autoPlay playsInline loop preload="auto" aria-hidden="true"
                poster={posterOk ? video.poster : undefined} onError={() => setFailed(true)}>
                <source src={video.webm} type="video/webm" />
                {/* 最後一個 source 也失敗才算整支影片失敗（source 的 error 不會冒泡到 video） */}
                <source src={video.mp4} type="video/mp4" onError={() => setFailed(true)} />
            </video>
        );
    }
    if (!posterOk) return null;
    return (
        <img className="arcade-settle-video" src={video.poster} alt="" aria-hidden="true" decoding="async"
            onError={() => markFailed(video.poster)} />
    );
}

export default function SettleOverlay({ show, reduced }: { show: ShowState; reduced: boolean }) {
    const s = show.summary;
    const plan = show.plan;
    const input = show.input;
    const active = show.phase === 'settle' && !!s && !!plan && !!input;
    const payout = active ? s!.totalPayout : 0;
    const big = active && (plan!.winClass === 'big' || plan!.winClass === 'mega');
    const rolled = useRollUp(payout, big ? 2600 : 1400, reduced);
    // 素材：大獎字卡、落空吉祥物（都是缺檔就退回原本的文字）
    const card = active ? cardKind(plan!, s ?? null) : null;
    const cardUrl = card ? ASSETS.card[card] : null;
    const cardOk = useAsset(cardUrl);
    const loseUrl = active && !plan!.spectator && plan!.winClass === 'none' ? ASSETS.mascotLose : null;
    const loseOk = useAsset(loseUrl);

    if (!active) return null;
    const bs = getBigSmallResult(input!.numbers);
    const oe = getOddEvenResult(input!.numbers);
    const replay = input!.kind === 'replay';
    const rainLevel = plan!.winClass === 'none' || plan!.winClass === 'small' ? (plan!.winClass === 'small' ? 'win' : null)
        : plan!.winClass === 'win' ? 'win' : plan!.winClass;

    return (
        <>
            {big && !reduced && <div className="arcade-bigflash" aria-hidden="true" />}
            <CoinRain level={rainLevel} reduced={reduced} />
            <div className={`arcade-settle arcade-settle--${plan!.winClass}`} role="status" aria-live="polite">
                {wantsBigWinVideo(plan!) && <BigWinVideo reduced={reduced} video={pickBigWinVideo(plan!)} />}
                {plan!.spectator ? (
                    <>
                        <div className="arcade-settle-title">本期結果</div>
                        <div className="arcade-settle-sub">觀戰中・下一期記得下注</div>
                    </>
                ) : plan!.winClass === 'none' ? (
                    <>
                        {loseOk && loseUrl && (
                            <img className="arcade-settle-mascot" src={loseUrl} alt="" aria-hidden="true" width={1024} height={1024}
                                decoding="async" onError={() => markFailed(loseUrl)} />
                        )}
                        <div className="arcade-settle-title arcade-settle-title--miss">{plan!.missText}</div>
                        <div className="arcade-settle-sub">本期下注 {s!.totalCost.toLocaleString()} 幣・命中 {show.hitCount} 顆</div>
                    </>
                ) : (
                    <>
                        {cardOk && card && cardUrl ? (
                            <div className="arcade-settle-title arcade-settle-card">
                                <img src={cardUrl} alt={CARD_ALT[card]} width={1344} height={576} decoding="async"
                                    onError={() => markFailed(cardUrl)} />
                            </div>
                        ) : (
                            <div className="arcade-settle-title">{WIN_TITLE[plan!.winClass as keyof typeof WIN_TITLE]}</div>
                        )}
                        <div className="arcade-settle-amount">+{rolled.toLocaleString()}</div>
                        <div className="arcade-settle-sub">
                            下注 {s!.totalCost.toLocaleString()}・淨 {s!.net >= 0 ? '+' : ''}{s!.net.toLocaleString()} 幣
                        </div>
                    </>
                )}
                {!plan!.spectator && s!.lines.length > 0 && (
                    <ul className="arcade-settle-lines">
                        {s!.lines.map((l, i) => (
                            <li key={i} className={l.payout > 0 ? 'is-win' : ''}>
                                <span>{l.label} ×{l.multiplier}</span>
                                <span>{l.payout > 0 ? `+${l.payout.toLocaleString()}` : '—'}</span>
                            </li>
                        ))}
                    </ul>
                )}
                <div className="arcade-settle-facts">
                    <span>超級獎號 <Ball n={input!.superNumber} size="sm" /></span>
                    <span>大小：<b>{bs}</b></span>
                    <span>單雙：<b>{oe}</b></span>
                </div>
                {replay && <div className="arcade-settle-note">重播不扣代幣、不計排行</div>}
            </div>
        </>
    );
}
