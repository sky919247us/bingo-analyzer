import { useSeo } from '../hooks/useSeo';
import { PRIZE_TABLES } from '../models/prize-table';
import { calculateAllProbabilities } from '../models/probability';
import { SIDE_GAME_SPECS } from '../models/side-games';
import { getTaxInfo } from '../models/tax';
import '../styles/guide.css';

/**
 * 玩法教學內容頁（SEO 內容補完）
 *
 * 所有規則性數字均來自專案內資料：
 * - 基本規則（開獎頻率/球數/時程）：BINGO_RULES.md
 * - 獎金：models/prize-table.ts（PRIZE_TABLES）
 * - 機率：models/probability.ts（calculateAllProbabilities，超幾何分布精算）
 * - 附加玩法：models/side-games.ts（SIDE_GAME_SPECS）
 * - 稅務：models/tax.ts（getTaxInfo）
 */
export default function BingoGuide() {
    useSeo({
        title: '玩法教學',
        description: '台灣彩券賓果賓果(BINGO BINGO)完整玩法教學：1~10星規則、超級獎號、猜大小、猜單雙、各星數獎金與機率、常見術語解說與理性投注提醒。',
        keywords: '賓果賓果玩法, BINGO BINGO教學, 賓果規則, 超級獎號, 猜大小, 猜單雙, 賓果術語, 冷熱門, 遺漏值',
    });

    const taxInfo = getTaxInfo();

    /** 每個星數的「最高中獎顆數」獎項與對應機率，作為教學摘要 */
    const starSummaries = PRIZE_TABLES.map((table) => {
        const topEntry = [...table.prizes].sort((a, b) => b.hitCount - a.hitCount)[0];
        const probs = calculateAllProbabilities(table.star);
        const topProb = probs.find((p) => p.hitCount === topEntry.hitCount);
        return {
            star: table.star,
            topHit: topEntry.hitCount,
            topPrize: topEntry.normalPrize,
            odds: topProb?.odds ?? '—',
        };
    });

    const terms: { term: string; desc: string }[] = [
        { term: '冷熱門', desc: '依號碼在近期開獎中出現的次數多寡分類：出現次數偏高稱「熱門」，偏低稱「冷門」，純屬歷史統計描述，不代表未來傾向。' },
        { term: '遺漏值', desc: '某號碼距離上一次開出，已經連續「未開出」的期數。遺漏值愈大，代表該號愈久沒出現。' },
        { term: '連開', desc: '同一號碼在連續兩期（或以上）都開出。' },
        { term: '同出', desc: '兩個以上號碼在同一期一起開出的統計現象，常用來觀察號碼之間的關聯頻率。' },
        { term: '連號', desc: '開獎號碼中出現數值相鄰的號碼（例如 23、24），用於描述號碼分布的連續性。' },
    ];

    const faqs = [
        {
            q: '賓果賓果怎麼玩？',
            a: `賓果賓果從 01~80 號中，每期開出 20 顆號碼。玩家可依需求選擇 1 星到 10 星玩法（選 1~10 個號碼），中獎顆數對到規定門檻即可獲得對應獎金，每注新台幣 25 元。`,
        },
        {
            q: '賓果賓果多久開獎一次？投注時間到幾點？',
            a: `每 5 分鐘開獎一次，每日投注時間為 07:05 至 23:55，最後一期於 24:00 開獎（實際時程請以台灣彩券官方公告為準）。`,
        },
        {
            q: '超級獎號、猜大小、猜單雙是什麼？',
            a: `超級獎號是預測當期開出的第 20 個號碼；猜大小是預測 01~40（小）或 41~80（大）哪一邊開出較多顆；猜單雙是預測單數或雙數哪一邊開出較多顆，兩者都是「單邊開出 13 顆以上」才算成立，兩邊都不足 13 顆視為和局不中獎。`,
        },
        {
            q: '賓果賓果中獎獎金需要課稅嗎？',
            a: `依中華民國稅法，單注獎金超過新台幣 ${taxInfo.threshold.toLocaleString()} 元時，需扣繳所得稅與印花稅；未超過門檻則免稅。課稅以「每一注」為認定單位。`,
        },
        {
            q: '什麼是冷熱門、遺漏值？',
            a: `冷熱門是指號碼在近期開獎中出現次數的多寡；遺漏值是指某號碼連續多少期沒有開出。兩者都只是歷史統計描述，不代表下一期的機率會改變。`,
        },
    ];

    return (
        <div className="animate-in">
            <h1 className="page-title"><span className="emoji-icon">📖</span> 玩法教學</h1>
            <p className="page-subtitle">
                本頁彙整台灣彩券「BINGO BINGO 賓果賓果」的基本玩法、附加玩法、獎金與機率概要，並附常見術語解說。
                本站為非官方數據分析工具，正確玩法與獎金請以台灣彩券官方公告為準。
            </p>

            <nav className="guide-toc" aria-label="頁內導覽">
                <a href="#guide-basic">基本玩法</a>
                <a href="#guide-side">附加玩法</a>
                <a href="#guide-prize">獎金與機率</a>
                <a href="#guide-terms">常見術語</a>
                <a href="#guide-faq">常見問答</a>
                <a href="#guide-disclaimer">理性投注與免責聲明</a>
            </nav>

            <section id="guide-basic" className="card guide-section">
                <h2 className="section-title">基本玩法：1~10 星怎麼選？</h2>
                <p className="guide-lead">
                    賓果賓果的號碼範圍是 01~80 號，每期從中隨機開出 20 顆球。玩家可選擇投注「1 星至 10 星」，
                    選擇的號碼數量即為星數；依開獎後「命中顆數」對照獎金表發放獎金，每注基本售價新台幣 25 元。
                </p>
                <table className="data-table">
                    <thead>
                        <tr><th>項目</th><th>內容</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>總球數</td><td>01~80 號，共 80 顆</td></tr>
                        <tr><td>每期開獎顆數</td><td>20 顆</td></tr>
                        <tr><td>開獎頻率</td><td>每 5 分鐘一次</td></tr>
                        <tr><td>基本注額</td><td>每注新台幣 25 元（可選倍數投注）</td></tr>
                        <tr><td>投注時段</td><td>每日 07:05 開放投注至 23:55，最後一期 24:00 開獎</td></tr>
                        <tr><td>可選星數</td><td>1 星至 10 星（選 1~10 個號碼）</td></tr>
                    </tbody>
                </table>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 'var(--space-sm)' }}>
                    ※ 開獎時程與投注時間屬台灣彩券官方規範，實際內容請以官方公告為準（本站資料來源：專案內部 BINGO_RULES.md）。
                </p>
            </section>

            <section id="guide-side" className="card guide-section">
                <h2 className="section-title">附加玩法：超級獎號 / 猜大小 / 猜單雙</h2>
                <div className="grid grid-3" style={{ gap: 'var(--space-md)' }}>
                    {Object.values(SIDE_GAME_SPECS).map((spec) => (
                        <div className="guide-term-card" key={spec.type}>
                            <h4>{spec.icon} {spec.label}</h4>
                            <p>{spec.description}</p>
                            <p style={{ marginTop: 'var(--space-xs)' }}>
                                固定獎金倍數：<strong>{spec.payoutMultiple} 倍</strong>（單注獎金 ${spec.unitPrize.toLocaleString()}）
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            <section id="guide-prize" className="card guide-section">
                <h2 className="section-title">各星數獎金與機率概要</h2>
                <p className="guide-lead">
                    下表列出各星數「全中」（命中顆數等於星數，8~10 星另有「中 0 顆」安慰獎）的常態獎金與對應中獎機率，
                    完整各命中顆數獎金表請見「完整獎金表」頁面。機率為超幾何分布精算值（80 取 20）。
                </p>
                <table className="data-table">
                    <thead>
                        <tr><th>星數</th><th>對應獎項</th><th>常態獎金</th><th>中獎機率</th></tr>
                    </thead>
                    <tbody>
                        {starSummaries.map((s) => (
                            <tr key={s.star}>
                                <td>{s.star} 星</td>
                                <td>中 {s.topHit} 顆</td>
                                <td>${s.topPrize.toLocaleString()}</td>
                                <td>{s.odds}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 'var(--space-sm)' }}>
                    課稅規則：單注獎金超過新台幣 {taxInfo.threshold.toLocaleString()} 元需扣繳所得稅（20%）與印花稅（0.4%），
                    未超過門檻則全額免稅；詳見「完整獎金表」頁面的稅後試算。
                </p>
            </section>

            <section id="guide-terms" className="card guide-section">
                <h2 className="section-title">常見術語</h2>
                <div className="guide-term-grid">
                    {terms.map((t) => (
                        <div className="guide-term-card" key={t.term}>
                            <h4>{t.term}</h4>
                            <p>{t.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section id="guide-disclaimer" className="card guide-section">
                <h2 className="section-title">理性投注與免責聲明</h2>
                <div className="guide-disclaimer">
                    <p><strong>本站為非官方網站，僅提供數據分析與統計參考，不保證中獎結果。</strong></p>
                    <p>所有機率與獎金數字僅供研究參考，正確規則以台灣彩券官方公告為準。</p>
                    <p><strong>未滿 18 歲不得購買或兌領彩券。</strong>請理性投注，量力而為。</p>
                </div>
            </section>

            <section id="guide-faq" className="card guide-section">
                <h2 className="section-title">常見問答</h2>
                {faqs.map((f) => (
                    <div className="guide-faq-item" key={f.q}>
                        <h4>{f.q}</h4>
                        <p>{f.a}</p>
                    </div>
                ))}
            </section>

            <script type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        '@context': 'https://schema.org',
                        '@type': 'FAQPage',
                        mainEntity: faqs.map((f) => ({
                            '@type': 'Question',
                            name: f.q,
                            acceptedAnswer: { '@type': 'Answer', text: f.a },
                        })),
                    }),
                }}
            />
        </div>
    );
}
