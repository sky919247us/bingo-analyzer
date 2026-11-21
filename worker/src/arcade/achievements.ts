/**
 * 成就（只有徽章，不發幣）
 * - 解鎖檢查：下注、結算、簽到、救濟之後各呼叫一次 checkAchievements；GET /api/achievements 也補算一次
 * - user_achievements PK (user_id, code) + INSERT OR IGNORE → 重複檢查不會重複解鎖、unlocked_at 不會被改
 * GET /api/achievements → { achievements: [{ code, title, desc, icon, unlocked, unlockedAt }] }（含未解鎖）
 */
import { requireUser } from './auth';
import { nowIso } from './db';
import { json } from './http';
import { arcadeNow } from './round';
import type { ArcadeEnv } from './types';

export interface AchievementDef { code: string; title: string; desc: string; icon: string }

export const ACHIEVEMENTS: AchievementDef[] = [
  { code: 'first_bet', title: '初次下注', desc: '第一次下注', icon: '🎯' },
  { code: 'first_win', title: '首次中獎', desc: '第一次中獎', icon: '🎉' },
  { code: 'star5_win', title: '五星好手', desc: '5 星以上的基本玩法中獎', icon: '⭐' },
  { code: 'star8_win', title: '八星傳奇', desc: '8 星以上的基本玩法中獎', icon: '🌟' },
  { code: 'super_hit', title: '超級命中', desc: '猜中超級獎號', icon: '💥' },
  { code: 'big_10k', title: '萬元大獎', desc: '單期派彩達 10,000', icon: '💰' },
  { code: 'big_100k', title: '十萬巨獎', desc: '單期派彩達 100,000', icon: '💎' },
  { code: 'streak3', title: '三連莊', desc: '連莊 3 期', icon: '🔥' },
  { code: 'streak5', title: '五連莊', desc: '連莊 5 期', icon: '🚀' },
  { code: 'streak10', title: '十連莊', desc: '連莊 10 期', icon: '👑' },
  { code: 'bets100', title: '百注達人', desc: '累計下注 100 注', icon: '🎰' },
  { code: 'bets1000', title: '千注老手', desc: '累計下注 1,000 注', icon: '🏅' },
  { code: 'checkin7', title: '七日簽到', desc: '累計簽到 7 天', icon: '📅' },
  { code: 'net_100k', title: '淨賺十萬', desc: '總淨收益達 100,000', icon: '🏆' },
  { code: 'rescued', title: '東山再起', desc: '領過破產救濟', icon: '🛟' },
];

interface Facts {
  bets: number; win: number; s5: number; s8: number; sup: number;
  max_win: number; max_streak: number; total_net: number; checkins: number; rescued: number;
}

/** 「注」= bets 的一列（與 user_stats.total_bets 同口徑）；中獎 = 已結算、非退款、payout > 0 */
const FACTS_SQL = `SELECT
  (SELECT COUNT(*) FROM bets WHERE user_id = ?) AS bets,
  EXISTS (SELECT 1 FROM bets WHERE user_id = ? AND status = 'settled' AND refunded = 0 AND payout > 0) AS win,
  EXISTS (SELECT 1 FROM bets WHERE user_id = ? AND status = 'settled' AND refunded = 0 AND payout > 0 AND game = 'basic' AND star >= 5) AS s5,
  EXISTS (SELECT 1 FROM bets WHERE user_id = ? AND status = 'settled' AND refunded = 0 AND payout > 0 AND game = 'basic' AND star >= 8) AS s8,
  EXISTS (SELECT 1 FROM bets WHERE user_id = ? AND status = 'settled' AND refunded = 0 AND payout > 0 AND game = 'super') AS sup,
  COALESCE((SELECT max_win FROM user_stats WHERE user_id = ?), 0) AS max_win,
  COALESCE((SELECT max_streak FROM user_stats WHERE user_id = ?), 0) AS max_streak,
  COALESCE((SELECT total_net FROM user_stats WHERE user_id = ?), 0) AS total_net,
  (SELECT COUNT(*) FROM daily_claims WHERE user_id = ? AND kind = 'checkin' AND applied = 1) AS checkins,
  EXISTS (SELECT 1 FROM daily_claims WHERE user_id = ? AND kind = 'rescue' AND applied = 1) AS rescued`;

function satisfied(f: Facts): string[] {
  const ok: Record<string, boolean> = {
    first_bet: f.bets >= 1,
    first_win: !!f.win,
    star5_win: !!f.s5,
    star8_win: !!f.s8,
    super_hit: !!f.sup,
    big_10k: f.max_win >= 10_000, // max_win = 單期（使用者 × 期別）總派彩的最大值
    big_100k: f.max_win >= 100_000,
    streak3: f.max_streak >= 3,
    streak5: f.max_streak >= 5,
    streak10: f.max_streak >= 10,
    bets100: f.bets >= 100,
    bets1000: f.bets >= 1000,
    checkin7: f.checkins >= 7,
    net_100k: f.total_net >= 100_000,
    rescued: !!f.rescued,
  };
  return ACHIEVEMENTS.map((a) => a.code).filter((c) => ok[c]);
}

/** 檢查並寫入新解鎖的成就；回傳本次新解鎖的 code */
export async function checkAchievements(env: ArcadeEnv, userId: number): Promise<string[]> {
  const db = env.ARCADE_DB;
  const facts = await db.prepare(FACTS_SQL).bind(...Array(10).fill(userId)).first<Facts>();
  if (!facts) return [];
  const have = await db.prepare('SELECT code FROM user_achievements WHERE user_id = ?').bind(userId).all<{ code: string }>();
  const owned = new Set(have.results.map((r) => r.code));
  const fresh = satisfied(facts).filter((c) => !owned.has(c));
  if (fresh.length === 0) return [];
  const now = nowIso(await arcadeNow(env));
  // 使用者已被刪除時不寫（避免刪帳與結算交錯留下孤兒列）
  await db.batch(fresh.map((c) => db.prepare(
    'INSERT OR IGNORE INTO user_achievements (user_id, code, unlocked_at) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)',
  ).bind(userId, c, now, userId)));
  return fresh;
}

/** GET /api/achievements */
export async function getAchievements(request: Request, env: ArcadeEnv): Promise<Response> {
  const user = await requireUser(request, env);
  await checkAchievements(env, user.id);
  const rows = await env.ARCADE_DB.prepare('SELECT code, unlocked_at FROM user_achievements WHERE user_id = ?')
    .bind(user.id).all<{ code: string; unlocked_at: string }>();
  const map = new Map(rows.results.map((r) => [r.code, r.unlocked_at]));
  return json(request, {
    achievements: ACHIEVEMENTS.map((a) => ({
      code: a.code, title: a.title, desc: a.desc, icon: a.icon,
      unlocked: map.has(a.code), unlockedAt: map.get(a.code) ?? null,
    })),
  });
}
