/**
 * 開獎結果持久化與兜底
 *
 * - draw_results（D1）是結算的唯一依據；只由 Worker 自己抓到的官方資料寫入：
 *     1. KV today_draws（既有排程 syncDrawsToKV 從台彩抓的）→ ingestKvDraws
 *     2. 台彩 BingoResult?openDate=YYYY-MM-DD（補撈）→ fetchTlcDay
 *   沒有任何 API 接受前端送來的開獎結果。
 * - 同一期只寫一次（ON CONFLICT 只補 draw_time／draw_date 的空值），號碼一經寫入不再改 → 結算冪等。
 * - 72 小時兜底退款：refundPeriod（coins、tickets 各自原額退回，ledger type=refund，不計淨收益）。
 */
import { getMeta, nowIso, readKvDraws, setMeta, toDrawResult } from './db';
import { bigSmallOf, oddEvenOf } from './payout';
import { parseDrawTime } from './time';
import type { ArcadeEnv, BetDbRow, DrawResult } from './types';

export const BACKFILL_AFTER_MS = 10 * 60_000;
export const REFUND_AFTER_MS = 72 * 3600_000;
/** 同一日期最多每 10 分鐘向台彩補撈一次 */
const BACKFILL_THROTTLE_MS = 10 * 60_000;
/** 每次排程最多補撈幾個日期 */
const BACKFILL_MAX_DATES = 3;
/** D1 單一語句的綁定參數上限是 100，IN (...) 分批 */
const IN_CHUNK = 90;

const TLC_HISTORY_URL = 'https://api.taiwanlottery.com/TLCAPIWeB/Lottery/BingoResult';
const TLC_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

export interface IncomingDraw {
  result: DrawResult;
  date: string | null;
  drawTime: string | null;
  openOrder: number[] | null;
  source: 'kv' | 'tlc_history';
}

interface DrawDbRow { period: string; numbers: string; super_number: number; draw_time: string | null }

