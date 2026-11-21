/**
 * 賓果娛樂機 — 隱私說明（不進側邊欄；由免責聲明、登入區、娛樂機頁尾連入）
 */
import { Link } from 'react-router-dom';
import { useSeo } from '../hooks/useSeo';
import { DISCLAIMER_TEXT } from '../arcade/components/Disclaimer';
import '../arcade/arcade.css';
import '../arcade/arcade-p2.css';

export default function ArcadePrivacy() {
    useSeo({
        title: '賓果娛樂機隱私說明',
        description: '賓果娛樂機收集哪些資料、用途、存放位置、保存期間與如何刪除帳號。',
    });

    return (
        <div className="arcade-root arcade-privacy">
            <article className="arcade-panel arcade-privacy-card">
                <h1 className="arcade-privacy-title">賓果娛樂機 隱私說明</h1>
                <p className="arcade-muted">本說明只適用於「賓果娛樂機」（LINE 登入的虛擬代幣娛樂模擬）。未登入的試玩模式資料只存在你的瀏覽器，不會送到伺服器。</p>

                <h2>1. 我們收集哪些資料</h2>
                <ul>
                    <li>透過 LINE 登入時，只取得：<b>LINE userId</b>、<b>顯示名稱</b>、<b>大頭貼網址</b>。</li>
                    <li><b>不取得 email</b>、電話或其他 LINE 好友資料。</li>
                    <li>遊玩過程產生的紀錄：虛擬代幣與活動券餘額、注單、戰績、每日任務、成就、簽到與救濟紀錄、代幣帳本。</li>
                </ul>

                <h2>2. 用途</h2>
                <ul>
                    <li>辨識你的帳號、保存虛擬代幣與遊玩紀錄。</li>
                    <li>在排行榜與中獎跑馬燈顯示你的顯示名稱與大頭貼。</li>
                    <li>防止重複領取註冊金等濫用行為。</li>
                </ul>

                <h2>3. 存放位置</h2>
                <p>資料存放在 Cloudflare（Workers 與其資料庫服務）。</p>

                <h2>4. 不提供給第三方</h2>
                <p>我們不會出售、出租或提供你的資料給第三方。LINE 登入本身由 LINE 處理，請另參考 LINE 的隱私政策。</p>

                <h2>5. 保存期間</h2>
                <p>帳號存在期間持續保存；你刪除帳號後即刪除（例外見第 7 點）。</p>

                <h2>6. 如何刪除帳號</h2>
                <p>登入娛樂機後，在「戰績」分頁下方的「帳號設定」按「刪除帳號…」，輸入 <b>DELETE</b> 確認即可。刪除後會回到未登入狀態，所有資料無法復原。</p>

                <h2>7. 刪除後保留什麼</h2>
                <p>只保留你 LINE id 的<b>雜湊值</b>（無法反推出原本的 id）與刪除時間，用途僅限防止重複領取註冊金：之後用同一個 LINE 帳號重新註冊，<b>不會再送註冊金</b>。</p>

                <div className="arcade-disclaimer arcade-disclaimer--inline" role="note">
                    <span className="arcade-disclaimer-tag">免責聲明</span>{DISCLAIMER_TEXT}
                </div>

                <p className="arcade-privacy-back">
                    <Link className="arcade-btn arcade-btn--neon" to="/bingo-arcade">回到賓果娛樂機</Link>
                </p>
            </article>
        </div>
    );
}
