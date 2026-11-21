/**
 * 規則說明
 */
export default function RulesPanel() {
    return (
        <section className="arcade-panel arcade-rules" aria-label="規則">
            <h2 className="arcade-panel-title">玩法與演出說明</h2>
            <ul>
                <li>每注 25 代幣，倍數可選 1、2、3、4、5、6、8、10、12、20、50。</li>
                <li>基本玩法 1~10 星：派彩依台彩官方常態獎金表 × 倍數。</li>
                <li>超級獎號：猜第 20 顆，每個號碼 1 注，中獎 1,200 × 倍數。</li>
                <li>猜大小／單雙：一邊開出 ≥13 顆為勝，中獎 150 × 倍數；和局不中獎。</li>
                <li>開獎前 30 秒截止下注；結果完全照台彩官方開出順序逐顆出球。</li>
                <li>演出依「已經確定的結果」挑選：預告 STEP 越高、顏色越熱（藍→綠→紅→金→彩虹）越有希望；彩虹為確定演出。也可能出現強預告卻落空。</li>
                <li>聽牌：差 1 顆就中時觸發，依可得獎金分一般／SP／SPSP／PREMIUM。</li>
                <li>每日簽到 +500；代幣＋活動券低於 25 時每日可領一次破產救濟 +1,000。</li>
                <li>「重播上一期」不扣代幣、不計排行，會用你目前的選號示範結果。</li>
            </ul>
            <p className="arcade-ai-note">部分圖像由 AI 生成</p>
        </section>
    );
}
