/**
 * 每日任務蓋章（台北曆日；任務獎勵只發一般代幣，ledger type=mission，不計入淨收益）
 *
 * GET  /api/missions        → { day, missions: [{ code, title, target, progress, reward, done, claimed }] }
 * POST /api/missions/claim  { code } → { ok: true, reward, coins }
 *   未達成 409 MISSION_NOT_DONE；已領過 409 MISSION_CLAIMED；未知 code 400 BAD_REQUEST
 *
 * 判定口徑：
 * - checkin：今日 daily_claims(kind=checkin) 已發放（與 ledger type=checkin 同一個 batch 寫入）
 * - bet3／bet10：bets.created_at 落在台北今日的「不同期別數」／「注單列數」（跨日預約算下注當天）
 * - win1：bets.settled_at 落在台北今日、非退款且 payout > 0
 * - all：上面 4 個今日都已領取
 * 冪等：mission_claims PK (user_id, day, code) + applied 守衛，與簽到同一套原子流程。
 */
import { requireAgreed, requireUser } from './auth';
import { getUserById, nowIso } from './db';
import { ApiError, json, readJson } from './http';
import { arcadeNow } from './round';
import { nextDate, tpeDate, tpeToUtcMs } from './time';
import type { ArcadeEnv } from './types';

interface MissionDef { code: string; title: string; target: number; reward: number }

export const MISSIONS: MissionDef[] = [
  { code: 'checkin', title: '每日簽到', target: 1, reward: 100 },
  { code: 'bet3', title: '玩 3 期', target: 3, reward: 100 },
  { code: 'bet10', title: '下注 10 注', target: 10, reward: 150 },
  { code: 'win1', title: '中獎 1 次', target: 1, reward: 150 },
  { code: 'all', title: '全部蓋章', target: 4, reward: 500 },
];
const BASE_CODES = ['checkin', 'bet3', 'bet10', 'win1'];

async function missionState(env: ArcadeEnv, userId: number, day: string) {
  const from = nowIso(tpeToUtcMs(day, 0));
  const to = nowIso(tpeToUtcMs(nextDate(day), 0));
  const db = env.ARCADE_DB;
  const f = await db.prepare(`SELECT
      EXISTS (SELECT 1 FROM daily_claims WHERE user_id = ? AND day = ? AND kind = 'checkin' AND applied = 1) AS ci,
      (SELECT COUNT(DISTINCT period) FROM bets WHERE user_id = ? AND created_at >= ? AND created_at < ?) AS periods,
      (SELECT COUNT(*) FROM bets WHERE user_id = ? AND created_at >= ? AND created_at < ?) AS cnt,
      EXISTS (SELECT 1 FROM bets WHERE user_id = ? AND status = 'settled' AND refunded = 0 AND payout > 0
              AND settled_at >= ? AND settled_at < ?) AS win`)
    .bind(userId, day, userId, from, to, userId, from, to, userId, from, to)
    .first<{ ci: number; periods: number; cnt: number; win: number }>();
  const claims = await db.prepare('SELECT code FROM mission_claims WHERE user_id = ? AND day = ? AND applied = 1')
    .bind(userId, day).all<{ code: string }>();
  const claimed = new Set(claims.results.map((r) => r.code));
  const raw: Record<string, number> = {
    checkin: f?.ci ? 1 : 0,
    bet3: f?.periods ?? 0,
    bet10: f?.cnt ?? 0,
    win1: f?.win ? 1 : 0,
    all: BASE_CODES.filter((c) => claimed.has(c)).length,
  };
  return MISSIONS.map((m) => {
    const progress = Math.min(raw[m.code] ?? 0, m.target);
    return { code: m.code, title: m.title, target: m.target, progress, reward: m.reward, done: progress >= m.target, claimed: claimed.has(m.code) };
  });
}

/** GET /api/missions */
export async function getMissions(request: Request, env: ArcadeEnv): Promise<Response> {
  const user = await requireUser(request, env);
  const day = tpeDate(await arcadeNow(env));
  return json(request, { day, missions: await missionState(env, user.id, day) });
}

/** POST /api/missions/claim { code } */
export async function claimMission(request: Request, env: ArcadeEnv): Promise<Response> {
  const user = await requireUser(request, env);
  requireAgreed(user);
  const body = await readJson(request);
  const def = MISSIONS.find((m) => m.code === body?.code);
  if (!def) throw new ApiError(400, `code 只能是 ${MISSIONS.map((m) => m.code).join('|')}`, 'BAD_REQUEST');
  const nowMs = await arcadeNow(env);
  const day = tpeDate(nowMs);
  const st = (await missionState(env, user.id, day)).find((m) => m.code === def.code)!;
  if (st.claimed) throw new ApiError(409, '今日已領過這個任務', 'MISSION_CLAIMED');
  if (!st.done) throw new ApiError(409, '任務尚未達成', 'MISSION_NOT_DONE');

  // 原子發放：INSERT OR IGNORE 領取列（applied=0）→ 加幣／記帳只在 applied=0 時生效 → 標 applied=1
  const db = env.ARCADE_DB;
  const now = nowIso(nowMs);
  const pending = 'EXISTS (SELECT 1 FROM mission_claims WHERE user_id = ? AND day = ? AND code = ? AND applied = 0)';
  const res = await db.batch([
    db.prepare('INSERT OR IGNORE INTO mission_claims (user_id, day, code, reward, applied, created_at) VALUES (?, ?, ?, ?, 0, ?)')
      .bind(user.id, day, def.code, def.reward, now),
    db.prepare(`UPDATE users SET coins = coins + ?, updated_at = ? WHERE id = ? AND ${pending}`)
      .bind(def.reward, now, user.id, user.id, day, def.code),
    db.prepare(`INSERT INTO ledger (user_id, type, currency, amount, ref, note, created_at)
                SELECT ?, 'mission', 'coins', ?, ?, ?, ? WHERE ${pending}`)
      .bind(user.id, def.reward, `${day}:${def.code}`, `每日任務：${def.title}`, now, user.id, day, def.code),
    db.prepare('UPDATE mission_claims SET applied = 1 WHERE user_id = ? AND day = ? AND code = ? AND applied = 0')
      .bind(user.id, day, def.code),
  ]);
  if (res[3].meta.changes !== 1) throw new ApiError(409, '今日已領過這個任務', 'MISSION_CLAIMED');
  const u = (await getUserById(env, user.id))!;
  return json(request, { ok: true, reward: def.reward, coins: u.coins });
}
