/**
 * 賓果賓果分析模型 — React 入口
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>,
);

// PWA: 僅在正式環境（production build）且瀏覽器支援時註冊 service worker。
// 路徑使用相對路徑 './sw.js'，以相容 vite.config.ts 的相對 base（GitHub Pages 子路徑部署）。
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch((err) => {
            console.error('Service worker 註冊失敗：', err);
        });
    });
}
