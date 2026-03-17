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
    
    if (!resp.ok) {
        throw new Error(`TLC API Error: ${resp.status}`);
    }
    
    const data: any = await resp.json();
    if (data.rtCode !== 0) {
         throw new Error(`TLC API rtCode: ${data.rtCode}`);
    }
    
    const post = data.content?.lotteryBingoLatestPost;
    if (!post) {
         throw new Error(`TLC API Missing post data`);
    }

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

export default {
  // 處理前端的 API 請求
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 處理 CORS Preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        if (url.pathname === '/api/kv/latest') {
            const rawLatest = await env.BINGO_KV.get('latest_draw');
            const lastUpdated = await env.BINGO_KV.get('last_updated');
            return new Response(JSON.stringify({
                success: true,
                draw: rawLatest ? JSON.parse(rawLatest) : null,
                lastUpdated: lastUpdated || null
            }), { headers: corsHeaders });
        }
        
        if (url.pathname === '/api/kv/today') {
            const rawToday = await env.BINGO_KV.get('today_draws');
            const lastUpdated = await env.BINGO_KV.get('last_updated');
            const draws = rawToday ? JSON.parse(rawToday) : [];
            return new Response(JSON.stringify({
                success: true,
                draws: draws,
                count: draws.length,
                lastUpdated: lastUpdated || null
            }), { headers: corsHeaders });
        }

        if (url.pathname === '/api/kv/force-update') {
            await syncDrawsToKV(env);
            return new Response(JSON.stringify({ success: true, message: 'Forced cron execution.' }), { headers: corsHeaders });
        }

        if (url.pathname === '/api/kv/backfill' && request.method === 'POST') {
            const body: any = await request.json();
            if (body.today_draws) await env.BINGO_KV.put('today_draws', JSON.stringify(body.today_draws));
            if (body.latest_draw) await env.BINGO_KV.put('latest_draw', JSON.stringify(body.latest_draw));
            if (body.last_updated) await env.BINGO_KV.put('last_updated', body.last_updated);
            if (body.today_date) await env.BINGO_KV.put('today_date', body.today_date);
            return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }

        return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: corsHeaders });
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
    }
  },

  // 處理 Cron 定時任務
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
      ctx.waitUntil(syncDrawsToKV(env));
  },
};

async function syncDrawsToKV(env: Env) {
    try {
      // 取得台灣時間 (UTC+8) 的日期 YYYY-MM-DD 作為換日判斷
      // 將時間往前平移 4 小時，這樣 00:00 ~ 03:59 會被算在「昨天」，直到 04:00 才會換日
      const now = new Date();
      const adjustedNow = new Date(now.getTime() - 4 * 60 * 60 * 1000); 
      const options = { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' } as const;
      const todayDateStr = adjustedNow.toLocaleDateString('en-CA', options); // 格式: YYYY-MM-DD

      // 1. 處理換日清空邏輯
      const savedDate = await env.BINGO_KV.get('today_date');
      if (savedDate !== todayDateStr) {
          console.log(`換日偵測！清空歷史紀錄 (舊: ${savedDate}, 新: ${todayDateStr})`);
          await env.BINGO_KV.put('today_date', todayDateStr);
          await env.BINGO_KV.put('today_draws', JSON.stringify([]));
      }

      try {
          // 2. 獲取台彩最新期數 (Fast API)
          let newDraw = null;
          try {
              newDraw = await fetchLatestFromTLC();
              console.log(`Latest API 抓取到最新期數: ${newDraw.period}`);
          } catch (e) {
              console.log('Latest API 抓取失敗，依賴 History API');
          }
          
          // 3. 獲取歷史資料第一頁，包含 totalSize (History API)
          // 這是用來確認台彩今天到底開了幾期
          const { totalSize, draws: page1Draws } = await fetchHistoryPageFromTLC(todayDateStr, 1);
          
          if (page1Draws.length === 0 && !newDraw) {
              console.log('今日尚無開獎資料');
              return;
          }

          // 4. 讀取 KV 目錄
          const rawToday = await env.BINGO_KV.get('today_draws');
          let todayDraws: any[] = rawToday ? JSON.parse(rawToday) : [];
          
          let isUpdated = false;

          // 5. 將 Latest API 的資料合併進去
          if (newDraw) {
              const isNewFromLatest = !todayDraws.some(d => d.period === newDraw.period);
              if (isNewFromLatest) {
                  console.log(`新增期數: ${newDraw.period} 到 KV`);
                  todayDraws.unshift(newDraw);
                  isUpdated = true;
              }
          }
          
          // 6. 防漏驗證：如果 KV 中的資料筆數小於台彩告知的總期數，代表中間有漏
          // (用 < 判斷是因為 KV 裡可能預先包含了剛從 Latest API 抓到但 History 還沒出來的超新期數)
          if (todayDraws.length < totalSize) {
              console.log(`偵測到缺漏！KV期數: ${todayDraws.length}, 台彩總期數: ${totalSize}。執行全自動回補...`);
              
              let allDraws = [...page1Draws];
              if (newDraw) allDraws.push(newDraw);
              
              // 如果 totalSize > 50 (超過第一頁的容量)，就把剩下的頁數全部抓完
              let page = 2;
              while (allDraws.length < totalSize && page <= 5) {
                  const { draws: nextDraws } = await fetchHistoryPageFromTLC(todayDateStr, page);
                  if (nextDraws.length === 0) break;
                  allDraws.push(...nextDraws);
                  page++;
              }
              
              // 7. 去重並確保陣列內照期數由大到小排序
              const uniqueDraws = Array.from(new Map(allDraws.map(d => [d.period, d])).values());
              uniqueDraws.sort((a, b) => Number(b.period) - Number(a.period));
              
              todayDraws = uniqueDraws;
              isUpdated = true;
              console.log(`回補完成，現有 ${todayDraws.length} 期`);
          }

          // 8. 寫回 KV
          if (isUpdated) {
              todayDraws.sort((a, b) => Number(b.period) - Number(a.period));
              await env.BINGO_KV.put('today_draws', JSON.stringify(todayDraws));
              await env.BINGO_KV.put('latest_draw', JSON.stringify(todayDraws[0]));
          } else {
              console.log(`期數已滿 (${todayDraws.length}/${totalSize})，無缺漏，略過寫入`);
          }

          // 9. 更新最後檢查時間
          await env.BINGO_KV.put('last_updated', new Date().toISOString());

      } catch (err: any) {
          console.error('抓取或寫入 KV 失敗:', err.message);
      }
    } catch (err) {
        console.error('Cron job top-level error:', err);
    }
}
