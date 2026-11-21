/** 下注與注單查詢：POST /api/bets、GET /api/bets、GET /api/bets/recent、GET /api/bets/pending */
import { randomHex, requireAgreed, requireUser } from './auth';
import { checkAchievements } from './achievements';
import { getUserById, nowIso, toBetRow } from './db';
import { findDrawResults } from './draws';
import { ApiError, json, readJson } from './http';
import { ALLOWED_MULTIPLIERS, UNIT_COST, unitsOf, type BetItem } from './payout';
import { consecutivePeriods, getRound, slotOfMs } from './round';
import { settlePeriod, trySettlePeriod } from './settle';
import type { ArcadeEnv, BetDbRow } from './types';

export const MAX_ITEMS_PER_PERIOD = 20;

function bad(msg: string): never {
  throw new ApiError(400, msg, 'BAD_BET');
}

function validNumbers(v: unknown, min: number, max: number): number[] {
  if (!Array.isArray(v)) bad('numbers 必須是陣列');
  const arr = v as unknown[];
  if (arr.length < min || arr.length > max) bad(`numbers 數量需介於 ${min}~${max}`);
  if (!arr.every((n) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 80)) bad('號碼需為 1~80 的整數');
  if (new Set(arr).size !== arr.length) bad('號碼不可重複');
  return [...(arr as number[])].sort((a, b) => a - b);
}

/** 驗證並正規化單一 item */
export function parseItem(raw: any): BetItem {
  if (!raw || typeof raw !== 'object') bad('item 格式錯誤');
  switch (raw.game) {
    case 'basic': {
      const star = raw.star;
      if (!Number.isInteger(star) || star < 1 || star > 10) bad('星數需為 1~10');
      const numbers = validNumbers(raw.numbers, 1, 10);
      if (numbers.length !== star) bad('號碼數必須等於星數');
      return { game: 'basic', star, numbers };
    }
    case 'super':
      return { game: 'super', numbers: validNumbers(raw.numbers, 1, 20) };
    case 'bigSmall':
      if (raw.pick !== '大' && raw.pick !== '小') bad("bigSmall 的 pick 只能是 '大' 或 '小'");
      return { game: 'bigSmall', pick: raw.pick };
    case 'oddEven':
      if (raw.pick !== '單' && raw.pick !== '雙') bad("oddEven 的 pick 只能是 '單' 或 '雙'");
      return { game: 'oddEven', pick: raw.pick };
    default:
      bad('未知的 game');
  }
}

/**
 * 允許的連續投注期數（含當期）：官方選項 1~10、12 期（沒有 11 期）。
 * 與倍數白名單同樣做法，日後要改只改這個常數。
 */
export const ALLOWED_PERIODS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12];
export const MAX_PERIODS = Math.max(...ALLOWED_PERIODS);

/**
 * POST /api/bets { period, multiplier, items, periods? }
 *
 * periods（選填，需在 ALLOWED_PERIODS 白名單內，預設 1）：從 period 起連續 N 期，同一組 items/倍數套用到每一期，
 * 每期各一張 bet_orders 與各自的 bets（共用 group_id），各期獨立結算；一次扣款 = 單期成本 × N。
 * 可跨日（期別規則見 round.ts：同年跨日 +1、跨年由 (民國年)000001 起算）；每期記下預定開獎時刻 draw_at，
 * 供排程補撈與 72 小時兜底退款使用。
 *
 * 原子性：一個 batch（D1 會包成單一交易）
 *   1. INSERT 第一期 bet_orders … WHERE 餘額足夠 AND 每一期 item 數都未超過上限   ← 守衛列
 *   2. INSERT 其餘各期 bet_orders WHERE 守衛列存在
 *   3. UPDATE users 扣款 WHERE 守衛列存在 AND coins >= ? AND tickets >= ?
 *   4. 每個 item 一句 INSERT bets … SELECT FROM bet_orders WHERE group_id=?（一句寫入 N 期，控制語句數）
 *   5. INSERT ledger … WHERE 守衛列存在
 * 若 1 的 changes=0 即視為餘額不足或超量，整批其餘語句皆為 no-op。
 * users 另有 CHECK(coins>=0, tickets>=0) 當最後防線。
 */
