/** GET /api/leaderboard?type=rich|maxWin|week|month|streak|total&limit=50（免登入；帶 token 附 me） */
import { optionalUser } from './auth';
import { ApiError, json } from './http';
import { arcadeNow } from './round';
import { monthKey, weekKey } from './time';
import type { ArcadeEnv } from './types';

const TYPES = ['rich', 'maxWin', 'week', 'month', 'streak', 'total'] as const;
type BoardType = (typeof TYPES)[number];

/** 每種排行的「值欄位」與「納入條件」（rich 依 users.coins，不含 tickets） */
function spec(type: BoardType, wk: string, mk: string): { value: string; where: string; args: unknown[] } {
  switch (type) {
    case 'rich': return { value: 'u.coins', where: '1', args: [] };
    case 'maxWin': return { value: 's.max_win', where: 's.max_win > 0', args: [] };
    case 'week': return { value: 's.week_net', where: 's.week_key = ? AND s.total_bets > 0', args: [wk] };
    case 'month': return { value: 's.month_net', where: 's.month_key = ? AND s.total_bets > 0', args: [mk] };
    case 'streak': return { value: 's.max_streak', where: 's.max_streak > 0', args: [] };
    case 'total': return { value: 's.total_net', where: 's.total_bets > 0', args: [] };
  }
}

export async function leaderboard(request: Request, env: ArcadeEnv): Promise<Response> {
  const url = new URL(request.url);
  const type = (url.searchParams.get('type') ?? 'rich') as BoardType;
  if (!TYPES.includes(type)) throw new ApiError(400, `type 只能是 ${TYPES.join('|')}`, 'BAD_REQUEST');
  const rawLimit = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const limit = Math.max(1, Math.min(isNaN(rawLimit) ? 50 : rawLimit, 100));

  const now = await arcadeNow(env);
  const { value, where, args } = spec(type, weekKey(now), monthKey(now));
  const from = 'FROM users u LEFT JOIN user_stats s ON s.user_id = u.id';
  const rows = await env.ARCADE_DB.prepare(
    `SELECT u.id AS userId, u.name AS name, u.avatar AS avatar, COALESCE(${value}, 0) AS value
     ${from} WHERE ${where} ORDER BY value DESC, u.id ASC LIMIT ?`,
  ).bind(...args, limit).all<{ userId: number; name: string; avatar: string | null; value: number }>();

  let me: { rank: number; value: number } | null = null;
  const user = await optionalUser(request, env);
  if (user) {
    const mine = await env.ARCADE_DB.prepare(`SELECT COALESCE(${value}, 0) AS value ${from} WHERE u.id = ? AND ${where}`)
      .bind(user.id, ...args).first<{ value: number }>();
    if (mine) {
      // 名次 = 值嚴格大於我的人數 + 1（與列表同分以 id 排序略有差異，屬可接受）
      const higher = await env.ARCADE_DB.prepare(`SELECT COUNT(*) AS c ${from} WHERE ${where} AND COALESCE(${value}, 0) > ?`)
        .bind(...args, mine.value).first<{ c: number }>();
      me = { rank: (higher?.c ?? 0) + 1, value: mine.value };
    }
  }

  return json(request, {
    type,
    rows: rows.results.map((r, i) => ({ rank: i + 1, userId: r.userId, name: r.name, avatar: r.avatar, value: r.value })),
    me,
  });
}
