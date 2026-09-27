/**
 * 刮刮研究室 — 手寫 Service Worker
 *
 * 策略：
 * - App shell（index.html、build 後的 JS/CSS/圖片等同網域靜態資產）：
 *   stale-while-revalidate（先回快取加速，同時背景更新快取）。
 * - 開獎資料（跨網域台彩 API、Cloudflare Worker KV API、public/data/ 下的 CSV）：
 *   一律 network-first，且不寫入快取 —— 絕不能讓使用者看到過期開獎號碼。
 *   若離線導致 fetch 失敗，直接讓錯誤往上拋，交給前端既有的 fallback/錯誤處理。
 *
 * 版本字串（SW_VERSION）變更時，activate 階段會自動清除舊快取。
 */

const SW_VERSION = 'v1';
const SHELL_CACHE = `bingo-shell-${SW_VERSION}`;

/** 一律不快取、永遠打網路的網址判斷式（開獎資料 / 跨網域 API） */
function isNoCacheData(url) {
    // 跨網域：台彩官方 API
    if (url.hostname.includes('taiwanlottery.com')) return true;
    // 跨網域：Cloudflare Worker（開獎 KV API）
    if (url.hostname.endsWith('.workers.dev')) return true;
    // 同網域：public/data/ 下的 CSV 開獎資料
    if (url.pathname.includes('/data/') && url.pathname.endsWith('.csv')) return true;
    return false;
}

self.addEventListener('install', (event) => {
    // 不預先快取任何檔案，改由 fetch 時依策略動態快取，避免部署時序問題
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(
                keys
                    .filter((key) => key.startsWith('bingo-shell-') && key !== SHELL_CACHE)
                    .map((key) => caches.delete(key)),
            );
            await self.clients.claim();
        })(),
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;

    // 只處理 GET；非 GET（例如 POST）一律放行給網路，不介入
    if (request.method !== 'GET') return;

    let url;
    try {
        url = new URL(request.url);
    } catch {
        return;
    }

    // 開獎資料 / 跨網域 API：network-only，不快取、不攔截失敗
    if (isNoCacheData(url)) {
        event.respondWith(fetch(request));
        return;
    }

    // 只處理同網域的 http(s) 請求（忽略 chrome-extension: 等）
    if (url.origin !== self.location.origin) return;

    // App shell：stale-while-revalidate
    event.respondWith(
        (async () => {
            const cache = await caches.open(SHELL_CACHE);
            const cached = await cache.match(request);

            const networkFetch = fetch(request)
                .then((response) => {
                    if (response && response.status === 200) {
                        cache.put(request, response.clone());
                    }
                    return response;
                })
                .catch(() => undefined);

            // 有快取先回快取（加速 + 可離線），背景仍會更新快取；
            // 無快取則等待網路，網路也失敗才真正失敗。
            return cached || (await networkFetch) || Response.error();
        })(),
    );
});
