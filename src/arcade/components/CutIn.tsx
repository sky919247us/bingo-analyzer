/**
 * 第 20 顆超級獎號：全螢幕 cut-in 特寫
 * 玩家有下超級獎號且命中 → 彩虹最強演出
 */
import type { ShowState } from '../engine';
import { Ball } from './DrawLcd';
import { ASSETS, markFailed, useAsset } from '../assets';

export default function CutIn({ show }: { show: ShowState }) {
    // 吉祥物 SUPER NUMBER 圖：側邊滑入＋停頓＋滑出；缺檔維持原本的色帶
    const imgOk = useAsset(show.plan ? ASSETS.cutin.super : null);
    if (!show.cutIn || !show.input || !show.plan) return null;
    const revealed = show.drawn.length === 20;
    const n = show.input.superNumber;
    const { superBet, superHit } = show.plan;
    const strong = revealed && superHit;

    return (
        <div className={`arcade-cutin${strong ? ' is-premium' : ''}`} role="status" aria-live="assertive">
            <div className="arcade-cutin-band" aria-hidden="true" />
            {imgOk && (
                <img className="arcade-imgcut arcade-imgcut--super" src={ASSETS.cutin.super} alt="" aria-hidden="true"
                    width={1344} height={576} decoding="async" onError={() => markFailed(ASSETS.cutin.super)} />
            )}
            <div className="arcade-cutin-body">
                <div className="arcade-cutin-title">超級獎號</div>
                <div className="arcade-cutin-ball">
                    {revealed ? <Ball n={n} size="lg" className="arcade-ball--hero" /> : <span className="arcade-ball arcade-ball--lg arcade-ball--mystery">?</span>}
                </div>
                {superBet && (
                    <div className="arcade-cutin-sub">
                        {!revealed ? '你的超級獎號…' : superHit ? '命中超級獎號！' : '可惜，下次再來'}
                    </div>
                )}
            </div>
        </div>
    );
}
