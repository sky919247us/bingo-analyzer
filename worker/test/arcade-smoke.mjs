// 賓果娛樂機 Worker 冒煙測試（node 原生 fetch）
// 前置：
//   1. npx wrangler d1 migrations apply bingo-arcade --local
//   2. npx wrangler kv key put today_draws --path test/seed-today-draws.json --binding BINGO_KV --local
//   3. npx wrangler dev --local --port 8787 --var ARCADE_DEV_LOGIN:1 --var ADMIN_LINE_IDS:Uadmin0001 \
//        --var LINE_CHANNEL_ID:test-channel --var LINE_CALLBACK_URL:http://127.0.0.1:8787/api/auth/line/callback
//   4. node test/arcade-smoke.mjs   （BASE 可用環境變數 ARCADE_BASE 覆寫）
// 需要乾淨的本地 D1（重跑前刪 .wrangler/state/v3/d1 再 apply migration；含 0002_multi_period、0003_feed）
// 可加 --persist-to <目錄> 用獨立的本地狀態（migrations apply / kv put / dev 三者都要加同一個目錄）

const BASE = process.env.ARCADE_BASE ?? 'http://127.0.0.1:8787';
let pass = 0;
const fails = [];

function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fails.push(name); console.log(`  ✘ ${name}`, detail === undefined ? '' : JSON.stringify(detail)); }
}

async function call(method, path, { token, body, origin, redirect } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (origin) headers.Origin = origin;
  const r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: redirect ?? 'follow' });
  let data = null;
  const text = await r.text();
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data, headers: r.headers };
}

const T = (taipei) => new Date(taipei + '+08:00').toISOString(); // 台北時間 → ISO
const ODD = Array.from({ length: 20 }, (_, i) => i * 2 + 1); // 1,3,…,39：小、單；超級獎號 39
const P37 = '115000037', P38 = '115000038', P39 = '115000039';

async function setState(now, latestDraw) {
  const r = await call('POST', '/api/dev/state', { body: { now, latestDraw } });
  return r.data.round;
}

