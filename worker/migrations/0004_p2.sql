-- 賓果娛樂機 P2：每日任務、成就、刪除帳號防洗幣、開獎結果持久化、跨日／兜底退款
-- 只新增資料表與欄位，不改既有 CHECK（bets.status 仍只有 pending/settled；退款以 settled + refunded = 1 表示）

-- 每日任務領取（day 為台北日期）；PK 保證同一天同一任務只能領一次，applied 為發放守衛
CREATE TABLE mission_claims (
  user_id    INTEGER NOT NULL,
  day        TEXT    NOT NULL,
  code       TEXT    NOT NULL,
  reward     INTEGER NOT NULL,
  applied    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL,
  PRIMARY KEY (user_id, day, code)
);

-- 成就徽章（只有徽章，不發幣）
CREATE TABLE user_achievements (
  user_id     INTEGER NOT NULL,
  code        TEXT    NOT NULL,
  unlocked_at TEXT    NOT NULL,
  PRIMARY KEY (user_id, code)
);

-- 刪除過的帳號：line_hash = sha256(line_id)；同一 LINE 重新註冊不再送註冊金
CREATE TABLE deleted_accounts (
  line_hash  TEXT PRIMARY KEY,
  deleted_at TEXT NOT NULL
);

-- 官方開獎結果（只由 Worker 自己抓到的 KV today_draws／台彩 BingoResult 寫入）
CREATE TABLE draw_results (
  period       TEXT    PRIMARY KEY,
  draw_date    TEXT,               -- 台北日期 YYYY-MM-DD
  draw_time    TEXT,               -- 台北當地時間 YYYY-MM-DDTHH:MM:SS（台彩歷史 API 不提供時為 NULL）
  numbers      TEXT    NOT NULL,   -- JSON 陣列（20 顆，大小順序）
  open_order   TEXT,               -- JSON 陣列（開出順序，可能為 NULL）
  super_number INTEGER NOT NULL,
  big_small    TEXT,               -- 大／小／和
  odd_even     TEXT,               -- 單／雙／和
  source       TEXT    NOT NULL,   -- kv | tlc_history
  fetched_at   TEXT    NOT NULL
);
CREATE INDEX idx_draw_results_date ON draw_results (draw_date);

-- 注單：預定開獎時刻（UTC ISO，用於補撈與 72 小時兜底退款）、退款標記
ALTER TABLE bet_orders ADD COLUMN draw_at TEXT;
ALTER TABLE bets ADD COLUMN draw_at TEXT;
ALTER TABLE bets ADD COLUMN refunded INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_bets_status_draw_at ON bets (status, draw_at);
CREATE INDEX idx_bets_user_created ON bets (user_id, created_at);
