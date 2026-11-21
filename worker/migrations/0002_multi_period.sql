-- 多期投注（連續投注 N 期）
-- 同一次下注的 N 期共用一個 group_id；每期各一張 bet_orders 與各自的 bets（各期獨立結算）
-- 舊資料 group_id 為 NULL，查詢時以 order_id 代替（單期下注即一個群組）
ALTER TABLE bet_orders ADD COLUMN group_id TEXT;
ALTER TABLE bets ADD COLUMN group_id TEXT;
CREATE INDEX idx_bet_orders_group ON bet_orders (group_id);
CREATE INDEX idx_bets_user_status ON bets (user_id, status, period);
