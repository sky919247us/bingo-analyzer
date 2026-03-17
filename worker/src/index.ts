export interface Env {
  BINGO_KV: KVNamespace;
}

const TLC_LATEST_URL = 'https://api.taiwanlottery.com/TLCAPIWeB/Lottery/LatestBingoResult';
const TLC_OEHL_URL = 'https://api.taiwanlottery.com/TLCAPIWeB/Lottery/OEHLStatistic';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 允許跨域請求的 Headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json;charset=UTF-8',
};

/** 從 LatestBingoResult 取得最新一期開獎號碼 */
async function fetchLatestFromTLC(): Promise<any> {
    const resp = await fetch(TLC_LATEST_URL, {
        headers: { 'Accept': 'application/json', 'User-Agent': UA },
    });
    if (!resp.ok) throw new Error(`TLC API Error: ${resp.status}`);
    const data: any = await resp.json();
    if (data.rtCode !== 0) throw new Error(`TLC API rtCode: ${data.rtCode}`);
    const post = data.content?.lotteryBingoLatestPost;
    if (!post) throw new Error(`TLC API Missing post data`);

    return {
        period: String(post.drawTerm),
        drawTime: post.dDate,
        numbers: post.bigShowOrder.map((n: string) => parseInt(n, 10)),
        superNumber: parseInt(post.prizeNum?.bullEye || '0', 10),
    };
}

/** 從 OEHLStatistic 取得大小單雙即時統計（此 API 更新速度最快） */
async function fetchOEHLStatistic(): Promise<any> {
    const resp = await fetch(TLC_OEHL_URL, {
        headers: { 'Accept': 'application/json', 'User-Agent': UA },
    });
    if (!resp.ok) throw new Error(`OEHL API Error: ${resp.status}`);
    const data: any = await resp.json();
    if (data.rtCode !== 0) throw new Error(`OEHL API rtCode: ${data.rtCode}`);
    return data.content;
}

/** 從 BingoResult 歷史查詢 API 取得指定日期的開獎紀錄 */
async function fetchHistoryPageFromTLC(dateStr: string, page: number = 1): Promise<{ totalSize: number, draws: any[] }> {
    const url = `https://api.taiwanlottery.com/TLCAPIWeB/Lottery/BingoResult?openDate=${dateStr}&pageNum=${page}&pageSize=50`;
    const resp = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': UA } });
    if (!resp.ok) throw new Error(`TLC History API Error: ${resp.status}`);
    const data: any = await resp.json();
    if (data.rtCode !== 0) throw new Error(`TLC History API rtCode: ${data.rtCode}`);

    const contentResults = data.content?.bingoQueryResult || [];
    const draws = contentResults.map((item: any) => ({
        period: String(item.drawTerm),
        drawTime: item.dDate || dateStr,
        numbers: item.bigShowOrder.map((n: string) => parseInt(n, 10)),
        superNumber: parseInt(item.bullEyeTop || '0', 10),
    }));

    return {
        totalSize: data.content?.totalSize || 0,
        draws
    };
}

/** 判斷 drawTime 是否為有效時間（排除 0001-01-01 等無效預設值） */
function isValidDrawTime(drawTime: string | undefined | null): boolean {
    if (!drawTime || !drawTime.includes(':')) return false;
    if (drawTime.startsWith('0001') || drawTime.startsWith('0000')) return false;
    const ts = new Date(drawTime).getTime();
    return !isNaN(ts) && ts > 0;
}

