/** D1／KV 存取共用函式 */
import type { ArcadeEnv, BetDbRow, DrawResult, UserRow } from './types';

export const SIGNUP_COINS = 10_000;

export function nowIso(ms: number = Date.now()): string {
  return new Date(ms).toISOString();
}

export async function getMeta(env: ArcadeEnv, key: string): Promise<string | null> {
  const r = await env.ARCADE_DB.prepare('SELECT value FROM meta WHERE key = ?').bind(key).first<{ value: string }>();
  return r ? r.value : null;
}

export async function setMeta(env: ArcadeEnv, key: string, value: string | null): Promise<void> {
  if (value === null) {
    await env.ARCADE_DB.prepare('DELETE FROM meta WHERE key = ?').bind(key).run();
    return;
  }
  await env.ARCADE_DB.prepare(
    'INSERT INTO meta (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
  ).bind(key, value, nowIso()).run();
}

export async function getUserById(env: ArcadeEnv, id: number): Promise<UserRow | null> {
  return env.ARCADE_DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
}

export function isAdminUser(env: ArcadeEnv, user: UserRow): boolean {
  const ids = (env.ADMIN_LINE_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return ids.includes(user.line_id);
}

/**
 * 建立或更新使用者（LINE 登入／dev 登入共用）
 * 新用戶：users + user_stats + ledger(signup) 在同一個 batch 內完成
 */
export async function upsertUser(env: ArcadeEnv, lineId: string, name: string, avatar: string | null): Promise<UserRow> {
  const db = env.ARCADE_DB;
  const now = nowIso();
  const existing = await db.prepare('SELECT * FROM users WHERE line_id = ?').bind(lineId).first<UserRow>();
  if (existing) {
    await db.prepare('UPDATE users SET name = ?, avatar = ?, updated_at = ? WHERE id = ?')
      .bind(name || existing.name, avatar, now, existing.id).run();
    return (await getUserById(env, existing.id))!;
  }
  // 防洗幣：同一 LINE 帳號刪除後重新註冊，註冊金改為 0（deleted_accounts 只存 sha256(line_id)）
  const deleted = await db.prepare('SELECT 1 AS x FROM deleted_accounts WHERE line_hash = ?').bind(await lineHash(lineId)).first();
  const bonus = deleted ? 0 : SIGNUP_COINS;
  const note = deleted ? '重新註冊（不再贈送註冊金）' : '註冊贈送';
  // INSERT OR IGNORE：同時兩個登入請求也只會建一個；後續兩句以「剛建立且尚無 signup 帳」為守衛
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO users (line_id, name, avatar, coins, tickets, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)')
      .bind(lineId, name, avatar, bonus, now, now),
    db.prepare(`INSERT INTO ledger (user_id, type, currency, amount, ref, note, created_at)
                SELECT u.id, 'signup', 'coins', ?, NULL, ?, ? FROM users u
                WHERE u.line_id = ? AND NOT EXISTS (SELECT 1 FROM ledger l WHERE l.user_id = u.id AND l.type = 'signup')`)
      .bind(bonus, note, now, lineId),
    db.prepare('INSERT OR IGNORE INTO user_stats (user_id) SELECT id FROM users WHERE line_id = ?').bind(lineId),
  ]);
  return (await db.prepare('SELECT * FROM users WHERE line_id = ?').bind(lineId).first<UserRow>())!;
}

export interface BetRow {
  id: number;
  /** 同一次（可能多期）下注的群組 id；舊資料以 order_id 代替 */
  groupId: string;
  period: string;
  game: string;
  star: number | null;
  numbers: number[] | null;
  pick: string | null;
  multiplier: number;
  costCoins: number;
  costTickets: number;
  status: 'pending' | 'settled';
  hits: number | null;
  payout: number | null;
  createdAt: string;
  /** true = 超過 72 小時拿不到官方結果、已原額退款（此時 status 為 settled、payout 0） */
  refunded: boolean;
  /** 預定開獎時刻（UTC ISO）；0004 之前的舊注單為 null */
  drawAt: string | null;
}

/** sha256(line_id) hex，用於 deleted_accounts */
export async function lineHash(lineId: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(lineId));
  return Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, '0')).join('');
}

export function toBetRow(r: BetDbRow): BetRow {
  return {
    id: r.id,
    groupId: r.group_id ?? r.order_id,
    period: r.period,
    game: r.game,
    star: r.star,
    numbers: r.numbers ? (JSON.parse(r.numbers) as number[]) : null,
    pick: r.pick,
    multiplier: r.multiplier,
    costCoins: r.cost_coins,
    costTickets: r.cost_tickets,
    status: r.status,
    hits: r.hits,
    payout: r.payout,
    createdAt: r.created_at,
    refunded: r.refunded === 1,
    drawAt: r.draw_at ?? null,
  };
}

/** 讀既有 KV today_draws（相容新舊格式），回傳依期別新→舊 */
export async function readKvDraws(env: ArcadeEnv): Promise<any[]> {
  const raw = await env.BINGO_KV.get('today_draws');
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const draws: any[] = Array.isArray(parsed) ? parsed : parsed.draws ?? [];
    return [...draws].sort((a, b) => Number(b.period) - Number(a.period));
  } catch {
    return [];
  }
}

/** 由 KV 草稿轉為結算用開獎結果；資料不完整回 null（寧可不結算） */
export function toDrawResult(d: any): DrawResult | null {
  if (!d || !d.period || !Array.isArray(d.numbers)) return null;
  const numbers = d.numbers.map((n: any) => Number(n));
  const uniq = new Set(numbers);
  if (numbers.length !== 20 || uniq.size !== 20 || numbers.some((n: number) => !Number.isInteger(n) || n < 1 || n > 80)) return null;
  const openOrder = Array.isArray(d.openOrder) && d.openOrder.length === 20 ? d.openOrder.map(Number) : undefined;
  // 超級獎號 = openShowOrder 第 20 顆；KV 若無開出順序則用台彩提供的 superNumber（bullEye）
  const superNumber = openOrder ? openOrder[19] : Number(d.superNumber);
  if (!uniq.has(superNumber)) return null;
  return { period: String(d.period), numbers, superNumber, openOrder };
}
