-- 中獎跑馬燈：只記錄「真實玩家」結算後達門檻的中獎（由 settle.ts 寫入，不可手動灌資料）
-- 每「使用者 × 期別」最多一則（同期多注合併）；UNIQUE 作為冪等的最後防線
-- masked_name 於寫入時就遮罩，API 永不回傳原名、user_id、avatar
CREATE TABLE feed_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  type         TEXT    NOT NULL CHECK (type IN ('win', 'bigwin')),
  user_id      INTEGER NOT NULL REFERENCES users (id),
  masked_name  TEXT    NOT NULL,
  period       TEXT    NOT NULL,
  game         TEXT    NOT NULL,          -- 玩法摘要，例：「5 星全中」「超級獎號命中」
  payout       INTEGER NOT NULL,          -- 該期該玩家總派彩
  ratio        REAL    NOT NULL,          -- 總派彩 ÷ 總下注
  hidden       INTEGER NOT NULL DEFAULT 0, -- 管理員隱藏（例：名字不雅）
  created_at   TEXT    NOT NULL,
  UNIQUE (user_id, period)
);
CREATE INDEX idx_feed_created ON feed_events (created_at);
CREATE INDEX idx_feed_visible ON feed_events (hidden, id DESC);
