/**
 * 賓果娛樂機 — AI 生成圖片／影片素材
 *
 * 原則：素材是「加分」，不是必要條件。
 * - 所有路徑集中在這裡，以 import.meta.env.BASE_URL 組出（vite base 為 './'）。
 * - 每個檔案整個 session 只嘗試載入一次；載入失敗或檔案不存在 → 記為 fail，
 *   元件就維持原本的純 CSS 演出，不會破圖、不會丟例外。
 * - 只在需要時才載入：演出開始（拿到導演計畫）時預載本期可能用到的圖；
 *   影片只在最高等級大獎的結算畫面才掛上 <video>。
 */
import { useEffect, useState } from 'react';
import type { DirectorPlan, PreviewColor, ReachLevel } from './director';
import type { SettleSummary } from './payout';

const BASE = `${import.meta.env.BASE_URL}arcade/`;
const p = (file: string) => `${BASE}${file}`;

export const ASSETS = {
    /** 機台頂部霓虹招牌（黑底，screen 去背） */
    sign: p('sign.webp'),
    /** 液晶背景，依預告色切換 */
    bg: {
        blue: p('bg_blue.webp'),
        green: p('bg_green.webp'),
        red: p('bg_red.webp'),
        gold: p('bg_gold.webp'),
        rainbow: p('bg_rainbow.webp'),
    } satisfies Record<PreviewColor, string>,
    /** 吉祥物 cut-in */
    cutin: {
        reach: p('cutin_reach.webp'),
        super: p('cutin_super.webp'),
        premium: p('cutin_premium.webp'),
    },
    /** 落空收尾吉祥物 */
    mascotLose: p('mascot_lose.webp'),
    /** 結算大獎字卡（黑底，screen 去背） */
    card: {
        bigwin: p('card_bigwin.webp'),
        megawin: p('card_megawin.webp'),
        jackpot: p('card_jackpot.webp'),
    },
    /**
     * 最高等級大獎影片（只在結算時才掛上；多支輪替，每局隨機挑一支）。
     * 2026-11-11：AI 生成的短片品質不佳，暫停使用 → 清單設為空，大獎改回純 CSS 演出。
     * 要恢復時把 [] 改回 [1, 2, 3, 4] 並把檔案放回 public/arcade/。
     */
    videos: ([] as number[]).map((i) => ({
        webm: p(`bigwin_loop_${i}.webm`),
        mp4: p(`bigwin_loop_${i}.mp4`),
        poster: p(`bigwin_poster_${i}.jpg`),
    })),
} as const;

export type BigWinVideoAsset = (typeof ASSETS.videos)[number];

/** 同一局（同一個 plan 物件）固定同一支，預載與播放才會一致 */
const videoPick = new WeakMap<object, BigWinVideoAsset>();
export function pickBigWinVideo(plan: object): BigWinVideoAsset {
    let v = videoPick.get(plan);
    if (!v) {
        v = ASSETS.videos[Math.floor(Math.random() * ASSETS.videos.length)];
        videoPick.set(plan, v);
    }
    return v;
}

/* ───────────── 載入狀態（模組層快取） ───────────── */

type Status = 'loading' | 'ok' | 'fail';
const status = new Map<string, Status>();
const pending = new Map<string, Promise<boolean>>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

/**
 * 載入一張圖；成功回 true，失敗（404、格式錯、被擋）回 false。永不 reject。
 * 同一個網址只會真的抓一次。
 */
export function loadImage(url: string): Promise<boolean> {
    const s = status.get(url);
    if (s === 'ok') return Promise.resolve(true);
    if (s === 'fail') return Promise.resolve(false);
    const inflight = pending.get(url);
    if (inflight) return inflight;
    if (typeof Image === 'undefined') return Promise.resolve(false);

    status.set(url, 'loading');
    const job = new Promise<boolean>((resolve) => {
        const img = new Image();
        img.decoding = 'async';
        const done = (ok: boolean) => {
            img.onload = null;
            img.onerror = null;
            status.set(url, ok ? 'ok' : 'fail');
            pending.delete(url);
            notify();
            resolve(ok);
        };
        img.onload = () => {
            // 先解碼好，演出時才不會卡一下；decode 失敗（例如伺服器回了 HTML）視為缺檔
            if (typeof img.decode === 'function') img.decode().then(() => done(true), () => done(img.naturalWidth > 0));
            else done(img.naturalWidth > 0);
        };
        img.onerror = () => done(false);
        img.src = url;
    });
    pending.set(url, job);
    return job;
}

