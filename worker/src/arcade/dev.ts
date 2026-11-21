/**
 * 本地測試後門（只有 env.ARCADE_DEV_LOGIN === '1' 才啟用，否則路由層直接 404）
 * 正式環境絕不可設定 ARCADE_DEV_LOGIN。
 *
 * - POST /api/dev/login   { lineId, name }                    → { token, user }
 * - POST /api/dev/state   { now?: ISO|null, latestDraw?: {period, drawTime}|null }  注入時鐘／最新已知期
 * - POST /api/dev/settle  { period, numbers[20], superNumber } 以固定號碼結算
 * - POST /api/dev/kv      { todayDraws: {draws:[...]} | null }   寫入／刪除 KV today_draws（模擬排程抓到的資料、或 KV 被清空）
 * - POST /api/dev/cron    { backfill?: boolean, ingestOnly?: boolean } 執行排程的娛樂機部分（settleFromKv；dev 預設不連台彩）
 */
import { createSession } from './auth';
import { setMeta, toDrawResult, upsertUser } from './db';
import { ApiError, json, readJson } from './http';
import { userView } from './player';
import { getRound } from './round';
import { settleFromKv, settlePeriod } from './settle';
import type { ArcadeEnv } from './types';

export async function devRoute(request: Request, env: ArcadeEnv, path: string): Promise<Response> {
  if (request.method !== 'POST') throw new ApiError(405, 'Method Not Allowed', 'METHOD');
  const body = await readJson(request);
  if (path === '/api/dev/login') {
    const lineId = typeof body?.lineId === 'string' ? body.lineId : '';
    if (!lineId) throw new ApiError(400, 'lineId 必填', 'BAD_REQUEST');
    const user = await upsertUser(env, lineId, String(body?.name ?? lineId), null);
    const token = await createSession(env, user.id);
    return json(request, { token, user: userView(env, user) });
  }
  if (path === '/api/dev/state') {
    if ('now' in (body ?? {})) await setMeta(env, 'dev_now', body.now ?? null);
    if ('latestDraw' in (body ?? {})) await setMeta(env, 'dev_latest_draw', body.latestDraw ? JSON.stringify(body.latestDraw) : null);
    return json(request, { round: await getRound(env) });
  }
  if (path === '/api/dev/settle') {
    const d = toDrawResult({ period: body?.period, numbers: body?.numbers, superNumber: body?.superNumber });
    if (!d) throw new ApiError(400, '開獎資料不完整（需 20 個不重複號碼且 superNumber 在其中）', 'BAD_REQUEST');
    return json(request, { summary: await settlePeriod(env, d) });
  }
  if (path === '/api/dev/kv') {
    if (body?.todayDraws === null || body?.todayDraws === undefined) await env.BINGO_KV.delete('today_draws');
    else await env.BINGO_KV.put('today_draws', JSON.stringify(body.todayDraws));
    if (typeof body?.todayDate === 'string') await env.BINGO_KV.put('today_date', body.todayDate);
    return json(request, { ok: true });
  }
  if (path === '/api/dev/cron') {
    return json(request, { summary: await settleFromKv(env, { backfill: body?.backfill === true, ingestOnly: body?.ingestOnly === true }) });
  }
  throw new ApiError(404, 'Not Found', 'NOT_FOUND');
}