export async function placeBets(request: Request, env: ArcadeEnv): Promise<Response> {
  const user = await requireUser(request, env);
  requireAgreed(user);
  const body = await readJson(request);

  const multiplier = body?.multiplier;
  if (!ALLOWED_MULTIPLIERS.includes(multiplier)) bad(`倍數只能是 ${ALLOWED_MULTIPLIERS.join(',')}`);
  if (!Array.isArray(body?.items) || body.items.length < 1) bad('items 不可為空');
  if (body.items.length > MAX_ITEMS_PER_PERIOD) bad(`同一期最多 ${MAX_ITEMS_PER_PERIOD} 個 item`);
  const items = (body.items as unknown[]).map(parseItem);
  const n = body?.periods === undefined || body?.periods === null ? 1 : body.periods;
  if (!ALLOWED_PERIODS.includes(n)) bad(`periods 只能是 ${ALLOWED_PERIODS.join(',')}`);

  const round = await getRound(env);
  if (typeof body?.period !== 'string' || round.period === null || body.period !== round.period) {
    throw new ApiError(409, '期別不是目前可下注期', 'WRONG_PERIOD');
  }
  if (!round.open) throw new ApiError(409, '本期已截止下注', 'CLOSED');
  const firstSlot = slotOfMs(Date.parse(round.drawTime));
  if (!firstSlot) throw new ApiError(409, '期別不是目前可下注期', 'WRONG_PERIOD');
  const plan = consecutivePeriods(round.period, firstSlot, n);
  const periods = plan.map((p) => p.period);
  const drawAts = plan.map((p) => nowIso(p.drawMs));

  // 計算成本：活動券優先扣，依「期別 → item」順序分攤
  const costs = items.map((it) => unitsOf(it) * UNIT_COST * multiplier);
  const total = costs.reduce((a, b) => a + b, 0) * n;
  const fresh = (await getUserById(env, user.id))!;
  let ticketsLeft = Math.min(fresh.tickets, total);
  /** split[期別索引][item 索引] */
  const split = periods.map(() => costs.map((c) => {
    const t = Math.min(ticketsLeft, c);
    ticketsLeft -= t;
    return { tickets: t, coins: c - t };
  }));
  const costTickets = split.flat().reduce((a, s) => a + s.tickets, 0);
  const costCoins = total - costTickets;
  if (fresh.coins < costCoins) throw new ApiError(409, '代幣不足', 'INSUFFICIENT');

  const db = env.ARCADE_DB;
  // 建立時間用 arcade 時鐘（正式環境＝真實時間；dev 可注入）；每日任務以此判定「今日下注」
  const now = round.serverNow;
  const groupId = randomHex(16);
  const orderIds = periods.map(() => randomHex(16));
  const guardId = orderIds[0];
  const guard = 'EXISTS (SELECT 1 FROM bet_orders WHERE id = ?)';
  const ph = periods.map(() => '?').join(', ');
  const periodCost = (pi: number) => split[pi].reduce((a, s) => ({ coins: a.coins + s.coins, tickets: a.tickets + s.tickets }), { coins: 0, tickets: 0 });
  const c0 = periodCost(0);
  const stmts: D1PreparedStatement[] = [
    db.prepare(`INSERT INTO bet_orders (id, user_id, period, cost_coins, cost_tickets, created_at, group_id, draw_at)
                SELECT ?, ?, ?, ?, ?, ?, ?, ?
                WHERE (SELECT coins FROM users WHERE id = ?) >= ?
                  AND (SELECT tickets FROM users WHERE id = ?) >= ?
                  AND NOT EXISTS (SELECT 1 FROM bets WHERE user_id = ? AND period IN (${ph})
                                  GROUP BY period HAVING COUNT(*) + ? > ?)`)
      .bind(guardId, user.id, periods[0], c0.coins, c0.tickets, now, groupId, drawAts[0],
        user.id, costCoins, user.id, costTickets, user.id, ...periods, items.length, MAX_ITEMS_PER_PERIOD),
  ];
  for (let pi = 1; pi < n; pi++) {
    const c = periodCost(pi);
    stmts.push(
      db.prepare(`INSERT INTO bet_orders (id, user_id, period, cost_coins, cost_tickets, created_at, group_id, draw_at)
                  SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard}`)
        .bind(orderIds[pi], user.id, periods[pi], c.coins, c.tickets, now, groupId, drawAts[pi], guardId),
    );
  }
  const userUpdateIdx = stmts.length;
  stmts.push(
    db.prepare(`UPDATE users SET coins = coins - ?, tickets = tickets - ?, updated_at = ?
                WHERE id = ? AND coins >= ? AND tickets >= ? AND ${guard}`)
      .bind(costCoins, costTickets, now, user.id, costCoins, costTickets, guardId),
  );
  items.forEach((it, i) => {
    // 各期該 item 用掉的活動券：{ "期別": tickets }，以 json_extract 取出（item 成本各期相同）
    const ticketMap = JSON.stringify(Object.fromEntries(periods.map((p, pi) => [p, split[pi][i].tickets])));
    stmts.push(
      db.prepare(`INSERT INTO bets (order_id, group_id, user_id, period, game, star, numbers, pick, multiplier, cost_coins, cost_tickets, status, created_at, draw_at)
                  SELECT o.id, o.group_id, ?, o.period, ?, ?, ?, ?, ?,
                         ? - json_extract(?, '$."' || o.period || '"'), json_extract(?, '$."' || o.period || '"'),
                         'pending', ?, o.draw_at
                  FROM bet_orders o WHERE o.group_id = ? AND ${guard}
                  ORDER BY o.period`)
        .bind(user.id, it.game,
          it.game === 'basic' ? it.star : null,
          'numbers' in it ? JSON.stringify(it.numbers) : null,
          'pick' in it ? it.pick : null,
          multiplier, costs[i], ticketMap, ticketMap, now, groupId, guardId),
    );
  });
  const range = n > 1 ? `第 ${periods[0]}~${periods[n - 1]} 期（共 ${n} 期）` : `第 ${periods[0]} 期`;
  for (const [currency, amt] of [['coins', costCoins], ['tickets', costTickets]] as const) {
    if (amt > 0) {
      stmts.push(
        db.prepare(`INSERT INTO ledger (user_id, type, currency, amount, ref, note, created_at)
                    SELECT ?, 'bet', ?, ?, ?, ?, ? WHERE ${guard}`)
          .bind(user.id, currency, -amt, n > 1 ? `group:${groupId}` : `order:${guardId}`, `${range} ${items.length} 項`, now, guardId),
      );
    }
  }
  const res = await db.batch(stmts);
  if (res[0].meta.changes !== 1 || res[userUpdateIdx].meta.changes !== 1) {
    const cnt = await db.prepare(`SELECT COALESCE(MAX(c), 0) AS c FROM (SELECT COUNT(*) AS c FROM bets WHERE user_id = ? AND period IN (${ph}) GROUP BY period)`)
      .bind(user.id, ...periods).first<{ c: number }>();
    if ((cnt?.c ?? 0) + items.length > MAX_ITEMS_PER_PERIOD) {
      throw new ApiError(409, `同一期每人最多 ${MAX_ITEMS_PER_PERIOD} 個 item`, 'TOO_MANY');
    }
    throw new ApiError(409, '代幣不足', 'INSUFFICIENT');
  }

  const rows = await db.prepare('SELECT * FROM bets WHERE group_id = ? ORDER BY period, id').bind(groupId).all<BetDbRow>();
  // 成就檢查（first_bet、bets100…）；失敗不影響下注結果
  await checkAchievements(env, user.id).catch((err) => console.error('[arcade] 成就檢查失敗:', err));
  const after = (await getUserById(env, user.id))!;
  return json(request, {
    bets: rows.results.map(toBetRow),
    cost: { coins: costCoins, tickets: costTickets },
    balance: { coins: after.coins, tickets: after.tickets },
    periods: n,
    lastPeriod: periods[n - 1],
    groupId,
  });
}

