/** 玩家端點：/api/me、/api/agree、/api/checkin、/api/rescue */
import { checkAchievements } from './achievements';
import { requireAgreed, requireUser } from './auth';
import { getUserById, isAdminUser, nowIso } from './db';
import { ApiError, json } from './http';
import { arcadeNow } from './round';
import { monthKey, tpeDate, weekKey } from './time';
import type { ArcadeEnv, UserRow } from './types';

export const CHECKIN_COINS = 500;
export const RESCUE_COINS = 1000;
/** coins + tickets 低於此值才能領救濟（= 1 注成本） */
export const RESCUE_THRESHOLD = 25;

export function userView(env: ArcadeEnv, u: UserRow) {
  return {
    id: u.id,
    name: u.name,
    avatar: u.avatar,
    coins: u.coins,
    tickets: u.tickets,
    isAdmin: isAdminUser(env, u),
    agreedAt: u.agreed_at,
    createdAt: u.created_at,
  };
}

async function mePayload(env: ArcadeEnv, user: UserRow) {
  const now = await arcadeNow(env);
  const wk = weekKey(now);
  const mk = monthKey(now);
  const day = tpeDate(now);
  const s = await env.ARCADE_DB.prepare('SELECT * FROM user_stats WHERE user_id = ?').bind(user.id).first<any>();
  const claims = await env.ARCADE_DB.prepare('SELECT kind FROM daily_claims WHERE user_id = ? AND day = ? AND applied = 1')
    .bind(user.id, day).all<{ kind: string }>();
  const kinds = new Set(claims.results.map((r) => r.kind));
  return {
    user: userView(env, user),
    stats: {
      totalNet: s?.total_net ?? 0,
      // 週／月 key 不是當期時視為 0（結算時才會歸零重算）
      weekNet: s && s.week_key === wk ? s.week_net : 0,
      monthNet: s && s.month_key === mk ? s.month_net : 0,
      maxWin: s?.max_win ?? 0,
      curStreak: s?.cur_streak ?? 0,
      maxStreak: s?.max_streak ?? 0,
      totalBets: s?.total_bets ?? 0,
      totalWagered: s?.total_wagered ?? 0,
    },
    today: { checkedIn: kinds.has('checkin'), rescued: kinds.has('rescue') },
  };
}

export async function getMe(request: Request, env: ArcadeEnv): Promise<Response> {
  const user = await requireUser(request, env);
  return json(request, await mePayload(env, user));
}

export async function agree(request: Request, env: ArcadeEnv): Promise<Response> {
  const user = await requireUser(request, env);
  if (!user.agreed_at) {
    await env.ARCADE_DB.prepare('UPDATE users SET agreed_at = ?, updated_at = ? WHERE id = ? AND agreed_at IS NULL')
      .bind(nowIso(), nowIso(), user.id).run();
  }
  return json(request, await mePayload(env, (await getUserById(env, user.id))!));
}

/**
 * 每日領取的共用原子流程（一個 batch = 一個交易）：
 * 1. INSERT OR IGNORE daily_claims（applied=0），救濟另加資格條件
 * 2. 加幣：只在「本日此 kind 尚未 applied」時生效
 * 3. 寫 ledger：同條件
 * 4. 標 applied=1 → 其 changes=1 代表本次真的發放
 */
async function claimDaily(env: ArcadeEnv, user: UserRow, kind: 'checkin' | 'rescue', amount: number, day: string) {
  const db = env.ARCADE_DB;
  const now = nowIso();
  const pending = `EXISTS (SELECT 1 FROM daily_claims WHERE user_id = ? AND day = ? AND kind = ? AND applied = 0)`;
  const eligible = kind === 'rescue' ? `AND (SELECT coins + tickets FROM users WHERE id = ?) < ${RESCUE_THRESHOLD}` : '';
  const insertArgs: unknown[] = [user.id, day, kind, amount, now];
  if (kind === 'rescue') insertArgs.push(user.id);
  const res = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO daily_claims (user_id, day, kind, amount, applied, created_at) SELECT ?, ?, ?, ?, 0, ? WHERE 1 ${eligible}`)
      .bind(...insertArgs),
    db.prepare(`UPDATE users SET coins = coins + ?, updated_at = ? WHERE id = ? AND ${pending}`)
      .bind(amount, now, user.id, user.id, day, kind),
    db.prepare(`INSERT INTO ledger (user_id, type, currency, amount, ref, note, created_at) SELECT ?, ?, 'coins', ?, ?, NULL, ? WHERE ${pending}`)
      .bind(user.id, kind, amount, day, now, user.id, day, kind),
    db.prepare('UPDATE daily_claims SET applied = 1 WHERE user_id = ? AND day = ? AND kind = ? AND applied = 0')
      .bind(user.id, day, kind),
  ]);
  return res[3].meta.changes === 1;
}

export async function checkin(request: Request, env: ArcadeEnv): Promise<Response> {
  const user = await requireUser(request, env);
  requireAgreed(user);
  const day = tpeDate(await arcadeNow(env));
  const ok = await claimDaily(env, user, 'checkin', CHECKIN_COINS, day);
  if (!ok) throw new ApiError(409, '今日已簽到', 'ALREADY');
  await checkAchievements(env, user.id).catch((err) => console.error('[arcade] 成就檢查失敗:', err));
  const u = (await getUserById(env, user.id))!;
  return json(request, { granted: CHECKIN_COINS, coins: u.coins });
}

export async function rescue(request: Request, env: ArcadeEnv): Promise<Response> {
  const user = await requireUser(request, env);
  requireAgreed(user);
  const day = tpeDate(await arcadeNow(env));
  const ok = await claimDaily(env, user, 'rescue', RESCUE_COINS, day);
  if (!ok) {
    const had = await env.ARCADE_DB.prepare("SELECT 1 AS x FROM daily_claims WHERE user_id = ? AND day = ? AND kind = 'rescue'")
      .bind(user.id, day).first();
    if (had) throw new ApiError(409, '今日已領過救濟金', 'ALREADY');
    throw new ApiError(409, `代幣與活動券合計低於 ${RESCUE_THRESHOLD} 才能領取救濟金`, 'NOT_ELIGIBLE');
  }
  await checkAchievements(env, user.id).catch((err) => console.error('[arcade] 成就檢查失敗:', err));
  const u = (await getUserById(env, user.id))!;
  return json(request, { granted: RESCUE_COINS, coins: u.coins });
}
