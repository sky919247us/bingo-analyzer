/**
 * 「目前可下注期」判定
 *
 * 期別規則（2026-11-20 以 public/data/賓果賓果_2014~2026.csv 查證，見 ARCADE_SETUP.md「期別連續性」）：
 * - 每日 07:05～23:55 每 5 分鐘一期，共 203 期；同一日內 drawTerm 連續 +1。
 * - 跨日連續：同一民國年內，隔日第 1 期 = 前一日最後一期 + 1（4,765 組相鄰日全部成立）。
 * - 跨年重置：1/1 第 1 期 = (民國年)000001，例 2026/01/01 = 115000001（13 次跨年全部成立）。
 *
 * 作法：取已知最新一期 L（KV today_draws → D1 meta.last_draw），由 L 的 drawTime 推出它是第 iL 期（日期 dL）；
 *   下一期名目時段 (date, n) 由時鐘推得；
 *   - date = dL 且 n > iL：period = L + (n − iL)
 *   - date = dL 的隔日：同年 period = L + (203 − iL) + n；跨年 period = 民國年 × 10^6 + n
 *   - 其他（已知期太舊）：period = null、open = false（寧可不開放也不猜）
 * 04:05～07:05 之間 KV 可能是空的，靠 settle.ts 持久化的 meta.last_draw 推算當日第 1 期。
 */
import { getMeta, nowIso, readKvDraws } from './db';
import { CLOSE_BEFORE_MS, DRAWS_PER_DAY, DRAW_INTERVAL_SEC, FIRST_DRAW_SEC, drawMs, nextDate, parseDrawTime, tpeDate, tpeSecOfDay } from './time';
import { isDev, type ArcadeEnv } from './types';

export interface Round {
  period: string | null;
  drawTime: string;
  closesAt: string;
  serverNow: string;
  open: boolean;
}

export interface KnownDraw { period: string; drawTime: string }

/** 開獎時段：台北日期 + 當日第幾期（1~203） */
export interface Slot { date: string; index: number }

/** 目前時間（dev 模式可由 meta.dev_now 注入） */
export async function arcadeNow(env: ArcadeEnv): Promise<number> {
  if (isDev(env)) {
    const v = await getMeta(env, 'dev_now');
    if (v) {
      const ms = Date.parse(v);
      if (!isNaN(ms)) return ms;
    }
  }
  return Date.now();
}

export async function latestKnownDraw(env: ArcadeEnv): Promise<KnownDraw | null> {
  if (isDev(env)) {
    const v = await getMeta(env, 'dev_latest_draw');
    if (v) return JSON.parse(v) as KnownDraw;
  }
  const draws = await readKvDraws(env);
  const withTime = draws.find((d) => parseDrawTime(d.drawTime));
  if (withTime) return { period: String(withTime.period), drawTime: String(withTime.drawTime) };
  const metaV = await getMeta(env, 'last_draw');
  return metaV ? (JSON.parse(metaV) as KnownDraw) : null;
}

const rocYear = (date: string) => Number(date.slice(0, 4)) - 1911;

/** 下一個開獎時段（23:55 之後是隔日 07:05） */
export function nextSlot(s: Slot): Slot {
  return s.index >= DRAWS_PER_DAY ? { date: nextDate(s.date), index: 1 } : { date: s.date, index: s.index + 1 };
}

/** 開獎時刻（UTC 毫秒）→ 時段；不是整點期回 null */
export function slotOfMs(ms: number): Slot | null {
  const off = tpeSecOfDay(ms) - FIRST_DRAW_SEC;
  if (off < 0 || off % DRAW_INTERVAL_SEC !== 0) return null;
  const index = off / DRAW_INTERVAL_SEC + 1;
  return index > DRAWS_PER_DAY ? null : { date: tpeDate(ms), index };
}

/** 由已知期（period @ known）推 target 時段的期別；推不出來回 null */
export function periodAt(period: string, known: Slot, target: Slot): string | null {
  if (!/^\d+$/.test(period)) return null;
  const L = Number(period);
  if (target.date === known.date) return target.index > known.index ? String(L + (target.index - known.index)) : null;
  if (target.date !== nextDate(known.date)) return null; // 只推到隔日，已知期太舊不猜
  if (target.date.slice(0, 4) === known.date.slice(0, 4)) return String(L + (DRAWS_PER_DAY - known.index) + target.index);
  // 跨年：已知期必須是 9 碼且前 3 碼等於已知日的民國年，才確定編號規則
  if (!/^\d{9}$/.test(period) || Math.floor(L / 1_000_000) !== rocYear(known.date)) return null;
  return String(rocYear(target.date) * 1_000_000 + target.index);
}

/**
 * 從 (firstPeriod @ first) 起連續 n 期：每期的期別與開獎時刻（UTC 毫秒）
 * 跨日沿用 +1；跨年從 (民國年)000001 重新起算
 */
export function consecutivePeriods(firstPeriod: string, first: Slot, n: number): { period: string; slot: Slot; drawMs: number }[] {
  const out = [{ period: firstPeriod, slot: first, drawMs: drawMs(first.date, first.index) }];
  for (let i = 1; i < n; i++) {
    const prev = out[i - 1];
    const slot = nextSlot(prev.slot);
    const period = slot.date.slice(0, 4) === prev.slot.date.slice(0, 4)
      ? String(Number(prev.period) + 1)
      : String(rocYear(slot.date) * 1_000_000 + slot.index);
    out.push({ period, slot, drawMs: drawMs(slot.date, slot.index) });
  }
  return out;
}

export async function getRound(env: ArcadeEnv): Promise<Round> {
  const now = await arcadeNow(env);
  let date = tpeDate(now);
  const sod = tpeSecOfDay(now);
  let index: number;
  if (sod < FIRST_DRAW_SEC) index = 1;
  else index = Math.floor((sod - FIRST_DRAW_SEC) / DRAW_INTERVAL_SEC) + 2;
  if (index > DRAWS_PER_DAY) {
    date = nextDate(date);
    index = 1;
  }
  const dMs = drawMs(date, index);
  const closesMs = dMs - CLOSE_BEFORE_MS;

  let period: string | null = null;
  const latest = await latestKnownDraw(env);
  const parsed = latest ? parseDrawTime(latest.drawTime) : null;
  if (latest && parsed) period = periodAt(String(latest.period), parsed, { date, index });
  return {
    period,
    drawTime: nowIso(dMs),
    closesAt: nowIso(closesMs),
    serverNow: nowIso(now),
    open: period !== null && now < closesMs,
  };
}