/** GET /api/bets?period=xxx（若該期已有官方結果（D1 draw_results 或 KV）但尚未結算，當場嘗試結算） */
export async function listBets(request: Request, env: ArcadeEnv): Promise<Response> {
  const user = await requireUser(request, env);
  const period = new URL(request.url).searchParams.get('period') ?? '';
  if (!/^\d{1,15}$/.test(period)) throw new ApiError(400, 'period 格式錯誤', 'BAD_REQUEST');
  const q = () => env.ARCADE_DB.prepare('SELECT * FROM bets WHERE user_id = ? AND period = ? ORDER BY id').bind(user.id, period).all<BetDbRow>();
  let rows = await q();
  if (rows.results.some((r) => r.status === 'pending')) {
    try {
      if (await trySettlePeriod(env, period)) rows = await q();
    } catch (err) {
      console.error('[arcade] 當場結算失敗:', err);
    }
  }
  return json(request, { bets: rows.results.map(toBetRow) });
}

/** GET /api/bets/recent?limit=30 */
export async function recentBets(request: Request, env: ArcadeEnv): Promise<Response> {
  const user = await requireUser(request, env);
  const raw = parseInt(new URL(request.url).searchParams.get('limit') ?? '30', 10);
  const limit = Math.max(1, Math.min(isNaN(raw) ? 30 : raw, 100));
  const rows = await env.ARCADE_DB.prepare('SELECT * FROM bets WHERE user_id = ? ORDER BY id DESC LIMIT ?').bind(user.id, limit).all<BetDbRow>();
  return json(request, { bets: rows.results.map(toBetRow) });
}

/**
 * GET /api/bets/pending：自己所有未結算的注單（含多期投注預約的未來期別），依期別舊→新
 * 若其中有期別已有官方結果（D1 draw_results 或 KV），先當場結算再回傳（與 GET /api/bets 一致）
 * 回應：{ bets, periods }（periods = 未結算的不同期別數）
 */
export async function pendingBets(request: Request, env: ArcadeEnv): Promise<Response> {
  const user = await requireUser(request, env);
  const q = () => env.ARCADE_DB.prepare("SELECT * FROM bets WHERE user_id = ? AND status = 'pending' ORDER BY period, id LIMIT 500")
    .bind(user.id).all<BetDbRow>();
  let rows = await q();
  if (rows.results.length > 0) {
    try {
      const found = await findDrawResults(env, [...new Set(rows.results.map((r) => r.period))]);
      let settled = false;
      for (const d of found.values()) { await settlePeriod(env, d); settled = true; }
      if (settled) rows = await q();
    } catch (err) {
      console.error('[arcade] pending 當場結算失敗:', err);
    }
  }
  return json(request, { bets: rows.results.map(toBetRow), periods: new Set(rows.results.map((r) => r.period)).size });
}
