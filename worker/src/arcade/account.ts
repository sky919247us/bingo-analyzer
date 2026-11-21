/**
 * POST /api/me/delete { confirm: "DELETE" } → { ok: true }
 *
 * 同一個 batch（D1 單一交易）：
 *   1. deleted_accounts 記 sha256(line_id)（防洗幣：同一 LINE 重新註冊註冊金為 0）
 *   2. 刪 sessions、bets、bet_orders、user_periods、user_stats、user_achievements、mission_claims、
 *      daily_claims、ledger、feed_events，最後刪 users
 * 登入用 Bearer token（存在 sessions），沒有 cookie；刪掉 sessions 即讓所有 token 失效。
 * 管理員也可以刪自己的帳號（不另外擋）。
 */
import { requireUser } from './auth';
import { lineHash, nowIso } from './db';
import { ApiError, json, readJson } from './http';
import type { ArcadeEnv } from './types';

const USER_TABLES = [
  'sessions', 'bets', 'bet_orders', 'user_periods', 'user_stats', 'user_achievements',
  'mission_claims', 'daily_claims', 'ledger', 'feed_events',
];

export async function deleteMe(request: Request, env: ArcadeEnv): Promise<Response> {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  if (body?.confirm !== 'DELETE') throw new ApiError(400, '請在 confirm 填入 "DELETE" 確認刪除帳號', 'BAD_REQUEST');
  const db = env.ARCADE_DB;
  const now = nowIso();
  await db.batch([
    db.prepare(`INSERT INTO deleted_accounts (line_hash, deleted_at) VALUES (?, ?)
                ON CONFLICT(line_hash) DO UPDATE SET deleted_at = excluded.deleted_at`)
      .bind(await lineHash(user.line_id), now),
    // bets 參照 bet_orders，先刪 bets 再刪 bet_orders；users 最後刪
    ...USER_TABLES.map((t) => db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(user.id)),
    db.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
  ]);
  return json(request, { ok: true });
}
