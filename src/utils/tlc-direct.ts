/**
 * 台彩賓果賓果 API 前端直連模組
 *
 * 依據《賓果賓果_快速取得開獎號碼_技術筆記》實作：
 *
 * 1. API 回應帶 `Access-Control-Allow-Origin: *`，前端可直接 fetch，不需要自建代理。
 * 2. 台彩前面掛了 HiNet CDN，不繞過的話中位數會慢約 46.5 秒。
 *    在網址後面加一個每次都不同的 `_` 參數即可讓 CDN 視為不同物件而回源。
 * 3. **不要加 `Cache-Control` 請求標頭** —— 它不在 CORS 安全清單內，
 *    會觸發 preflight（多一趟 OPTIONS 往返）。實測只加 `_` 參數就能拿到
 *    `X-Cache: MISS, MISS, MISS`，效果與加標頭完全相同。
 *    （`cache: 'no-store'` 是給瀏覽器自身快取看的，不會產生 preflight，可以用。）
 * 4. 也不要再經 Cloudflare Worker 代理這支 API —— 那會疊上第二層快取，反而更慢。
 *
 * 實測延遲（1125 期）：一般期數開獎後 21.2 ~ 65.4 秒可取得，每日首期 65.2 ~ 108.3 秒。
 */

const API = 'https://api.taiwanlottery.com/TLCAPIWeB/Lottery/BingoResult';

/** 每日第一期：07:05 */
export const FIRST_DRAW_SEC = (7 * 60 + 5) * 60;
/** 每日最後一期：23:55 */
export const LAST_DRAW_SEC = (23 * 60 + 55) * 60;
/** 開獎間隔（秒） */
export const DRAW_INTERVAL_SEC = 300;
/** 一天的秒數 */
const DAY_SEC = 86400;

/** 開獎後幾毫秒開始查詢（此前查詢必定落空：實測最快 21.2 秒） */
export const POLL_START_MS = 20_000;
/** 每日首期較慢（中位數 97 秒），晚一點再開始查 */
export const POLL_START_FIRST_MS = 60_000;
/** 一般期數的逾時上限（實測最慢 65.4 秒，門檻訂 66 秒即可） */
export const POLL_LIMIT_MS = 66_000;
/** 每日首期的逾時上限（實測最慢 108.3 秒） */
export const POLL_LIMIT_FIRST_MS = 120_000;
/** 輪詢間隔 */
export const POLL_INTERVAL_MS = 1_000;

/** 單期開獎資料 */
export interface TlcDraw {
    period: string;
    drawTime: string;
    numbers: number[];
    superNumber: number;
}

/** 取得指定時刻的台北時間欄位 */
function taipeiParts(now: Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
    }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
    return {
        year: get('year'),
        month: get('month'),
        day: get('day'),
        // Intl 在 hour12:false 下午夜可能回傳 '24'，收斂成 0
        hour: parseInt(get('hour'), 10) % 24,
        minute: parseInt(get('minute'), 10),
        second: parseInt(get('second'), 10),
    };
}

/** 該時刻的台北日期字串 YYYY-MM-DD */
export function taipeiDateStr(now: Date = new Date()): string {
    const p = taipeiParts(now);
    return `${p.year}-${p.month}-${p.day}`;
}

/** 該時刻在台北的「當日已過秒數」 */
export function taipeiSecondsOfDay(now: Date = new Date()): number {
    const p = taipeiParts(now);
    return p.hour * 3600 + p.minute * 60 + p.second;
}

/**
 * 距離下一期「名目開獎時刻」還有幾秒
 * 收班後回傳到隔日 07:05 的秒數
 */
export function secondsUntilNextDraw(now: Date = new Date()): number {
    const sod = taipeiSecondsOfDay(now);
    if (sod < FIRST_DRAW_SEC) return FIRST_DRAW_SEC - sod;
    if (sod >= LAST_DRAW_SEC) return DAY_SEC - sod + FIRST_DRAW_SEC;

    const elapsed = sod - FIRST_DRAW_SEC;
    const next = FIRST_DRAW_SEC + (Math.floor(elapsed / DRAW_INTERVAL_SEC) + 1) * DRAW_INTERVAL_SEC;
    if (next > LAST_DRAW_SEC) return DAY_SEC - sod + FIRST_DRAW_SEC;
    return next - sod;
}

/** 判斷某個時刻是否為當日首期（07:05） */
export function isFirstDrawOfDay(at: Date): boolean {
    const sod = taipeiSecondsOfDay(at);
    // 容許 ±2 秒的排程誤差
    return Math.abs(sod - FIRST_DRAW_SEC) <= 2;
}

/**
 * 名目上「當日應該已開到第幾期」
 * 拿來跟實際抓到的筆數比對，判斷資料是否已到最新一期
 */
export function expectedIndex(now: Date = new Date()): number {
    const sod = taipeiSecondsOfDay(now);
    if (sod < FIRST_DRAW_SEC) return 0;
    const t = Math.min(sod, LAST_DRAW_SEC);
    return Math.floor((t - FIRST_DRAW_SEC) / DRAW_INTERVAL_SEC) + 1;
}

