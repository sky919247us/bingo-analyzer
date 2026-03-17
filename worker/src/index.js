const TLC_LATEST_URL = 'https://api.taiwanlottery.com/TLCAPIWeB/Lottery/LatestBingoResult';

// 允許跨域請求的 Headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json;charset=UTF-8',
};

async function fetchLatestFromTLC() {
    const resp = await fetch(TLC_LATEST_URL, {
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
    });
    
    if (!resp.ok) {
        throw new Error(`TLC API Error: ${resp.status}`);
    }
    
    const data = await resp.json();
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
        numbers: post.bigShowOrder.map(n => parseInt(n, 10)),
        superNumber: parseInt(post.prizeNum?.bullEye || '0', 10),
    };
}

async function fetchHistoryPageFromTLC(dateStr, page = 1) {
    const url = `https://api.taiwanlottery.com/TLCAPIWeB/Lottery/BingoResult?openDate=${dateStr}&pageNum=${page}&pageSize=50`;
    const resp = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
    if (!resp.ok) throw new Error(`TLC History API Error: ${resp.status}`);
    const data = await resp.json();
    if (data.rtCode !== 0) throw new Error(`TLC History API rtCode: ${data.rtCode}`);
    
    const contentResults = data.content?.bingoQueryResult || [];
    const draws = contentResults.map(item => ({
        period: String(item.drawTerm),
        drawTime: item.dDate || dateStr,
        numbers: item.bigShowOrder.map(n => parseInt(n, 10)),
        superNumber: parseInt(item.bullEyeTop || '0', 10),
    }));
    
    return {
        totalSize: data.content?.totalSize || 0,
        draws
    };
}

/**
 * 根據現有的 anchor 時間補全所有遺漏的時間
 * 賓果每期 5 分鐘
 */
function fillMissingTimes(draws) {
    // 找出第一個有具體時間 (包含 ':') 的物件作為錨點
    const anchor = draws.find(d => d.drawTime && d.drawTime.includes(':'));
    if (!anchor) return draws;

    const anchorTime = new Date(anchor.drawTime).getTime();
    const anchorPeriod = Number(anchor.period);

    return draws.map(d => {
        // 如果已經有時間了，直接回傳
        if (d.drawTime && d.drawTime.includes(':')) return d;

        // 否則，計算期號差距並補完時間
        const periodDiff = Number(d.period) - anchorPeriod;
        const calculatedDate = new Date(anchorTime + periodDiff * 5 * 60 * 1000);
        return {
            ...d,
            drawTime: calculatedDate.toISOString()
        };
    });
}

export default {
  // 處理前端的 API 請求
  async fetch(request, env, ctx) {
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
            const lastUpdated = await env.BINGO_KV.get('last_updated');
            return new Response(JSON.stringify({ success: true, message: 'Forced cron execution.', lastUpdated }), { headers: corsHeaders });
        }

        if (url.pathname === '/api/kv/backfill' && request.method === 'POST') {
            const body = await request.json();
            if (body.today_draws) await env.BINGO_KV.put('today_draws', JSON.stringify(body.today_draws));
            if (body.latest_draw) await env.BINGO_KV.put('latest_draw', JSON.stringify(body.latest_draw));
            if (body.last_updated) await env.BINGO_KV.put('last_updated', body.last_updated);
            if (body.today_date) await env.BINGO_KV.put('today_date', body.today_date);
            return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }

        return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: corsHeaders });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
    }
  },

  // 處理 Cron 定時任務
  async scheduled(event, env, ctx) {
      console.log('Cron trigger fired at: ' + new Date().toISOString());
      ctx.waitUntil(syncDrawsToKV(env));
  },
};

async function syncDrawsToKV(env) {
    try {
      // 取得台灣時間 (UTC+8) 的日期 YYYY-MM-DD 作為換日判斷
      const now = new Date();
      // 將時間往前平移 4 小時處理凌晨換日
      const adjustedNow = new Date(now.getTime() - 4 * 60 * 60 * 1000); 
      const options = { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' };
      const todayDateStr = adjustedNow.toLocaleDateString('en-CA', options); // 格式: YYYY-MM-DD

      const savedDate = await env.BINGO_KV.get('today_date');
      if (savedDate !== todayDateStr) {
          console.log(`換日偵測！清空歷史紀錄 (舊: ${savedDate}, 新: ${todayDateStr})`);
          await env.BINGO_KV.put('today_date', todayDateStr);
          await env.BINGO_KV.put('today_draws', JSON.stringify([]));
      }

      try {
          // 2. 獲取台彩最新期數
          let newDraw = null;
          try {
              newDraw = await fetchLatestFromTLC();
          } catch (e) {
              console.log('Latest API Error, falling back to history');
          }
          
          // 3. 獲取第一頁歷史
          const { totalSize, draws: page1Draws } = await fetchHistoryPageFromTLC(todayDateStr, 1);
          
          if (page1Draws.length === 0 && !newDraw) {
              console.log('No draws yet today');
              return;
          }

          // 4. 讀取現有 KV
          const rawToday = await env.BINGO_KV.get('today_draws');
          let todayDraws = rawToday ? JSON.parse(rawToday) : [];
          
          let isUpdated = false;

          // 5. 合併最新一期
          if (newDraw) {
              const isNew = !todayDraws.some(d => d.period === newDraw.period);
              if (isNew) {
                  todayDraws.unshift(newDraw);
                  isUpdated = true;
              }
          }
          
          // 6. 防漏判定：如果筆數不對或是最新期數斷層
          const hasMissing = todayDraws.length < totalSize;
          
          if (hasMissing) {
              console.log(`Gap detected: KV count ${todayDraws.length} < Total ${totalSize}. Re-filling...`);
              
              let allFetched = [...page1Draws];
              if (newDraw) allFetched.push(newDraw);
              
              let page = 2;
              while (allFetched.length < totalSize && page <= 5) {
                  const { draws: nextDraws } = await fetchHistoryPageFromTLC(todayDateStr, page);
                  if (nextDraws.length === 0) break;
                  allFetched.push(...nextDraws);
                  page++;
              }
              
              // 去重
              const map = new Map();
              allFetched.forEach(d => map.set(d.period, d));
              todayDraws = Array.from(map.values());
              isUpdated = true;
          }

          // 7. 關鍵：補全所有時間資訊
          if (isUpdated || todayDraws.some(d => !d.drawTime || !d.drawTime.includes(':'))) {
              // 補強：確保至少有一個 drawTime 是帶時間的
              todayDraws = fillMissingTimes(todayDraws);
              isUpdated = true;
          }

          if (isUpdated) {
              todayDraws.sort((a, b) => Number(b.period) - Number(a.period));
              await env.BINGO_KV.put('today_draws', JSON.stringify(todayDraws));
              await env.BINGO_KV.put('latest_draw', JSON.stringify(todayDraws[0]));
          }

          await env.BINGO_KV.put('last_updated', new Date().toISOString());

      } catch (err) {
          console.error('Inner fetch error:', err.message);
      }
    } catch (err) {
        console.error('Fatal error in sync:', err);
    }
}
