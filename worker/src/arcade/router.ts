/** 賓果娛樂機 /api/*（不含 /api/kv/*）路由分派。代幣不可購買／兌換／轉帳，故無任何儲值或轉帳端點。 */
import { deleteMe } from './account';
import { getAchievements } from './achievements';
import { exchange, lineCallback, lineStart, logout } from './auth';
import { adminGrant, adminLedger, adminUsers } from './admin';
import { listBets, pendingBets, placeBets, recentBets } from './bets';
import { devRoute } from './dev';
import { adminHideFeed, getFeed } from './feed';
import { ApiError, corsFor, errorResponse, json } from './http';
import { leaderboard } from './leaderboard';
import { claimMission, getMissions } from './missions';
import { agree, checkin, getMe, rescue, userView } from './player';
import { getRound } from './round';
import { isDev, type ArcadeEnv } from './types';

/** 是否由本模組處理此路徑 */
export function isArcadePath(pathname: string): boolean {
  return pathname.startsWith('/api/') && !pathname.startsWith('/api/kv/');
}

type Handler = (request: Request, env: ArcadeEnv) => Promise<Response>;

const ROUTES: Record<string, Handler> = {
  'GET /api/auth/line/start': lineStart,
  'GET /api/auth/line/callback': lineCallback,
  'POST /api/auth/exchange': (r, e) => exchange(r, e, (u) => userView(e, u)),
  'POST /api/auth/logout': logout,
  'GET /api/me': getMe,
  'POST /api/agree': agree,
  'POST /api/checkin': checkin,
  'POST /api/rescue': rescue,
  'GET /api/round': async (r, e) => json(r, await getRound(e)),
  'POST /api/bets': placeBets,
  'GET /api/bets': listBets,
  'GET /api/bets/recent': recentBets,
  'GET /api/bets/pending': pendingBets,
  'GET /api/leaderboard': leaderboard,
  'GET /api/admin/users': adminUsers,
  'POST /api/admin/grant': adminGrant,
  'GET /api/admin/ledger': adminLedger,
  'GET /api/feed': getFeed,
  'POST /api/admin/feed/hide': adminHideFeed,
  'GET /api/missions': getMissions,
  'POST /api/missions/claim': claimMission,
  'GET /api/achievements': getAchievements,
  'POST /api/me/delete': deleteMe,
};

export async function handleArcade(request: Request, env: ArcadeEnv): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsFor(request) });
  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  try {
    if (path.startsWith('/api/dev/')) {
      // 正式環境不設 ARCADE_DEV_LOGIN → 一律 404，與不存在的路徑無法區分
      if (!isDev(env)) throw new ApiError(404, 'Not Found', 'NOT_FOUND');
      return await devRoute(request, env, path);
    }
    const h = ROUTES[`${request.method} ${path}`];
    if (!h) throw new ApiError(404, 'Not Found', 'NOT_FOUND');
    return await h(request, env);
  } catch (err) {
    return errorResponse(request, err);
  }
}