/**
 * 由「當日第幾期」算出名目開獎時刻字串
 * 第 N 期的開獎時刻 = 07:05 + (N - 1) × 5 分鐘
 */
export function drawTimeFromIndex(dateStr: string, index: number): string {
    const sec = FIRST_DRAW_SEC + (index - 1) * DRAW_INTERVAL_SEC;
    const hh = String(Math.floor(sec / 3600)).padStart(2, '0');
    const mm = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
    return `${dateStr}T${hh}:${mm}:00`;
}

/** 該時刻的台北時間字串（ISO 樣式，供顯示用） */
export function taipeiDateTimeStr(at: Date): string {
    const p = taipeiParts(at);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${p.year}-${p.month}-${p.day}T${pad(p.hour)}:${pad(p.minute)}:00`;
}

/** 把 API 的一筆結果轉成內部格式 */
function toDraw(item: Record<string, unknown>, fallbackDate: string): TlcDraw {
    return {
        period: String(item.drawTerm),
        // ⚠ API 的 dDate 永遠是 0001-01-01，不可用來判斷開獎時間，
        //   只能由當日期序推算（呼叫端會用 drawTimeFromIndex 補上正確時刻）
        drawTime: fallbackDate,
        numbers: (item.bigShowOrder as string[]).map((n) => parseInt(n, 10)),
        superNumber: parseInt((item.bullEyeTop as string) || '0', 10),
    };
}

/** 組出帶防快取參數的網址 */
function buildUrl(dateStr: string, pageNum: number, pageSize: number): string {
    const qs = new URLSearchParams({
        openDate: dateStr,
        pageNum: String(pageNum),
        pageSize: String(pageSize),
        _: String(Date.now()),   // ← 關鍵：繞過 HiNet CDN 快取
    });
    return `${API}?${qs}`;
}

/** 共用的請求（不加任何自訂標頭，避免 CORS preflight） */
async function request(url: string): Promise<Record<string, unknown>> {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.rtCode !== 0) throw new Error(json.rtMsg || 'API 回傳錯誤');
    return json;
}

/**
 * 取指定日期的最新一期；當日尚無開獎時回傳 null
 */
export async function fetchLatestDirect(dateStr: string): Promise<TlcDraw | null> {
    const json = await request(buildUrl(dateStr, 1, 1));
    const content = (json.content ?? {}) as Record<string, unknown>;
    const rows = (content.bingoQueryResult ?? []) as Array<Record<string, unknown>>;
    return rows.length > 0 ? toDraw(rows[0], dateStr) : null;
}

/**
 * 取指定日期的所有開獎（每日 203 期，最多 5 頁）
 * ⚠ totalSize 在當日尚無開獎時是 null，不是 0
 */
export async function fetchDayDirect(dateStr: string): Promise<TlcDraw[]> {
    const results: TlcDraw[] = [];
    let total = 0;

    for (let page = 1; page <= 5; page++) {
        const json = await request(buildUrl(dateStr, page, 50));
        const content = (json.content ?? {}) as Record<string, unknown>;
        total = (content.totalSize as number) || 0;   // null → 0
        const rows = (content.bingoQueryResult ?? []) as Array<Record<string, unknown>>;
        if (rows.length === 0) break;

        for (const row of rows) results.push(toDraw(row, dateStr));
        if (results.length >= total || rows.length < 50) break;
    }

    results.sort((a, b) => Number(b.period) - Number(a.period));

    // 期別當日逐期 +1，用當日最小期別當錨點推算每一期的名目開獎時刻
    if (results.length > 0) {
        const firstTerm = Number(results[results.length - 1].period);
        for (const d of results) {
            d.drawTime = drawTimeFromIndex(dateStr, Number(d.period) - firstTerm + 1);
        }
    }

    return results;
}

/**
 * 守候某一期直到取得，或逾時回傳 null
 *
 * @param scheduledMs  該期的名目開獎時刻（epoch ms）
 * @param prevPeriod   目前已知的最新期別，用來判斷是否為新的一期
 * @param opts.isFirst 是否為當日首期（門檻不同）
 * @param opts.signal  取消用（元件卸載時中止）
 */
export async function waitForDraw(
    scheduledMs: number,
    prevPeriod: string | null,
    opts: { isFirst?: boolean; signal?: { cancelled: boolean } } = {},
): Promise<{ draw: TlcDraw; delaySec: number } | null> {
    const isFirst = opts.isFirst ?? false;
    const startAt = isFirst ? POLL_START_FIRST_MS : POLL_START_MS;
    const limit = isFirst ? POLL_LIMIT_FIRST_MS : POLL_LIMIT_MS;
    const dateStr = taipeiDateStr(new Date(scheduledMs));

    const wait = scheduledMs + startAt - Date.now();
    if (wait > 0) await sleep(wait);

    while (!opts.signal?.cancelled && Date.now() - scheduledMs < limit) {
        try {
            const draw = await fetchLatestDirect(dateStr);
            if (draw && draw.period !== prevPeriod) {
                return { draw, delaySec: (Date.now() - scheduledMs) / 1000 };
            }
        } catch {
            /* 單次失敗不中斷，繼續重試 */
        }
        await sleep(POLL_INTERVAL_MS);
    }

    return null;   // 逾時
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}
