# 賓果娛樂機後端：上線前要自己做的步驟

代幣（coins／tickets）是虛擬的，不能購買、兌換、轉帳。後端沒有任何儲值或轉帳端點，以後也不要加。

## 1. 建 LINE Login channel
1. 到 LINE Developers Console 建一個 Provider，再建 **LINE Login** channel（App type 選 Web app）。
2. 在 LINE Login 分頁的 **Callback URL** 填：
   `https://bingo-kv-worker.sky919247us.workers.dev/api/auth/line/callback`
   （如果 Worker 綁了自訂網域，就填那個網域；這個值必須和 `LINE_CALLBACK_URL` 完全一樣）
3. 記下 **Channel ID** 和 **Channel secret**。scope 只用 `openid profile`，不必申請 email 權限。
4. Channel 要切成 **Published**，不然只有開發者帳號能登入。

## 2. 建 D1 資料庫（會在 Cloudflare 雲端建立資源）
```bash
cd worker
npx wrangler d1 create bingo-arcade
```
把輸出的 `database_id` 填到 `wrangler.toml` 的 `REPLACE_WITH_REAL_ID`。

## 3. 套用 migration
```bash
npx wrangler d1 migrations apply bingo-arcade --remote
```
目前共 0001～0004。`0004_p2.sql`（每日任務、成就、刪除帳號、draw_results、注單 draw_at／refunded）是 2026-11-20 新增的，已上線的 D1 要再跑一次這條指令。

## 4. 設定 secrets
```bash
npx wrangler secret put LINE_CHANNEL_ID
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put LINE_CALLBACK_URL     # 和第 1 步填的 Callback URL 相同
npx wrangler secret put ADMIN_LINE_IDS        # 管理員的 LINE userId（U 開頭），多個用逗號分隔
```
管理員的 LINE userId 可以先登入一次，再到 D1 查 `SELECT id, name, line_id FROM users;` 取得。

> ⚠️ **正式環境絕對不可設定 `ARCADE_DEV_LOGIN`。** 設了之後 `/api/dev/login` 能免密碼登入任何帳號（包括管理員），`/api/dev/state` 和 `/api/dev/settle` 也能竄改時鐘和開獎結果。沒設的時候這三個路徑一律回 404。

## 5. 部署
```bash
npx wrangler deploy
```
部署後檢查：
- `GET /api/round` 回 JSON
- `GET /api/kv/latest` 和以前一樣
- 前端按「LINE 登入」能回到 `#/bingo-arcade?login_code=...`

## 本地開發／測試
```bash
cd worker
cp .dev.vars.example .dev.vars        # 填入值；.dev.vars 已被 .gitignore 排除
npx wrangler d1 migrations apply bingo-arcade --local
npx wrangler kv key put today_draws --path test/seed-today-draws.json --binding BINGO_KV --local
npx wrangler dev --local --port 8787 --var ARCADE_DEV_LOGIN:1 --var ADMIN_LINE_IDS:Uadmin0001 \
  --var LINE_CHANNEL_ID:test-channel --var LINE_CALLBACK_URL:http://127.0.0.1:8787/api/auth/line/callback
node test/arcade-smoke.mjs && node test/arcade-smoke-p2.mjs
```
冒煙測試需要乾淨的本地 D1。重跑前先**停掉 wrangler dev**（否則 D1 檔案被鎖住刪不掉），再刪 `.wrangler/state/v3/d1`，重新 apply migration 與 kv put。
`arcade-smoke-p2.mjs` 要接在 `arcade-smoke.mjs` 後面跑，它涵蓋每日任務、成就、刪除帳號、首期與跨日／跨年、draw_results 結算、72 小時退款。

dev 專用端點（只有設 `ARCADE_DEV_LOGIN=1` 才存在，正式環境一律 404）：
- `POST /api/dev/kv` `{ todayDraws: {draws:[...]} | null, todayDate? }`：寫入或刪除 KV 的 `today_draws`
- `POST /api/dev/cron` `{ backfill?: boolean, ingestOnly?: boolean }`：執行排程中娛樂機的部分（`settleFromKv`）。dev 預設 `backfill=false`，不會連到台彩

## P2 端點（都要登入）
- `GET /api/missions`、`POST /api/missions/claim {code}`：每日任務。獎勵記在 ledger 的 `mission` 型別，不計入淨收益
- `GET /api/achievements`：成就徽章，不發幣
- `POST /api/me/delete {confirm:"DELETE"}`：刪除帳號。會把 sha256(line_id) 記進 `deleted_accounts`，同一個 LINE 重新註冊時註冊金是 0
- 連莊沿用 `/api/me` 原本的 `stats.curStreak`、`stats.maxStreak`

## 期別連續性（2026-11-20 用 `public/data/賓果賓果_2014~2026.csv` 查證）
- 同一個民國年內，隔日第 1 期一定等於前一日最後一期 + 1：可比對的 4,765 組相鄰日全部成立。唯一的例外是 CSV 缺了 2026/02 整個月，但缺口前後的期別差仍然等於 33 天 × 203 期，算術上一致。
- 跨年會重置：每年 1/1 第 1 期 = (民國年)000001，例如 2025/12/31 最後一期 114074095，2026/01/01 第一期 115000001。2014～2026 的 13 次跨年全部成立。
- 少數日子期數不足 203：2023/12/31 只有 180 期，2017/07/01 和 2018/03/29 的 CSV 各缺 1 列。

## 已知限制
- **多期投注（`periods`）**：只接受官方選項 1~10、12 期（`worker/src/arcade/bets.ts` 的 `ALLOWED_PERIODS`，前端 `src/arcade/multi.ts` 的 `PERIOD_OPTIONS` 要同步改）。**可以跨日、跨年**：同年 +1，跨年從 (民國年)000001 起算，見 `round.ts` 的 `consecutivePeriods`。`TOO_MANY_PERIODS` 已經不會再出現。
- **當日第 1 期（07:05）開放下注。** 推算依據是「最後已知期別」：先看 KV `today_draws`，沒有就看 D1 的 `meta.last_draw`（只會往前更新）。已知期必須是同一天或前一天；更舊就不推算，回傳 `period=null`，停止下注。
- 期別推算假設每天都開滿 203 期。如果某天提早收班或中途停開（例如 2023/12/31 只開了 180 期），之後推出來的期別會跟實際時刻錯開，或是那幾期根本不會開出來。開不出來的期別會在 72 小時後自動退款。
- **結算一律以 D1 的 `draw_results` 為準**：排程每次都把 KV 的結果寫進這張表，所以 KV 清空後也能結算。開獎後超過 10 分鐘還沒有結果，排程會依日期向台彩 `BingoResult?openDate=` 補撈，每個日期 10 分鐘最多查一次。超過 72 小時仍沒有官方結果，就把 coins、tickets 原額退回（ledger 型別 `refund`，注單標成 `status='settled'`、`refunded=1`），不計入淨收益。
- 0004 之前的舊注單沒有 `draw_at`，補撈和退款的門檻改用 `created_at` 計算，門檻會提早，最多約 1 小時。
- 「同一組不可重複預約」只在前端擋，後端只檢查每期 20 項上限。
- 每日任務的「注」以注單列數計算（一個超級獎號 item 算 1 注），跟 `stats.totalBets` 的算法相同。
