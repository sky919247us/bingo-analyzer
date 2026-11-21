/**
 * 結算（冪等）
 *
 * 每「使用者 × 期別」一個 batch（D1 包成單一交易）：
 *   對每張 pending 注單：
 *     a. UPDATE users 加派彩   WHERE 該注單仍 pending
 *     b. INSERT ledger(payout) WHERE 該注單仍 pending
 *     c. UPDATE bets → settled WHERE id=? AND status='pending'（搶占）
 *   然後：
 *     d. INSERT OR IGNORE user_periods（applied=0）
 *     e. UPDATE user_stats（淨收益／連莊／最大獎）WHERE user_periods 仍 applied=0
 *     e2. INSERT OR IGNORE feed_events（達門檻的中獎才寫；同樣以 applied=0 為守衛，且 UNIQUE(user_id, period)）
 *     f. UPDATE user_periods SET applied=1
 * 同一期重跑：a/b/c 因注單已非 pending 全為 no-op；e 因 applied=1 為 no-op → 不重複派彩、不重複計統計。
 * 派彩是「注單 × 開獎結果」的純函式，故彙總值在重跑時也一致。
 */
import { checkAchievements } from './achievements';
import { nowIso } from './db';
import { BACKFILL_AFTER_MS, REFUND_AFTER_MS, backfillFromTlc, findDrawResults, ingestKvDraws, refundPeriod, type RefundSummary } from './draws';
import { feedCandidate, maskName, purgeOldFeed } from './feed';
import { evaluate } from './payout';
import { arcadeNow } from './round';
import { monthKey, weekKey } from './time';
import type { ArcadeEnv, BetDbRow, DrawResult } from './types';

export interface SettleSummary { period: string; users: number; betsSettled: number; payout: number }

export async function settlePeriod(env: ArcadeEnv, draw: DrawResult): Promise<SettleSummary> {
  const db = env.ARCADE_DB;
  const period = draw.period;
  const summary: SettleSummary = { period, users: 0, betsSettled: 0, payout: 0 };

  const pendingUsers = await db.prepare("SELECT DISTINCT user_id FROM bets WHERE period = ? AND status = 'pending'")
    .bind(period).all<{ user_id: number }>();

  const nowMs = await arcadeNow(env);
  const wk = weekKey(nowMs);
  const mk = monthKey(nowMs);
  // 用 arcade 時鐘（正式環境＝真實時間），每日任務 win1 以 settled_at 判定「今日」
  const now = nowIso(nowMs);

  for (const { user_id: uid } of pendingUsers.results) {
    const all = await db.prepare('SELECT * FROM bets WHERE user_id = ? AND period = ? ORDER BY id').bind(uid, period).all<BetDbRow>();
    const evals = all.results.map((b) => ({
      bet: b,
      ...evaluate({ game: b.game, star: b.star, numbers: b.numbers ? JSON.parse(b.numbers) : null, pick: b.pick, multiplier: b.multiplier }, draw),
    }));
    const stmts: D1PreparedStatement[] = [];
    const pendingGuard = "EXISTS (SELECT 1 FROM bets WHERE id = ? AND status = 'pending')";
    const betUpdateIdx: number[] = [];
    for (const e of evals) {
      if (e.bet.status !== 'pending') continue;
      if (e.payout > 0) {
        stmts.push(
          db.prepare(`UPDATE users SET coins = coins + ?, updated_at = ? WHERE id = ? AND ${pendingGuard}`)
            .bind(e.payout, now, uid, e.bet.id),
          db.prepare(`INSERT INTO ledger (user_id, type, currency, amount, ref, note, created_at)
                      SELECT ?, 'payout', 'coins', ?, ?, ?, ? WHERE ${pendingGuard}`)
            .bind(uid, e.payout, `bet:${e.bet.id}`, `第 ${period} 期 ${e.bet.game}`, now, e.bet.id),
        );
      }
      betUpdateIdx.push(stmts.length);
      stmts.push(
        db.prepare("UPDATE bets SET status = 'settled', hits = ?, payout = ?, settled_at = ? WHERE id = ? AND status = 'pending'")
          .bind(e.hits, e.payout, now, e.bet.id),
      );
    }
    const totalPayout = evals.reduce((a, e) => a + e.payout, 0);
    const totalCost = evals.reduce((a, e) => a + e.bet.cost_coins + e.bet.cost_tickets, 0);
    const net = totalPayout - totalCost;
    const won = totalPayout > 0 ? 1 : 0;
    const unapplied = 'EXISTS (SELECT 1 FROM user_periods WHERE user_id = ? AND period = ? AND applied = 0)';
    stmts.push(
      db.prepare('INSERT OR IGNORE INTO user_periods (user_id, period, bet_count, cost, payout, applied, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)')
        .bind(uid, period, evals.length, totalCost, totalPayout, now),
      db.prepare('INSERT OR IGNORE INTO user_stats (user_id) VALUES (?)').bind(uid),
      // SQLite 的 SET 右側一律引用「更新前」的欄位值
      db.prepare(`UPDATE user_stats SET
                    total_net = total_net + ?,
                    week_net = CASE WHEN week_key = ? THEN week_net ELSE 0 END + ?, week_key = ?,
                    month_net = CASE WHEN month_key = ? THEN month_net ELSE 0 END + ?, month_key = ?,
                    max_win = MAX(max_win, ?),
                    cur_streak = CASE WHEN ? = 1 THEN cur_streak + 1 ELSE 0 END,
                    max_streak = MAX(max_streak, CASE WHEN ? = 1 THEN cur_streak + 1 ELSE 0 END),
                    total_bets = total_bets + ?,
                    total_wagered = total_wagered + ?,
                    updated_at = ?
                  WHERE user_id = ? AND ${unapplied}`)
        .bind(net, wk, net, wk, mk, net, mk, totalPayout, won, won, evals.length, totalCost, now, uid, uid, period),
    );
    // 中獎跑馬燈：同期多注合併成一則；與統計同一個 batch、同一個 applied=0 守衛 → 重跑結算不會重複產生
    const cand = feedCandidate(
      evals.map((e) => ({ game: e.bet.game, star: e.bet.star, hits: e.hits, payout: e.payout, pick: e.bet.pick })),
      totalPayout, totalCost,
    );
    if (cand) {
      const u = await db.prepare('SELECT name FROM users WHERE id = ?').bind(uid).first<{ name: string }>();
      stmts.push(
        db.prepare(`INSERT OR IGNORE INTO feed_events (type, user_id, masked_name, period, game, payout, ratio, created_at)
                    SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ${unapplied}`)
          .bind(cand.type, uid, maskName(u?.name), period, cand.game, cand.payout, cand.ratio, nowIso(nowMs), uid, period),
      );
    }
    stmts.push(
      db.prepare('UPDATE user_periods SET applied = 1 WHERE user_id = ? AND period = ? AND applied = 0').bind(uid, period),
    );
    const res = await db.batch(stmts);
    const settledNow = betUpdateIdx.filter((i) => res[i].meta.changes === 1).length;
    if (res[res.length - 1].meta.changes === 1) summary.users++;
    summary.betsSettled += settledNow;
    summary.payout += settledNow > 0 ? totalPayout : 0;
    // 成就（first_win、streak…）；失敗不影響結算
    if (settledNow > 0) await checkAchievements(env, uid).catch((err) => console.error('[arcade] 成就檢查失敗:', err));
  }
  return summary;
}