async function main() {
  console.log('# 公開端點／CORS');
  const pre = await call('OPTIONS', '/api/bets', { origin: 'http://localhost:5173' });
  check('OPTIONS 預檢 204 且回允許 origin', pre.status === 204 && pre.headers.get('access-control-allow-origin') === 'http://localhost:5173', pre.status);
  check('預檢含 Authorization, Content-Type', (pre.headers.get('access-control-allow-headers') ?? '').includes('Authorization'));
  const evil = await call('GET', '/api/round', { origin: 'https://evil.example.com' });
  check('非白名單 origin 不回 ACAO', evil.headers.get('access-control-allow-origin') === null);
  const ls1 = await call('GET', '/api/auth/line/start?return_to=' + encodeURIComponent('https://bingo.i168.win.evil.com/#/x'), { redirect: 'manual' });
  check('line/start 拒絕前綴偽造的 return_to (400)', ls1.status === 400, ls1);
  const ls2 = await call('GET', '/api/auth/line/start?return_to=' + encodeURIComponent('https://bingo.i168.win/#/bingo-arcade'), { redirect: 'manual' });
  const loc = ls2.headers.get('location') ?? '';
  check('line/start 302 到 LINE 授權頁且帶 PKCE S256', ls2.status === 302 && loc.startsWith('https://access.line.me/oauth2/v2.1/authorize') && loc.includes('code_challenge_method=S256') && loc.includes('scope=openid+profile'), loc);
  const ex = await call('POST', '/api/auth/exchange', { body: { code: '0'.repeat(32) } });
  check('exchange 無效 code → 400', ex.status === 400, ex.data);
  const meAnon = await call('GET', '/api/me');
  check('未登入 /api/me → 401', meAnon.status === 401);

  console.log('# 期別判定');
  // 台北 10:03，已知最新期 115000036 @10:00 → 下一期 037 @10:05，10:04:30 截止
  let round = await setState(T('2026-11-11T10:03:00'), { period: '115000036', drawTime: '2026-11-11T10:00:00' });
  check('round.period = 已知最新 +1', round.period === P37 && round.open === true, round);
  check('closesAt = drawTime − 30 秒', Date.parse(round.drawTime) - Date.parse(round.closesAt) === 30000 && round.drawTime === T('2026-11-11T10:05:00'), round);
  const nightRound = await setState(T('2026-11-11T23:58:00'), { period: '115000203', drawTime: '2026-11-11T23:55:00' });
  // 2026-11-20 起開放首期與跨日：隔日第 1 期 = 前一日最後一期 + 1（public/data CSV 查證）
  check('收班後：明日 07:05 首期可下注、period=203+1', nightRound.period === '115000204' && nightRound.open === true && nightRound.drawTime === T('2026-11-12T07:05:00'), nightRound);
  round = await setState(T('2026-11-11T10:03:00'), { period: '115000036', drawTime: '2026-11-11T10:00:00' });

  console.log('# 註冊／同意／簽到');
  const A = await call('POST', '/api/dev/login', { body: { lineId: 'Ualice0001', name: 'Alice' } });
  const ta = A.data.token;
  check('新用戶 10,000 coins', A.data.user.coins === 10000 && A.data.user.tickets === 0, A.data.user);
  const betBeforeAgree = await call('POST', '/api/bets', { token: ta, body: { period: P37, multiplier: 1, items: [{ game: 'bigSmall', pick: '大' }] } });
  check('agree 前下注 403 NOT_AGREED', betBeforeAgree.status === 403 && betBeforeAgree.data.code === 'NOT_AGREED', betBeforeAgree.data);
  const ciBefore = await call('POST', '/api/checkin', { token: ta });
  check('agree 前簽到 403 NOT_AGREED', ciBefore.status === 403 && ciBefore.data.code === 'NOT_AGREED');
  const ag = await call('POST', '/api/agree', { token: ta });
  check('agree 後 agreedAt 有值、回 me 格式', ag.status === 200 && typeof ag.data.user.agreedAt === 'string' && ag.data.stats && ag.data.today, ag.data);
  const ci1 = await call('POST', '/api/checkin', { token: ta });
  check('簽到成功 +500', ci1.status === 200 && ci1.data.granted === 500 && ci1.data.coins === 10500, ci1.data);
  const ci2 = await call('POST', '/api/checkin', { token: ta });
  check('第二次簽到 409 ALREADY', ci2.status === 409 && ci2.data.code === 'ALREADY', ci2.data);
  const rsA = await call('POST', '/api/rescue', { token: ta });
  check('餘額充足領救濟 409 NOT_ELIGIBLE', rsA.status === 409 && rsA.data.code === 'NOT_ELIGIBLE', rsA.data);

  console.log('# 管理員');
  const ADM = await call('POST', '/api/dev/login', { body: { lineId: 'Uadmin0001', name: 'Admin' } });
  const tadm = ADM.data.token;
  check('ADMIN_LINE_IDS 內的使用者 isAdmin=true', ADM.data.user.isAdmin === true && A.data.user.isAdmin === false);
  const na = await call('GET', '/api/admin/users', { token: ta });
  check('非管理員 admin/users 403 FORBIDDEN', na.status === 403 && na.data.code === 'FORBIDDEN', na.data);
  const ng = await call('POST', '/api/admin/grant', { token: ta, body: { userId: A.data.user.id, currency: 'coins', amount: 1, reason: 'x' } });
  check('非管理員 admin/grant 403', ng.status === 403);
  const nl = await call('GET', '/api/admin/ledger', { token: ta });
  check('非管理員 admin/ledger 403', nl.status === 403);
  const badGrant = await call('POST', '/api/admin/grant', { token: tadm, body: { userId: A.data.user.id, currency: 'tickets', amount: 0, reason: 'x' } });
  check('amount=0 被拒 400', badGrant.status === 400);
  const noReason = await call('POST', '/api/admin/grant', { token: tadm, body: { userId: A.data.user.id, currency: 'tickets', amount: 100, reason: '' } });
  check('reason 空白被拒 400', noReason.status === 400);
  const gr = await call('POST', '/api/admin/grant', { token: tadm, body: { userId: A.data.user.id, currency: 'tickets', amount: 100, reason: '活動獎勵' } });
  check('管理員發 100 tickets', gr.status === 200 && gr.data.tickets === 100 && gr.data.coins === 10500, gr.data);
  const led = await call('GET', `/api/admin/ledger?userId=${A.data.user.id}`, { token: tadm });
  const grantRow = (led.data.rows ?? []).find((r) => r.type === 'admin_grant');
  check('ledger 有 admin_grant 且記 operatorId', grantRow && grantRow.amount === 100 && grantRow.currency === 'tickets' && grantRow.operatorId === ADM.data.user.id && grantRow.note === '活動獎勵' && grantRow.userName === 'Alice', grantRow);
  const au = await call('GET', '/api/admin/users?q=Ali', { token: tadm });
  check('admin/users 以名稱搜尋', au.status === 200 && au.data.users.length === 1 && au.data.users[0].name === 'Alice', au.data);

  console.log('# 下注驗證');
  const badMul = await call('POST', '/api/bets', { token: ta, body: { period: P37, multiplier: 7, items: [{ game: 'bigSmall', pick: '大' }] } });
  check('倍數 7 被拒 400', badMul.status === 400, badMul.data);
  const badStar = await call('POST', '/api/bets', { token: ta, body: { period: P37, multiplier: 1, items: [{ game: 'basic', star: 3, numbers: [1, 2] }] } });
  check('星數與號碼數不符被拒 400', badStar.status === 400, badStar.data);
  const badNum = await call('POST', '/api/bets', { token: ta, body: { period: P37, multiplier: 1, items: [{ game: 'basic', star: 1, numbers: [81] }] } });
  check('號碼 81 被拒 400', badNum.status === 400);
  const badPick = await call('POST', '/api/bets', { token: ta, body: { period: P37, multiplier: 1, items: [{ game: 'oddEven', pick: '大' }] } });
  check('oddEven pick=大 被拒 400', badPick.status === 400);
  const wp = await call('POST', '/api/bets', { token: ta, body: { period: '115000099', multiplier: 1, items: [{ game: 'bigSmall', pick: '大' }] } });
  check('錯誤期別 409 WRONG_PERIOD', wp.status === 409 && wp.data.code === 'WRONG_PERIOD', wp.data);
  await setState(T('2026-11-11T10:04:45'));
  const closed = await call('POST', '/api/bets', { token: ta, body: { period: P37, multiplier: 1, items: [{ game: 'bigSmall', pick: '大' }] } });
  check('截止後 409 CLOSED', closed.status === 409 && closed.data.code === 'CLOSED', closed.data);
  await setState(T('2026-11-11T10:03:00'));

  console.log('# 下注扣款（tickets 優先）');
  // 7 注 × 25 × 2 = 350；先扣 100 tickets，再扣 250 coins
  const itemsA = [
    { game: 'basic', star: 3, numbers: [1, 3, 5] }, // 中 3 → 500×2 = 1000
    { game: 'basic', star: 1, numbers: [2] },       // 0
    { game: 'super', numbers: [39, 2] },             // 2 注，中超級獎號 → 1200×2 = 2400
    { game: 'bigSmall', pick: '小' },                // 150×2 = 300
    { game: 'oddEven', pick: '單' },                 // 300
    { game: 'oddEven', pick: '雙' },                 // 0
  ];
  const bA = await call('POST', '/api/bets', { token: ta, body: { period: P37, multiplier: 2, items: itemsA } });
  check('下注成功 cost = {coins:250, tickets:100}', bA.status === 200 && bA.data.cost.coins === 250 && bA.data.cost.tickets === 100, bA.data);
  check('餘額 coins 10250 / tickets 0', bA.data.balance?.coins === 10250 && bA.data.balance?.tickets === 0, bA.data.balance);
  check('BetRow 格式', bA.data.bets?.length === 6 && bA.data.bets[0].status === 'pending' && bA.data.bets[0].star === 3 && Array.isArray(bA.data.bets[0].numbers) && bA.data.bets[3].pick === '小' && bA.data.bets[3].numbers === null && bA.data.bets[0].costTickets === 50, bA.data.bets?.[0]);

  const B = await call('POST', '/api/dev/login', { body: { lineId: 'Ubob00001', name: 'Bob' } });
  const tb = B.data.token;
  await call('POST', '/api/agree', { token: tb });
  const insuff = await call('POST', '/api/bets', { token: tb, body: { period: P37, multiplier: 50, items: [{ game: 'super', numbers: Array.from({ length: 20 }, (_, i) => i + 41) }] } });
  check('餘額不足 409 INSUFFICIENT', insuff.status === 409 && insuff.data.code === 'INSUFFICIENT', insuff.data);
  const drain = await call('POST', '/api/bets', { token: tb, body: { period: P37, multiplier: 50, items: [2, 4, 6, 8, 10, 12, 14, 16].map((n) => ({ game: 'basic', star: 1, numbers: [n] })) } });
  check('Bob 押光 10,000', drain.status === 200 && drain.data.balance.coins === 0, drain.data);
  const rs1 = await call('POST', '/api/rescue', { token: tb });
  check('coins+tickets<25 救濟 +1000', rs1.status === 200 && rs1.data.granted === 1000 && rs1.data.coins === 1000, rs1.data);
  const rs2 = await call('POST', '/api/rescue', { token: tb });
  check('第二次救濟 409 ALREADY', rs2.status === 409 && rs2.data.code === 'ALREADY', rs2.data);
  const tooMany = await call('POST', '/api/bets', { token: tb, body: { period: P37, multiplier: 1, items: Array.from({ length: 13 }, (_, i) => ({ game: 'basic', star: 1, numbers: [i + 60] })) } });
  check('同期超過 20 item 被拒 409', tooMany.status === 409 && tooMany.data.code === 'TOO_MANY', tooMany.data);
  const meB0 = await call('GET', '/api/me', { token: tb });
  check('被拒的下注不扣款（Bob 仍 1000）', meB0.data.user.coins === 1000, meB0.data.user);

  console.log('# 結算（P37 由 KV 種子資料：1,3,…,39，超級獎號 39）');
  const g37 = await call('GET', `/api/bets?period=${P37}`, { token: ta });
  const pay = (g37.data.bets ?? []).map((b) => b.payout);
  check('GET /api/bets 當場從 KV 結算', g37.data.bets?.every((b) => b.status === 'settled'), g37.data);
  check('派彩 basic3中3=1000 / basic1=0 / super=2400 / 小=300 / 單=300 / 雙=0', JSON.stringify(pay) === JSON.stringify([1000, 0, 2400, 300, 300, 0]), pay);
  check('hits：basic 3 / super 1', g37.data.bets?.[0].hits === 3 && g37.data.bets?.[2].hits === 1);
  const meA1 = await call('GET', '/api/me', { token: ta });
  check('Alice coins = 10250 + 4000 = 14250', meA1.data.user.coins === 14250, meA1.data.user);
  const again = await call('POST', '/api/dev/settle', { body: { period: P37, numbers: ODD, superNumber: 39 } });
  const meA2 = await call('GET', '/api/me', { token: ta });
  check('同一期再結算：不重複派彩', again.data.summary?.betsSettled === 0 && meA2.data.user.coins === 14250, { s: again.data.summary, c: meA2.data.user.coins });
  const g37b = await call('GET', `/api/bets?period=${P37}`, { token: ta });
  const meA3 = await call('GET', '/api/me', { token: ta });
  check('再 GET 一次也不重複派彩', meA3.data.user.coins === 14250 && g37b.data.bets.length === 6);
  check('stats 第一期：net 3650、maxWin 4000、streak 1、totalBets 6、wagered 350', meA3.data.stats.totalNet === 3650 && meA3.data.stats.maxWin === 4000 && meA3.data.stats.curStreak === 1 && meA3.data.stats.totalBets === 6 && meA3.data.stats.totalWagered === 350, meA3.data.stats);

  console.log('# 連莊／淨收益（P38 中、P39 不中）');
  let r38 = await setState(T('2026-11-11T10:08:00'), { period: P37, drawTime: '2026-11-11T10:05:00' });
  check('下一期 = 038', r38.period === P38, r38);
  const b38 = await call('POST', '/api/bets', { token: ta, body: { period: P38, multiplier: 1, items: [{ game: 'bigSmall', pick: '小' }] } });
  check('P38 下注 25', b38.status === 200 && b38.data.cost.coins === 25, b38.data);
  // 41~60 → 大；用來驗 bigSmall 大/小 都有覆蓋：Alice 押小 → 不中？改用 ODD（小）讓她中
  const s38 = await call('POST', '/api/dev/settle', { body: { period: P38, numbers: ODD, superNumber: 1 } });
  check('P38 結算 1 注', s38.data.summary?.betsSettled === 1, s38.data);
  await setState(T('2026-11-11T10:13:00'), { period: P38, drawTime: '2026-11-11T10:10:00' });
  const BIG = Array.from({ length: 20 }, (_, i) => i + 41); // 41~60：大；單雙 10:10 和局
  const b39 = await call('POST', '/api/bets', { token: ta, body: { period: P39, multiplier: 1, items: [{ game: 'bigSmall', pick: '小' }, { game: 'oddEven', pick: '單' }] } });
  check('P39 下注 50', b39.status === 200 && b39.data.cost.coins === 50, b39.data);
  await call('POST', '/api/dev/settle', { body: { period: P39, numbers: BIG, superNumber: 60 } });
  const g39 = await call('GET', `/api/bets?period=${P39}`, { token: ta });
  check('P39：押小遇大=0、單雙和局=0', g39.data.bets.every((b) => b.status === 'settled' && b.payout === 0), g39.data.bets);
  const meA4 = await call('GET', '/api/me', { token: ta });
  // net = 3650 + (150−25) + (0−50) = 3725；coins = 14250 −25 +150 −50 = 14325
  check('coins 14325', meA4.data.user.coins === 14325, meA4.data.user);
  check('totalNet/weekNet/monthNet = 3725（不含簽到 500、發券 100）', meA4.data.stats.totalNet === 3725 && meA4.data.stats.weekNet === 3725 && meA4.data.stats.monthNet === 3725, meA4.data.stats);
  check('連莊：cur 0、max 2；maxWin 4000', meA4.data.stats.curStreak === 0 && meA4.data.stats.maxStreak === 2 && meA4.data.stats.maxWin === 4000, meA4.data.stats);
  check('today.checkedIn=true', meA4.data.today.checkedIn === true && meA4.data.today.rescued === false);
  const meB = await call('GET', '/api/me', { token: tb });
  check('Bob weekNet = −10000（不含救濟 1000）', meB.data.stats.weekNet === -10000 && meB.data.stats.totalNet === -10000 && meB.data.today.rescued === true, meB.data.stats);
  const recent = await call('GET', '/api/bets/recent?limit=3', { token: ta });
  check('bets/recent limit=3 新到舊', recent.data.bets.length === 3 && recent.data.bets[0].period === P39, recent.data.bets?.map((b) => b.period));

  console.log('# 排行榜');
  const expect = { rich: 14325, maxWin: 4000, week: 3725, month: 3725, streak: 2, total: 3725 };
  for (const type of ['rich', 'maxWin', 'week', 'month', 'streak', 'total']) {
    const lb = await call('GET', `/api/leaderboard?type=${type}&limit=50`, { token: ta });
    const rows = lb.data.rows ?? [];
    const shapeOk = lb.status === 200 && lb.data.type === type && rows.every((r, i) => r.rank === i + 1 && typeof r.userId === 'number' && typeof r.name === 'string' && 'avatar' in r && typeof r.value === 'number');
    check(`${type}：格式正確、Alice 第 1、me 正確`, shapeOk && rows[0]?.name === 'Alice' && rows[0]?.value === expect[type] && lb.data.me?.rank === 1 && lb.data.me?.value === expect[type], lb.data);
  }
  const lbAnon = await call('GET', '/api/leaderboard?type=week');
  check('未登入排行 me=null；week 不含未下注者', lbAnon.data.me === null && lbAnon.data.rows.length === 2, lbAnon.data);
  const lbBad = await call('GET', '/api/leaderboard?type=foo');
  check('未知 type 400', lbBad.status === 400);

  console.log('# ledger 完整性');
  const ledA = await call('GET', `/api/admin/ledger?userId=${A.data.user.id}&limit=100`, { token: tadm });
  const sumCoins = ledA.data.rows.filter((r) => r.currency === 'coins').reduce((a, r) => a + r.amount, 0);
  const sumTickets = ledA.data.rows.filter((r) => r.currency === 'tickets').reduce((a, r) => a + r.amount, 0);
  check('Alice ledger 加總 = 目前餘額（coins 14325、tickets 0）', sumCoins === 14325 && sumTickets === 0, { sumCoins, sumTickets });
  const types = new Set(ledA.data.rows.map((r) => r.type));
  check('ledger 類型含 signup/checkin/admin_grant/bet/payout', ['signup', 'checkin', 'admin_grant', 'bet', 'payout'].every((t) => types.has(t)), [...types]);

  console.log('# 既有 /api/kv/*');
  const kl = await call('GET', '/api/kv/latest');
  check('/api/kv/latest 格式不變、CORS *', kl.status === 200 && kl.data.success === true && kl.data.draw?.period === P37 && 'lastUpdated' in kl.data && kl.headers.get('access-control-allow-origin') === '*', kl.data);
  const kt = await call('GET', '/api/kv/today');
  check('/api/kv/today 格式不變', kt.status === 200 && kt.data.success === true && kt.data.count === 1 && Array.isArray(kt.data.draws), kt.data);
  const ko = await call('OPTIONS', '/api/kv/today');
  check('/api/kv/* OPTIONS 仍回 *', ko.headers.get('access-control-allow-origin') === '*');

  console.log('# 多期投注');
  const P40 = '115000040', P41 = '115000041', P42 = '115000042';
  const r40 = await setState(T('2026-11-11T10:18:00'), { period: P39, drawTime: '2026-11-11T10:15:00' });
  check('下一期 = 040', r40.period === P40 && r40.open === true, r40);
  const C = await call('POST', '/api/dev/login', { body: { lineId: 'Ucarol0001', name: 'Carol' } });
  const tc = C.data.token;
  await call('POST', '/api/agree', { token: tc });
  await call('POST', '/api/admin/grant', { token: tadm, body: { userId: C.data.user.id, currency: 'tickets', amount: 60, reason: '多期測試' } });
  const itemsC = [{ game: 'bigSmall', pick: '小' }, { game: 'basic', star: 1, numbers: [1] }];
  const badP0 = await call('POST', '/api/bets', { token: tc, body: { period: P40, multiplier: 1, items: itemsC, periods: 0 } });
  const badP13 = await call('POST', '/api/bets', { token: tc, body: { period: P40, multiplier: 1, items: itemsC, periods: 13 } });
  const badP15 = await call('POST', '/api/bets', { token: tc, body: { period: P40, multiplier: 1, items: itemsC, periods: 1.5 } });
  check('periods=0 / 13 / 1.5 被拒 400', badP0.status === 400 && badP13.status === 400 && badP15.status === 400, [badP0.status, badP13.status, badP15.status]);
  const badP11 = await call('POST', '/api/bets', { token: tc, body: { period: P40, multiplier: 1, items: itemsC, periods: 11 } });
  check('periods=11 不在官方選項內被拒 400', badP11.status === 400 && badP11.data.code === 'BAD_BET', badP11.data);
  // 用另一位使用者驗 12 期可下，避免影響 Carol 的數字
  const E = await call('POST', '/api/dev/login', { body: { lineId: 'Uerin00001', name: 'Erin' } });
  await call('POST', '/api/agree', { token: E.data.token });
  const okP12 = await call('POST', '/api/bets', { token: E.data.token, body: { period: P40, multiplier: 1, items: [{ game: 'bigSmall', pick: '大' }], periods: 12 } });
  check('periods=12 可下：12 筆、lastPeriod=051、扣 300', okP12.status === 200 && okP12.data.periods === 12 && okP12.data.bets.length === 12 && okP12.data.lastPeriod === '115000051' && okP12.data.cost.coins === 300, okP12.data);
  // 單期 50 × 3 期 = 150；先扣 60 tickets（第 1 期 50、第 2 期 10），再扣 90 coins
  const mC = await call('POST', '/api/bets', { token: tc, body: { period: P40, multiplier: 1, items: itemsC, periods: 3 } });
  check('3 期下注成功 cost = {coins:90, tickets:60}', mC.status === 200 && mC.data.cost.coins === 90 && mC.data.cost.tickets === 60, mC.data);
  check('回應 periods=3、lastPeriod=042、餘額 9910/0', mC.data.periods === 3 && mC.data.lastPeriod === P42 && mC.data.balance?.coins === 9910 && mC.data.balance?.tickets === 0, mC.data);
  const byP = (rows, p) => (rows ?? []).filter((b) => b.period === p);
  check('各期各一組（每期 2 筆，共 6 筆，同一 groupId）', mC.data.bets?.length === 6 && [P40, P41, P42].every((p) => byP(mC.data.bets, p).length === 2) && new Set(mC.data.bets.map((b) => b.groupId)).size === 1, mC.data.bets?.map((b) => b.period));
  const tk = (p) => byP(mC.data.bets, p).reduce((a, b) => a + b.costTickets, 0);
  const cc = (p) => byP(mC.data.bets, p).reduce((a, b) => a + b.costCoins, 0);
  check('活動券依期別分攤：P40 50券、P41 10券+40幣、P42 50幣', tk(P40) === 50 && cc(P40) === 0 && tk(P41) === 10 && cc(P41) === 40 && tk(P42) === 0 && cc(P42) === 50, { P40: [tk(P40), cc(P40)], P41: [tk(P41), cc(P41)], P42: [tk(P42), cc(P42)] });
  const single = await call('POST', '/api/bets', { token: tc, body: { period: P40, multiplier: 1, items: [{ game: 'oddEven', pick: '單' }] } });
  check('混合：同期再下單期 1 項（25 幣）', single.status === 200 && single.data.periods === 1 && single.data.lastPeriod === P40 && single.data.cost.coins === 25 && single.data.balance.coins === 9885, single.data);
  const over = await call('POST', '/api/bets', { token: tc, body: { period: P40, multiplier: 1, periods: 2, items: Array.from({ length: 18 }, (_, i) => ({ game: 'basic', star: 1, numbers: [i + 60] })) } });
  check('多期中任一期超過 20 item → 409 TOO_MANY', over.status === 409 && over.data.code === 'TOO_MANY', over.data);
  const meC0 = await call('GET', '/api/me', { token: tc });
  check('被拒的多期下注不扣款（Carol 仍 9885）', meC0.data.user.coins === 9885, meC0.data.user);
  const pend0 = await call('GET', '/api/bets/pending', { token: tc });
  check('pending：7 筆、3 期、期別舊→新', pend0.status === 200 && pend0.data.bets.length === 7 && pend0.data.periods === 3 && pend0.data.bets[0].period === P40 && pend0.data.bets[6].period === P42, pend0.data);
  const g41 = await call('GET', `/api/bets?period=${P41}`, { token: tc });
  check('GET /api/bets?period=041 回 2 筆 pending', g41.data.bets?.length === 2 && g41.data.bets.every((b) => b.status === 'pending'), g41.data);
  const pendAnon = await call('GET', '/api/bets/pending');
  check('未登入 pending → 401', pendAnon.status === 401);

  // P40：ODD（小、單、1 在其中）→ 小 150 + 1星 50 + 單 150 = 350；成本 50+25 = 75 → net +275
  await call('POST', '/api/dev/settle', { body: { period: P40, numbers: ODD, superNumber: 39 } });
  const meC1 = await call('GET', '/api/me', { token: tc });
  check('P40 結算後：coins 10235、net 275（成本只算 P40 那期）', meC1.data.user.coins === 10235 && meC1.data.stats.totalNet === 275 && meC1.data.stats.curStreak === 1 && meC1.data.stats.totalWagered === 75, { u: meC1.data.user, s: meC1.data.stats });
  const pend1 = await call('GET', '/api/bets/pending', { token: tc });
  check('P40 結算後 pending 剩 4 筆、2 期', pend1.data.bets.length === 4 && pend1.data.periods === 2 && pend1.data.bets.every((b) => b.period !== P40), pend1.data);
  // P41：BIG（大、單雙和局）→ 0；成本 50 → net −50，連莊斷
  await call('POST', '/api/dev/settle', { body: { period: P41, numbers: BIG, superNumber: 60 } });
  // P42：ODD → 200；成本 50 → net +150
  await call('POST', '/api/dev/settle', { body: { period: P42, numbers: ODD, superNumber: 39 } });
  const again42 = await call('POST', '/api/dev/settle', { body: { period: P42, numbers: ODD, superNumber: 39 } });
  const meC2 = await call('GET', '/api/me', { token: tc });
  check('逐期結算：coins 10435、net 375', meC2.data.user.coins === 10435 && meC2.data.stats.totalNet === 375 && meC2.data.stats.weekNet === 375, meC2.data.stats);
  check('連莊 cur 1 / max 1、maxWin 350（單期最大）、totalBets 7、wagered 175', meC2.data.stats.curStreak === 1 && meC2.data.stats.maxStreak === 1 && meC2.data.stats.maxWin === 350 && meC2.data.stats.totalBets === 7 && meC2.data.stats.totalWagered === 175, meC2.data.stats);
  check('重跑 P42 結算不重複派彩', again42.data.summary?.betsSettled === 0);
  const pend2 = await call('GET', '/api/bets/pending', { token: tc });
  check('全部結算後 pending 為空', pend2.data.bets.length === 0 && pend2.data.periods === 0, pend2.data);
  const ledC = await call('GET', `/api/admin/ledger?userId=${C.data.user.id}&limit=100`, { token: tadm });
  const sumC = ledC.data.rows.filter((r) => r.currency === 'coins').reduce((a, r) => a + r.amount, 0);
  const sumCT = ledC.data.rows.filter((r) => r.currency === 'tickets').reduce((a, r) => a + r.amount, 0);
  check('Carol ledger 加總 = 餘額（coins 10435、tickets 0）', sumC === 10435 && sumCT === 0, { sumC, sumCT });
  const meA5 = await call('GET', '/api/me', { token: ta });
  check('多期測試不影響 Alice（coins 14325、net 3725）', meA5.data.user.coins === 14325 && meA5.data.stats.totalNet === 3725, meA5.data);

  console.log('# 多期跨日');
  // 23:43、已知最新 200 期 @23:40 → 下一期 201 @23:45，當天剩 201、202、203 共 3 期
  const late = await setState(T('2026-11-11T23:43:00'), { period: '115000200', drawTime: '2026-11-11T23:40:00' });
  check('23:43 下一期 = 201', late.period === '115000201' && late.open === true, late);
  const cross = await call('POST', '/api/bets', { token: tc, body: { period: '115000201', multiplier: 1, items: [{ game: 'bigSmall', pick: '大' }], periods: 4 } });
  check('跨日 4 期可下：201~203 + 隔日首期 204、扣 100', cross.status === 200 && cross.data.lastPeriod === '115000204' && cross.data.cost.coins === 100 && cross.data.bets.map((b) => b.period).join() === '115000201,115000202,115000203,115000204', cross.data);
  const d204 = cross.data.bets?.find((b) => b.period === '115000204');
  check('隔日首期 drawAt = 11/12 07:05', d204?.drawAt === T('2026-11-12T07:05:00'), d204);
  const meC3 = await call('GET', '/api/me', { token: tc });
  check('扣款正確（10435 − 100）', meC3.data.user.coins === 10335, meC3.data.user);

  console.log('# 中獎跑馬燈 feed');
  // 目前 dev 時鐘 23:43；P37 Alice 於 10:03 結算（派彩 4000／成本 350、超級獎號命中 → bigwin）
  const P201 = '115000201';
  const D = await call('POST', '/api/dev/login', { body: { lineId: 'Udave00001', name: '王小明' } });
  await call('POST', '/api/agree', { token: D.data.token });
  // 3 星中 3 ×2 = 1000 幣、成本 50 → 20 倍 → win（未達 bigwin）
  const bD = await call('POST', '/api/bets', { token: D.data.token, body: { period: P201, multiplier: 2, items: [{ game: 'basic', star: 3, numbers: [1, 3, 5] }] } });
  check('Dave P201 下注成功', bD.status === 200, bD.data);
  await call('POST', '/api/dev/settle', { body: { period: P201, numbers: ODD, superNumber: 39 } });
  await call('POST', '/api/dev/settle', { body: { period: P201, numbers: ODD, superNumber: 39 } }); // 重跑
  const fd = await call('GET', '/api/feed', { origin: 'http://localhost:5173' });
  const evs = fd.data.events ?? [];
  check('feed 免登入 200、CORS 白名單、有 serverNow', fd.status === 200 && fd.headers.get('access-control-allow-origin') === 'http://localhost:5173' && typeof fd.data.serverNow === 'string', fd.status);
  check('只有達門檻的 2 則（P38/P39/P40~42/Bob/Carol 未達門檻不產生）', evs.length === 2 && evs.every((e) => e.period === P37 || e.period === P201), evs);
  const eA = evs.find((e) => e.period === P37), eD = evs.find((e) => e.period === P201);
  check('Alice P37 合併成一則 bigwin、派彩 4000、超級獎號', eA && eA.type === 'bigwin' && eA.payout === 4000 && eA.game.includes('超級獎號') && eA.game.includes('等 4 注'), eA);
  check('Dave P201 win、派彩 1000、ratio 20、3 星全中', eD && eD.type === 'win' && eD.payout === 1000 && eD.ratio === 20 && eD.game === '3 星全中', eD);
  check('遮罩：王小明→王＊＊、Alice→A＊＊', eD?.maskedName === '王＊＊' && eA?.maskedName === 'A＊＊', [eD?.maskedName, eA?.maskedName]);
  check('不回傳 user_id／userId／avatar／原名', evs.every((e) => !('user_id' in e) && !('userId' in e) && !('avatar' in e) && !JSON.stringify(e).includes('Alice') && !JSON.stringify(e).includes('小明')), evs);
  check('新→舊排序', evs[0]?.id > evs[1]?.id && evs[0]?.period === P201);
  check('重複結算不重複產生（Dave 只有 1 則）', evs.filter((e) => e.period === P201).length === 1);
  const fAfter = await call('GET', `/api/feed?after=${eA.id}`);
  check('after=<Alice id> 只回之後的 1 則', fAfter.data.events.length === 1 && fAfter.data.events[0].id === eD.id, fAfter.data);
  const fLim = await call('GET', '/api/feed?limit=1');
  check('limit=1 只回最新 1 則', fLim.data.events.length === 1 && fLim.data.events[0].id === eD.id);
  await setState(T('2026-11-12T10:04:00'));
  const fOld = await call('GET', '/api/feed');
  check('24 小時外（P37 於 11/11 10:03）不回傳', fOld.data.events.length === 1 && fOld.data.events[0].period === P201, fOld.data);
  await setState(T('2026-11-11T23:44:00'));
  const hNo = await call('POST', '/api/admin/feed/hide', { token: ta, body: { id: eD.id } });
  check('非管理員 hide 403 FORBIDDEN', hNo.status === 403 && hNo.data.code === 'FORBIDDEN', hNo.data);
  const hAnon = await call('POST', '/api/admin/feed/hide', { body: { id: eD.id } });
  check('未登入 hide 401', hAnon.status === 401);
  const h404 = await call('POST', '/api/admin/feed/hide', { token: tadm, body: { id: 999999 } });
  check('hide 不存在的 id 404', h404.status === 404);
  const hOk = await call('POST', '/api/admin/feed/hide', { token: tadm, body: { id: eD.id } });
  const fHid = await call('GET', '/api/feed');
  check('管理員 hide 後不再回傳', hOk.status === 200 && fHid.data.events.length === 1 && fHid.data.events[0].id === eA.id, fHid.data);

  await setState(null, null);
  const lo = await call('POST', '/api/auth/logout', { token: tb });
  const afterLogout = await call('GET', '/api/me', { token: tb });
  check('logout 後 token 失效', lo.status === 200 && afterLogout.status === 401);

  console.log(`\n結果：通過 ${pass}，失敗 ${fails.length}`);
  if (fails.length) { console.log('失敗項目：', fails); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(2); });