function rowToResult(r: DrawDbRow): DrawResult {
  return { period: r.period, numbers: JSON.parse(r.numbers) as number[], superNumber: r.super_number };
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** 寫入 draw_results（已存在的期別不改號碼，只補 draw_time／draw_date 空值） */
export async function upsertDraws(env: ArcadeEnv, draws: IncomingDraw[]): Promise<void> {
  if (draws.length === 0) return;
  const db = env.ARCADE_DB;
  const now = nowIso();
  for (const part of chunks(draws, 50)) {
    await db.batch(part.map((d) => db.prepare(
      `INSERT INTO draw_results (period, draw_date, draw_time, numbers, open_order, super_number, big_small, odd_even, source, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(period) DO UPDATE SET
         draw_time = COALESCE(draw_results.draw_time, excluded.draw_time),
         draw_date = COALESCE(draw_results.draw_date, excluded.draw_date)
       WHERE draw_results.draw_time IS NULL OR draw_results.draw_date IS NULL`,
    ).bind(
      d.result.period, d.date, d.drawTime, JSON.stringify(d.result.numbers),
      d.openOrder ? JSON.stringify(d.openOrder) : null, d.result.superNumber,
      bigSmallOf(d.result.numbers), oddEvenOf(d.result.numbers), d.source, now,
    )));
  }
}

/** 從 D1 查多期結果 */
async function dbResults(env: ArcadeEnv, periods: string[]): Promise<Map<string, DrawDbRow>> {
  const out = new Map<string, DrawDbRow>();
  for (const part of chunks(periods, IN_CHUNK)) {
    const rows = await env.ARCADE_DB.prepare(
      `SELECT period, numbers, super_number, draw_time FROM draw_results WHERE period IN (${part.map(() => '?').join(', ')})`,
    ).bind(...part).all<DrawDbRow>();
    for (const r of rows.results) out.set(r.period, r);
  }
  return out;
}

function kvToIncoming(d: any, fallbackDate: string | null): IncomingDraw | null {
  const result = toDrawResult(d);
  if (!result) return null;
  const parsed = parseDrawTime(d.drawTime);
  return {
    result,
    date: parsed ? parsed.date : fallbackDate,
    drawTime: parsed ? String(d.drawTime).slice(0, 19).replace(' ', 'T') : null,
    openOrder: result.openOrder ?? null,
    source: 'kv',
  };
}

/**
 * 找多期的官方結果：先查 D1，D1 沒有的再看 KV（找到就順手寫進 D1）
 * 回傳 Map<period, DrawResult>（只含找得到的期別）
 */
export async function findDrawResults(env: ArcadeEnv, periods: string[]): Promise<Map<string, DrawResult>> {
  const out = new Map<string, DrawResult>();
  if (periods.length === 0) return out;
  const inDb = await dbResults(env, periods);
  for (const [p, r] of inDb) out.set(p, rowToResult(r));
  const missing = periods.filter((p) => !out.has(p));
  if (missing.length > 0) {
    const kv = await readKvDraws(env);
    const fresh: IncomingDraw[] = [];
    for (const p of missing) {
      const inc = kvToIncoming(kv.find((x) => String(x.period) === p), null);
      if (inc) { fresh.push(inc); out.set(p, inc.result); }
    }
    await upsertDraws(env, fresh);
  }
  return out;
}

/**
 * 排程：把 KV today_draws 的結果寫進 draw_results，並持久化「最後已知期別與時間」（meta.last_draw，只往前不倒退）
 * 為了省 D1 寫入額度，只寫 D1 還沒有（或缺 draw_time）的期別。
 */
export async function ingestKvDraws(env: ArcadeEnv): Promise<number> {
  const kv = await readKvDraws(env);
  if (kv.length === 0) return 0;
  const kvDate = await env.BINGO_KV.get('today_date');
  const incoming = kv.map((d) => kvToIncoming(d, kvDate)).filter((x): x is IncomingDraw => x !== null);
  if (incoming.length === 0) return 0;

  const periods = incoming.map((d) => d.result.period);
  const existing = await dbResults(env, periods);
  const toWrite = incoming.filter((d) => {
    const e = existing.get(d.result.period);
    return !e || (!e.draw_time && d.drawTime);
  });
  await upsertDraws(env, toWrite);

  // 最後已知期別：取 KV 中有 drawTime 的最新一期，比 meta 現值新才更新
  const latest = kv.find((d) => parseDrawTime(d.drawTime));
  if (latest) await advanceLastDraw(env, String(latest.period), String(latest.drawTime));
  return toWrite.length;
}

export async function advanceLastDraw(env: ArcadeEnv, period: string, drawTime: string): Promise<void> {
  const next = parseDrawTime(drawTime);
  if (!next) return;
  const curRaw = await getMeta(env, 'last_draw');
  if (curRaw) {
    try {
      const cur = JSON.parse(curRaw) as { period: string; drawTime: string };
      const c = parseDrawTime(cur.drawTime);
      if (c && (c.date > next.date || (c.date === next.date && c.index >= next.index))) return;
    } catch { /* 壞掉的值直接覆蓋 */ }
  }
  await setMeta(env, 'last_draw', JSON.stringify({ period, drawTime }));
}

/** 向台彩 BingoResult 依日期查詢全部期別（每頁 50 筆，最多 5 頁 = 250 筆 ≥ 每日 203 期） */
export async function fetchTlcDay(date: string): Promise<IncomingDraw[]> {
  const out: IncomingDraw[] = [];
  for (let page = 1; page <= 5; page++) {
    // `_` 參數繞過 HiNet CDN 快取（見 index.ts noCacheUrl 與技術筆記）
    const url = `${TLC_HISTORY_URL}?openDate=${date}&pageNum=${page}&pageSize=50&_=${Date.now()}`;
    const resp = await fetch(url, { headers: TLC_HEADERS });
    if (!resp.ok) throw new Error(`TLC BingoResult HTTP ${resp.status}`);
    const data: any = await resp.json();
    if (data.rtCode !== 0) throw new Error(`TLC BingoResult rtCode ${data.rtCode}`);
    const items: any[] = data.content?.bingoQueryResult ?? [];
    const total = Number(data.content?.totalSize ?? 0) || 0; // 當日尚無開獎時 totalSize 為 null
    for (const it of items) {
      // 超級獎號用 bullEyeTop（與既有 KV 同步一致）；openShowOrder 只存檔備查
      const result = toDrawResult({
        period: String(it.drawTerm),
        numbers: (it.bigShowOrder ?? []).map((n: string) => parseInt(n, 10)),
        superNumber: parseInt(it.bullEyeTop ?? '0', 10),
      });
      if (!result) continue;
      const open = Array.isArray(it.openShowOrder) && it.openShowOrder.length === 20 ? it.openShowOrder.map((n: string) => parseInt(n, 10)) : null;
      out.push({ result, date, drawTime: null, openOrder: open, source: 'tlc_history' });
    }
    if (items.length === 0 || out.length >= total) break;
  }
  return out;
}

/**
 * 補撈：對「已過開獎時刻 10 分鐘仍無結果」的期別，依其開獎日期向台彩查詢
 * 每個日期 10 分鐘內只查一次、每次最多 3 個日期；失敗只記 log
 */
export async function backfillFromTlc(env: ArcadeEnv, due: { period: string; at: string }[], nowMs: number): Promise<number> {
  const dates = [...new Set(due.map((d) => tpeDateOfIso(d.at)))].slice(0, BACKFILL_MAX_DATES);
  let written = 0;
  for (const date of dates) {
    const key = `backfill_at:${date}`;
    const last = await getMeta(env, key);
    if (last && nowMs - Date.parse(last) < BACKFILL_THROTTLE_MS) continue;
    await setMeta(env, key, nowIso(nowMs));
    try {
      const got = await fetchTlcDay(date);
      await upsertDraws(env, got);
      written += got.length;
      console.log(`[arcade] 補撈 ${date}：取得 ${got.length} 期`);
    } catch (err) {
      console.error(`[arcade] 補撈 ${date} 失敗:`, err);
    }
  }
  return written;
}

function tpeDateOfIso(iso: string): string {
  const d = new Date(Date.parse(iso) + 8 * 3600_000);
  return d.toISOString().slice(0, 10);
}

export interface RefundSummary { period: string; users: number; betsRefunded: number }

/**
 * 兜底退款（冪等）：該期所有 pending 注單原額退回 coins／tickets，標成 settled + refunded=1、payout 0
 * 每注單的加幣與 ledger 都以「該注單仍 pending」為守衛，最後才改狀態 → 重跑不會重複退款
 * 不寫 user_periods／user_stats → 不計入淨收益、連莊、排行
 */
export async function refundPeriod(env: ArcadeEnv, period: string, nowMs: number): Promise<RefundSummary> {
  const db = env.ARCADE_DB;
  const now = nowIso(nowMs);
  const summary: RefundSummary = { period, users: 0, betsRefunded: 0 };
  const users = await db.prepare("SELECT DISTINCT user_id FROM bets WHERE period = ? AND status = 'pending'").bind(period).all<{ user_id: number }>();
  for (const { user_id: uid } of users.results) {
    const bets = await db.prepare("SELECT * FROM bets WHERE user_id = ? AND period = ? AND status = 'pending' ORDER BY id").bind(uid, period).all<BetDbRow>();
    const stmts: D1PreparedStatement[] = [];
    const statusIdx: number[] = [];
    const guard = "EXISTS (SELECT 1 FROM bets WHERE id = ? AND status = 'pending')";
    for (const b of bets.results) {
      stmts.push(
        db.prepare(`UPDATE users SET coins = coins + ?, tickets = tickets + ?, updated_at = ? WHERE id = ? AND ${guard}`)
          .bind(b.cost_coins, b.cost_tickets, now, uid, b.id),
      );
      for (const [currency, amt] of [['coins', b.cost_coins], ['tickets', b.cost_tickets]] as const) {
        if (amt > 0) {
          stmts.push(
            db.prepare(`INSERT INTO ledger (user_id, type, currency, amount, ref, note, created_at)
                        SELECT ?, 'refund', ?, ?, ?, ?, ? WHERE ${guard}`)
              .bind(uid, currency, amt, `bet:${b.id}`, `第 ${period} 期逾 72 小時無官方結果，原額退回`, now, b.id),
          );
        }
      }
      statusIdx.push(stmts.length);
      stmts.push(
        db.prepare("UPDATE bets SET status = 'settled', refunded = 1, hits = NULL, payout = 0, settled_at = ? WHERE id = ? AND status = 'pending'")
          .bind(now, b.id),
      );
    }
    if (stmts.length === 0) continue;
    const res = await db.batch(stmts);
    const n = statusIdx.filter((i) => res[i].meta.changes === 1).length;
    if (n > 0) summary.users++;
    summary.betsRefunded += n;
  }
  return summary;
}