/** 根據已知錨點推算缺失的 drawTime */
function fillMissingTimes(draws: any[]) {
    const anchor = draws.find(d => isValidDrawTime(d.drawTime));
    if (!anchor) return draws;

    const anchorTime = new Date(anchor.drawTime).getTime();
    const anchorPeriod = Number(anchor.period);

    return draws.map(d => {
        if (isValidDrawTime(d.drawTime)) return d;
        const periodDiff = Number(d.period) - anchorPeriod;
        const calculatedDate = new Date(anchorTime + periodDiff * 5 * 60 * 1000);
        return {
            ...d,
            drawTime: calculatedDate.toISOString()
        };
    });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    try {
        if (url.pathname === '/api/kv/latest') {
            const rawLatest = await env.BINGO_KV.get('latest_draw');
            const lastUpdated = await env.BINGO_KV.get('last_updated');
            return new Response(JSON.stringify({ success: true, draw: rawLatest ? JSON.parse(rawLatest) : null, lastUpdated }), { headers: corsHeaders });
        }
        if (url.pathname === '/api/kv/today') {
            const rawToday = await env.BINGO_KV.get('today_draws');
            const lastUpdated = await env.BINGO_KV.get('last_updated');
            const draws = rawToday ? JSON.parse(rawToday) : [];
            return new Response(JSON.stringify({ success: true, draws, count: draws.length, lastUpdated }), { headers: corsHeaders });
        }
        if (url.pathname === '/api/kv/oehl') {
            const rawOehl = await env.BINGO_KV.get('oehl_stats');
            const lastUpdated = await env.BINGO_KV.get('last_updated');
            return new Response(JSON.stringify({ success: true, oehl: rawOehl ? JSON.parse(rawOehl) : null, lastUpdated }), { headers: corsHeaders });
        }
        if (url.pathname === '/api/kv/force-update') {
            await syncDrawsToKV(env);
            const lastUpdated = await env.BINGO_KV.get('last_updated');
            return new Response(JSON.stringify({ success: true, message: 'Forced update success.', lastUpdated }), { headers: corsHeaders });
        }
        return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: corsHeaders });
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
      // Cron 在開獎整分鐘觸發，延遲 3 秒後開始同步
      // 用 OEHLStatistic 偵測新期（更新最快），每 10 秒重試最多 20 次
      ctx.waitUntil(
          new Promise(resolve => setTimeout(resolve, 3_000))
              .then(() => syncDrawsToKV(env))
      );
  },
};

/**
 * 每日開獎時段：台灣時間 07:05 ~ 23:55，每 5 分鐘一期，共 203 期
 * 偵測策略：OEHLStatistic（最快）→ LatestBingoResult → BingoResult（歷史）
 * 重試：每 10 秒一次，最多 20 次（涵蓋 200 秒）
 */
