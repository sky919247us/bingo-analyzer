/** 賓果娛樂機 Worker 環境變數（與既有 Env 合併使用） */
export interface ArcadeEnv {
  BINGO_KV: KVNamespace;
  ARCADE_DB: D1Database;
  LINE_CHANNEL_ID?: string;
  LINE_CHANNEL_SECRET?: string;
  LINE_CALLBACK_URL?: string;
  /** 逗號分隔的 LINE userId */
  ADMIN_LINE_IDS?: string;
  /** 只有本地測試可設為 "1"；正式環境絕不可設 */
  ARCADE_DEV_LOGIN?: string;
}

export interface UserRow {
  id: number;
  line_id: string;
  name: string;
  avatar: string | null;
  coins: number;
  tickets: number;
  agreed_at: string | null;
  created_at: string;
}

export interface BetDbRow {
  id: number;
  order_id: string;
  /** 多期投注群組（0002 migration 新增；舊資料為 NULL） */
  group_id: string | null;
  user_id: number;
  period: string;
  game: string;
  star: number | null;
  numbers: string | null;
  pick: string | null;
  multiplier: number;
  cost_coins: number;
  cost_tickets: number;
  status: 'pending' | 'settled';
  hits: number | null;
  payout: number | null;
  created_at: string;
  /** 預定開獎時刻 UTC ISO（0004 migration 新增；舊資料為 NULL） */
  draw_at: string | null;
  /** 1 = 超過 72 小時拿不到官方結果、已原額退款（status 同時為 settled） */
  refunded: number;
}

/** 一期的官方開獎結果 */
export interface DrawResult {
  period: string;
  numbers: number[];
  superNumber: number;
  /** 實際開出順序（若有則第 20 顆為超級獎號） */
  openOrder?: number[];
}

export function isDev(env: ArcadeEnv): boolean {
  return env.ARCADE_DEV_LOGIN === '1';
}
