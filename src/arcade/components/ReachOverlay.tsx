/**
 * 預告 STEP 字卡、預告色條、聽牌演出（暗角＋慢動作＋心跳）
 */
import type { ShowState } from '../engine';
import { COLOR_LABEL, REACH_LABEL } from '../director';
import { markFailed, reachCutinUrl, useAsset } from '../assets';

const STEP_WORDS = ['', '注目', '集氣', '激熱', '超激熱', '最高潮'];

/** 出球前的預告：STEP 1~5 依序升級，最後亮出預告色 */
export function PreviewStep({ show }: { show: ShowState }) {
    if (show.phase !== 'preview' || !show.plan) return null;
    const { step, color } = show.plan;
    return (
        <div className="arcade-preview" data-color={show.showColor ? color : 'none'}>
            <div className="arcade-preview-flash" key={show.previewStep} aria-hidden="true" />
            <div className="arcade-preview-steps">
                {[1, 2, 3, 4, 5].map((s) => (
                    <span
                        key={s}
                        className={`arcade-step${s <= show.previewStep ? ' is-on' : ''}${s > step ? ' is-locked' : ''}`}
                    >
                        STEP {s}
                    </span>
                ))}
            </div>
            {show.previewStep > 0 && (
                <div className="arcade-preview-word" key={`w${show.previewStep}`}>{STEP_WORDS[show.previewStep]}</div>
            )}
            {show.showColor && (
                <div className={`arcade-colorbar arcade-colorbar--${color}`}>
                    預告色：{COLOR_LABEL[color]}{color === 'rainbow' ? '（確定！）' : ''}
                </div>
            )}
            {show.plan.spectator && <div className="arcade-preview-note">觀戰中：本期未下注</div>}
        </div>
    );
}

/** 出球中常駐的預告色條（小） */
export function ColorStrip({ show }: { show: ShowState }) {
    if (show.phase !== 'drawing' || !show.plan) return null;
    return <div className={`arcade-strip arcade-colorbar--${show.plan.color}`} aria-label={`預告色 ${COLOR_LABEL[show.plan.color]}`} />;
}

/** 聽牌：差 1 顆就中，畫面暗角、慢動作、心跳 */
export function ReachOverlay({ show }: { show: ShowState }) {
    const reach = show.plan?.reach;
    // 吉祥物 cut-in：SPSP / PREMIUM 用 premium 圖，其餘用 reach 圖；缺檔就只有原本的文字演出
    const cutUrl = reach ? reachCutinUrl(reach.level) : null;
    const cutOk = useAsset(cutUrl);
    if (!show.reachOn || !reach) return null;
    return (
        <div className={`arcade-reach arcade-reach--${reach.level}${show.reachResult ? ` is-${show.reachResult}` : ''}`}>
            <div className="arcade-reach-vignette" aria-hidden="true" />
            {cutOk && cutUrl && (
                <img className="arcade-imgcut arcade-imgcut--reach" src={cutUrl} alt="" aria-hidden="true"
                    width={1344} height={576} decoding="async" onError={() => markFailed(cutUrl)} />
            )}
            <div className="arcade-reach-text">
                <div className="arcade-reach-title">{REACH_LABEL[reach.level]}</div>
                <div className="arcade-reach-sub">{reach.label}・目標 {reach.value.toLocaleString()} 幣</div>
                {show.reachResult === 'win' && <div className="arcade-reach-result is-win">成功！</div>}
                {show.reachResult === 'lose' && <div className="arcade-reach-result is-lose">落空…</div>}
            </div>
        </div>
    );
}