async function syncDrawsToKV(env: Env) {
    try {
      const now = new Date();
      const taipeiFormatter = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Taipei',
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hour12: false,
      });
      const parts = taipeiFormatter.formatToParts(now);
      const taipeiHour = parseInt(parts.find(p => p.type === 'hour')?.value || '12', 10);
      const taipeiMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
      const taipeiYear = parts.find(p => p.type === 'year')?.value;
      const taipeiMonth = parts.find(p => p.type === 'month')?.value;
      const taipeiDay = parts.find(p => p.type === 'day')?.value;
      const taipeiTimeMinutes = taipeiHour * 60 + taipeiMinute;

      // 開獎時段：07:05(=425分) ~ 23:55(=1435分)
      const DRAW_START = 7 * 60 + 5;
      const DRAW_END = 23 * 60 + 55;
      const isDrawTime = taipeiTimeMinutes >= DRAW_START && taipeiTimeMinutes <= DRAW_END;

      // 換日邏輯：凌晨 00:00~04:59 視為前一天
      let todayDateStr: string;
      if (taipeiHour < 5) {
          const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          const yParts = taipeiFormatter.formatToParts(yesterday);
          const yYear = yParts.find(p => p.type === 'year')?.value;
          const yMonth = yParts.find(p => p.type === 'month')?.value;
          const yDay = yParts.find(p => p.type === 'day')?.value;
          todayDateStr = `${yYear}-${yMonth}-${yDay}`;
      } else {
          todayDateStr = `${taipeiYear}-${taipeiMonth}-${taipeiDay}`;
      }

      const savedDate = await env.BINGO_KV.get('today_date');
      if (savedDate !== todayDateStr) {
          await env.BINGO_KV.put('today_date', todayDateStr);
          await env.BINGO_KV.put('today_draws', JSON.stringify([]));
      }

      // 非開獎時段只做換日，不抓新資料
      if (!isDrawTime) {
          console.log(`[syncDrawsToKV] 非開獎時段 (台灣 ${taipeiHour}:${String(taipeiMinute).padStart(2, '0')})，僅執行換日檢查`);
          await env.BINGO_KV.put('last_updated', new Date().toISOString());
          return;
      }

      const rawToday = await env.BINGO_KV.get('today_draws');
      let todayDraws: any[] = rawToday ? JSON.parse(rawToday) : [];
      const currentLatestPeriod = todayDraws.length > 0
          ? todayDraws.reduce((max, d) => Number(d.period) > Number(max.period) ? d : max).period
          : null;
      let isUpdated = false;

      // === 第一階段：用 OEHLStatistic 偵測新期數（此 API 更新最快） ===
      let oehlData: any = null;
      let oehlLatestPeriod: string | null = null;
      const MAX_RETRIES = 20;
      const RETRY_DELAY = 10_000;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          if (attempt > 0) {
              console.log(`[syncDrawsToKV] 等待新期數，第 ${attempt} 次重試...`);
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          }

          try {
              oehlData = await fetchOEHLStatistic();
              const results = oehlData?.todayResults || [];
              if (results.length > 0) {
                  oehlLatestPeriod = String(results[0].drawTerm);
              }
          } catch (err) {
              console.error('[syncDrawsToKV] fetchOEHLStatistic failed:', err);
          }

          // 有新期數就跳出重試
          if (oehlLatestPeriod && (!currentLatestPeriod || oehlLatestPeriod !== currentLatestPeriod)) {
              console.log(`[syncDrawsToKV] OEHL 偵測到新期數 ${oehlLatestPeriod}（原 ${currentLatestPeriod}），第 ${attempt} 次嘗試`);
              break;
          }

          if (attempt === MAX_RETRIES) {
              console.log(`[syncDrawsToKV] 重試 ${MAX_RETRIES} 次後仍無新期數`);
          }
      }

      // 儲存 OEHL 大小單雙統計到 KV
      if (oehlData) {
          await env.BINGO_KV.put('oehl_stats', JSON.stringify(oehlData));
      }

      // === 第二階段：取得開獎號碼（LatestBingoResult + History） ===
      let newDraw: any = null;
      try {
          newDraw = await fetchLatestFromTLC();
      } catch (err) {
          console.error('[syncDrawsToKV] fetchLatestFromTLC failed:', err);
      }

      const { totalSize, draws: page1Draws } = await fetchHistoryPageFromTLC(todayDateStr, 1);

      if (page1Draws.length === 0 && !newDraw) return;

      // 驗證 newDraw 屬於今日
      if (newDraw && isValidDrawTime(newDraw.drawTime)) {
          const drawDateStr = new Intl.DateTimeFormat('en-CA', {
              timeZone: 'Asia/Taipei',
              year: 'numeric', month: '2-digit', day: '2-digit',
          }).format(new Date(newDraw.drawTime));
          if (drawDateStr !== todayDateStr) {
              console.log(`[syncDrawsToKV] newDraw 日期 ${drawDateStr} ≠ 今日 ${todayDateStr}，捨棄`);
              newDraw = null;
          }
      }

      if (newDraw && !todayDraws.some(d => d.period === newDraw.period)) {
          todayDraws.unshift(newDraw);
          isUpdated = true;
      }

      if (todayDraws.length < totalSize) {
          let allFetched = [...page1Draws];
          if (newDraw) allFetched.push(newDraw);
          let page = 2;
          while (allFetched.length < totalSize && page <= 5) {
              const { draws: nextDraws } = await fetchHistoryPageFromTLC(todayDateStr, page);
              if (nextDraws.length === 0) break;
              allFetched.push(...nextDraws);
              page++;
          }
          const map = new Map();
          allFetched.forEach(d => map.set(d.period, d));
          todayDraws = Array.from(map.values());
          isUpdated = true;
      }

      if (isUpdated || todayDraws.some(d => !isValidDrawTime(d.drawTime))) {
          todayDraws = fillMissingTimes(todayDraws);
          isUpdated = true;
      }

      if (isUpdated) {
          todayDraws.sort((a, b) => Number(b.period) - Number(a.period));
          await env.BINGO_KV.put('today_draws', JSON.stringify(todayDraws));
          await env.BINGO_KV.put('latest_draw', JSON.stringify(todayDraws[0]));
      }
      await env.BINGO_KV.put('last_updated', new Date().toISOString());
      console.log(`[syncDrawsToKV] 同步完成，日期=${todayDateStr}，筆數=${todayDraws.length}，已更新=${isUpdated}，OEHL最新=${oehlLatestPeriod}`);
    } catch (err) {
      console.error('[syncDrawsToKV] 同步失敗:', err);
    }
}