/** 找該期官方結果（D1 draw_results → KV）並結算；找不到回 false */
export async function trySettlePeriod(env: ArcadeEnv, period: string): Promise<boolean> {
  const d = (await findDrawResults(env, [period])).get(period);
  if (!d) return false;
  await settlePeriod(env, d);
  return true;
}

export interface CronOptions {
  /** 是否向台彩補撈（預設 true；dev 測試傳 false 以免連外） */
  backfill?: boolean;
  /** 只把 KV 寫進 draw_results，不結算（dev 測試用） */
  ingestOnly?: boolean;
}

export interface CronSummary {
  ingested: number;
  settled: SettleSummary[];
  backfilled: number;
  refunded: RefundSummary[];
}

/**
 * 排程同步後呼叫（index.ts scheduled）：
 *   1. KV today_draws → D1 draw_results，並更新 meta.last_draw（只往前）
 *   2. 結算所有已有官方結果的 pending 期別（結果一律從 draw_results 取，KV 清空也能結算）
 *   3. 已過開獎時刻 10 分鐘仍無結果 → 向台彩 BingoResult 依日期補撈，補到再結算
 *   4. 已過開獎時刻 72 小時仍無結果 → 原額退款（refunded=1）
 * 每一步都冪等：重跑不會重複派彩或退款。
 */
export async function settleFromKv(env: ArcadeEnv, opts: CronOptions = {}): Promise<CronSummary> {
  const out: CronSummary = { ingested: 0, settled: [], backfilled: 0, refunded: [] };
  out.ingested = await ingestKvDraws(env);
  if (opts.ingestOnly) return out;

  const nowMs = await arcadeNow(env);
  // 舊注單（0004 之前）沒有 draw_at，以 created_at 代替（只會讓門檻提早，至多一小時內）
  const pending = await env.ARCADE_DB.prepare(
    `SELECT period, MIN(COALESCE(draw_at, created_at)) AS at FROM bets WHERE status = 'pending'
     GROUP BY period ORDER BY at LIMIT 300`,
  ).all<{ period: string; at: string }>();
  const found = await findDrawResults(env, pending.results.map((p) => p.period));
  for (const d of found.values()) out.settled.push(await settlePeriod(env, d));

  let missing = pending.results.filter((p) => !found.has(p.period) && Date.parse(p.at) + BACKFILL_AFTER_MS <= nowMs);
  if (missing.length > 0 && opts.backfill !== false) {
    out.backfilled = await backfillFromTlc(env, missing, nowMs);
    if (out.backfilled > 0) {
      const got = await findDrawResults(env, missing.map((p) => p.period));
      for (const d of got.values()) out.settled.push(await settlePeriod(env, d));
      missing = missing.filter((p) => !got.has(p.period));
    }
  }
  for (const p of missing) {
    if (Date.parse(p.at) + REFUND_AFTER_MS <= nowMs) out.refunded.push(await refundPeriod(env, p.period, nowMs));
  }
  // 順便清掉 7 天前的跑馬燈事件；失敗不影響結算
  await purgeOldFeed(env).catch((err) => console.error('[arcade] 清除舊跑馬燈失敗:', err));
  return out;
}
