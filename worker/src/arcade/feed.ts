/**
 * 中獎跑馬燈 feed
 *
 * - 只由結算流程（settle.ts）寫入真實注單的中獎，沒有任何「新增事件」的 API。
 * - GET  /api/feed?after=<id>&limit=30  免登入；只回最近 24 小時、未隱藏、最多 50 筆（新→舊）
 * - POST /api/admin/feed/hide { id }      管理員隱藏某則
 * - 排程（settleFromKv）順便刪除 7 天前的舊資料
 */
import { ApiError, json, readJson } from './http';
import { requireAdmin } from './admin';
import { arcadeNow } from './round';
import type { ArcadeEnv } from './types';

const DAY_MS = 86_400_000;
export const FEED_MAX_LIMIT = 50;

/** 門檻（任一成立才寫入） */
export const FEED_MIN_PAYOUT = 1000;
export const FEED_MIN_RATIO = 20;
/** bigwin 門檻（任一成立） */
export const BIGWIN_PAYOUT = 7500;
export const BIGWIN_RATIO = 100;

/**
 * 暱稱遮罩：保留第一個字（以 code point 計，emoji 不會被切半），其餘換成「＊」，最多顯示 3 個字元
 * 例：王小明→王＊＊、Alice→A＊＊、王→王＊（單字名也加遮罩，避免露出全名）、空白→＊＊＊
 */
export function maskName(name: string | null | undefined): string {
  const chars = Array.from((name ?? '').trim());
  if (chars.length === 0) return '＊＊＊';
  const stars = Math.min(Math.max(chars.length - 1, 1), 2);
  return chars[0] + '＊'.repeat(stars);
}

export interface EvalForFeed {
  game: string;
  star: number | null;
  hits: number;
  payout: number;
  pick: string | null;
}

export interface FeedCandidate {
  type: 'win' | 'bigwin';
  game: string;
  payout: number;
  ratio: number;
}

/** 單注的中獎描述 */
function describe(e: EvalForFeed): string {
  switch (e.game) {
    case 'basic':
      return e.hits === e.star ? `${e.star} 星全中` : `${e.star} 星中 ${e.hits}`;
    case 'super':
      return '超級獎號命中';
    case 'bigSmall':
    case 'oddEven':
      return `猜中「${e.pick}」`;
    default:
      return e.game;
  }
}

/**
 * 判斷該玩家該期（已合併）是否值得播報；不值得回 null
 * 門檻：總派彩 ≥ 1,000、或總派彩 ≥ 總下注 20 倍、或超級獎號命中、或 5 星以上全中
 * bigwin：總派彩 ≥ 7,500、或 ≥ 100 倍、或超級獎號命中
 */
export function feedCandidate(evals: EvalForFeed[], totalPayout: number, totalCost: number): FeedCandidate | null {
  if (totalPayout <= 0) return null;
  const winners = evals.filter((e) => e.payout > 0);
  const superHit = winners.some((e) => e.game === 'super');
  const fullStar = winners.filter((e) => e.game === 'basic' && (e.star ?? 0) >= 5 && e.hits === e.star);
  const ratio = totalCost > 0 ? Math.round((totalPayout / totalCost) * 10) / 10 : 0;
  const worthy = totalPayout >= FEED_MIN_PAYOUT || (totalCost > 0 && ratio >= FEED_MIN_RATIO) || superHit || fullStar.length > 0;
  if (!worthy) return null;
  const big = totalPayout >= BIGWIN_PAYOUT || (totalCost > 0 && ratio >= BIGWIN_RATIO) || superHit;
  // 標題注單：5 星以上全中（星數大者）＞超級獎號＞派彩最高者
  fullStar.sort((a, b) => (b.star ?? 0) - (a.star ?? 0));
  const head = fullStar[0] ?? winners.find((e) => e.game === 'super') ?? [...winners].sort((a, b) => b.payout - a.payout)[0];
  const game = describe(head) + (winners.length > 1 ? ` 等 ${winners.length} 注` : '');
  return { type: big ? 'bigwin' : 'win', game, payout: totalPayout, ratio };
}

interface FeedDbRow {
  id: number; type: string; masked_name: string; period: string; game: string; payout: number; ratio: number; created_at: string;
}

/** GET /api/feed?after=<id>&limit=30 */
export async function getFeed(request: Request, env: ArcadeEnv): Promise<Response> {
  const url = new URL(request.url);
  const afterRaw = parseInt(url.searchParams.get('after') ?? '0', 10);
  const after = isNaN(afterRaw) || afterRaw < 0 ? 0 : afterRaw;
  const limitRaw = parseInt(url.searchParams.get('limit') ?? '30', 10);
  const limit = Math.max(1, Math.min(isNaN(limitRaw) ? 30 : limitRaw, FEED_MAX_LIMIT));
  const now = await arcadeNow(env);
  const since = new Date(now - DAY_MS).toISOString();
  const rows = await env.ARCADE_DB.prepare(
    `SELECT id, type, masked_name, period, game, payout, ratio, created_at FROM feed_events
     WHERE hidden = 0 AND id > ? AND created_at >= ? ORDER BY id DESC LIMIT ?`,
  ).bind(after, since, limit).all<FeedDbRow>();
  return json(request, {
    // 只回遮罩名與中獎摘要，不含 user_id／avatar
    events: rows.results.map((r) => ({
      id: r.id, type: r.type, maskedName: r.masked_name, period: r.period, game: r.game,
      payout: r.payout, ratio: r.ratio, createdAt: r.created_at,
    })),
    serverNow: new Date(now).toISOString(),
  });
}

/** POST /api/admin/feed/hide { id } */
export async function adminHideFeed(request: Request, env: ArcadeEnv): Promise<Response> {
  await requireAdmin(request, env);
  const body = await readJson(request);
  const id = body?.id;
  if (!Number.isInteger(id) || id < 1) throw new ApiError(400, 'id 必須是正整數', 'BAD_REQUEST');
  const res = await env.ARCADE_DB.prepare('UPDATE feed_events SET hidden = 1 WHERE id = ?').bind(id).run();
  if (res.meta.changes !== 1) throw new ApiError(404, '找不到這則跑馬燈', 'NOT_FOUND');
  return json(request, { ok: true, id });
}

/** 刪除 7 天前的事件（排程呼叫） */
export async function purgeOldFeed(env: ArcadeEnv): Promise<void> {
  const cutoff = new Date((await arcadeNow(env)) - 7 * DAY_MS).toISOString();
  await env.ARCADE_DB.prepare('DELETE FROM feed_events WHERE created_at < ?').bind(cutoff).run();
}
