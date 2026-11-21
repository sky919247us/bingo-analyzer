/**
 * 賓果娛樂機（柏青哥風格開獎模擬器）
 *
 * 開獎結果完全照台彩官方數據（照實際開出順序逐顆出球），演出只是包裝：
 * 先算出玩家本期結果，再依結果挑演出強度（見 arcade/director.ts）。
 * - 新一期開獎資料到達 → 自動播放演出
 * - 「重播上一期」：不扣代幣、不計排行
 * - 未登入或 API 連不到 → 試玩模式（本地假代幣）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSeo } from '../hooks/useSeo';
import { useBingoData } from '../hooks/useBingoData';
import { secondsUntilNextDraw, taipeiDateStr, taipeiSecondsOfDay } from '../utils/tlc-direct';
import type { BingoDrawData } from '../utils/bingo-strategies';
import { useArcadeAccount } from '../arcade/account';
import { errorMessage, getRound, takeLoginParams, ArcadeApiError, type Achievement, type BetItem, type RoundInfo } from '../arcade/api';
import { buildShowInput, CLOSE_BEFORE_SEC, nextPeriodFromDraws, roundPhase, useShowPlayer } from '../arcade/engine';
import { isSoundOn, setSoundOn, sfx, startBgm, stopBgm } from '../arcade/audio';
import { buildRound, buildTopics, useWinFeed, type FeedEvent, type TickerItem } from '../arcade/feed';
import { BigWinToast, WinTicker } from '../arcade/components/WinTicker';
import type { PlayedBet } from '../arcade/payout';
import Machine from '../arcade/components/Machine';
import DrawLcd from '../arcade/components/DrawLcd';
import { ColorStrip, PreviewStep, ReachOverlay } from '../arcade/components/ReachOverlay';
import CutIn from '../arcade/components/CutIn';
import SettleOverlay from '../arcade/components/SettleOverlay';
import TugGauge from '../arcade/components/TugGauge';
import BetPanel, { draftItem, EMPTY_DRAFT, type Draft } from '../arcade/components/BetPanel';
import Leaderboard from '../arcade/components/Leaderboard';
import StatsPanel from '../arcade/components/StatsPanel';
import RulesPanel from '../arcade/components/RulesPanel';
import LoginButton from '../arcade/components/LoginButton';
import { AgreeDialog, DisclaimerBar } from '../arcade/components/Disclaimer';
import { preloadForPlan } from '../arcade/assets';
import { groupReservations, makePeriodDater } from '../arcade/multi';
import MissionCard from '../arcade/components/MissionCard';
import AchievementWall, { AchievementToast } from '../arcade/components/AchievementWall';
import RecentBets from '../arcade/components/RecentBets';
import AccountPanel from '../arcade/components/AccountPanel';
import '../arcade/arcade.css';
import '../arcade/arcade-assets.css';
import '../arcade/arcade-feed.css';
import '../arcade/arcade-p2.css';

function useReducedMotion(): boolean {
    const [reduced, setReduced] = useState(() =>
        typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    useEffect(() => {
        if (!window.matchMedia) return;
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        const on = () => setReduced(mq.matches);
        mq.addEventListener?.('change', on);
        return () => mq.removeEventListener?.('change', on);
    }, []);
    return reduced;
}

function fmtClock(sec: number): string {
    const s = Math.max(0, Math.floor(sec));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

type MobileTab = 'stats' | 'missions' | 'board' | 'rules';

/** 連莊主題色：2 綠、3 紅、5 金、10 彩虹 */
function streakTier(n: number): 'green' | 'red' | 'gold' | 'rainbow' | null {
    if (n >= 10) return 'rainbow';
    if (n >= 5) return 'gold';
    if (n >= 3) return 'red';
    if (n >= 2) return 'green';
    return null;
}

