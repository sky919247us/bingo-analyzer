/**
 * 賓果娛樂機 — 中獎跑馬燈資料
 *
 * 內容全部可驗證，絕不虛構：
 * 1. 真實中獎：後端 GET /api/feed（只有伺服器結算過的真實注單；名字已遮罩）
 * 2. 開獎話題：由 useBingoData 的官方開獎資料在前端算出（不打 API），每則都能用當期數據對照
 * 3. 自己的中獎：試玩模式中獎時插一則「（試玩）你 …」，只在本機記憶體、不送後端
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ARCADE_API } from './api';
import type { BingoDrawData } from '../utils/bingo-strategies';
import { countBig, countOdd, getBigSmallResult, getOddEvenResult } from '../models/side-games';
import { computeBigSmallStreak, computeOddEvenStreak } from '../utils/streak-analysis';
import { taipeiDateStr } from '../utils/tlc-direct';

/* ───────────── 型別 ───────────── */

export interface FeedEvent {
    id: number;
    type: 'win' | 'bigwin';
    maskedName: string;
    period: string;
    game: string;
    payout: number;
    ratio: number;
    createdAt: string;
}

export type TickerKind = 'win' | 'bigwin' | 'self' | 'topic' | 'countdown';

export interface TickerItem {
    /** 去重用；同 key 視為同一則 */
    key: string;
    kind: TickerKind;
    text: string;
}

export const TICKER_MAX = 12;
const POLL_MS = 30_000;
/** 後端回 404（例如尚未部署此端點）時暫停輪詢多久，避免 console 一直出錯 */
const BACKOFF_404_MS = 5 * 60_000;

const fmt = (n: number) => n.toLocaleString('zh-TW');

export function feedText(e: FeedEvent): string {
    return `🎉 ${e.maskedName} 在第 ${e.period} 期 ${e.game}，贏得 ${fmt(e.payout)} 幣`;
}

/* ───────────── 後端 feed ───────────── */

/** 免登入；不帶自訂標頭（簡單請求，不觸發 CORS 預檢） */
export async function fetchFeed(signal?: AbortSignal): Promise<FeedEvent[]> {
    const r = await fetch(`${ARCADE_API}/api/feed?limit=30`, { signal });
    if (!r.ok) throw Object.assign(new Error(`feed HTTP ${r.status}`), { status: r.status });
    const data = await r.json() as { events?: FeedEvent[] };
    return Array.isArray(data.events) ? data.events : [];
}

/**
 * 輪詢真實中獎：每 30 秒一次＋ refreshKey（最新期別）變動時立刻拉一次
 * - 連不到就維持現有清單、不報錯
 * - 第一次成功載入時已存在的事件只放跑馬燈；之後新出現的 bigwin 才交給 onNewBigWin（跳 toast）
 */
export function useWinFeed(refreshKey: string | null, onNewBigWin: (e: FeedEvent) => void): FeedEvent[] {
    const [events, setEvents] = useState<FeedEvent[]>([]);
    const maxIdRef = useRef<number | null>(null);
    const pauseUntilRef = useRef(0);
    const cbRef = useRef(onNewBigWin);
    cbRef.current = onNewBigWin;

    const pull = useCallback(async (signal?: AbortSignal) => {
        if (Date.now() < pauseUntilRef.current) return;
        try {
            const list = await fetchFeed(signal);
            const prevMax = maxIdRef.current;
            const newMax = list.reduce((m, e) => Math.max(m, e.id), prevMax ?? 0);
            if (prevMax !== null) {
                // 舊→新依序推播
                list.filter((e) => e.id > prevMax && e.type === 'bigwin')
                    .sort((a, b) => a.id - b.id)
                    .forEach((e) => cbRef.current(e));
            }
            maxIdRef.current = newMax;
            setEvents(list);
        } catch (err) {
            if ((err as { name?: string }).name === 'AbortError') return;
            if ((err as { status?: number }).status === 404) pauseUntilRef.current = Date.now() + BACKOFF_404_MS;
            /* 其餘錯誤：靜默，只顯示開獎話題 */
        }
    }, []);

    useEffect(() => {
        const ac = new AbortController();
        void pull(ac.signal);
        return () => ac.abort();
    }, [pull, refreshKey]);

    useEffect(() => {
        const t = setInterval(() => { void pull(); }, POLL_MS);
        return () => clearInterval(t);
    }, [pull]);

    return events;
}

/* ───────────── 開獎話題（純函式） ───────────── */

const CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const cnNum = (n: number) => (n <= 10 ? CN_NUM[n] : String(n));
const pad2 = (n: number) => String(n).padStart(2, '0');

/** 只取「期別連續」的前段（避免資料缺期時把不相鄰的兩期當成連開） */
function consecutivePrefix(draws: BingoDrawData[]): BingoDrawData[] {
    const out: BingoDrawData[] = [];
    for (const d of draws) {
        const prev = out[out.length - 1];
        if (prev && Number(prev.period) - Number(d.period) !== 1) break;
        out.push(d);
    }
    return out;
}

