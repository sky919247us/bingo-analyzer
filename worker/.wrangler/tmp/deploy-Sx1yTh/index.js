var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
var TLC_LATEST_URL = "https://api.taiwanlottery.com/TLCAPIWeB/Lottery/LatestBingoResult";
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json;charset=UTF-8"
};
async function fetchLatestFromTLC() {
  const resp = await fetch(TLC_LATEST_URL, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
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
    numbers: post.bigShowOrder.map((n) => parseInt(n, 10)),
    superNumber: parseInt(post.prizeNum?.bullEye || "0", 10)
  };
}
__name(fetchLatestFromTLC, "fetchLatestFromTLC");
var index_default = {
  // 處理前端的 API 請求
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    try {
      if (url.pathname === "/api/kv/latest") {
        const rawLatest = await env.BINGO_KV.get("latest_draw");
        const lastUpdated = await env.BINGO_KV.get("last_updated");
        return new Response(JSON.stringify({
          success: true,
          draw: rawLatest ? JSON.parse(rawLatest) : null,
          lastUpdated: lastUpdated || null
        }), { headers: corsHeaders });
      }
      if (url.pathname === "/api/kv/today") {
        const rawToday = await env.BINGO_KV.get("today_draws");
        const lastUpdated = await env.BINGO_KV.get("last_updated");
        const draws = rawToday ? JSON.parse(rawToday) : [];
        return new Response(JSON.stringify({
          success: true,
          draws,
          count: draws.length,
          lastUpdated: lastUpdated || null
        }), { headers: corsHeaders });
      }
      return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: corsHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
    }
  },
  // 處理 Cron 定時任務
  async scheduled(event, env, ctx) {
    const now = /* @__PURE__ */ new Date();
    const options = { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" };
    const todayDateStr = now.toLocaleDateString("en-CA", options);
    const savedDate = await env.BINGO_KV.get("today_date");
    if (savedDate !== todayDateStr) {
      console.log(`\u63DB\u65E5\u5075\u6E2C\uFF01\u6E05\u7A7A\u6B77\u53F2\u7D00\u9304 (\u820A: ${savedDate}, \u65B0: ${todayDateStr})`);
      await env.BINGO_KV.put("today_date", todayDateStr);
      await env.BINGO_KV.put("today_draws", JSON.stringify([]));
    }
    try {
      const newDraw = await fetchLatestFromTLC();
      console.log(`\u6293\u53D6\u5230\u6700\u65B0\u671F\u6578: ${newDraw.period}`);
      const rawToday = await env.BINGO_KV.get("today_draws");
      let todayDraws = rawToday ? JSON.parse(rawToday) : [];
      const isNew = !todayDraws.some((d) => d.period === newDraw.period);
      if (isNew) {
        console.log(`\u65B0\u589E\u671F\u6578: ${newDraw.period} \u5230 KV`);
        todayDraws.unshift(newDraw);
        todayDraws.sort((a, b) => Number(b.period) - Number(a.period));
        await env.BINGO_KV.put("today_draws", JSON.stringify(todayDraws));
        await env.BINGO_KV.put("latest_draw", JSON.stringify(newDraw));
      } else {
        console.log(`\u671F\u6578 ${newDraw.period} \u5DF2\u5B58\u5728\uFF0C\u7565\u904E\u65B0\u589E`);
      }
      await env.BINGO_KV.put("last_updated", (/* @__PURE__ */ new Date()).toISOString());
    } catch (err) {
      console.error("\u6293\u53D6\u6216\u5BEB\u5165 KV \u5931\u6557:", err.message);
    }
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
