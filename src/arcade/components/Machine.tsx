/**
 * 霓虹機台外框：頂部招牌、中央液晶（children）、底部操作列（PUSH / 跳過 / 重播 / 音效）
 */
import type { ReactNode } from 'react';
import type { RoundPhase, ShowState } from '../engine';
import { ASSETS, markFailed, useAsset } from '../assets';

const PHASE_LABEL: Record<RoundPhase, string> = {
    betting: '下注中',
    closed: '截止・等待開獎',
    preview: '預告中',
    drawing: '開獎中',
    settle: '結算',
};

interface Props {
    phase: RoundPhase;
    show: ShowState;
    status: string;
    soundOn: boolean;
    canReplay: boolean;
    onToggleSound: () => void;
    onPush: () => void;
    onSkip: () => void;
    onReplay: () => void;
    children: ReactNode;
    below?: ReactNode;
}

export default function Machine({ phase, show, status, soundOn, canReplay, onToggleSound, onPush, onSkip, onReplay, children, below }: Props) {
    const running = show.phase !== 'idle';
    // 招牌圖載入成功才換上；失敗維持原本的 CSS 霓虹字
    const signOk = useAsset(ASSETS.sign);
    return (
        <div className={`arcade-machine arcade-machine--${phase}`} data-color={show.plan && running ? show.plan.color : 'none'}>
            <div className="arcade-machine-glow" aria-hidden="true" />
            <div className="arcade-marquee">
                <span className="arcade-marquee-lights" aria-hidden="true" />
                {signOk ? (
                    <h1 className="arcade-logo arcade-logo--img">
                        <img className="arcade-sign-img" src={ASSETS.sign} alt="" width={1536} height={512} decoding="async"
                            onError={() => markFailed(ASSETS.sign)} />
                        <span className="arcade-sr">BINGO★FEVER</span>
                    </h1>
                ) : (
                    <h1 className="arcade-logo">BINGO<span>★</span>FEVER</h1>
                )}
                <div className="arcade-marquee-status">
                    <span className={`arcade-phase arcade-phase--${phase}`}>{PHASE_LABEL[phase]}</span>
                    <span className="arcade-status-text">{status}</span>
                </div>
            </div>

            <div className="arcade-screen">{children}</div>

            {below}

            <div className="arcade-controls">
                <button type="button" className="arcade-btn arcade-btn--ghost arcade-btn--icon" onClick={onToggleSound}
                    aria-pressed={soundOn} aria-label={soundOn ? '關閉音效' : '開啟音效'}>
                    {soundOn ? '🔊' : '🔇'}<span className="arcade-btn-label">{soundOn ? '音效開' : '靜音'}</span>
                </button>

                {show.pushWaiting ? (
                    <button type="button" className="arcade-push" onClick={onPush}>
                        <span>PUSH</span>
                        <small>按下揭曉最後 3 顆</small>
                    </button>
                ) : (
                    <button type="button" className="arcade-btn arcade-btn--neon" onClick={onReplay} disabled={running || !canReplay}>
                        重播上一期
                    </button>
                )}

                <button type="button" className="arcade-btn arcade-btn--ghost" onClick={onSkip} disabled={!running || show.phase === 'settle'}>
                    跳過
                </button>
            </div>
        </div>
    );
}
