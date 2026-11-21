/** 管理員端點（ADMIN_LINE_IDS 內的 LINE userId 才可用，否則 403 FORBIDDEN）。只能「發放」，沒有扣除／轉帳。 */
import { requireUser } from './auth';
import { getUserById, isAdminUser, nowIso } from './db';
import { ApiError, json, readJson } from './http';
import type { ArcadeEnv, UserRow } from './types';

export async function requireAdmin(request: Request, env: ArcadeEnv): Promise<UserRow> {
  const u = await requireUser(request, env);
  if (!isAdminUser(env, u)) throw new ApiError(403, '需要管理員權限', 'FORBIDDEN');
  return u;
}

/** GET /api/admin/users?q= */
export async function adminUsers(request: Request, env: ArcadeEnv): Promise<Response> {
  await requireAdmin(request, env);
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 100);
  const like = `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
  const rows = await env.ARCADE_DB.prepare(
    `SELECT id, name, avatar, coins, tickets, created_at FROM users
     WHERE ? = '' OR name LIKE ? ESCAPE '\\' OR CAST(id AS TEXT) = ? OR line_id = ?
     ORDER BY id DESC LIMIT 50`,
  ).bind(q, like, q, q).all<any>();
  return json(request, {
    users: rows.results.map((r) => ({ id: r.id, name: r.name, avatar: r.avatar, coins: r.coins, tickets: r.tickets, createdAt: r.created_at })),
  });
}

/** POST /api/admin/grant { userId, currency, amount, reason } */
export async function adminGrant(request: Request, env: ArcadeEnv): Promise<Response> {
  const admin = await requireAdmin(request, env);
  const body = await readJson(request);
  const userId = body?.userId;
  const currency = body?.currency;
  const amount = body?.amount;
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!Number.isInteger(userId)) throw new ApiError(400, 'userId 必須是整數', 'BAD_REQUEST');
  if (currency !== 'coins' && currency !== 'tickets') throw new ApiError(400, "currency 只能是 'coins' 或 'tickets'", 'BAD_REQUEST');
  if (!Number.isInteger(amount) || amount < 1 || amount > 1_000_000) throw new ApiError(400, 'amount 需為 1~1,000,000 的整數', 'BAD_REQUEST');
  if (!reason || [...reason].length > 100) throw new ApiError(400, 'reason 必填且不超過 100 字', 'BAD_REQUEST');
  const target = await getUserById(env, userId);
  if (!target) throw new ApiError(404, '找不到使用者', 'NOT_FOUND');

  const db = env.ARCADE_DB;
  const now = nowIso();
  const col = currency === 'coins' ? 'coins' : 'tickets'; // 白名單欄位名
  const res = await db.batch([
    db.prepare(`UPDATE users SET ${col} = ${col} + ?, updated_at = ? WHERE id = ?`).bind(amount, now, userId),
    db.prepare(`INSERT INTO ledger (user_id, type, currency, amount, ref, note, operator_id, created_at)
                SELECT ?, 'admin_grant', ?, ?, NULL, ?, ?, ? WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)`)
      .bind(userId, currency, amount, reason, admin.id, now, userId),
  ]);
  if (res[0].meta.changes !== 1) throw new ApiError(404, '找不到使用者', 'NOT_FOUND');
  const after = (await getUserById(env, userId))!;
  return json(request, { coins: after.coins, tickets: after.tickets });
}

/** GET /api/admin/ledger?userId=&limit=100 */
export async function adminLedger(request: Request, env: ArcadeEnv): Promise<Response> {
  await requireAdmin(request, env);
  const url = new URL(request.url);
  const uidRaw = url.searchParams.get('userId');
  const uid = uidRaw ? parseInt(uidRaw, 10) : null;
  const rawLimit = parseInt(url.searchParams.get('limit') ?? '100', 10);
  const limit = Math.max(1, Math.min(isNaN(rawLimit) ? 100 : rawLimit, 500));
  const base = `SELECT l.*, u.name AS user_name FROM ledger l JOIN users u ON u.id = l.user_id`;
  const stmt = uid !== null && !isNaN(uid)
    ? env.ARCADE_DB.prepare(`${base} WHERE l.user_id = ? ORDER BY l.id DESC LIMIT ?`).bind(uid, limit)
    : env.ARCADE_DB.prepare(`${base} ORDER BY l.id DESC LIMIT ?`).bind(limit);
  const rows = await stmt.all<any>();
  return json(request, {
    rows: rows.results.map((r) => ({
      id: r.id, userId: r.user_id, userName: r.user_name, type: r.type, currency: r.currency, amount: r.amount,
      ref: r.ref, note: r.note, operatorId: r.operator_id, createdAt: r.created_at,
    })),
  });
}
