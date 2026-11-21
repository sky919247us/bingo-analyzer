// 賓果娛樂機 P2 冒煙測試：每日任務、成就、刪除帳號、首期／跨日、draw_results、72 小時退款
// 前置與 arcade-smoke.mjs 相同（本地 D1 已 apply 到 0004、wrangler dev --local 帶 ARCADE_DEV_LOGIN:1、ADMIN_LINE_IDS:Uadmin0001）
// 可以接在 arcade-smoke.mjs 之後跑（用 2026-12 的時鐘與不同的使用者，互不干擾）
//   node test/arcade-smoke.mjs && node test/arcade-smoke-p2.mjs
// 不會連台彩：/api/dev/cron 在 dev 預設 backfill=false。

const BASE = process.env.ARCADE_BASE ?? 'http://127.0.0.1:8787';
let pass = 0;
const fails = [];

function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fails.push(name); console.log(`  ✘ ${name}`, detail === undefined ? '' : JSON.stringify(detail)); }
}

async function call(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
}

const T = (taipei) => new Date(taipei + '+08:00').toISOString();
const ODD = Array.from({ length: 20 }, (_, i) => i * 2 + 1); // 1,3,…,39：小、單
const setState = async (now, latestDraw) => (await call('POST', '/api/dev/state', { body: { now, latestDraw } })).data.round;
const login = async (lineId, name) => (await call('POST', '/api/dev/login', { body: { lineId, name } })).data;
const kv = (draws, todayDate) => call('POST', '/api/dev/kv', { body: { todayDraws: draws ? { updatedAt: new Date().toISOString(), draws } : null, todayDate } });
const cron = (opts = {}) => call('POST', '/api/dev/cron', { body: opts });
const me = async (token) => (await call('GET', '/api/me', { token })).data;