/** 已確認可用？（不觸發載入） */
export function isReady(url: string | null | undefined): boolean {
    return !!url && status.get(url) === 'ok';
}

/** 標記某個素材在實際使用時出錯（例如 <img> onError），之後改用 CSS 退回 */
export function markFailed(url: string): void {
    if (status.get(url) === 'fail') return;
    status.set(url, 'fail');
    notify();
}

/**
 * 元件用：傳入網址（null = 本次不需要），回傳是否可以顯示素材。
 * 尚未載入會自動觸發載入；載入失敗永遠回 false → 元件走原本的 CSS 演出。
 */
export function useAsset(url: string | null | undefined): boolean {
    const [, force] = useState(0);
    useEffect(() => {
        if (!url) return;
        const on = () => force((v) => v + 1);
        listeners.add(on);
        if (!status.has(url)) void loadImage(url);
        return () => { listeners.delete(on); };
    }, [url]);
    return isReady(url);
}

/* ───────────── 依演出計畫挑素材 ───────────── */

/** 聽牌 cut-in：SPSP / PREMIUM 用 premium，其餘用 reach */
export function reachCutinUrl(level: ReachLevel): string {
    return level === 'spsp' || level === 'premium' ? ASSETS.cutin.premium : ASSETS.cutin.reach;
}

export type CardKind = keyof typeof ASSETS.card;

/**
 * 結算字卡等級：
 * - big → bigwin
 * - mega → megawin；mega 且（超級獎號命中 或 派彩 ≥ 下注 1000 倍）→ jackpot
 */
export function cardKind(plan: DirectorPlan, summary: SettleSummary | null): CardKind | null {
    if (plan.spectator) return null;
    if (plan.winClass === 'big') return 'bigwin';
    if (plan.winClass === 'mega') return plan.superHit || (summary?.ratio ?? 0) >= 1000 ? 'jackpot' : 'megawin';
    return null;
}

/** 最高等級大獎（mega）才播影片 */
export function wantsBigWinVideo(plan: DirectorPlan): boolean {
    return ASSETS.videos.length > 0 && !plan.spectator && plan.winClass === 'mega';
}

/** 本期演出可能用到的圖片清單（不含影片本體） */
export function assetsForPlan(plan: DirectorPlan, summary: SettleSummary | null): string[] {
    const list: string[] = [ASSETS.bg[plan.color], ASSETS.cutin.super];
    if (plan.reach) list.push(reachCutinUrl(plan.reach.level));
    const card = cardKind(plan, summary);
    if (card) list.push(ASSETS.card[card]);
    if (!plan.spectator && plan.winClass === 'none') list.push(ASSETS.mascotLose);
    if (wantsBigWinVideo(plan)) list.push(pickBigWinVideo(plan).poster);
    return list;
}

/** 演出開始前預載本期素材（失敗不影響演出） */
export function preloadForPlan(plan: DirectorPlan, summary: SettleSummary | null): void {
    for (const url of assetsForPlan(plan, summary)) void loadImage(url);
}

/* ───────────── 影片條件 ───────────── */

interface NetworkInformationLike { saveData?: boolean }

/** reduced-motion 或省流量模式時不載入影片，只顯示 poster */
export function videoAllowed(reduced: boolean): boolean {
    if (reduced) return false;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
    const conn = typeof navigator !== 'undefined'
        ? (navigator as Navigator & { connection?: NetworkInformationLike }).connection
        : undefined;
    return !conn?.saveData;
}
