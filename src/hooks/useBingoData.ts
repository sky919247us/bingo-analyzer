/**
 * 台灣彩券賓果賓果 — 資料取得 Hook
 * - 「即時模式」：從後端 API (/api/latest, /api/history) 取得即時開獎資料
 * - 「CSV 模式」：從 public/data/ 載入靜態歷史 CSV（作為 Fallback 或年份瀏覽）
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { parseCsvData, type DrawResult } from '../utils/csv-parser';
import type { BingoDrawData } from '../utils/bingo-strategies';

/** 可用的歷史年份清單 */
const AVAILABLE_YEARS = [
    2026, 2025, 2024, 2023, 2022, 2021, 2020,
    2019, 2018, 2017, 2016, 2015, 2014, 2013,
];

/** 後端 API 基底 URL (對應新建的 Cloudflare Worker) */
const API_BASE = 'https://bingo-kv-worker.sky919247us.workers.dev';

/** CSV 模式刷新間隔（毫秒）— 保持 60 秒 */
const CSV_REFRESH_INTERVAL = 60_000;

/** 前端提取延遲秒數：開獎後 40 秒再抓（Worker 在開獎後 25 秒寫入 KV，預留 15 秒緩衝） */
const FETCH_DELAY_SECS = 50;

/**
 * 取得台灣時間的時、分、秒
 */
function getTaipeiTime(): { hours: number; minutes: number; seconds: number } {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Taipei',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hour12: false,
    }).formatToParts(now);
    return {
        hours: parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10),
        minutes: parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10),
        seconds: parseInt(parts.find(p => p.type === 'second')?.value || '0', 10),
    };
}

/**
 * 計算距離下一次提取的秒數
 * 開獎時段：台灣時間 07:05 ~ 23:55（每日 203 期，每 5 分鐘一期）
 * 提取時間點：07:05:30, 07:10:30, 07:15:30, ..., 23:55:30
 */
function getSecondsUntilNextFetch(): number {
    const { hours, minutes, seconds } = getTaipeiTime();
    const currentTotalSecs = hours * 3600 + minutes * 60 + seconds;

    // 第一個提取點 07:05:10，最後一個 23:55:10，間隔 300 秒
    const FIRST_FETCH = (7 * 60 + 5) * 60 + FETCH_DELAY_SECS;  // 07:05:40 = 25540s
    const LAST_FETCH = (23 * 60 + 55) * 60 + FETCH_DELAY_SECS; // 23:55:40 = 86140s
    const INTERVAL = 5 * 60; // 300s

    // 還沒到第一期 → 等到 07:05:10
    if (currentTotalSecs < FIRST_FETCH) {
        return FIRST_FETCH - currentTotalSecs;
    }

    // 已過最後一期 → 等到隔天 07:05:10
    if (currentTotalSecs >= LAST_FETCH + INTERVAL) {
        return (24 * 3600 - currentTotalSecs) + FIRST_FETCH;
    }

    // 開獎時段中 → 計算下一個 5 分鐘提取點
    const elapsed = currentTotalSecs - FIRST_FETCH;
    const nextFetchSecs = FIRST_FETCH + (Math.floor(elapsed / INTERVAL) + 1) * INTERVAL;

    // 若超過最後一期，等到隔天
    if (nextFetchSecs > LAST_FETCH) {
        return (24 * 3600 - currentTotalSecs) + FIRST_FETCH;
    }

    return nextFetchSecs - currentTotalSecs;
}

interface UseBingoDataReturn {
    draws: BingoDrawData[];
    rawDraws: DrawResult[];
    loading: boolean;
    error: string | null;
    latestDraw: BingoDrawData | null;
    latestStats: {
        bigSmallRatio: string;
        oddEvenRatio: string;
        /** 大小結果：大/小/－（需 ≥13 顆才成立） */
        bigSmallResult: string;
        /** 單雙結果：單/雙/－（需 ≥13 顆才成立） */
        oddEvenResult: string;
        /** 所有開獎號碼總和 (和值) */
        sum: number;
    } | null;
    countdown: number;
    refresh: () => void;
    /** 資料模式：live（即時 API）或 csv（靜態年份） */
    mode: 'live' | 'csv';
    /** 切換到即時模式 */
    setLiveMode: () => void;
    /** 切換到 CSV 模式並指定年份 */
    setCsvYear: (year: number) => void;
    /** 目前選擇的年份（CSV 模式下有效） */
    selectedYear: number;
    /** 可用年份清單 */
    availableYears: number[];
}

/**
 * 從 Worker KV API 取得今日歷史
 */
async function fetchFromKV(): Promise<{ draws: BingoDrawData[], lastUpdated: string | null }> {
    try {
        const resp = await fetch(`${API_BASE}/api/kv/today`);
        if (resp.ok) {
            const json = await resp.json();
            if (json.success && json.draws) {
                return {
                    draws: json.draws,
                    lastUpdated: json.lastUpdated
                };
            }
        }
    } catch (err) {
        console.error('Failed to fetch from KV', err);
    }
    return { draws: [], lastUpdated: null };
}

/**
 * 從 public/data/ 載入指定年份的 CSV
 */
async function fetchCsvYear(year: number): Promise<DrawResult[]> {
    const url = `${import.meta.env.BASE_URL}data/賓果賓果_${year}.csv`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`無法載入 ${year} 年資料 (HTTP ${response.status})`);
    const csvText = await response.text();
    return parseCsvData(csvText);
}

