/** 台北時間工具（UTC+8 固定、無日光節約） */

const TPE_OFFSET_MS = 8 * 3600 * 1000;
export const FIRST_DRAW_SEC = (7 * 60 + 5) * 60; // 07:05
export const LAST_DRAW_SEC = (23 * 60 + 55) * 60; // 23:55
export const DRAW_INTERVAL_SEC = 300;
export const DRAWS_PER_DAY = (LAST_DRAW_SEC - FIRST_DRAW_SEC) / DRAW_INTERVAL_SEC + 1; // 203
export const CLOSE_BEFORE_MS = 30_000;

const pad = (n: number) => String(n).padStart(2, '0');

/** 台北日期 YYYY-MM-DD */
export function tpeDate(ms: number): string {
  const d = new Date(ms + TPE_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 台北當日已過秒數 */
export function tpeSecOfDay(ms: number): number {
  const d = new Date(ms + TPE_OFFSET_MS);
  return d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
}

/** 台北日期 + 當日秒數 → UTC 毫秒 */
export function tpeToUtcMs(dateStr: string, sec: number): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d) + sec * 1000 - TPE_OFFSET_MS;
}

/** 隔天的台北日期 */
export function nextDate(dateStr: string): string {
  return tpeDate(tpeToUtcMs(dateStr, 12 * 3600) + 86400_000);
}

/** 台北 ISO 週 key，例 2026-W46（週一起算） */
export function weekKey(ms: number): string {
  const d = new Date(ms + TPE_OFFSET_MS);
  const day = d.getUTCDay() || 7; // 週一=1 … 週日=7
  const th = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 4 - day)); // 該週週四
  const yearStart = Date.UTC(th.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((th.getTime() - yearStart) / 86400_000 + 1) / 7);
  return `${th.getUTCFullYear()}-W${pad(week)}`;
}

/** 台北月份 key，例 2026-11 */
export function monthKey(ms: number): string {
  return tpeDate(ms).slice(0, 7);
}

/** 第 index 期（1 起）的開獎 UTC 毫秒 */
export function drawMs(dateStr: string, index: number): number {
  return tpeToUtcMs(dateStr, FIRST_DRAW_SEC + (index - 1) * DRAW_INTERVAL_SEC);
}

/**
 * 解析 KV 內的 drawTime（台北當地時間字串，如 2026-03-17T15:05:00）
 * 回傳 { date, index }；非整點期或格式不符回 null
 */
export function parseDrawTime(drawTime: string | null | undefined): { date: string; index: number } | null {
  if (!drawTime) return null;
  const m = drawTime.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/);
  if (!m || m[1].startsWith('0001') || m[1].startsWith('0000')) return null;
  const sec = parseInt(m[2], 10) * 3600 + parseInt(m[3], 10) * 60;
  const off = sec - FIRST_DRAW_SEC;
  if (off < 0 || off % DRAW_INTERVAL_SEC !== 0) return null;
  const index = off / DRAW_INTERVAL_SEC + 1;
  if (index > DRAWS_PER_DAY) return null;
  return { date: m[1], index };
}
