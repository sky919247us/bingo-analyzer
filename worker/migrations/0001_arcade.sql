-- 賓果娛樂機（虛擬代幣，不可購買／兌換／轉帳）D1 結構
-- coins／tickets 加 CHECK 作為最後一道防線：任何讓餘額變負的 UPDATE 都會讓整個 batch 失敗回滾

CREATE TABLE users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  line_id     TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL DEFAULT '',
  avatar      TEXT,
  coins       INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),
  tickets     INTEGER NOT NULL DEFAULT 0 CHECK (tickets >= 0),
  agreed_at   TEXT,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);
CREATE INDEX idx_users_coins ON users (coins DESC);
CREATE INDEX idx_users_name  ON users (name);

-- 登入 session：只存 token 的 sha256
CREATE TABLE sessions (
  token_hash  TEXT    PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users (id),
  created_at  TEXT    NOT NULL,
  expires_at  TEXT    NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions (user_id);

-- 帳本：所有餘額異動都寫一筆（amount 有正負）
-- type: signup | checkin | rescue | bet | payout | admin_grant
CREATE TABLE ledger (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users (id),
  type         TEXT    NOT NULL,
  currency     TEXT    NOT NULL CHECK (currency IN ('coins', 'tickets')),
  amount       INTEGER NOT NULL,
  ref          TEXT,
  note         TEXT,
  operator_id  INTEGER,
  created_at   TEXT    NOT NULL
);
CREATE INDEX idx_ledger_user ON ledger (user_id, id DESC);
CREATE INDEX idx_ledger_type ON ledger (type, id DESC);

-- 下注單（一次 POST /api/bets 為一張 order，作為扣款與寫入注單的原子守衛）
CREATE TABLE bet_orders (
  id           TEXT    PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users (id),
  period       TEXT    NOT NULL,
  cost_coins   INTEGER NOT NULL,
  cost_tickets INTEGER NOT NULL,
  created_at   TEXT    NOT NULL
);

CREATE TABLE bets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     TEXT    NOT NULL REFERENCES bet_orders (id),
  user_id      INTEGER NOT NULL REFERENCES users (id),
  period       TEXT    NOT NULL,
  game         TEXT    NOT NULL CHECK (game IN ('basic', 'super', 'bigSmall', 'oddEven')),
  star         INTEGER,
  numbers      TEXT,               -- JSON 陣列
  pick         TEXT,
  multiplier   INTEGER NOT NULL,
  cost_coins   INTEGER NOT NULL,
  cost_tickets INTEGER NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'settled')),
  hits         INTEGER,
  payout       INTEGER,
  created_at   TEXT    NOT NULL,
  settled_at   TEXT
);
CREATE INDEX idx_bets_user_period ON bets (user_id, period);
CREATE INDEX idx_bets_status_period ON bets (status, period);
CREATE INDEX idx_bets_user_id ON bets (user_id, id DESC);

-- 每人每期的結算彙總（統計更新的冪等守衛）
CREATE TABLE user_periods (
  user_id    INTEGER NOT NULL,
  period     TEXT    NOT NULL,
  bet_count  INTEGER NOT NULL,
  cost       INTEGER NOT NULL,
  payout     INTEGER NOT NULL,
  applied    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL,
  PRIMARY KEY (user_id, period)
);

-- 統計（net 只含 派彩 − 下注成本；簽到／救濟／發幣不計）
CREATE TABLE user_stats (
  user_id        INTEGER PRIMARY KEY REFERENCES users (id),
  total_net      INTEGER NOT NULL DEFAULT 0,
  week_net       INTEGER NOT NULL DEFAULT 0,
  week_key       TEXT    NOT NULL DEFAULT '',
  month_net      INTEGER NOT NULL DEFAULT 0,
  month_key      TEXT    NOT NULL DEFAULT '',
  max_win        INTEGER NOT NULL DEFAULT 0,
  cur_streak     INTEGER NOT NULL DEFAULT 0,
  max_streak     INTEGER NOT NULL DEFAULT 0,
  total_bets     INTEGER NOT NULL DEFAULT 0,
  total_wagered  INTEGER NOT NULL DEFAULT 0,
  updated_at     TEXT
);
CREATE INDEX idx_stats_total  ON user_stats (total_net DESC);
CREATE INDEX idx_stats_week   ON user_stats (week_key, week_net DESC);
CREATE INDEX idx_stats_month  ON user_stats (month_key, month_net DESC);
CREATE INDEX idx_stats_maxwin ON user_stats (max_win DESC);
CREATE INDEX idx_stats_streak ON user_stats (max_streak DESC);

-- 每日領取（簽到／救濟），day 為台北日期
CREATE TABLE daily_claims (
  user_id    INTEGER NOT NULL,
  day        TEXT    NOT NULL,
  kind       TEXT    NOT NULL CHECK (kind IN ('checkin', 'rescue')),
  amount     INTEGER NOT NULL,
  applied    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL,
  PRIMARY KEY (user_id, day, kind)
);

CREATE TABLE meta (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
