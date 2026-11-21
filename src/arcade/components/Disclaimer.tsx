/**
 * 免責聲明：頁首細條、下注區、頁尾、首次同意對話框
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';

export const DISCLAIMER_TEXT =
    '本頁為娛樂模擬，代幣為虛擬點數，無任何金錢價值，不得購買、兌換或轉讓，非真實賭博。開獎號碼取自台灣彩券公開資訊，本站與台灣彩券公司無關。未滿 18 歲請勿參與。';

export function DisclaimerBar({ variant }: { variant: 'top' | 'inline' | 'footer' }) {
    return (
        <div className={`arcade-disclaimer arcade-disclaimer--${variant}`} role="note">
            <span className="arcade-disclaimer-tag">免責聲明</span>
            {DISCLAIMER_TEXT}
            {' '}<Link className="arcade-privacy-link" to="/arcade-privacy">隱私說明</Link>
        </div>
    );
}

interface AgreeDialogProps {
    online: boolean;
    onAgree: () => Promise<void>;
}

/** 首次進入（或首次登入）必須勾選同意才能下注 / 簽到 */
export function AgreeDialog({ online, onAgree }: AgreeDialogProps) {
    const [checked, setChecked] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const submit = async () => {
        if (!checked) return;
        setBusy(true);
        setErr(null);
        try {
            await onAgree();
        } catch (e) {
            setErr(e instanceof Error ? e.message : '送出失敗，請稍後再試');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="arcade-modal" role="dialog" aria-modal="true" aria-labelledby="arcade-agree-title">
            <div className="arcade-modal-card">
                <h2 id="arcade-agree-title" className="arcade-modal-title">開始遊玩前請先閱讀</h2>
                <p className="arcade-modal-text">{DISCLAIMER_TEXT}</p>
                <ul className="arcade-modal-list">
                    <li>{online ? '登入後送 10,000 代幣，可每日簽到與破產救濟。' : '目前為「試玩模式」：代幣只存在你的瀏覽器，不計排行。'}</li>
                    <li>開獎結果完全照台彩官方數據；畫面演出只是包裝，不影響結果。</li>
                    <li>LINE 登入只取得顯示名稱與大頭貼，不取 email。<Link className="arcade-privacy-link" to="/arcade-privacy">隱私說明</Link></li>
                </ul>
                <label className="arcade-check">
                    <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
                    <span>我已滿 18 歲，並了解本頁為娛樂模擬、代幣無任何金錢價值</span>
                </label>
                {err && <p className="arcade-error">{err}</p>}
                <button type="button" className="arcade-btn arcade-btn--gold arcade-btn--block" disabled={!checked || busy} onClick={submit}>
                    {busy ? '送出中…' : '同意並開始'}
                </button>
            </div>
        </div>
    );
}
