export interface Env {
  BINGO_KV: KVNamespace;
}

const TLC_LATEST_URL = 'https://api.taiwanlottery.com/TLCAPIWeB/Lottery/LatestBingoResult';

// 允許跨域請求的 Headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json;charset=UTF-8',
};

async function fetchLatestFromTLC(): Promise<any> {
    const resp = await fetch(TLC_LATEST_URL, {
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
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

async function fetchHistoryPageFromTLC(dateStr: string, page: number = 1): Promise<{ totalSize: number, draws: any[] }> {
    const url = `https://api.taiwanlottery.com/TLCAPIWeB/Lottery/BingoResult?openDate=${dateStr}&pageNum=${page}&pageSize=50`;
    const resp = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
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
    // 台彩 API 回傳無效時間為 "0001-01-01T00:00:00"，必須排除
    if (drawTime.startsWith('0001') || drawTime.startsWith('0000')) return false;
    const ts = new Date(drawTime).getTime();
    // 排除 Unix epoch 前的時間戳
    return !isNaN(ts) && ts > 0;
}

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
      // Cron 在整分鐘觸發，延遲 5 秒確保台彩 API 已更新最新獎號
      // 模擬 07:05:01, 07:10:01, ..., 23:55:01 的提取時間點
      ctx.waitUntil(
          new Promise(resolve => setTimeout(resolve, 5000))
              .then(() => syncDrawsToKV(env))
      );
  },
};

/**
 * 每日開獎時段：台灣時間 07:05 ~ 23:55，每 5 分鐘一期，共 203 期
 * Cron 每 5 分鐘觸發一次，延遲 5 秒後執行（確保台彩 API 已更新）
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
      const taipeiTimeMinutes = taipeiHour * 60 + taipeiMinute; // 轉為當日分鐘數

      // 開獎時段：07:05(=425分) ~ 23:55(=1435分)，超出範圍僅做換日不抓新資料
      const DRAW_START = 7 * 60 + 5;   // 07:05 = 425
      const DRAW_END = 23 * 60 + 55;   // 23:55 = 1435
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

      // 非開獎時段（07:05 前或 23:55 後）只做換日，不抓新資料
      if (!isDrawTime) {
          console.log(`[syncDrawsToKV] 非開獎時段 (台灣 ${taipeiHour}:${String(taipeiMinute).padStart(2, '0')})，僅執行換日檢查`);
          await env.BINGO_KV.put('last_updated', new Date().toISOString());
          return;
      }

      let newDraw: any = null;
      try {
          newDraw = await fetchLatestFromTLC();
      } catch (err) {
          console.error('[syncDrawsToKV] fetchLatestFromTLC failed:', err);
      }

      const { totalSize, draws: page1Draws } = await fetchHistoryPageFromTLC(todayDateStr, 1);
      if (page1Draws.length === 0 && !newDraw) return;

      const rawToday = await env.BINGO_KV.get('today_draws');
      let todayDraws: any[] = rawToday ? JSON.parse(rawToday) : [];
      let isUpdated = false;

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
      console.log(`[syncDrawsToKV] 同步完成，日期=${todayDateStr}，筆數=${todayDraws.length}，已更新=${isUpdated}`);
    } catch (err) {
      console.error('[syncDrawsToKV] 同步失敗:', err);
    }
}