/** 最長連號（升冪），長度 < 3 回 null */
export function longestRun(numbers: number[]): { from: number; to: number; len: number } | null {
    const s = [...new Set(numbers)].sort((a, b) => a - b);
    let best: { from: number; to: number; len: number } | null = null;
    let start = 0;
    for (let i = 1; i <= s.length; i++) {
        if (i < s.length && s[i] === s[i - 1] + 1) continue;
        const len = i - start;
        if (len >= 3 && (!best || len > best.len)) best = { from: s[start], to: s[i - 1], len };
        start = i;
    }
    return best;
}

/**
 * 由官方開獎資料產生話題（draws 新→舊）。倒數那則文字由元件即時算，這裡只放占位。
 */
export function buildTopics(draws: BingoDrawData[], now: Date = new Date()): TickerItem[] {
    const d = draws[0];
    if (!d) return [];
    const out: TickerItem[] = [];
    const p = d.period;

    out.push({ key: `super-${p}`, kind: 'topic', text: `⭐ 第 ${p} 期超級獎號開出 ${pad2(d.superNumber)}` });

    const big = countBig(d.numbers);
    const bs = getBigSmallResult(d.numbers);
    out.push({
        key: `bs-${p}`, kind: 'topic',
        text: bs === '和'
            ? `📊 第 ${p} 期大小和局（大 ${big} 顆、小 ${d.numbers.length - big} 顆）`
            : `📊 第 ${p} 期開「${bs}」（大 ${big} 顆、小 ${d.numbers.length - big} 顆）`,
    });
    const odd = countOdd(d.numbers);
    const oe = getOddEvenResult(d.numbers);
    out.push({
        key: `oe-${p}`, kind: 'topic',
        text: oe === '和'
            ? `📊 第 ${p} 期單雙和局（單 ${odd} 顆、雙 ${d.numbers.length - odd} 顆）`
            : `📊 第 ${p} 期開「${oe}」（單 ${odd} 顆、雙 ${d.numbers.length - odd} 顆）`,
    });

    const run = longestRun(d.numbers);
    if (run) {
        out.push({ key: `run-${p}`, kind: 'topic', text: `🔗 第 ${p} 期開出 ${pad2(run.from)}~${pad2(run.to)} ${cnNum(run.len)}連號` });
    }

    const seq = consecutivePrefix(draws).map((x) => x.numbers);
    const sBs = computeBigSmallStreak(seq);
    if ((sBs.side === '大' || sBs.side === '小') && sBs.length >= 3) {
        out.push({ key: `sbs-${p}`, kind: 'topic', text: `🔥 「${sBs.side}」已連開 ${sBs.length} 期（至第 ${p} 期）` });
    }
    const sOe = computeOddEvenStreak(seq);
    if ((sOe.side === '單' || sOe.side === '雙') && sOe.length >= 3) {
        out.push({ key: `soe-${p}`, kind: 'topic', text: `🔥 「${sOe.side}」已連開 ${sOe.length} 期（至第 ${p} 期）` });
    }

    const today = taipeiDateStr(now);
    const todays = draws.filter((x) => x.drawTime.startsWith(today));
    if (todays.length >= 5) {
        const cnt = new Map<number, number>();
        todays.forEach((x) => x.numbers.forEach((n) => cnt.set(n, (cnt.get(n) ?? 0) + 1)));
        const max = Math.max(...cnt.values());
        const hot = [...cnt.entries()].filter(([, c]) => c === max).map(([n]) => n).sort((a, b) => a - b);
        const shown = hot.slice(0, 3).map(pad2).join('、') + (hot.length > 3 ? ` 等 ${hot.length} 個號碼` : '');
        out.push({ key: `hot-${today}-${todays.length}`, kind: 'topic', text: `🌡️ 今日已開 ${todays.length} 期，${shown} 開出最多（${max} 次）` });
    }

    out.push({ key: 'countdown', kind: 'countdown', text: '' });
    return out;
}

/**
 * 組一輪：真實中獎（含自己的試玩中獎）優先，其餘用話題補足；最多 12 則、同 key 只出現一次
 */
export function buildRound(selfWins: TickerItem[], events: FeedEvent[], topics: TickerItem[]): TickerItem[] {
    const real: TickerItem[] = events.map((e) => ({ key: `feed-${e.id}`, kind: e.type, text: feedText(e) }));
    const seen = new Set<string>();
    const out: TickerItem[] = [];
    for (const it of [...selfWins, ...real, ...topics]) {
        if (out.length >= TICKER_MAX) break;
        if (seen.has(it.key)) continue;
        seen.add(it.key);
        out.push(it);
    }
    // 倒數提示一定保留（若被擠掉，換掉最後一則話題）
    if (!out.some((x) => x.kind === 'countdown')) {
        const cd = topics.find((x) => x.kind === 'countdown');
        const idx = out.map((x) => x.kind).lastIndexOf('topic');
        if (cd && idx >= 0) out[idx] = cd;
    }
    return out;
}
