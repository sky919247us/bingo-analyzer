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

function fillMissingTimes(draws: any[]) {
    const anchor = draws.find(d => d.drawTime && d.drawTime.includes(':'));
    if (!anchor) return draws;

    const anchorTime = new Date(anchor.drawTime).getTime();
    const anchorPeriod = Number(anchor.period);

    return draws.map(d => {
        if (d.drawTime && d.drawTime.includes(':')) return d;
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
      ctx.waitUntil(syncDrawsToKV(env));
  },
};

async function syncDrawsToKV(env: Env) {
    try {
      const now = new Date();
      const adjustedNow = new Date(now.getTime() - 4 * 60 * 60 * 1000); 
      const options = { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' } as const;
      const todayDateStr = adjustedNow.toLocaleDateString('en-CA', options);

      const savedDate = await env.BINGO_KV.get('today_date');
      if (savedDate !== todayDateStr) {
          await env.BINGO_KV.put('today_date', todayDateStr);
          await env.BINGO_KV.put('today_draws', JSON.stringify([]));
      }

      let newDraw: any = null;
      try { newDraw = await fetchLatestFromTLC(); } catch {}
      
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

      if (isUpdated || todayDraws.some(d => !d.drawTime || !d.drawTime.includes(':'))) {
          todayDraws = fillMissingTimes(todayDraws);
          isUpdated = true;
      }

      if (isUpdated) {
          todayDraws.sort((a, b) => Number(b.period) - Number(a.period));
          await env.BINGO_KV.put('today_draws', JSON.stringify(todayDraws));
          await env.BINGO_KV.put('latest_draw', JSON.stringify(todayDraws[0]));
      }
      await env.BINGO_KV.put('last_updated', new Date().toISOString());
    } catch (err) {}
}
