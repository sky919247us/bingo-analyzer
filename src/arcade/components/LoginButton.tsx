/**
 * 登入狀態：未登入顯示 LINE 登入；已登入顯示頭像、名稱與登出
 */
import { Link } from 'react-router-dom';
import { lineLoginUrl, type ArcadeUser } from '../api';

interface Props {
    user: ArcadeUser | null;
    loading: boolean;
    onLogout: () => void;
}

export default function LoginButton({ user, loading, onLogout }: Props) {
    if (loading) return <span className="arcade-login-loading">連線中…</span>;

    if (!user) {
        return (
            <div className="arcade-login">
                <a className="arcade-btn arcade-btn--line" href={lineLoginUrl()}>
                    LINE 登入
                </a>
                <Link className="arcade-privacy-link" to="/arcade-privacy">隱私說明</Link>
            </div>
        );
    }

    return (
        <div className="arcade-user">
            {user.avatar
                ? <img className="arcade-avatar" src={user.avatar} alt="" width={32} height={32} referrerPolicy="no-referrer" />
                : <span className="arcade-avatar arcade-avatar--empty" aria-hidden="true">{user.name.slice(0, 1)}</span>}
            <span className="arcade-user-name">{user.name}</span>
            <button type="button" className="arcade-btn arcade-btn--ghost arcade-btn--sm" onClick={onLogout}>登出</button>
        </div>
    );
}
