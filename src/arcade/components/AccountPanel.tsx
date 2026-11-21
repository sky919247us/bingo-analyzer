/**
 * 帳號設定（登入模式）：隱私說明連結、刪除帳號（輸入 DELETE 二次確認）
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../api';

interface Props {
    userName: string;
    onDelete: () => Promise<void>;
    onDeleted: () => void;
}

export default function AccountPanel({ userName, onDelete, onDeleted }: Props) {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const ok = text.trim() === 'DELETE';

    const submit = async () => {
        if (!ok || busy) return;
        setBusy(true);
        setErr(null);
        try {
            await onDelete();
            onDeleted();
        } catch (e) {
            setErr(errorMessage(e));
            setBusy(false);
        }
    };

    return (
        <section className="arcade-panel arcade-account" aria-label="帳號設定">
            <h2 className="arcade-panel-title">帳號設定</h2>
            <p className="arcade-muted">
                目前登入：{userName}・<Link className="arcade-privacy-link" to="/arcade-privacy">隱私說明</Link>
            </p>
            {!open ? (
                <button type="button" className="arcade-btn arcade-btn--ghost arcade-btn--danger arcade-btn--block" onClick={() => setOpen(true)}>
                    刪除帳號…
                </button>
            ) : (
                <div className="arcade-delete" role="group" aria-labelledby="arcade-delete-title">
                    <h3 id="arcade-delete-title" className="arcade-delete-title">確定要刪除帳號？</h3>
                    <ul className="arcade-delete-list">
                        <li>你的代幣、活動券、注單、戰績、任務、成就與帳本紀錄會<b>全部刪除，無法復原</b>。</li>
                        <li>之後用同一個 LINE 帳號重新註冊，<b>不會再送註冊金</b>（起始代幣為 0）。</li>
                        <li>系統只保留 LINE id 的雜湊值，用來防止重複領註冊金。</li>
                    </ul>
                    <label className="arcade-delete-label" htmlFor="arcade-delete-input">請輸入 <b>DELETE</b> 確認</label>
                    <input id="arcade-delete-input" className="arcade-input" type="text" autoComplete="off" autoCapitalize="characters"
                        spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} placeholder="DELETE" />
                    {err && <p className="arcade-error" role="alert">{err}</p>}
                    <div className="arcade-delete-actions">
                        <button type="button" className="arcade-btn arcade-btn--ghost" disabled={busy}
                            onClick={() => { setOpen(false); setText(''); setErr(null); }}>
                            取消
                        </button>
                        <button type="button" className="arcade-btn arcade-btn--danger-solid" disabled={!ok || busy} onClick={() => void submit()}>
                            {busy ? '刪除中…' : '永久刪除帳號'}
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}