export default function BingoArcade() {
    useSeo({
        title: '賓果娛樂機',
        description: '賓果賓果開獎模擬娛樂機：照台彩官方開出順序逐顆出球，搭配預告、聽牌、超級獎號特寫等演出。虛擬代幣、無金錢價值。',
        keywords: '賓果賓果,開獎模擬,賓果娛樂機,BINGO BINGO,超級獎號,猜大小,猜單雙',
    });

    const navigate = useNavigate();
    const { draws, error: dataError } = useBingoData();
    const account = useArcadeAccount();
    const accountRef = useRef(account);
    accountRef.current = account;

    const reduced = useReducedMotion();
    const player = useShowPlayer(reduced);
    const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
    const [now, setNow] = useState(() => new Date());
    const [round, setRound] = useState<(RoundInfo & { fetchedAt: number }) | null>(null);
    const [soundOn, setSound] = useState(isSoundOn);
    const [notice, setNotice] = useState<string | null>(null);
    const [mobileTab, setMobileTab] = useState<MobileTab>('stats');
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [boardKey, setBoardKey] = useState(0);
    /* 跑馬燈：自己的試玩中獎（只存在本頁記憶體，不送後端）與大獎 toast 佇列 */
    const [selfWins, setSelfWins] = useState<TickerItem[]>([]);
    const [toastQueue, setToastQueue] = useState<FeedEvent[]>([]);
    /** 成就解鎖提示佇列 */
    const [achvQueue, setAchvQueue] = useState<Achievement[]>([]);

    /* 每秒更新倒數 */
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    /* LINE 登入回來：網址帶 login_code / login_error */
    useEffect(() => {
        const { code, error } = takeLoginParams();
        if (code === null && error === null) return;
        navigate('/bingo-arcade', { replace: true });
        if (error) { setNotice(`登入失敗：${error}`); return; }
        if (code) {
            account.loginWithCode(code)
                .then(() => setNotice('登入成功！'))
                .catch((e) => setNotice(`登入失敗：${errorMessage(e)}`));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* 登入模式：向伺服器取得目前可下注期別 */
    const latestPeriod = draws[0]?.period ?? null;
    const refreshRound = useCallback(() => {
        if (!accountRef.current.online) { setRound(null); return; }
        getRound().then((r) => setRound({ ...r, fetchedAt: Date.now() })).catch(() => setRound(null));
    }, []);
    useEffect(() => { refreshRound(); }, [refreshRound, account.online, latestPeriod]);

    const secondsToDraw = secondsUntilNextDraw(now);
    const localPeriod = useMemo(() => nextPeriodFromDraws(draws, now), [draws, now]);
    const period = account.online ? (round?.open ? round.period : null) : localPeriod;
    const secondsToClose = account.online && round
        ? (new Date(round.closesAt).getTime() - new Date(round.serverNow).getTime() - (now.getTime() - round.fetchedAt)) / 1000
        : secondsToDraw - CLOSE_BEFORE_SEC;
    const phase = roundPhase(player.state.phase, now);

    /* 登入模式：本期截止後每 10 秒重問一次下一期 */
    const roundStale = account.online && (!round || secondsToClose < 0);
    const tick10 = Math.floor(now.getTime() / 10_000);
    useEffect(() => { if (roundStale) refreshRound(); }, [roundStale, tick10, refreshRound]);
    const placed = account.betsOf(period);

    /* 多期投注（可跨日）：以本期期別＋開獎時刻為基準推算各期日期（登入用伺服器的開獎時刻，試玩用本機時鐘），以及已預約的注 */
    const baseDrawMs = account.online
        ? (round ? new Date(round.drawTime).getTime() : null)
        : Math.floor((now.getTime() + secondsToDraw * 1000) / 60_000) * 60_000;
    const periodDate = useMemo(() => makePeriodDater(period, baseDrawMs === null ? null : new Date(baseDrawMs)), [period, baseDrawMs]);
    const todayStr = taipeiDateStr(now);
    const reservations = useMemo(() => groupReservations(account.reservations, period), [account.reservations, period]);

    /* 演出一開始（拿到導演計畫）就預載本期可能用到的素材；缺檔不影響演出 */
    const showPlan = player.state.plan;
    const showSummary = player.state.summary;
    useEffect(() => {
        if (showPlan) preloadForPlan(showPlan, showSummary);
    }, [showPlan, showSummary]);

    /* 演出：新一期到達自動播放 */
    const seenRef = useRef<string | null>(null);
    const startLive = useCallback(async (draw: BingoDrawData) => {
        const bets = await accountRef.current.fetchBetsOf(draw.period);
        player.start(buildShowInput(draw, bets, 'live'), () => {
            const wasDemo = !accountRef.current.online;
            const s = accountRef.current.settlePeriod(draw);
            if (wasDemo && s && s.totalPayout > 0) {
                const best = [...s.lines].sort((a, b) => b.payout - a.payout)[0];
                const more = s.lines.filter((l) => l.payout > 0).length;
                const text = `（試玩）你在第 ${draw.period} 期 ${best.label}${more > 1 ? ` 等 ${more} 注` : ''}中獎，贏得 ${s.totalPayout.toLocaleString('zh-TW')} 幣`;
                setSelfWins((w) => [{ key: `self-${draw.period}`, kind: 'self' as const, text }, ...w.filter((x) => x.key !== `self-${draw.period}`)].slice(0, 3));
            }
            setBoardKey((k) => k + 1);
        });
    }, [player]);

    useEffect(() => {
        if (!draws[0] || account.mode === 'loading') return;
        if (seenRef.current === null) {
            seenRef.current = draws[0].period;
            account.settleStale(draws);
            return;
        }
        if (draws[0].period !== seenRef.current) {
            seenRef.current = draws[0].period;
            void startLive(draws[0]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [latestPeriod, account.mode]);

    /* 重播上一期：用該期已下的注，沒有就用目前選號示範 */
    const replay = () => {
        const d = draws[0];
        if (!d) return;
        let bets: PlayedBet[] = account.betsOf(d.period);
        if (bets.length === 0) {
            const it = draftItem(draft);
            bets = it ? [{ item: it, multiplier: draft.multiplier }] : [];
        }
        setDrawerOpen(false);
        player.start(buildShowInput(d, bets, 'replay'));
    };

    const place = async (p: string, mult: number, items: BetItem[], periods: number) => {
        try {
            await account.placeBets(p, mult, items, periods);
        } catch (e) {
            if (e instanceof ArcadeApiError && (e.code === 'WRONG_PERIOD' || e.code === 'CLOSED' || e.code === 'TOO_MANY_PERIODS')) refreshRound();
            throw new Error(errorMessage(e));
        }
    };

    const toggleSound = () => { const v = !soundOn; setSoundOn(v); setSound(v); };
    // 大廳背景音樂：在本頁才播，離開頁面就停（聲音關著時 startBgm 只記下意圖）
    useEffect(() => { startBgm(); return stopBgm; }, []);

    /* 液晶上要標記的號碼 */
    const picked = useMemo(() => {
        const s = new Set<number>();
        const add = (bs: PlayedBet[]) => bs.forEach((b) => { if ('numbers' in b.item) b.item.numbers.forEach((n) => s.add(n)); });
        if (player.state.phase !== 'idle' && player.state.input) add(player.state.input.bets);
        else { add(placed); draft.numbers.forEach((n) => s.add(n)); }
        return [...s];
    }, [player.state.phase, player.state.input, placed, draft.numbers]);

    const blockedReason = account.mode === 'loading' ? '連線中…'
        : !account.agreed ? '請先同意免責聲明'
            : !period ? '非開獎時段'
                : secondsToClose <= 0 ? '本期已截止，請等下一期' : null;

    const status = dataError && draws.length === 0 ? dataError
        : phase === 'betting' ? `第 ${period ?? '—'} 期・開獎倒數 ${fmtClock(secondsToDraw)}`
            : phase === 'closed' ? `停止下注・${fmtClock(secondsToDraw)} 後開獎`
                : player.state.input?.kind === 'replay' ? '重播中（不計）' : '官方開獎演出';

    /* 跑馬燈：真實中獎（後端，30 秒輪詢＋每期開獎後立即拉）＋開獎話題（前端由官方數據算）＋自己的試玩中獎 */
    const onNewBigWin = useCallback((e: FeedEvent) => {
        setToastQueue((q) => [...q.filter((x) => x.id !== e.id), e]);
        sfx.coin(); // 音效關閉時 sfx 內部不會發聲
    }, []);
    const feedEvents = useWinFeed(latestPeriod, onNewBigWin);
    const todayKey = draws[0]?.drawTime.slice(0, 10) ?? '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const topics = useMemo(() => buildTopics(draws), [draws, todayKey]);
    const tickerItems = useMemo(() => buildRound(selfWins, feedEvents, topics), [selfWins, feedEvents, topics]);
    // 倒數：首期與跨日期別照常推算（期別以伺服器為準，試玩用本機推算）
    const nextPeriodText = period ?? localPeriod;
    const countdownText = secondsToDraw > 300
        ? (taipeiSecondsOfDay(now) < 7 * 3600 + 5 * 60
            ? `⏱️ 今日 07:05 開出第一期${nextPeriodText ? `（第 ${nextPeriodText} 期）` : ''}`
            : `⏱️ 今日開獎已結束，明日 07:05 開出第一期${nextPeriodText ? `（第 ${nextPeriodText} 期）` : ''}`)
        : nextPeriodText
            ? `⏱️ 距第 ${nextPeriodText} 期開獎還有 ${fmtClock(secondsToDraw)}`
            : `⏱️ 距下一期開獎還有 ${fmtClock(secondsToDraw)}`;
    const toast = toastQueue[0] ?? null;
    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToastQueue((q) => q.slice(1)), 3500);
        return () => clearTimeout(t);
    }, [toast]);
    /* 成就解鎖：大獎 toast 沒在顯示時才出現（同位置），並放進跑馬燈 */
    const achvToast = toast ? null : achvQueue[0] ?? null;
    useEffect(() => {
        if (!achvToast) return;
        const t = setTimeout(() => setAchvQueue((q) => q.slice(1)), 3500);
        return () => clearTimeout(t);
    }, [achvToast]);
    const onAchvUnlocked = useCallback((items: Achievement[]) => {
        setAchvQueue((q) => [...q, ...items.filter((a) => !q.some((x) => x.code === a.code))]);
        setSelfWins((w) => [
            ...items.map((a) => ({ key: `achv-${a.code}`, kind: 'self' as const, text: `🏅 成就解鎖：${a.icon} ${a.title}` })),
            ...w.filter((x) => !items.some((a) => x.key === `achv-${a.code}`)),
        ].slice(0, 3));
        sfx.coin();
    }, []);
    /** 任務／成就／注單重新讀取的時機：餘額變動（下注、結算、簽到、救濟）或每期開獎後 */
    const p2Key = `${boardKey}-${account.stats.coins}-${account.stats.tickets}-${account.user?.id ?? ''}`;
    const tier = streakTier(account.stats.curStreak);

    const drawnForTug = player.state.phase !== 'idle' ? player.state.drawn : draws[0]?.numbers ?? [];
    const demo = !account.online;

    return (
        <div className={`arcade-root${reduced ? ' is-reduced' : ''}`}>
            <DisclaimerBar variant="top" />

            <header className="arcade-head">
                <div className="arcade-mode">
                    {demo
                        ? <span className="arcade-badge arcade-badge--demo">試玩模式・不計排行{account.offline ? '（伺服器連不到）' : ''}</span>
                        : <span className="arcade-badge arcade-badge--online">已登入・計入排行</span>}
                </div>
                <LoginButton user={account.user} loading={account.mode === 'loading'} onLogout={() => void account.logout()} />
            </header>
            {notice && <div className="arcade-notice" role="status">{notice}<button type="button" onClick={() => setNotice(null)} aria-label="關閉">×</button></div>}
            <WinTicker items={tickerItems} countdownText={countdownText} reduced={reduced} />

            <div className="arcade-layout">
                <div className="arcade-col arcade-col--center">
                    <div className={`arcade-streak${tier ? ` arcade-streak--${tier}` : ''}`} data-streak={tier ?? 'none'}>
                    {tier && <div className="arcade-streak-chip" role="status">連莊 {account.stats.curStreak}・{({ green: '綠', red: '紅', gold: '金', rainbow: '彩虹' } as const)[tier]}色機台</div>}
                    <Machine
                        phase={phase}
                        show={player.state}
                        status={status}
                        soundOn={soundOn}
                        canReplay={draws.length > 0}
                        onToggleSound={toggleSound}
                        onPush={player.push}
                        onSkip={player.skip}
                        onReplay={replay}
                        below={<TugGauge drawn={drawnForTug} />}
                    >
                        <DrawLcd show={player.state} picked={picked} idleNumbers={draws[0]?.numbers ?? []} idleSuper={draws[0]?.superNumber ?? null}>
                            <ColorStrip show={player.state} />
                            <PreviewStep show={player.state} />
                            <ReachOverlay show={player.state} />
                            <SettleOverlay show={player.state} reduced={reduced} />
                        </DrawLcd>
                    </Machine>
                    </div>

                    <div className="arcade-mtabs arcade-mtabs--4" role="tablist" aria-label="資訊分頁">
                        {([['stats', '戰績'], ['missions', '任務'], ['board', '排行榜'], ['rules', '規則']] as const).map(([k, label]) => (
                            <button key={k} type="button" role="tab" aria-selected={mobileTab === k}
                                className={`arcade-mtab${mobileTab === k ? ' is-on' : ''}`} onClick={() => setMobileTab(k)}>
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className={`arcade-pane arcade-pane--rules${mobileTab === 'rules' ? ' is-on' : ''}`}>
                        <RulesPanel />
                    </div>
                </div>

                <div className="arcade-col arcade-col--left arcade-col--split">
                    <div className={`arcade-pane arcade-pane--stack arcade-pane--stats${mobileTab === 'stats' ? ' is-on' : ''}`}>
                    <StatsPanel
                        stats={account.stats}
                        demo={demo}
                        agreed={account.agreed}
                        checkedIn={account.checkedIn}
                        rescued={account.rescued}
                        canRescue={account.canRescue}
                        onCheckin={account.checkin}
                        onRescue={account.rescue}
                        onResetDemo={account.resetDemo}
                    />
                    {account.online && <RecentBets reloadKey={p2Key} periodDate={periodDate} today={todayStr} />}
                    {account.online && account.user && (
                        <AccountPanel
                            userName={account.user.name}
                            onDelete={account.deleteAccount}
                            onDeleted={() => { setNotice('帳號已刪除，已回到未登入狀態。之後用同一個 LINE 重新註冊不會再送註冊金。'); setMobileTab('stats'); }}
                        />
                    )}
                    </div>
                    <div className={`arcade-pane arcade-pane--stack arcade-pane--missions${mobileTab === 'missions' ? ' is-on' : ''}`}>
                        <MissionCard online={account.online} agreed={account.agreed} reloadKey={p2Key} onCoins={account.applyCoins} />
                        <AchievementWall online={account.online} userId={account.user?.id ?? null} reloadKey={p2Key} onUnlocked={onAchvUnlocked} />
                    </div>
                </div>

                <div className="arcade-col arcade-col--right">
                    <div className={`arcade-drawer${drawerOpen ? ' is-open' : ''}`}>
                        <button type="button" className="arcade-drawer-handle" onClick={() => setDrawerOpen((v) => !v)} aria-expanded={drawerOpen}>
                            {drawerOpen ? '收起下注 ▼' : `下注 ▲・${blockedReason === null ? `截止 ${fmtClock(secondsToClose)}` : '暫停下注'}`}
                            {placed.length > 0 && <span className="arcade-drawer-count">{placed.length}</span>}
                        </button>
                        <div className="arcade-drawer-body">
                            <BetPanel
                                draft={draft}
                                setDraft={setDraft}
                                period={period}
                                secondsToClose={secondsToClose}
                                blockedReason={blockedReason}
                                placed={placed}
                                balance={account.stats.coins + account.stats.tickets}
                                demo={demo}
                                periodDate={periodDate}
                                today={todayStr}
                                betsOf={(p) => account.betsOf(p)}
                                reservations={reservations}
                                onPlace={place}
                            />
                        </div>
                    </div>
                    <div className={`arcade-pane arcade-pane--board${mobileTab === 'board' ? ' is-on' : ''}`}>
                        <Leaderboard online={account.online} reloadKey={boardKey} />
                    </div>
                </div>
            </div>

            <DisclaimerBar variant="footer" />
            <p className="arcade-ai-note arcade-ai-note--footer">部分圖像由 AI 生成</p>
            <nav className="arcade-footer-links" aria-label="娛樂機說明">
                <Link className="arcade-privacy-link" to="/arcade-privacy">隱私說明</Link>
            </nav>

            <CutIn show={player.state} />
            <BigWinToast event={toast} onClose={() => setToastQueue((q) => q.slice(1))} />
            <AchievementToast item={achvToast} onClose={() => setAchvQueue((q) => q.slice(1))} />
            {account.mode !== 'loading' && !account.agreed && (
                <AgreeDialog online={account.online} onAgree={account.agree} />
            )}
        </div>
    );
}