function toBingoDrawData(draw: DrawResult): BingoDrawData {
    return {
        period: draw.period,
        drawTime: draw.date,
        numbers: draw.numbers,
        superNumber: draw.superNumber,
    };
}

function calculateStats(numbers: number[]) {
    const bigCount = numbers.filter((n) => n >= 41).length;
    const smallCount = numbers.length - bigCount;
    const oddCount = numbers.filter((n) => n % 2 === 1).length;
    const evenCount = numbers.length - oddCount;

    // 賓果賓果規則：需 ≥13 顆才判定大/小、單/雙，否則為和（－）
    const bigSmallResult = bigCount >= 13 ? '大' : smallCount >= 13 ? '小' : '－';
    const oddEvenResult = oddCount >= 13 ? '單' : evenCount >= 13 ? '雙' : '－';

    return {
        bigSmallRatio: `${bigCount}:${smallCount}`,
        oddEvenRatio: `${oddCount}:${evenCount}`,
        bigSmallResult,
        oddEvenResult,
        sum: numbers.reduce((a, b) => a + b, 0),
    };
}

/**
 * 賓果資料取得 Hook
 * 預設嘗試即時模式（後端 API），若後端不可用則自動降級為 CSV 模式
 */
export function useBingoData(): UseBingoDataReturn {
    const [mode, setMode] = useState<'live' | 'csv'>('live');
    const [selectedYear, setSelectedYear] = useState(AVAILABLE_YEARS[0]);
    const [rawDraws, setRawDraws] = useState<DrawResult[]>([]);
    const [draws, setDraws] = useState<BingoDrawData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [countdown, setCountdown] = useState(60);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

    /** 即時模式：從 Worker KV 取得資料 */
    const loadLive = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { draws: kvDraws } = await fetchFromKV();

            if (!kvDraws || kvDraws.length === 0) {
                setError('KV 暫無資料，等待 Worker 更新');
                setDraws([]);
                setRawDraws([]);
                setCountdown(getSecondsUntilNextFetch());
                return;
            }

            // 按期數降序排列，確保最新在前
            const sortedDraws = [...kvDraws].sort((a, b) => Number(b.period) - Number(a.period));

            setDraws(sortedDraws);
            setRawDraws([]); // 即時模式下不使用 rawDraws

            // 倒數計時：精確對齊下一期開獎 + 10 秒的提取時間
            setCountdown(getSecondsUntilNextFetch());
        } catch {
            setError('即時資料取得失敗 (KV 連線異常)');
            setCountdown(getSecondsUntilNextFetch());
        } finally {
            setLoading(false);
        }
    }, []);

    /** CSV 模式：從靜態檔案載入 */
    const loadCsv = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const csvData = await fetchCsvYear(selectedYear);
            // 反序排列，確保最新期在前
            const reversedCsvData = [...csvData].reverse();
            const reversedDraws = reversedCsvData.map(toBingoDrawData);
            setRawDraws(reversedCsvData);
            setDraws(reversedDraws);
            setCountdown(CSV_REFRESH_INTERVAL / 1000);
        } catch (err) {
            setError(err instanceof Error ? err.message : '載入失敗');
        } finally {
            setLoading(false);
        }
    }, [selectedYear]);

    /** 根據當前模式載入資料 */
    const loadData = useCallback(() => {
        if (mode === 'live') return loadLive();
        return loadCsv();
    }, [mode, loadLive, loadCsv]);

    // 即時模式：用 setTimeout 精確對齊開獎時間 +10 秒；CSV 模式：固定間隔
    useEffect(() => {
        loadData();

        if (mode === 'live') {
            // 即時模式：每次提取後重新計算下一次提取時間
            const scheduleNext = () => {
                const waitSecs = getSecondsUntilNextFetch();
                setCountdown(waitSecs);
                timerRef.current = setTimeout(() => {
                    loadLive().then(scheduleNext);
                }, waitSecs * 1000) as unknown as ReturnType<typeof setInterval>;
            };
            scheduleNext();

            // 每秒倒數
            countdownRef.current = setInterval(() => {
                setCountdown((prev) => Math.max(prev - 1, 0));
            }, 1000);
        } else {
            // CSV 模式：固定 60 秒刷新
            timerRef.current = setInterval(loadData, CSV_REFRESH_INTERVAL);
            countdownRef.current = setInterval(() => {
                setCountdown((prev) => (prev <= 1 ? CSV_REFRESH_INTERVAL / 1000 : prev - 1));
            }, 1000);
        }

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current as unknown as number);
                clearInterval(timerRef.current);
            }
            if (countdownRef.current) clearInterval(countdownRef.current);
        };
    }, [mode]); // 移除 loadData 依賴，避免重複觸發

    const latestDraw = draws.length > 0 ? draws[0] : null;

    const setLiveMode = useCallback(() => {
        setMode('live');
    }, []);

    const setCsvYear = useCallback((year: number) => {
        setSelectedYear(year);
        setMode('csv');
    }, []);

    return {
        draws,
        rawDraws,
        loading,
        error,
        latestDraw,
        latestStats: latestDraw ? calculateStats(latestDraw.numbers) : null,
        countdown,
        refresh: loadData,
        mode,
        setLiveMode,
        setCsvYear,
        selectedYear,
        availableYears: AVAILABLE_YEARS,
    };
}