async function main() {
  const ADM = await login('Uadmin0001', 'Admin');
  const tadm = ADM.token;

  console.log('# 首期開放、最後已知期別持久化（KV 清空時靠 meta.last_draw）');
  // 2026-12-01 第 203 期（23:55）= 115068005（民國 115 年第 335 天：334×203+203）
  await setState(T('2026-12-01T23:58:00'), null);
  await kv([{ period: '115068005', drawTime: '2026-12-01T23:55:00', numbers: ODD, superNumber: 39 }], '2026-12-01');
  const ing = await cron({ ingestOnly: true });
  check('KV → draw_results 寫入 1 期', ing.status === 200 && ing.data.summary.ingested === 1, ing.data);
  await kv(null);
  const r0 = await setState(T('2026-12-02T06:30:00'), null);
  check('KV 清空、06:30：由 meta.last_draw 推出當日第 1 期 115068006 @07:05 可下注', r0.period === '115068006' && r0.open === true && r0.drawTime === T('2026-12-02T07:05:00'), r0);

  const F = await login('Ufirst0001', 'Fiona');
  const tf = F.token;
  await call('POST', '/api/agree', { token: tf });
  const bF = await call('POST', '/api/bets', { token: tf, body: { period: '115068006', multiplier: 1, items: [{ game: 'bigSmall', pick: '小' }, { game: 'basic', star: 5, numbers: [1, 3, 5, 7, 9] }] } });
  check('當日第 1 期可下注（200）、drawAt = 07:05', bF.status === 200 && bF.data.bets.every((b) => b.drawAt === T('2026-12-02T07:05:00')), bF.data);

  console.log('# KV 清空後仍能從 draw_results 結算');
  await setState(T('2026-12-02T07:06:00'), null);
  await kv([{ period: '115068006', drawTime: '2026-12-02T07:05:00', numbers: ODD, superNumber: 39 }], '2026-12-02');
  await cron({ ingestOnly: true });
  await kv(null);
  const kt = await call('GET', '/api/kv/today');
  check('KV today_draws 已清空', kt.data.count === 0, kt.data);
  const gF = await call('GET', '/api/bets?period=115068006', { token: tf });
  check('GET /api/bets 從 draw_results 結算：小 150、5 星中 5 = 7500', gF.data.bets?.every((b) => b.status === 'settled' && b.refunded === false) && gF.data.bets.map((b) => b.payout).join() === '150,7500', gF.data);
  const meF = await me(tf);
  check('Fiona coins = 10000 − 50 + 7650 = 17600', meF.user.coins === 17600, meF.user);
  const r1 = await setState(T('2026-12-02T07:06:00'), null);
  check('meta.last_draw 已前進到 115068006 → 下一期 115068007', r1.period === '115068007' && r1.open === true, r1);
  const achF = await call('GET', '/api/achievements', { token: tf });
  const unlockedF = new Set((achF.data.achievements ?? []).filter((a) => a.unlocked).map((a) => a.code));
  check('成就：first_bet、first_win、star5_win 解鎖，star8_win 未解鎖', ['first_bet', 'first_win', 'star5_win'].every((c) => unlockedF.has(c)) && !unlockedF.has('star8_win'), [...unlockedF]);

  console.log('# 72 小時兜底退款（只退一次）');
  await call('POST', '/api/admin/grant', { token: tadm, body: { userId: F.user.id, currency: 'tickets', amount: 30, reason: '退款測試' } });
  const bR = await call('POST', '/api/bets', { token: tf, body: { period: '115068007', multiplier: 1, items: [{ game: 'bigSmall', pick: '大' }, { game: 'oddEven', pick: '雙' }] } });
  check('下注 50 = 30 券 + 20 幣', bR.status === 200 && bR.data.cost.tickets === 30 && bR.data.cost.coins === 20, bR.data);
  const before = await me(tf);
  await setState(T('2026-12-05T06:10:00'), null); // 開獎後 71 小時
  const c71 = await cron();
  const p71 = await call('GET', '/api/bets/pending', { token: tf });
  check('71 小時：尚未退款（仍 pending）', !c71.data.summary.refunded.some((r) => r.period === '115068007') && p71.data.bets.length === 2, { c: c71.data.summary.refunded, p: p71.data.bets?.length });
  await setState(T('2026-12-05T07:11:00'), null); // 開獎後 72 小時 1 分
  const c72 = await cron();
  const rf = c72.data.summary.refunded.find((r) => r.period === '115068007');
  check('72 小時：退款 2 注', rf && rf.betsRefunded === 2 && rf.users === 1, c72.data.summary.refunded);
  const after = await me(tf);
  check('coins +20、tickets +30 原額退回', after.user.coins === before.user.coins + 20 && after.user.tickets === before.user.tickets + 30, { before: before.user, after: after.user });
  check('退款不計淨收益（totalNet 不變）', after.stats.totalNet === before.stats.totalNet, after.stats);
  const gR = await call('GET', '/api/bets?period=115068007', { token: tf });
  check('注單 status=settled、refunded=true、payout 0', gR.data.bets.every((b) => b.status === 'settled' && b.refunded === true && b.payout === 0), gR.data.bets);
  const cAgain = await cron();
  const again = await me(tf);
  check('再跑一次排程：不重複退款', !cAgain.data.summary.refunded.some((r) => r.period === '115068007' && r.betsRefunded > 0) && again.user.coins === after.user.coins && again.user.tickets === after.user.tickets, { s: cAgain.data.summary.refunded, u: again.user });
  const ledF = await call('GET', `/api/admin/ledger?userId=${F.user.id}&limit=100`, { token: tadm });
  const refunds = ledF.data.rows.filter((r) => r.type === 'refund');
  check('ledger refund（每注單各自記帳）：coins 合計 20、tickets 合計 30', refunds.length >= 2 && refunds.every((r) => r.ref?.startsWith('bet:')) && refunds.filter((r) => r.currency === 'coins').reduce((a, r) => a + r.amount, 0) === 20 && refunds.filter((r) => r.currency === 'tickets').reduce((a, r) => a + r.amount, 0) === 30, refunds);
  const sumC = ledF.data.rows.filter((r) => r.currency === 'coins').reduce((a, r) => a + r.amount, 0);
  const sumT = ledF.data.rows.filter((r) => r.currency === 'tickets').reduce((a, r) => a + r.amount, 0);
  check('Fiona ledger 加總 = 餘額', sumC === again.user.coins && sumT === again.user.tickets, { sumC, sumT, u: again.user });

  console.log('# 每日任務');
  // 2026-12-10 10:00 = 第 36 期 → 115069665（343×203+36）
  await setState(T('2026-12-10T10:03:00'), { period: '115069665', drawTime: '2026-12-10T10:00:00' });
  const M = await login('Umission01', 'Mia');
  const tm = M.token;
  await call('POST', '/api/agree', { token: tm });
  const m0 = await call('GET', '/api/missions', { token: tm });
  check('GET /api/missions 格式：day、5 個任務、全 0', m0.status === 200 && m0.data.day === '2026-12-10' && m0.data.missions.length === 5 && m0.data.missions.every((m) => m.progress === 0 && m.done === false && m.claimed === false && typeof m.title === 'string' && m.target > 0 && m.reward > 0), m0.data);
  check('任務 code 與獎勵', m0.data.missions.map((m) => `${m.code}:${m.reward}`).join() === 'checkin:100,bet3:100,bet10:150,win1:150,all:500', m0.data.missions);
  const nd = await call('POST', '/api/missions/claim', { token: tm, body: { code: 'checkin' } });
  check('未簽到領 checkin → 409 MISSION_NOT_DONE', nd.status === 409 && nd.data.code === 'MISSION_NOT_DONE', nd.data);
  const badCode = await call('POST', '/api/missions/claim', { token: tm, body: { code: 'xyz' } });
  check('未知 code → 400', badCode.status === 400, badCode.data);
  const anonM = await call('GET', '/api/missions');
  check('未登入 → 401', anonM.status === 401);
  await call('POST', '/api/checkin', { token: tm });
  const cc = await call('POST', '/api/missions/claim', { token: tm, body: { code: 'checkin' } });
  check('領 checkin：{ok, reward 100, coins 10600}', cc.status === 200 && cc.data.ok === true && cc.data.reward === 100 && cc.data.coins === 10600, cc.data);
  const cc2 = await call('POST', '/api/missions/claim', { token: tm, body: { code: 'checkin' } });
  check('再領 checkin → 409 MISSION_CLAIMED', cc2.status === 409 && cc2.data.code === 'MISSION_CLAIMED', cc2.data);
  const itemsM = [{ game: 'bigSmall', pick: '小' }, { game: 'oddEven', pick: '單' }, { game: 'basic', star: 1, numbers: [1] }, { game: 'basic', star: 1, numbers: [2] }];
  const bM = await call('POST', '/api/bets', { token: tm, body: { period: '115069666', multiplier: 1, items: itemsM, periods: 3 } });
  check('下注 3 期 × 4 項 = 12 注', bM.status === 200 && bM.data.bets.length === 12, bM.data);
  const m1 = (await call('GET', '/api/missions', { token: tm })).data.missions;
  const byCode = (arr, c) => arr.find((m) => m.code === c);
  check('bet3 3/3、bet10 10/10 達成，win1 未達成', byCode(m1, 'bet3').progress === 3 && byCode(m1, 'bet3').done && byCode(m1, 'bet10').progress === 10 && byCode(m1, 'bet10').done && !byCode(m1, 'win1').done, m1);
  const w0 = await call('POST', '/api/missions/claim', { token: tm, body: { code: 'win1' } });
  check('未中獎領 win1 → 409 MISSION_NOT_DONE', w0.status === 409 && w0.data.code === 'MISSION_NOT_DONE', w0.data);
  const allEarly = await call('POST', '/api/missions/claim', { token: tm, body: { code: 'all' } });
  check('未全部領取就領 all → 409 MISSION_NOT_DONE', allEarly.status === 409 && allEarly.data.code === 'MISSION_NOT_DONE', allEarly.data);
  await call('POST', '/api/dev/settle', { body: { period: '115069666', numbers: ODD, superNumber: 39 } });
  // 同時送兩次 bet3：只能成功一次
  const [p1, p2] = await Promise.all([1, 2].map(() => call('POST', '/api/missions/claim', { token: tm, body: { code: 'bet3' } })));
  const oks = [p1, p2].filter((x) => x.status === 200);
  const dup = [p1, p2].filter((x) => x.status === 409 && x.data.code === 'MISSION_CLAIMED');
  check('並發領 bet3：恰好 1 次成功、1 次 409 MISSION_CLAIMED', oks.length === 1 && dup.length === 1, [p1, p2]);
  const b10 = await call('POST', '/api/missions/claim', { token: tm, body: { code: 'bet10' } });
  const w1 = await call('POST', '/api/missions/claim', { token: tm, body: { code: 'win1' } });
  check('領 bet10 150、win1 150', b10.data.reward === 150 && w1.data.reward === 150, [b10.data, w1.data]);
  const m2 = (await call('GET', '/api/missions', { token: tm })).data.missions;
  check('all 進度 4/4 可領', byCode(m2, 'all').progress === 4 && byCode(m2, 'all').done && !byCode(m2, 'all').claimed, byCode(m2, 'all'));
  const al = await call('POST', '/api/missions/claim', { token: tm, body: { code: 'all' } });
  const al2 = await call('POST', '/api/missions/claim', { token: tm, body: { code: 'all' } });
  check('領 all 500；再領 409 MISSION_CLAIMED', al.status === 200 && al.data.reward === 500 && al2.status === 409 && al2.data.code === 'MISSION_CLAIMED', [al.data, al2.data]);
  const meM = await me(tm);
  // 10000 +500 簽到 −300 下注 +350 派彩（小 150、單 150、1 星 50）+1000 任務
  check('Mia coins = 11550；totalNet 只算派彩−成本 = 250（不含任務 1000）', meM.user.coins === 11550 && meM.stats.totalNet === 250, { u: meM.user, s: meM.stats });
  const ledM = await call('GET', `/api/admin/ledger?userId=${M.user.id}&limit=100`, { token: tadm });
  const mis = ledM.data.rows.filter((r) => r.type === 'mission');
  check('ledger type=mission 5 筆合計 1000', mis.length === 5 && mis.reduce((a, r) => a + r.amount, 0) === 1000, mis);
  await setState(T('2026-12-11T10:03:00'), { period: '115069868', drawTime: '2026-12-11T10:00:00' });
  const mNext = (await call('GET', '/api/missions', { token: tm })).data;
  check('隔天任務重置', mNext.day === '2026-12-11' && mNext.missions.every((m) => !m.claimed) && byCode(mNext.missions, 'checkin').progress === 0, mNext);

  console.log('# 成就');
  await setState(T('2026-12-10T10:08:00'), { period: '115069666', drawTime: '2026-12-10T10:05:00' });
  await call('POST', '/api/dev/settle', { body: { period: '115069667', numbers: ODD, superNumber: 39 } });
  await call('POST', '/api/dev/settle', { body: { period: '115069668', numbers: ODD, superNumber: 39 } });
  const meM2 = await me(tm);
  check('連莊 3：stats.curStreak 3、maxStreak 3', meM2.stats.curStreak === 3 && meM2.stats.maxStreak === 3, meM2.stats);
  for (let d = 11; d <= 16; d++) await (async () => { await setState(T(`2026-12-${d}T09:00:00`), null); await call('POST', '/api/checkin', { token: tm }); })();
  const achM = await call('GET', '/api/achievements', { token: tm });
  const listM = achM.data.achievements ?? [];
  const um = new Map(listM.map((a) => [a.code, a]));
  check('GET /api/achievements 15 項、格式含 code/title/desc/icon/unlocked/unlockedAt', achM.status === 200 && listM.length === 15 && listM.every((a) => typeof a.code === 'string' && typeof a.title === 'string' && typeof a.desc === 'string' && typeof a.icon === 'string' && typeof a.unlocked === 'boolean' && (a.unlocked ? typeof a.unlockedAt === 'string' : a.unlockedAt === null)), listM);
  check('Mia 解鎖 first_bet、first_win、streak3、checkin7', ['first_bet', 'first_win', 'streak3', 'checkin7'].every((c) => um.get(c)?.unlocked), listM.filter((a) => a.unlocked).map((a) => a.code));
  check('Mia 未解鎖 streak5、bets100、rescued、big_10k', ['streak5', 'bets100', 'rescued', 'big_10k'].every((c) => um.get(c)?.unlocked === false));
  const achAnon = await call('GET', '/api/achievements');
  check('未登入 achievements → 401', achAnon.status === 401);

  console.log('# 刪除帳號（防洗幣）');
  await setState(T('2026-12-20T10:03:00'), { period: '115071695', drawTime: '2026-12-20T10:00:00' });
  const Z = await login('Uzed000001', 'Zed');
  const tz = Z.token;
  check('新帳號 10,000', Z.user.coins === 10000);
  await call('POST', '/api/agree', { token: tz });
  await call('POST', '/api/bets', { token: tz, body: { period: '115071696', multiplier: 1, items: [{ game: 'bigSmall', pick: '大' }] } });
  const d0 = await call('POST', '/api/me/delete', { token: tz, body: {} });
  const d1 = await call('POST', '/api/me/delete', { token: tz, body: { confirm: 'delete' } });
  check('未帶 confirm／大小寫不符 → 400', d0.status === 400 && d1.status === 400, [d0.data, d1.data]);
  const dAnon = await call('POST', '/api/me/delete', { body: { confirm: 'DELETE' } });
  check('未登入刪帳 → 401', dAnon.status === 401);
  const dOk = await call('POST', '/api/me/delete', { token: tz, body: { confirm: 'DELETE' } });
  check('刪帳 → { ok: true }', dOk.status === 200 && dOk.data.ok === true, dOk.data);
  const meZ = await call('GET', '/api/me', { token: tz });
  check('舊 token 失效 401', meZ.status === 401);
  const ledZ = await call('GET', `/api/admin/ledger?userId=${Z.user.id}&limit=100`, { token: tadm });
  check('舊帳號的 ledger 已刪除', ledZ.data.rows.length === 0, ledZ.data);
  const pendZ = await call('GET', '/api/admin/users?q=Uzed000001', { token: tadm });
  check('admin/users 查不到舊帳號', pendZ.data.users.length === 0, pendZ.data);
  const Z2 = await login('Uzed000001', 'Zed');
  check('同一 LINE 重新註冊：註冊金 0、新 id', Z2.user.coins === 0 && Z2.user.id !== Z.user.id, Z2.user);
  const ledZ2 = await call('GET', `/api/admin/ledger?userId=${Z2.user.id}&limit=100`, { token: tadm });
  check('重新註冊的 signup 帳為 0', ledZ2.data.rows.length === 1 && ledZ2.data.rows[0].type === 'signup' && ledZ2.data.rows[0].amount === 0, ledZ2.data.rows);
  const meZ2 = await me(Z2.token);
  check('重新註冊後 /api/me 正常、統計歸零', meZ2.user.coins === 0 && meZ2.stats.totalBets === 0, meZ2);
  const Z3 = await login('Uzed000002', 'Zed2');
  check('其他新 LINE 仍送 10,000', Z3.user.coins === 10000);

  console.log('# 跨日／跨年多期期別推算');
  // 23:20 已知第 196 期 → 下一期 197（23:25）；12 期 = 197~203（7 期）+ 隔日 1~5
  const r12 = await setState(T('2026-12-20T23:22:00'), { period: '115072000', drawTime: '2026-12-20T23:20:00' });
  check('23:22 下一期 = 115072001', r12.period === '115072001' && r12.open, r12);
  const Y = await login('Uyear00001', 'Yuki');
  const ty = Y.token;
  await call('POST', '/api/agree', { token: ty });
  const b12 = await call('POST', '/api/bets', { token: ty, body: { period: '115072001', multiplier: 1, items: [{ game: 'bigSmall', pick: '大' }], periods: 12 } });
  const ps = (b12.data.bets ?? []).map((b) => b.period);
  check('12 期跨日：115072001~115072012 連續', b12.status === 200 && ps.length === 12 && ps.every((p, i) => p === String(115072001 + i)) && b12.data.lastPeriod === '115072012', b12.data);
  check('第 8 期（隔日首期）drawAt = 12/21 07:05、第 12 期 = 07:25', b12.data.bets?.[7].drawAt === T('2026-12-21T07:05:00') && b12.data.bets?.[11].drawAt === T('2026-12-21T07:25:00'), b12.data.bets?.map((b) => b.drawAt));
  // 跨年：2026-12-31 第 200 期 = 115074092（364×203+200）；1/1 首期 = 116000001
  const ry = await setState(T('2026-12-31T23:43:00'), { period: '115074092', drawTime: '2026-12-31T23:40:00' });
  check('12/31 23:43 下一期 = 115074093', ry.period === '115074093', ry);
  const by = await call('POST', '/api/bets', { token: ty, body: { period: '115074093', multiplier: 1, items: [{ game: 'oddEven', pick: '單' }], periods: 4 } });
  check('跨年 4 期：115074093、094、095、116000001', by.status === 200 && by.data.bets.map((b) => b.period).join() === '115074093,115074094,115074095,116000001' && by.data.bets[3].drawAt === T('2027-01-01T07:05:00'), by.data);
  const rNY = await setState(T('2026-12-31T23:58:00'), { period: '115074095', drawTime: '2026-12-31T23:55:00' });
  check('12/31 收班後：1/1 首期 116000001 可下注', rNY.period === '116000001' && rNY.open === true && rNY.drawTime === T('2027-01-01T07:05:00'), rNY);
  const rOld = await setState(T('2026-12-22T10:03:00'), { period: '115072000', drawTime: '2026-12-20T23:20:00' });
  check('已知期太舊（隔兩天）→ period=null 不開放', rOld.period === null && rOld.open === false, rOld);

  await setState(null, null);
  console.log(`\n結果：通過 ${pass}，失敗 ${fails.length}`);
  if (fails.length) { console.log('失敗項目：', fails); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(2); });
